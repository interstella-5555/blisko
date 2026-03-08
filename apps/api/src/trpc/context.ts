import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { and, eq, gt, placeholder } from "drizzle-orm";
import { auth } from "@/auth";
import { db, preparedName, schema } from "@/db";
import { requestMeta } from "@/services/metrics";

// Prepared statement — compiled once, reused on every authenticated request
export const sessionByToken = db
  .select()
  .from(schema.session)
  .where(and(eq(schema.session.token, placeholder("token")), gt(schema.session.expiresAt, placeholder("now"))))
  .limit(1)
  .prepare(preparedName("session_by_token"));

export interface TRPCContext {
  userId: string | null;
  db: typeof db;
  req: Request;
  [key: string]: unknown;
}

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TRPCContext> {
  let userId: string | null = null;

  try {
    // Try Better Auth session first
    const session = await auth.api.getSession({
      headers: opts.req.headers,
    });

    if (session?.user) {
      userId = session.user.id;
    }
  } catch (_error) {
    // Ignore Better Auth errors, will try Bearer token next
  }

  // Fallback: check Bearer token in Authorization header
  if (!userId) {
    const authHeader = opts.req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const [session] = await sessionByToken.execute({ token, now: new Date().toISOString() });

        if (session) {
          userId = session.userId;
        }
      } catch (error) {
        console.error("Token verification error:", error);
      }
    }
  }

  // Enrich metrics event with userId
  if (userId) {
    const meta = requestMeta.get(opts.req);
    if (meta) {
      meta.userId = userId;
    }
  }

  return {
    userId,
    db,
    req: opts.req,
  };
}
