# `security` — GDPR, data safety

- `security/filter-soft-deleted` — The `user` table has `deletedAt`. Soft-deleted users (`deletedAt IS NOT NULL`) must be **invisible everywhere**: nearby queries, waves, conversations, group members, status matching, discoverable groups. Standard filter: `INNER JOIN` to `user` table with `isNull(schema.user.deletedAt)`, or `notExists()` for relational queries (see `drizzle/no-unbounded-in`). The `isAuthed` tRPC middleware already blocks soft-deleted users from making API calls.

- `security/new-tables-check` — When adding new tables or queries that reference users, always check if soft-deleted users should be filtered.
