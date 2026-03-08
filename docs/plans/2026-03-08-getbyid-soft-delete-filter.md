# getById Soft-Delete Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Filter soft-deleted users from `profiles.getById` endpoint so deleted user profiles are invisible.

**Architecture:** Add the same `notInArray` soft-delete filter used throughout the codebase to the `getById` query. Single file change.

**Tech Stack:** Drizzle ORM, tRPC, PostgreSQL

---

### Task 1: Add soft-delete filter to getById

**Files:**
- Modify: `apps/api/src/trpc/procedures/profiles.ts:453-454`

**Step 1: Add the soft-delete filter**

Change the `getById` query from:

```ts
const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, input.userId));
```

to:

```ts
const [profile] = await db
  .select()
  .from(schema.profiles)
  .where(
    and(
      eq(schema.profiles.userId, input.userId),
      notInArray(
        schema.profiles.userId,
        db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
      ),
    ),
  );
```

All needed imports (`and`, `notInArray`, `isNotNull`) are already imported on line 11.

**Step 2: Verify typecheck passes**

Run: `pnpm --filter @repo/api typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/api/src/trpc/procedures/profiles.ts
git commit -m "Filter soft-deleted users from profiles.getById (BLI-73)"
```
