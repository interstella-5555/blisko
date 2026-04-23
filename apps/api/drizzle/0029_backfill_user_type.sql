-- 0029_backfill_user_type — one-time set initial types
--
-- BLI-271. Sets type='demo' for chatbot seed users (user[0-249]@example.com,
-- conservatively also any user%@example.com), 'test' for the rest of
-- @example.com, leaving real users at the column default ('regular').
-- Idempotent via type='regular' guard. Separated from DDL per
-- migrations/one-concern.

UPDATE "user"
SET type = 'demo'
WHERE email LIKE 'user%@example.com'
  AND type = 'regular';

UPDATE "user"
SET type = 'test'
WHERE email LIKE '%@example.com'
  AND email NOT LIKE 'user%@example.com'
  AND type = 'regular';
