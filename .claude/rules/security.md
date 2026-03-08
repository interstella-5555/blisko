# `security` — GDPR, data safety

- `security/filter-soft-deleted` — The `user` table has `deletedAt`. Soft-deleted users (`deletedAt IS NOT NULL`) must be **invisible everywhere**: nearby queries, waves, conversations, group members, status matching, discoverable groups. Standard filter: `notInArray(schema.profiles.userId, db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)))`. The `isAuthed` tRPC middleware already blocks soft-deleted users from making API calls.

- `security/new-tables-check` — When adding new tables or queries that reference users, always check if soft-deleted users should be filtered.
