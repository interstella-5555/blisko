/**
 * Test user email classifier — mirrors the SQL filter used by `cleanupTestUsers`:
 *   email LIKE '%@example.com' AND email NOT LIKE 'user%@example.com'
 *
 * Used:
 *   1. by tests, to lock the predicate down
 *   2. (future, BLI-271) by /dev/auto-login to set user.isTestUser on insert
 *
 * The chatbot demo users (user0..user249@example.com) are protected by the
 * `LIKE 'user%@example.com'` exclusion. This is intentionally conservative —
 * any `user*@example.com` is preserved, even non-numeric suffixes that could
 * plausibly be test users.
 */
export function isTestUserEmail(email: string): boolean {
  return email.endsWith("@example.com") && !email.startsWith("user");
}
