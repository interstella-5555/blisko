import type { Context } from 'hono';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Lazy initialization for Supabase client
let supabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}

export interface TRPCContext {
  userId: string | null;
  supabase: SupabaseClient | null;
  [key: string]: unknown; // Index signature for compatibility
}

export async function createContext(
  opts: FetchCreateContextFnOptions,
  _c?: Context
): Promise<TRPCContext> {
  const supabase = getSupabaseAdmin();
  const authHeader = opts.req.headers.get('authorization');
  let userId: string | null = null;

  if (supabase && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (!error && user) {
        userId = user.id;
      }
    } catch (error) {
      console.error('Auth error:', error);
    }
  }

  return {
    userId,
    supabase,
  };
}
