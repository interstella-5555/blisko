import { describe, expect, it } from "vitest";
import { isTestUserEmail } from "../src/services/test-users-cleanup";

describe("isTestUserEmail", () => {
  it("matches @example.com emails that are not chatbot demos", () => {
    expect(isTestUserEmail("12345@example.com")).toBe(true);
    expect(isTestUserEmail("seed1@example.com")).toBe(true);
    expect(isTestUserEmail("test-run-abc@example.com")).toBe(true);
  });

  it("excludes chatbot demo users user[0-249]@example.com", () => {
    expect(isTestUserEmail("user0@example.com")).toBe(false);
    expect(isTestUserEmail("user42@example.com")).toBe(false);
    expect(isTestUserEmail("user249@example.com")).toBe(false);
  });

  it("excludes non-@example.com addresses", () => {
    expect(isTestUserEmail("real@gmail.com")).toBe(false);
    expect(isTestUserEmail("user42@example.org")).toBe(false);
    expect(isTestUserEmail("foo@example.co")).toBe(false);
  });

  it("is case-sensitive on domain (matches Postgres LIKE behavior)", () => {
    expect(isTestUserEmail("12345@EXAMPLE.com")).toBe(false);
  });

  it("conservatively excludes any user*@example.com (mirrors SQL LIKE)", () => {
    // `user-abc@example.com` would technically be a test user, but our SQL
    // filter is `LIKE 'user%'` for safety — better to leave a few orphans
    // than to nuke a chatbot demo by mistake.
    expect(isTestUserEmail("user-abc@example.com")).toBe(false);
  });
});
