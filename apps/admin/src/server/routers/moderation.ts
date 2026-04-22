import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db";
import { enqueueOpsAndWait } from "~/lib/queue";
import { protectedProcedure, router } from "../trpc";

// Tabs in the admin UI map to these status groups. "history" is the user's
// verdict history (both kept and removed flags) so reviewers can scan prior
// decisions without diving into a user profile.
const STATUS_GROUPS = {
  review: ["flagged_review"],
  history: ["reviewed_ok", "reviewed_removed"],
  csam: ["blocked_csam"],
} as const;
type StatusGroup = keyof typeof STATUS_GROUPS;

export const moderationRouter = router({
  stats: protectedProcedure.query(async () => {
    const rows = await db
      .select({ status: schema.moderationResults.status, c: count() })
      .from(schema.moderationResults)
      .groupBy(schema.moderationResults.status);

    const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.c)]));
    return {
      pending: byStatus.flagged_review ?? 0,
      reviewedOk: byStatus.reviewed_ok ?? 0,
      reviewedRemoved: byStatus.reviewed_removed ?? 0,
      csam: byStatus.blocked_csam ?? 0,
    };
  }),

  list: protectedProcedure
    .input(
      z.object({
        group: z.enum(["review", "history", "csam"]).default("review"),
        limit: z.number().min(1).max(100).default(25),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const { group, limit, offset } = input;
      const statuses = STATUS_GROUPS[group as StatusGroup];
      const where = inArray(schema.moderationResults.status, [...statuses]);

      const rows = await db
        .select({
          id: schema.moderationResults.id,
          status: schema.moderationResults.status,
          uploadKey: schema.moderationResults.uploadKey,
          mimeType: schema.moderationResults.mimeType,
          flaggedCategories: schema.moderationResults.flaggedCategories,
          categoryScores: schema.moderationResults.categoryScores,
          createdAt: schema.moderationResults.createdAt,
          reviewedAt: schema.moderationResults.reviewedAt,
          reviewedBy: schema.moderationResults.reviewedBy,
          reviewDecision: schema.moderationResults.reviewDecision,
          reviewNotes: schema.moderationResults.reviewNotes,
          userId: schema.moderationResults.userId,
          // Uploader info (left join — row survives anonymization with userId nulled)
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
          email: schema.user.email,
        })
        .from(schema.moderationResults)
        .leftJoin(schema.user, eq(schema.moderationResults.userId, schema.user.id))
        .leftJoin(schema.profiles, eq(schema.moderationResults.userId, schema.profiles.userId))
        .where(where)
        .orderBy(desc(schema.moderationResults.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(schema.moderationResults).where(where);

      return { rows, total };
    }),

  reviewOk: protectedProcedure
    .input(z.object({ id: z.string().uuid(), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .update(schema.moderationResults)
        .set({
          status: "reviewed_ok",
          reviewedAt: new Date(),
          reviewedBy: ctx.session.email,
          reviewDecision: "ok",
          reviewNotes: input.notes ?? null,
        })
        .where(and(eq(schema.moderationResults.id, input.id), eq(schema.moderationResults.status, "flagged_review")))
        .returning({ id: schema.moderationResults.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Row not found or already reviewed",
        });
      }
      return { id: result[0].id };
    }),

  enqueueRemove: protectedProcedure
    .input(z.object({ id: z.string().uuid(), notes: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      // Check the row exists and is pending before paying the queue round-trip.
      // Takedown is irreversible (bytes gone from S3) so we want a fast-fail
      // on stale clicks.
      const row = await db.query.moderationResults.findFirst({
        where: eq(schema.moderationResults.id, input.id),
        columns: { status: true },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
      if (row.status !== "flagged_review") {
        throw new TRPCError({ code: "CONFLICT", message: `Row is ${row.status}, cannot remove` });
      }

      await enqueueOpsAndWait(
        "admin-remove-flagged-upload",
        {
          type: "admin-remove-flagged-upload",
          moderationResultId: input.id,
          reviewedBy: ctx.session.email,
          reviewNotes: input.notes ?? undefined,
        },
        { jobId: `admin-remove-flagged-upload-${input.id}` },
      );

      return { id: input.id };
    }),
});
