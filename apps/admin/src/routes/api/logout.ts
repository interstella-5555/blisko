import { createFileRoute } from "@tanstack/react-router";
import { deleteSession, parseSessionToken } from "~/lib/auth";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cookie = request.headers.get("cookie") || "";
        const token = parseSessionToken(cookie);
        if (token) deleteSession(token);

        const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

        return Response.json(
          { ok: true },
          {
            headers: {
              "Set-Cookie": `admin-session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`,
            },
          },
        );
      },
    },
  },
});
