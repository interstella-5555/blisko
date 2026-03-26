import { createServerFn } from "@tanstack/react-start";

export const getAuthSession = createServerFn().handler(async () => {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { auth, isAllowedEmail } = await import("~/lib/auth");

  const cookie = getRequestHeader("cookie") || "";
  const headers = new Headers({ cookie });
  const session = await auth.api.getSession({ headers });

  if (!session?.user?.email) {
    return { email: null, isAuthenticated: false };
  }

  // Defense in depth: verify email is still in allowlist even after session creation
  if (!isAllowedEmail(session.user.email)) {
    return { email: null, isAuthenticated: false };
  }

  return { email: session.user.email, isAuthenticated: true };
});
