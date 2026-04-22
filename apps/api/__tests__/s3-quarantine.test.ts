import { describe, expect, it } from "vitest";
import { quarantineKeyForUpload } from "../src/services/s3";

describe("quarantineKeyForUpload", () => {
  it("moves a standard uploads/ key to the user's quarantine prefix", () => {
    expect(quarantineKeyForUpload("uploads/abc-123.jpg", "user-42")).toBe("quarantine/user-42/abc-123.jpg");
  });

  it("preserves the original extension", () => {
    expect(quarantineKeyForUpload("uploads/portrait.png", "u")).toBe("quarantine/u/portrait.png");
    expect(quarantineKeyForUpload("uploads/avatar.webp", "u")).toBe("quarantine/u/avatar.webp");
  });

  it("namespaces keys that don't match the uploads/ prefix under the user verbatim", () => {
    // Defensive: if a non-uploads key ever reaches the helper (future consumer,
    // future migration), the lifecycle policy on quarantine/ must still cover it.
    expect(quarantineKeyForUpload("legacy/old-key.jpg", "user-42")).toBe("quarantine/user-42/legacy/old-key.jpg");
  });

  it("scopes every user's quarantine to their own subdirectory", () => {
    const a = quarantineKeyForUpload("uploads/same.jpg", "user-a");
    const b = quarantineKeyForUpload("uploads/same.jpg", "user-b");
    expect(a).not.toBe(b);
    expect(a.startsWith("quarantine/user-a/")).toBe(true);
    expect(b.startsWith("quarantine/user-b/")).toBe(true);
  });
});
