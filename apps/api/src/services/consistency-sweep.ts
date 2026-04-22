import { subHours } from "date-fns";
import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { userIsActive } from "@/db/filters";
import { enqueueProfileAI, enqueueProfileFromQA } from "./queue";

export interface SweepResult {
  zombieProfiles: { found: number; enqueued: number };
  stuckSessions: { found: number; enqueued: number };
  abandonedSessions: { found: number; cleaned: number };
}

/**
 * Scans for stuck state left by failed queue jobs and repairs it.
 * Called nightly by the maintenance scheduler and on-demand from admin panel.
 */
export async function runConsistencySweep(): Promise<SweepResult> {
  const oneHourAgo = subHours(new Date(), 1);
  const twentyFourHoursAgo = subHours(new Date(), 24);

  const result: SweepResult = {
    zombieProfiles: { found: 0, enqueued: 0 },
    stuckSessions: { found: 0, enqueued: 0 },
    abandonedSessions: { found: 0, cleaned: 0 },
  };

  // 1. Abandoned profiling sessions — active for >24h, no hope of completion
  // Runs FIRST so stuck session detection (step 2) doesn't re-enqueue sessions that are about to be abandoned
  const abandoned = await db
    .update(schema.profilingSessions)
    .set({ status: "abandoned" })
    .where(
      and(eq(schema.profilingSessions.status, "active"), lt(schema.profilingSessions.createdAt, twentyFourHoursAgo)),
    )
    .returning({ id: schema.profilingSessions.id });

  result.abandonedSessions.found = abandoned.length;
  result.abandonedSessions.cleaned = abandoned.length;

  // 2. Zombie profiles — bio exists but AI-generated fields missing
  const zombies = await db
    .select({
      userId: schema.profiles.userId,
      bio: schema.profiles.bio,
      lookingFor: schema.profiles.lookingFor,
    })
    .from(schema.profiles)
    .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
    .where(
      and(
        isNotNull(schema.profiles.bio),
        isNull(schema.profiles.portrait),
        lt(schema.profiles.updatedAt, oneHourAgo),
        userIsActive(),
      ),
    );

  result.zombieProfiles.found = zombies.length;
  for (const z of zombies) {
    await enqueueProfileAI(z.userId, z.bio, z.lookingFor);
    result.zombieProfiles.enqueued++;
  }

  // 3. Stuck profiling sessions — active (1h-24h), all Q&A answered with sufficient=true, but no generated profile
  // Sessions >24h were already abandoned in step 1
  const stuckSessions = await db
    .select({
      id: schema.profilingSessions.id,
      userId: schema.profilingSessions.userId,
      basedOnSessionId: schema.profilingSessions.basedOnSessionId,
      displayName: schema.profiles.displayName,
    })
    .from(schema.profilingSessions)
    .innerJoin(schema.user, eq(schema.profilingSessions.userId, schema.user.id))
    .innerJoin(schema.profiles, eq(schema.profilingSessions.userId, schema.profiles.userId))
    .where(
      and(
        eq(schema.profilingSessions.status, "active"),
        isNull(schema.profilingSessions.generatedBio),
        lt(schema.profilingSessions.createdAt, oneHourAgo),
        gt(schema.profilingSessions.createdAt, twentyFourHoursAgo),
        userIsActive(),
      ),
    );

  for (const session of stuckSessions) {
    // Load all answered Q&A — check if any has sufficient=true
    const qaRows = await db.query.profilingQA.findMany({
      where: and(eq(schema.profilingQA.sessionId, session.id), isNotNull(schema.profilingQA.answer)),
      columns: { question: true, answer: true, sufficient: true },
      orderBy: schema.profilingQA.questionNumber,
    });

    const hasSufficient = qaRows.some((r) => r.sufficient);
    if (!hasSufficient) continue;

    result.stuckSessions.found++;

    const qaHistory = qaRows.map((r) => ({ question: r.question, answer: r.answer! }));

    let previousSessionQA: { question: string; answer: string }[] | undefined;
    if (session.basedOnSessionId) {
      const prevRows = await db.query.profilingQA.findMany({
        where: and(eq(schema.profilingQA.sessionId, session.basedOnSessionId), isNotNull(schema.profilingQA.answer)),
        columns: { question: true, answer: true },
        orderBy: schema.profilingQA.questionNumber,
      });
      previousSessionQA = prevRows.map((r) => ({ question: r.question, answer: r.answer! }));
    }

    await enqueueProfileFromQA(session.id, session.userId, session.displayName, qaHistory, previousSessionQA);
    result.stuckSessions.enqueued++;
  }

  console.log(
    `[consistency-sweep] Done — zombies: ${result.zombieProfiles.found}, stuck sessions: ${result.stuckSessions.found}, abandoned: ${result.abandonedSessions.found}`,
  );

  return result;
}
