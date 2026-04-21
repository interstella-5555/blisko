import { describe, expect, it } from "vitest";
import { AVATAR_PIXEL_BUCKETS, avatarPixelBucket, buildImgproxyUrl, extractOurS3Key } from "../src/avatar";

const BASE = "https://img.blisko.app";

describe("avatarPixelBucket", () => {
  it("rounds up to the smallest covering bucket", () => {
    expect(avatarPixelBucket(1)).toBe(96);
    expect(avatarPixelBucket(96)).toBe(96);
    expect(avatarPixelBucket(97)).toBe(144);
    expect(avatarPixelBucket(144)).toBe(144);
    expect(avatarPixelBucket(200)).toBe(288);
    expect(avatarPixelBucket(300)).toBe(384);
    expect(avatarPixelBucket(384)).toBe(384);
    expect(avatarPixelBucket(500)).toBe(576);
  });

  it("clamps to the largest bucket when target exceeds all", () => {
    expect(avatarPixelBucket(10_000)).toBe(576);
  });

  it("every bucket maps to itself", () => {
    for (const b of AVATAR_PIXEL_BUCKETS) {
      expect(avatarPixelBucket(b)).toBe(b);
    }
  });
});

describe("buildImgproxyUrl", () => {
  it("returns null for null/undefined/empty source", () => {
    expect(buildImgproxyUrl(null, 96, BASE)).toBeNull();
    expect(buildImgproxyUrl(undefined, 96, BASE)).toBeNull();
    expect(buildImgproxyUrl("", 96, BASE)).toBeNull();
  });

  it("wraps our s3:// source in imgproxy URL", () => {
    const out = buildImgproxyUrl("s3://storage-kcd1m5rwdjmg8k6qp/uploads/abc.jpg", 120, BASE);
    expect(out).toBe(
      `https://img.blisko.app/unsafe/rs:fill:144:144/f:webp/plain/${encodeURIComponent("s3://storage-kcd1m5rwdjmg8k6qp/uploads/abc.jpg")}`,
    );
  });

  it("wraps Google OAuth URL", () => {
    const src = "https://lh3.googleusercontent.com/a/abc123";
    const out = buildImgproxyUrl(src, 96, BASE);
    expect(out).toBe(`https://img.blisko.app/unsafe/rs:fill:96:96/f:webp/plain/${encodeURIComponent(src)}`);
  });

  it("wraps seed URLs", () => {
    expect(buildImgproxyUrl("https://randomuser.me/api/portraits/men/42.jpg", 96, BASE)).toContain("unsafe/rs:fill");
  });

  it("falls back to raw URL for unknown sources (Facebook CDN etc)", () => {
    const fb = "https://scontent-waw1-1.xx.fbcdn.net/v/t39.30808-1/abc.jpg";
    expect(buildImgproxyUrl(fb, 96, BASE)).toBe(fb);
  });

  it("falls back to raw source when imgproxyBase is empty (env var missing)", () => {
    const src = "https://randomuser.me/api/portraits/men/42.jpg";
    expect(buildImgproxyUrl(src, 96, "")).toBe(src);
    expect(buildImgproxyUrl("s3://storage-kcd1m5rwdjmg8k6qp/uploads/abc.jpg", 96, "")).toBe(
      "s3://storage-kcd1m5rwdjmg8k6qp/uploads/abc.jpg",
    );
  });

  it("picks the right bucket for DPR=3 retina renders", () => {
    // 40pt at DPR=3 → 120px → bucket 144
    expect(buildImgproxyUrl("s3://storage-kcd1m5rwdjmg8k6qp/u/a.jpg", 120, BASE)).toContain(":144:144");
    // 100pt at DPR=3 → 300px → bucket 384
    expect(buildImgproxyUrl("s3://storage-kcd1m5rwdjmg8k6qp/u/a.jpg", 300, BASE)).toContain(":384:384");
    // 28pt at DPR=2 → 56px → bucket 96
    expect(buildImgproxyUrl("s3://storage-kcd1m5rwdjmg8k6qp/u/a.jpg", 56, BASE)).toContain(":96:96");
  });

  it("encodes source URL safely for query-looking characters", () => {
    const src = "https://lh3.googleusercontent.com/a/abc?sz=200";
    const out = buildImgproxyUrl(src, 96, BASE);
    expect(out).toContain(encodeURIComponent(src));
    expect(out).not.toContain("?sz=200"); // must be encoded, not raw
  });
});

describe("extractOurS3Key", () => {
  it("extracts key from s3:// URL", () => {
    expect(extractOurS3Key("s3://storage-kcd1m5rwdjmg8k6qp/uploads/abc.jpg")).toBe("uploads/abc.jpg");
    expect(extractOurS3Key("s3://another-bucket/foo/bar/baz.png")).toBe("foo/bar/baz.png");
  });

  it("returns null for non-s3 schemes (OAuth, seeds)", () => {
    expect(extractOurS3Key("https://lh3.googleusercontent.com/a/abc")).toBeNull();
    expect(extractOurS3Key("https://randomuser.me/api/portraits/men/42.jpg")).toBeNull();
  });

  it("returns null for null/undefined/empty", () => {
    expect(extractOurS3Key(null)).toBeNull();
    expect(extractOurS3Key(undefined)).toBeNull();
    expect(extractOurS3Key("")).toBeNull();
  });

  it("returns null for malformed s3:// (no key)", () => {
    expect(extractOurS3Key("s3://storage-kcd1m5rwdjmg8k6qp/")).toBeNull();
    expect(extractOurS3Key("s3://storage-kcd1m5rwdjmg8k6qp")).toBeNull();
  });
});
