import { and, isNull } from "drizzle-orm";
import { schema } from "@/db";

// Reusable gate for "is this user a live, interactable account?". Combines
// soft-delete (deletion grace period) and suspension (admin moderation) into a
// single predicate. Every discovery / matching / messaging query that joins
// `schema.user` should use this instead of `isNull(schema.user.deletedAt)` —
// forgetting the suspension side would leak suspended users back into nearby,
// matching, wave send pickers, etc.
//
// Scope note: this is pre-join by design. It must be composed with the rest of
// the WHERE via drizzle's `and(...)`. It is *not* a standalone `where` clause.
export const userIsActive = () => and(isNull(schema.user.deletedAt), isNull(schema.user.suspendedAt));
