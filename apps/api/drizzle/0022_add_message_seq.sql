-- add_message_seq — per-conversation monotonic sequence number
--
-- Adds seq column to messages table for deterministic pagination
-- and gap detection after WS disconnect. Backfills existing messages
-- using ROW_NUMBER ordered by created_at. BLI-224.

-- Step 1: Add nullable column
ALTER TABLE "messages" ADD COLUMN "seq" BIGINT;

-- Step 2: Backfill existing messages per conversation
UPDATE "messages" SET "seq" = sub.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY conversation_id ORDER BY created_at ASC
  ) AS row_num
  FROM "messages"
) sub
WHERE "messages"."id" = sub.id;

-- Step 3: Make NOT NULL
ALTER TABLE "messages" ALTER COLUMN "seq" SET NOT NULL;

-- Step 4: Add unique index (conversation_id, seq)
CREATE UNIQUE INDEX "messages_conv_seq_uniq" ON "messages" ("conversation_id", "seq");
