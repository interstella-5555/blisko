import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "api/src/trpc/router";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { authClient } from "./auth";

export type { AppRouter };

export const trpc = createTRPCReact<AppRouter>();

const getApiUrl = () => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    console.warn("EXPO_PUBLIC_API_URL not set, using localhost");
    return "http://localhost:3000";
  }
  return url;
};

const appVersion = Constants.expoConfig?.version ?? "unknown";

let lastFailedRequestId: string | null = null;

export function getLastFailedRequestId(): string | null {
  return lastFailedRequestId;
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      async headers() {
        const h: Record<string, string> = {
          "x-app-version": appVersion,
        };

        // Try Better Auth session first
        const { data } = await authClient.getSession();
        if (data?.session?.token) {
          h.authorization = `Bearer ${data.session.token}`;
          return h;
        }

        // Fallback to SecureStore (for dev auto-login)
        const token = await SecureStore.getItemAsync("blisko_session_token");
        if (token) {
          h.authorization = `Bearer ${token}`;
        }
        return h;
      },
      fetch(url, options) {
        return globalThis.fetch(url, options).then((response) => {
          if (!response.ok) {
            const requestId = response.headers.get("x-request-id");
            if (requestId) {
              lastFailedRequestId = requestId;
            }
          }
          return response;
        });
      },
    }),
  ],
});
