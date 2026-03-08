# `drizzle` — Drizzle ORM query patterns and conventions

- `drizzle/no-star-select` — Never fetch `SELECT *`. Always specify `columns` (relational API) or explicit fields (query builder / `.returning()`). Fetching unused columns wastes bandwidth, memory, and can leak sensitive data.

  ```ts
  // ✅
  db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
    columns: { displayName: true, avatarUrl: true },
  });
  // ✅
  db.insert(schema.waves).values({ ... })
    .returning({ id: schema.waves.id, status: schema.waves.status });
  ```

- `drizzle/use-find-first` — Single-row fetch → `findFirst()`, not destructured array from `db.select()`. Adds `LIMIT 1` automatically, returns object directly.

- `drizzle/schema-namespace` — Import `{ db, schema }` from `@/db`, access tables as `schema.profiles`, `schema.user`. **Never** import individual tables from `db/schema.ts`. Exception: `apps/api/src/db/index.ts` itself.

- `drizzle/tx-not-db` — Inside `db.transaction(async (tx) => { ... })`, ALL queries go through `tx`. Using `db` inside a transaction runs the query outside it — won't roll back on failure.

- `drizzle/use-returning` — Use `.returning()` after insert/update when you need the row. One round-trip, not two.

- `drizzle/use-on-conflict` — Upsert with `.onConflictDoUpdate()`, not select → if → update. Atomic, no race conditions.

- `drizzle/no-raw-execute` — Raw `sql` only inside query builder calls when there's no Drizzle equivalent (Haversine, `CASE WHEN`, `NULLS LAST`, column arithmetic). **Never** standalone `db.execute(sql`...`)`. If unavoidable, create a Linear ticket (label: Improvement) explaining why.

- `drizzle/use-filters` — Use Drizzle filter functions (`eq()`, `inArray()`, `between()`, `gt()`, `lt()`, `isNull()`, `and()`, `or()`, etc. from `drizzle-orm`) over raw `sql` for conditions.

- `drizzle/stable-api-only` — v1 relational queries only (`relations()` from `drizzle-orm`). Do NOT use beta v2 API (`defineRelations`, `r.one.*`/`r.many.*`).

- `drizzle/prepared-hot-paths` — Use `.prepare("name")` with `placeholder()` for queries executed on every request (auth, session lookup).

  ```ts
  const getSession = db.query.session.findFirst({
    where: eq(schema.session.token, placeholder("token")),
    with: { user: true },
  }).prepare("session_by_token");
  const session = await getSession.execute({ token: bearerToken });
  ```

- `drizzle/prefer-relational` — Default to `findMany`/`findFirst`. Switch to query builder (`db.select().from().leftJoin()`) when relational query grows past ~15 lines, over-fetches, or needs complex joins/aggregation. Think about what SQL Drizzle will generate — `findMany` with `with` runs separate queries or lateral joins per relation, query builder produces a single explicit JOIN. Pick whichever is significantly better.

- `drizzle/no-unbounded-in` — `inArray()` / `notInArray()` with a subquery that can grow past ~50 rows must be replaced with an INNER JOIN. `NOT IN (SELECT ...)` bypasses index usage and has a NULL pitfall (any NULL in the subquery makes the entire condition false). If a `db.query` (relational API) query would need this, convert it to `db.select()` with a JOIN instead.

  ```ts
  // ❌ notInArray with unbounded subquery
  notInArray(
    schema.profiles.userId,
    db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
  )

  // ✅ INNER JOIN
  db.select({ ... })
    .from(schema.profiles)
    .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
    .where(isNull(schema.user.deletedAt))
  ```

  If the refactor isn't trivial (e.g. query structure makes adding a JOIN complex), flag it to the user instead of forcing it.
