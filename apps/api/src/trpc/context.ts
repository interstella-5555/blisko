import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { and, eq, gt } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";

export interface TRPCContext {
  userId: string | null;
  db: typeof db;
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
        const [session] = await db
          .select()
          .from(schema.session)
          .where(and(eq(schema.session.token, token), gt(schema.session.expiresAt, new Date())))
          .limit(1);

        if (session) {
          userId = session.userId;
        }
      } catch (error) {
        console.error("Token verification error:", error);
      }
    }
  }

  return {
    userId,
    db,
  };
}
