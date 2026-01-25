import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { auth } from '../auth';
import { db } from '../db';

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
    const session = await auth.api.getSession({
      headers: opts.req.headers,
    });

    if (session?.user) {
      userId = session.user.id;
    }
  } catch (error) {
    console.error('Auth error:', error);
  }

  return {
    userId,
    db,
  };
}
