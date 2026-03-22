# `migrations` — Database migration workflow

Schema: `apps/api/src/db/schema.ts`. Migrations: `apps/api/drizzle/`. Config: `apps/api/drizzle.config.ts`.

- `migrations/never-modify-merged` — **NEVER** modify existing migration files that are already on `main`. Merged migrations are immutable — they may have already run in production. You can only: (1) add new migrations, or (2) modify migrations you created on your current branch that haven't been merged yet.

- `migrations/no-db-push` — All changes through migrations, never `db:push`.

- `migrations/use-bun-scripts` — Always `bun run --filter '@repo/api' db:generate -- --name=my_change` and `bun run --filter '@repo/api' db:migrate`. Never bare `npx drizzle-kit`.

- `migrations/never-migrate-manually` — `apps/api/.env` points at the **production** database. Running `drizzle-kit migrate` locally hits prod. Migrations run automatically via Railway post-deploy hook. Only generate locally.

- `migrations/underscore-names` — Use underscores: `--name=add_metrics_schema` (not dashes).

- `migrations/one-concern` — Don't mix unrelated schema changes. Don't mix DDL (CREATE/ALTER) with DML (UPDATE/INSERT) in same migration.

- `migrations/no-interactive` — `drizzle-kit generate` blocks on rename ambiguity (interactive prompt). Split renames into two migrations: (1) add new column + copy data via `--custom`, (2) drop old column after deploying step 1. Additive changes (new tables, columns, indexes) are non-interactive — safe to run from Claude Code.

- `migrations/custom-type-changes` — Drizzle can't auto-generate type casts. Use `--custom` and write SQL manually with `USING` clause.

- `migrations/custom-for-pg-internals` — PostgreSQL extensions, custom functions, triggers → always use `--custom`. Drizzle can't generate these.

- `migrations/review-sql` — Always read generated `.sql` before committing. Drizzle-kit can produce unexpected DDL for complex changes.

- `migrations/commit-together` — Schema change + migration + application code = one commit/branch. Migration files and `drizzle/meta/` snapshots are committed to git.

- `migrations/custom-comments` — Custom migrations (`--custom`) must have SQL comments explaining WHY the custom approach is needed.

- `migrations/check-data-export` — After any schema change, check if `apps/api/src/services/data-export.ts` needs updating (GDPR/RODO data export).
