import { createFileRoute } from "@tanstack/react-router";
import { auth, isAllowedEmail } from "~/lib/auth";
import { getQueue } from "~/lib/queue";

export const Route = createFileRoute("/api/queue-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-side auth check — direct HTTP calls bypass the _authed layout
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const queue = getQueue();
          const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
          return Response.json({
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
          });
        } catch (error) {
          console.error("[admin] queue health error:", error);
          return Response.json(
            { waiting: 0, active: 0, completed: 0, failed: 0, error: "Redis unavailable" },
            { status: 503 },
          );
        }
      },
    },
  },
});
