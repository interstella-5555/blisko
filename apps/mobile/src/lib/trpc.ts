import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import * as SecureStore from 'expo-secure-store';
import { authClient } from './auth';

// Import AppRouter type from api package
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
        // Try Better Auth session first
        const { data } = await authClient.getSession();
        if (data?.session?.token) {
          return {
            authorization: `Bearer ${data.session.token}`,
          };
        }

        // Fallback to SecureStore (for dev auto-login)
        const token = await SecureStore.getItemAsync('meet_session_token');
        return {
          authorization: token ? `Bearer ${token}` : '',
        };
      },
    }),
  ],
});
