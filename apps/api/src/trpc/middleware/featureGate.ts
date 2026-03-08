import { TRPCError } from "@trpc/server";
import { eq, placeholder } from "drizzle-orm";
import { db, schema } from "@/db";
import { middleware } from "@/trpc/trpc";

interface Gate {
  feature: string;
  requires: string[];
  enabled: boolean;
}

let gateCache: Map<string, Gate> | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

async function getGates(): Promise<Map<string, Gate>> {
  const now = Date.now();
  if (gateCache && now - cacheLoadedAt < CACHE_TTL_MS) {
    return gateCache;
  }

  const rows = await db.select().from(schema.featureGates);
  gateCache = new Map(rows.map((r) => [r.feature, r]));
  cacheLoadedAt = now;
  return gateCache;
}

const profileIsComplete = db
  .select({ isComplete: schema.profiles.isComplete })
  .from(schema.profiles)
  .where(eq(schema.profiles.userId, placeholder("userId")))
  .prepare("profile_is_complete");

export function featureGate(featureName: string) {
  return middleware(async ({ ctx, next }) => {
    const gates = await getGates();
    const gate = gates.get(featureName);

    if (!gate?.enabled) return next();

    if (!ctx.userId) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "NOT_AUTHENTICATED" });
    }

    const [profile] = await profileIsComplete.execute({ userId: ctx.userId });

    if (!profile) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "PROFILE_REQUIRED",
      });
    }

    const profileAttrs: Record<string, boolean> = {
      isComplete: profile.isComplete,
    };

    for (const attr of gate.requires) {
      if (!profileAttrs[attr]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Requires: ${attr}`,
        });
      }
    }

    return next();
  });
}
