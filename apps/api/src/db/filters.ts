import type { UserType } from "@repo/db";
import { and, eq, isNull, ne } from "drizzle-orm";
import { schema } from "@/db";

// System-level "is this user a real, addressable account?" — soft-delete +
// suspension only. Subject-agnostic. Use in cron jobs, system maintenance,
// and any path that must process all live users regardless of category.
export const userIsLive = () => and(isNull(schema.user.deletedAt), isNull(schema.user.suspendedAt));

// Discovery / matching visibility filter. Adds a partition on top of liveness:
//   - subject is `test` → sees ONLY other test users (E2E bubble — keeps CI
//     fixtures self-contained, prevents production noise leaking into tests)
//   - everyone else → sees regular/demo/review (test fixtures hidden)
//
// Pass `ctx.userType` from any tRPC procedure that joins `schema.user` for a
// user-facing surface (nearby map, status match, wave send, group discovery,
// messaging participant lookup, etc).
//
// Future-proof: hiding `demo` from discovery at launch is a 1-line change —
// add `ne(schema.user.type, "demo")` to the non-test branch.
export const userIsVisibleTo = (subjectType: UserType | null) =>
  and(userIsLive(), subjectType === "test" ? eq(schema.user.type, "test") : ne(schema.user.type, "test"));
