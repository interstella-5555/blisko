import { createFileRoute } from "@tanstack/react-router";
import { desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auth, isAllowedEmail } from "~/lib/auth";
import { db, schema } from "~/lib/db";

export const Route = createFileRoute("/api/matches")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Server-side auth check — the _authed layout only protects page navigation,
        // direct HTTP calls to this route bypass it. Verify session + allowlist.
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user?.email || !isAllowedEmail(session.user.email)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
        const limit = 25;
        const offset = (page - 1) * limit;

        const fromProfile = alias(schema.profiles, "fromProfile");
        const toProfile = alias(schema.profiles, "toProfile");

        const [analyses, countResult] = await Promise.all([
          db
            .select({
              id: schema.connectionAnalyses.id,
              fromUserId: schema.connectionAnalyses.fromUserId,
              toUserId: schema.connectionAnalyses.toUserId,
              aiMatchScore: schema.connectionAnalyses.aiMatchScore,
              shortSnippet: schema.connectionAnalyses.shortSnippet,
              longDescription: schema.connectionAnalyses.longDescription,
              fromProfileHash: schema.connectionAnalyses.fromProfileHash,
              toProfileHash: schema.connectionAnalyses.toProfileHash,
              triggeredBy: schema.connectionAnalyses.triggeredBy,
              jobId: schema.connectionAnalyses.jobId,
              enqueuedAt: schema.connectionAnalyses.enqueuedAt,
              processedAt: schema.connectionAnalyses.processedAt,
              processDurationMs: schema.connectionAnalyses.processDurationMs,
              waitDurationMs: schema.connectionAnalyses.waitDurationMs,
              attemptsMade: schema.connectionAnalyses.attemptsMade,
              createdAt: schema.connectionAnalyses.createdAt,
              updatedAt: schema.connectionAnalyses.updatedAt,
              fromName: fromProfile.displayName,
              toName: toProfile.displayName,
            })
            .from(schema.connectionAnalyses)
            .leftJoin(fromProfile, eq(schema.connectionAnalyses.fromUserId, fromProfile.userId))
            .leftJoin(toProfile, eq(schema.connectionAnalyses.toUserId, toProfile.userId))
            .orderBy(desc(schema.connectionAnalyses.updatedAt))
            .limit(limit)
            .offset(offset),
          db.select({ count: sql<number>`count(*)::int` }).from(schema.connectionAnalyses),
        ]);

        const total = countResult[0]?.count ?? 0;
        const totalPages = Math.ceil(total / limit);

        return Response.json({ analyses, page, limit, total, totalPages });
      },
    },
  },
});
