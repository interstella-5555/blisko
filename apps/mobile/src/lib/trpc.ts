import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { supabase } from './supabase';

// Import AppRouter type from api package
// In development, this uses the type directly
// For production, you need to ensure types are built
import type { AppRouter } from 'api/src/trpc/router';

export type { AppRouter };

export const trpc = createTRPCReact<AppRouter>();

const getApiUrl = () => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    console.warn('EXPO_PUBLIC_API_URL not set, using localhost');
    return 'http://localhost:3000';
  }
  return url;
};

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      async headers() {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        return {
          authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : '',
        };
      },
    }),
  ],
});
