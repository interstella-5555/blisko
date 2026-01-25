import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { eq, and, gt } from 'drizzle-orm';
import { auth } from '../auth';
import { db } from '../db';
import { session as sessionTable } from '../db/schema';

export interface TRPCContext {
  userId: string | null;
  db: typeof db;
  [key: string]: unknown;
}

export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TRPCContext> {
  let userId: string | null = null;

  try {
    // Try Better Auth session first
    const session = await auth.api.getSession({
      headers: opts.req.headers,
    });

    if (session?.user) {
      userId = session.user.id;
    }
  } catch (error) {
    // Ignore Better Auth errors, will try Bearer token next
  }

  // Fallback: check Bearer token in Authorization header
  if (!userId) {
    const authHeader = opts.req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const [session] = await db
          .select()
          .from(sessionTable)
          .where(
            and(
              eq(sessionTable.token, token),
              gt(sessionTable.expiresAt, new Date())
            )
          )
          .limit(1);

        if (session) {
          userId = session.userId;
        }
      } catch (error) {
        console.error('Token verification error:', error);
      }
    }
  }

  return {
    userId,
    db,
  };
}
