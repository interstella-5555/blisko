import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
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
        const { data } = await authClient.getSession();

        return {
          authorization: data?.session?.token
            ? `Bearer ${data.session.token}`
            : '',
        };
      },
    }),
  ],
});
