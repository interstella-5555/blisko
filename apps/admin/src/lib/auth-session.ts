import { createServerFn } from "@tanstack/react-start";

export const getAuthSession = createServerFn().handler(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { getSession, parseSessionToken } = await import("~/lib/auth");
  const cookie = getRequestHeader("cookie") || "";
  const token = parseSessionToken(cookie);
  const session = token ? getSession(token) : null;
  return { email: session?.email ?? null, isAuthenticated: !!session };
});
