import {
  answerFollowUpSchema,
  answerQuestionSchema,
  applyProfilingSchema,
  completeProfilingSchema,
  createGhostProfileSchema,
  ONBOARDING_QUESTIONS,
  requestMoreQuestionsSchema,
  startProfilingSchema,
  submitOnboardingSchema,
} from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { moderateContent } from "@/services/moderation";
import { generateFollowUpQuestions } from "@/services/profiling-ai";
import { enqueueProfileAI, enqueueProfileFromQA, enqueueProfilingQuestion } from "@/services/queue";
import { rateLimit } from "@/trpc/middleware/rateLimit";
import { protectedProcedure, router } from "@/trpc/trpc";

// --- Helpers ---

async function loadAnsweredQA(sessionId: string): Promise<{ question: string; answer: string }[]> {
  const qa = await db
    .select({ question: schema.profilingQA.question, answer: schema.profilingQA.answer })
    .from(schema.profilingQA)
    .where(eq(schema.profilingQA.sessionId, sessionId))
    .orderBy(asc(schema.profilingQA.questionNumber));

  return qa.filter((row) => row.answer != null).map((row) => ({ question: row.question, answer: row.answer! }));
}

async function loadPreviousSessionQA(session: {
  basedOnSessionId: string | null;
}): Promise<{ question: string; answer: string }[] | undefined> {
  if (!session.basedOnSessionId) return undefined;
  return loadAnsweredQA(session.basedOnSessionId);
}

async function getDisplayName(userId: string): Promise<string> {
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: { displayName: true },
  });
  return profile?.displayName ?? "Uzytkownik";
}

async function loadRetryContext(sessionId: string, userId: string) {
  const session = await db.query.profilingSessions.findFirst({
    where: and(
      eq(schema.profilingSessions.id, sessionId),
      eq(schema.profilingSessions.userId, userId),
      eq(schema.profilingSessions.status, "active"),
    ),
    columns: { id: true, basedOnSessionId: true },
  });

  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found or not active" });
  }

  const answeredQA = await loadAnsweredQA(sessionId);
  const previousSessionQA = await loadPreviousSessionQA(session);
  const displayName = await getDisplayName(userId);

  return { answeredQA, previousSessionQA, displayName };
}

// --- Router ---

export const profilingRouter = router({
  // Start a new profiling session
  startSession: protectedProcedure.input(startProfilingSchema).mutation(async ({ ctx, input }) => {
    // Abandon any existing active session
    await db
      .update(schema.profilingSessions)
      .set({ status: "abandoned" })
      .where(and(eq(schema.profilingSessions.userId, ctx.userId), eq(schema.profilingSessions.status, "active")));

    // Validate basedOnSessionId ownership
    if (input.basedOnSessionId) {
      const prevSession = await db.query.profilingSessions.findFirst({
        where: and(
          eq(schema.profilingSessions.id, input.basedOnSessionId),
          eq(schema.profilingSessions.userId, ctx.userId),
        ),
        columns: { id: true },
      });
      if (!prevSession) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Previous session not found" });
      }
    }

    // Create new session
    const [session] = await db
      .insert(schema.profilingSessions)
      .values({
        userId: ctx.userId,
        basedOnSessionId: input.basedOnSessionId ?? null,
      })
      .returning();

    const previousSessionQA = await loadPreviousSessionQA(session);
    const displayName = await getDisplayName(ctx.userId);

    // Enqueue first question
    await enqueueProfilingQuestion(session.id, ctx.userId, displayName, [], { previousSessionQA });

    return { sessionId: session.id };
  }),

  // Answer the current question
  answerQuestion: protectedProcedure.input(answerQuestionSchema).mutation(async ({ ctx, input }) => {
    const session = await db.query.profilingSessions.findFirst({
      where: and(
        eq(schema.profilingSessions.id, input.sessionId),
        eq(schema.profilingSessions.userId, ctx.userId),
        eq(schema.profilingSessions.status, "active"),
      ),
    });

    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Session not found or not active" });
    }

    // Get latest unanswered question
    const latestQ = await db.query.profilingQA.findFirst({
      where: eq(schema.profilingQA.sessionId, input.sessionId),
      orderBy: [desc(schema.profilingQA.questionNumber)],
    });

    if (!latestQ || latestQ.answer != null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No unanswered question" });
    }

    await moderateContent(input.answer);

    // Save answer
    await db.update(schema.profilingQA).set({ answer: input.answer }).where(eq(schema.profilingQA.id, latestQ.id));

    // Build full QA history
    const answeredQA = await loadAnsweredQA(input.sessionId);

    // Hard cap: 12 questions
    if (answeredQA.length >= 12) {
      return { questionNumber: answeredQA.length, done: true };
    }

    const previousSessionQA = await loadPreviousSessionQA(session);
    const displayName = await getDisplayName(ctx.userId);

    // Enqueue next question
    await enqueueProfilingQuestion(input.sessionId, ctx.userId, displayName, answeredQA, { previousSessionQA });

    return { questionNumber: answeredQA.length, done: false };
  }),

  // Request more questions after AI said sufficient
  requestMoreQuestions: protectedProcedure.input(requestMoreQuestionsSchema).mutation(async ({ ctx, input }) => {
    const session = await db.query.profilingSessions.findFirst({
      where: and(
        eq(schema.profilingSessions.id, input.sessionId),
        eq(schema.profilingSessions.userId, ctx.userId),
        eq(schema.profilingSessions.status, "active"),
      ),
    });

    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Session not found or not active" });
    }

    // Ensure latest question is answered before requesting more
    const latestQ = await db.query.profilingQA.findFirst({
      where: eq(schema.profilingQA.sessionId, input.sessionId),
      orderBy: [desc(schema.profilingQA.questionNumber)],
      columns: { answer: true },
    });

    if (latestQ && latestQ.answer == null) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Answer the current question first" });
    }

    // Count questions after first sufficient: true
    const allQA = await db
      .select({
        sufficient: schema.profilingQA.sufficient,
        answer: schema.profilingQA.answer,
        question: schema.profilingQA.question,
      })
      .from(schema.profilingQA)
      .where(eq(schema.profilingQA.sessionId, input.sessionId))
      .orderBy(asc(schema.profilingQA.questionNumber));

    let firstSufficientIdx = -1;
    for (let i = 0; i < allQA.length; i++) {
      if (allQA[i].sufficient) {
        firstSufficientIdx = i;
        break;
      }
    }

    const extraQuestions = firstSufficientIdx >= 0 ? allQA.length - firstSufficientIdx - 1 : 0;

    if (extraQuestions >= 5) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum extra questions reached" });
    }

    if (input.directionHint) {
      await moderateContent(input.directionHint);
    }

    const answeredQA = allQA
      .filter((qa) => qa.answer != null)
      .map((qa) => ({ question: qa.question, answer: qa.answer! }));

    const previousSessionQA = await loadPreviousSessionQA(session);
    const displayName = await getDisplayName(ctx.userId);

    await enqueueProfilingQuestion(input.sessionId, ctx.userId, displayName, answeredQA, {
      previousSessionQA,
      userRequestedMore: true,
      directionHint: input.directionHint,
    });

    return { extraQuestionsRemaining: 5 - extraQuestions - 1 };
  }),

  // Complete session and generate profile
  completeSession: protectedProcedure.input(completeProfilingSchema).mutation(async ({ ctx, input }) => {
    const session = await db.query.profilingSessions.findFirst({
      where: and(
        eq(schema.profilingSessions.id, input.sessionId),
        eq(schema.profilingSessions.userId, ctx.userId),
        eq(schema.profilingSessions.status, "active"),
      ),
    });

    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Session not found or not active" });
    }

    // Ensure no unanswered questions remain
    const allQA = await db
      .select({ question: schema.profilingQA.question, answer: schema.profilingQA.answer })
      .from(schema.profilingQA)
      .where(eq(schema.profilingQA.sessionId, input.sessionId))
      .orderBy(asc(schema.profilingQA.questionNumber));

    const unanswered = allQA.filter((qa) => qa.answer == null);
    if (unanswered.length > 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Answer all questions before completing" });
    }

    const answeredQA = allQA.map((qa) => ({ question: qa.question, answer: qa.answer! }));

    if (answeredQA.length < 3) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "At least 3 answered questions required" });
    }

    const previousSessionQA = await loadPreviousSessionQA(session);
    const displayName = await getDisplayName(ctx.userId);

    await enqueueProfileFromQA(input.sessionId, ctx.userId, displayName, answeredQA, previousSessionQA);

    return { status: "generating" as const };
  }),

  // Get current session state (for rebuilding UI after reconnect)
  getSessionState: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await db.query.profilingSessions.findFirst({
        where: and(eq(schema.profilingSessions.id, input.sessionId), eq(schema.profilingSessions.userId, ctx.userId)),
      });

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      }

      const questions = await db
        .select()
        .from(schema.profilingQA)
        .where(eq(schema.profilingQA.sessionId, input.sessionId))
        .orderBy(asc(schema.profilingQA.questionNumber));

      return { session, questions };
    }),

  // Apply generated profile from a completed session
  applyProfile: protectedProcedure.input(applyProfilingSchema).mutation(async ({ ctx, input }) => {
    const session = await db.query.profilingSessions.findFirst({
      where: and(
        eq(schema.profilingSessions.id, input.sessionId),
        eq(schema.profilingSessions.userId, ctx.userId),
        eq(schema.profilingSessions.status, "completed"),
      ),
    });

    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Completed session not found" });
    }

    if (!session.generatedBio || !session.generatedLookingFor) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Profile not yet generated" });
    }

    // Allow user edits to override generated text
    const bio = input.bio ?? session.generatedBio;
    const lookingFor = input.lookingFor ?? session.generatedLookingFor;

    await moderateContent([input.displayName, bio, lookingFor].join("\n\n"));

    // Fetch auth user image for initial profile creation
    const authUser = await db.query.user.findFirst({
      where: eq(schema.user.id, ctx.userId),
      columns: { image: true },
    });

    // Upsert profile — insert if new, update if exists
    const [profile] = await db
      .insert(schema.profiles)
      .values({
        userId: ctx.userId,
        displayName: input.displayName,
        bio,
        lookingFor,
        portrait: session.generatedPortrait,
        isComplete: true,
        ...(authUser?.image ? { avatarUrl: authUser.image } : {}),
      })
      .onConflictDoUpdate({
        target: schema.profiles.userId,
        set: {
          displayName: input.displayName,
          bio,
          lookingFor,
          portrait: session.generatedPortrait,
          isComplete: true,
          visibilityMode: "semi_open",
          updatedAt: new Date(),
        },
      })
      .returning();

    // Enqueue AI pipeline (portrait + embedding + interests)
    enqueueProfileAI(ctx.userId, profile.bio, profile.lookingFor).catch((err) => {
      console.error("[profiling] Failed to enqueue profile AI job:", err);
    });

    return profile;
  }),

  // Submit structured onboarding answers (new flow)
  submitOnboarding: protectedProcedure
    .input(submitOnboardingSchema)
    .use(rateLimit("profiling.submitOnboarding"))
    .mutation(async ({ ctx, input }) => {
      // Validate required questions are answered
      const answeredIds = new Set(input.answers.map((a) => a.questionId));
      const missingRequired = ONBOARDING_QUESTIONS.filter((q) => q.required && !answeredIds.has(q.id));
      if (missingRequired.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Missing required questions: ${missingRequired.map((q) => q.id).join(", ")}`,
        });
      }

      // Validate all questionIds are known
      const validIds = new Set(ONBOARDING_QUESTIONS.map((q) => q.id));
      for (const a of input.answers) {
        if (!validIds.has(a.questionId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown question: ${a.questionId}` });
        }
      }

      // Moderate all answers
      const allText = input.answers.map((a) => a.answer).join("\n\n");
      if (allText.trim()) {
        await moderateContent(allText);
      }

      const questionMap = new Map(ONBOARDING_QUESTIONS.map((q) => [q.id, q.question]));

      // Transaction: abandon old session + create new + insert answers atomically
      const session = await db.transaction(async (tx) => {
        await tx
          .update(schema.profilingSessions)
          .set({ status: "abandoned" })
          .where(and(eq(schema.profilingSessions.userId, ctx.userId), eq(schema.profilingSessions.status, "active")));

        const [newSession] = await tx.insert(schema.profilingSessions).values({ userId: ctx.userId }).returning();

        await tx.insert(schema.profilingQA).values(
          input.answers.map((a, idx) => ({
            sessionId: newSession.id,
            questionNumber: idx + 1,
            question: questionMap.get(a.questionId) ?? a.questionId,
            answer: a.answer,
            sufficient: false,
          })),
        );

        return newSession;
      });

      const questionNumber = input.answers.length;

      // Generate follow-up questions inline (~2-3s), outside transaction
      const displayName = await getDisplayName(ctx.userId);
      const answeredQA = input.answers.map((a) => ({
        question: questionMap.get(a.questionId) ?? a.questionId,
        answer: a.answer,
      }));

      let followUps: { questions: string[] };
      try {
        followUps = await generateFollowUpQuestions(displayName, answeredQA, input.skipped, {
          jobName: "inline-follow-up-questions",
          userId: ctx.userId,
        });
      } catch (err) {
        console.error("[profiling] Follow-up generation failed, proceeding without:", err);
        followUps = { questions: [] };
      }

      // Batch insert follow-up questions
      const followUpEntries =
        followUps.questions.length > 0
          ? await db
              .insert(schema.profilingQA)
              .values(
                followUps.questions.map((fq, idx) => ({
                  sessionId: session.id,
                  questionNumber: questionNumber + idx + 1,
                  question: fq,
                  answer: null,
                  sufficient: false,
                })),
              )
              .returning({ id: schema.profilingQA.id, question: schema.profilingQA.question })
          : [];

      return {
        sessionId: session.id,
        followUpQuestions: followUpEntries,
      };
    }),

  // Answer a follow-up question
  answerFollowUp: protectedProcedure.input(answerFollowUpSchema).mutation(async ({ ctx, input }) => {
    const session = await db.query.profilingSessions.findFirst({
      where: and(
        eq(schema.profilingSessions.id, input.sessionId),
        eq(schema.profilingSessions.userId, ctx.userId),
        eq(schema.profilingSessions.status, "active"),
      ),
    });

    if (!session) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Session not found or not active" });
    }

    await moderateContent(input.answer);

    // Save answer to the specific profilingQA row
    const [updated] = await db
      .update(schema.profilingQA)
      .set({ answer: input.answer })
      .where(and(eq(schema.profilingQA.id, input.questionId), eq(schema.profilingQA.sessionId, input.sessionId)))
      .returning();

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Follow-up question not found" });
    }

    // Check if all follow-ups are answered (no null answers left)
    const unanswered = await db
      .select({ id: schema.profilingQA.id })
      .from(schema.profilingQA)
      .where(and(eq(schema.profilingQA.sessionId, input.sessionId), isNull(schema.profilingQA.answer)));

    return { allAnswered: unanswered.length === 0 };
  }),

  // Create ghost profile (minimal, hidden)
  createGhostProfile: protectedProcedure.input(createGhostProfileSchema).mutation(async ({ ctx, input }) => {
    await moderateContent(input.displayName);

    const existing = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, ctx.userId),
    });

    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Profile already exists" });
    }

    const authUser = await db.query.user.findFirst({
      where: eq(schema.user.id, ctx.userId),
      columns: { image: true },
    });

    const [profile] = await db
      .insert(schema.profiles)
      .values({
        userId: ctx.userId,
        displayName: input.displayName,
        bio: "",
        lookingFor: "",
        visibilityMode: "ninja",
        ...(authUser?.image ? { avatarUrl: authUser.image } : {}),
      })
      .returning();

    return profile;
  }),

  // Retry question generation after failure (self-healing)
  retryQuestion: protectedProcedure
    .use(rateLimit("profiling.retryQuestion"))
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { answeredQA, previousSessionQA, displayName } = await loadRetryContext(input.sessionId, ctx.userId);
      await enqueueProfilingQuestion(input.sessionId, ctx.userId, displayName, answeredQA, { previousSessionQA });
    }),

  // Retry profile generation after failure (self-healing)
  retryProfileGeneration: protectedProcedure
    .use(rateLimit("profiling.retryProfileGeneration"))
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { answeredQA, previousSessionQA, displayName } = await loadRetryContext(input.sessionId, ctx.userId);
      await enqueueProfileFromQA(input.sessionId, ctx.userId, displayName, answeredQA, previousSessionQA);
    }),

  // List all sessions for this user
  getSessions: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await db
      .select()
      .from(schema.profilingSessions)
      .where(eq(schema.profilingSessions.userId, ctx.userId))
      .orderBy(desc(schema.profilingSessions.createdAt));

    return sessions;
  }),
});
