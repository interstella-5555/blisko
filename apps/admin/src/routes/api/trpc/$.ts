import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { getSession, parseSessionToken } from "~/lib/auth";
import { appRouter } from "~/server/routers";
import type { Context } from "~/server/trpc";

function handleRequest(request: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: (): Context => {
      const cookie = request.headers.get("cookie") ?? "";
      const token = parseSessionToken(cookie);
      const session = token ? getSession(token) : null;
      return { session };
    },
  });
}

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: async ({ request }) => handleRequest(request),
      POST: async ({ request }) => handleRequest(request),
    },
  },
});
