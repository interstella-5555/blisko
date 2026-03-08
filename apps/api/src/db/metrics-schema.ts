import { index, integer, numeric, pgSchema, serial, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const metricsSchema = pgSchema("metrics");

export const requestEvents = metricsSchema.table(
  "request_events",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    requestId: text("request_id").notNull(),
    method: text("method").notNull(),
    endpoint: text("endpoint").notNull(),
    userId: text("user_id"),
    durationMs: integer("duration_ms").notNull(),
    statusCode: smallint("status_code").notNull(),
    appVersion: text("app_version"),
    platform: text("platform"),
    authProvider: text("auth_provider"),
    sessionId: text("session_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_re_timestamp").on(table.timestamp),
    index("idx_re_endpoint_ts").on(table.endpoint, table.timestamp),
    index("idx_re_user_ts").on(table.userId, table.timestamp),
  ],
);

export const sloTargets = metricsSchema.table("slo_targets", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint"),
  metricType: text("metric_type").notNull(),
  thresholdMs: integer("threshold_ms"),
  thresholdPct: numeric("threshold_pct"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type NewRequestEvent = typeof requestEvents.$inferInsert;
