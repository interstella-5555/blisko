import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ensures the anonymization transaction in queue.ts clears all PII-bearing
 * profile columns. If a new column is added to the profiles schema but not
 * handled in anonymization, this test will fail.
 */
describe("anonymization completeness", () => {
  // Columns that are safe to keep after anonymization (non-PII system fields)
  const SAFE_COLUMNS = new Set(["id", "userId", "createdAt", "updatedAt"]);

  it("anonymization covers all PII-bearing profile columns", () => {
    const schemaSource = readFileSync(resolve(__dirname, "../src/db/schema.ts"), "utf-8");
    const queueSource = readFileSync(resolve(__dirname, "../src/services/queue.ts"), "utf-8");

    // Extract column names from profiles table definition
    const profileColumnsMatch = schemaSource.match(
      /export const profiles = pgTable\(\s*"profiles",\s*\{([\s\S]*?)\},\s*\(table\)/,
    );
    expect(profileColumnsMatch).not.toBeNull();

    const columnNames = [...profileColumnsMatch![1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]);

    expect(columnNames.length).toBeGreaterThan(10); // sanity check

    // Extract fields set in the profiles anonymization block (inside tx, not db)
    const anonymizeMatch = queueSource.match(
      /await tx\s*\n\s*\.update\(schema\.profiles\)\s*\.set\(\{([\s\S]*?)\}\)\s*\.where\(eq\(schema\.profiles\.userId/,
    );
    expect(anonymizeMatch).not.toBeNull();

    const anonymizedFields = new Set([...anonymizeMatch![1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]));

    const missingColumns = columnNames.filter((col) => !SAFE_COLUMNS.has(col) && !anonymizedFields.has(col));

    expect(missingColumns).toEqual([]);
  });
});
