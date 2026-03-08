-- Remove duplicates: keep the newest analysis per (from_user_id, to_user_id) pair
DELETE FROM "connection_analyses" WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY from_user_id, to_user_id ORDER BY updated_at DESC
    ) AS rn
    FROM "connection_analyses"
  ) ranked WHERE rn > 1
);--> statement-breakpoint
DROP INDEX "ca_pair_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "ca_pair_uniq" ON "connection_analyses" USING btree ("from_user_id","to_user_id");