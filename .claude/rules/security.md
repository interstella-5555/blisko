# `security` — GDPR, data safety

## Account deletion — two-phase model

User deletion follows a two-phase approach:

1. **Soft-delete (grace period, 14 days):** `deletedAt` is set, account blocked by `isAuthed` middleware, data intact for potential recovery.
2. **Anonymization (after 14 days):** Cron job overwrites personal data in `user` and `profiles` tables with generic values, nullifies profiling Q&A answers, anonymizes metrics. Relationships (waves, messages, conversations) remain intact — the user appears as "Usunięty użytkownik" via FK to `user.name`. This is RODO/GDPR-compliant anonymization (Motyw 26 — anonymized data falls outside GDPR scope).

**No hashing** — plain overwrite with generic values. Hashing without salt is pseudonymization (still under GDPR), and salted hashes add complexity for no benefit. Just overwrite.

- `security/filter-soft-deleted` — During the grace period, soft-deleted users (`deletedAt IS NOT NULL`) must be **invisible in discovery**: nearby queries, discoverable groups, status matching. Standard filter: `INNER JOIN` to `user` table with `isNull(schema.user.deletedAt)`. The `isAuthed` tRPC middleware blocks soft-deleted users from making API calls. After anonymization, filtering becomes redundant (no data to show) but stays as safety net.

- `security/preserve-relationships` — When a user is deleted, their relational data (waves, messages, conversation participation, reactions, connection analyses, status matches, blocks) is **preserved, not deleted**. The user's identity is anonymized via the `user` and `profiles` tables — all FKs still point to the same `user.id`, which now shows "Usunięty użytkownik". This preserves conversation history and interaction records for other users.

- `security/new-tables-check` — When adding new tables or queries that reference users, check: (1) should soft-deleted users be filtered from discovery? (2) does the anonymization job need to clear data in this table? (3) is data-export affected?
