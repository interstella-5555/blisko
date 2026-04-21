// Avatar URL resolver — composes imgproxy URLs from a source pointer and a target pixel size.
//
// Source pointers stored in `profiles.avatarUrl`:
//   - our uploads: `s3://${BUCKET_NAME}/uploads/{uuid}.{ext}` (BUCKET_NAME is Railway-generated)
//   - OAuth:       `https://lh3.googleusercontent.com/...`, `https://is1-ssl.mzstatic.com/...`, ...
//   - seeds:       `https://placekitten.com/...`, `https://randomuser.me/...`
//
// When the source prefix is in IMGPROXY_SOURCES, we wrap it in an imgproxy URL:
//   {base}/unsafe/rs:fill:{N}:{N}/f:webp/plain/{SOURCE}
// Unknown sources (Facebook's dynamic CDN, anything else) fall through as raw — the caller
// renders the original URL as-is. See BLI-256 for rehosting FB avatars to S3.

/**
 * Source URL prefixes imgproxy knows how to fetch. `s3://` covers any bucket — the
 * bucket name is Railway-generated (`storage-<id>`) and lives in `BUCKET_NAME` on
 * the api service. imgproxy enforces the concrete bucket via its own
 * `IMGPROXY_ALLOWED_SOURCES` env var; the helper's job here is just to decide
 * which sources are eligible for the imgproxy round-trip vs. raw passthrough.
 */
export const IMGPROXY_SOURCES = [
  "s3://",
  // Google OAuth — `/a/` path is reserved for OAuth profile pictures; Google
  // Photos / Drive share the same domain on different paths (`/d/`, `/pw/`, etc)
  // which we intentionally don't proxy. Google rotates lh1..lh6 for load balance.
  "https://lh1.googleusercontent.com/a/",
  "https://lh2.googleusercontent.com/a/",
  "https://lh3.googleusercontent.com/a/",
  "https://lh4.googleusercontent.com/a/",
  "https://lh5.googleusercontent.com/a/",
  "https://lh6.googleusercontent.com/a/",
  // Apple OAuth intentionally omitted — Sign in with Apple does not return a
  // profile image URL (per Apple + better-auth docs). mzstatic.com is the App
  // Store / Apple Music CDN, not OAuth-related.
  // LinkedIn OAuth — narrow to `/dms/image/` (profile pics live there). LinkedIn
  // doesn't publish a dedicated prefix for profile-only images.
  "https://media.licdn.com/dms/image/",
  // seed avatars — narrow to `/api/portraits/` to avoid their JSON API surface
  "https://randomuser.me/api/portraits/",
] as const;

/**
 * Cache buckets for imgproxy-served avatars. A target pixel size rounds up to the
 * smallest bucket that covers it, keeping the cache topology small. See BLI-257 for
 * the sibling effort to normalize `<Avatar size>` props to design tokens and drop
 * buckets we never hit.
 */
export const AVATAR_PIXEL_BUCKETS = [96, 144, 288, 384, 576] as const;

/**
 * Round up `targetPx` to the smallest pixel bucket that covers it. Clamps to the
 * largest bucket if the target exceeds all of them.
 */
export function avatarPixelBucket(targetPx: number): number {
  for (const bucket of AVATAR_PIXEL_BUCKETS) {
    if (bucket >= targetPx) return bucket;
  }
  return AVATAR_PIXEL_BUCKETS[AVATAR_PIXEL_BUCKETS.length - 1];
}

function sourceIsAllowed(source: string): boolean {
  return IMGPROXY_SOURCES.some((prefix) => source.startsWith(prefix));
}

/**
 * Compose an imgproxy URL for a given source and target pixel size.
 *
 * @param source       Source pointer from `profiles.avatarUrl` (or group avatarUrl etc.)
 * @param targetPx     Target size in physical pixels — caller passes `sizePt * pixelRatio`
 * @param imgproxyBase Base URL of the imgproxy service (e.g. `https://img.blisko.app`)
 *
 * Returns `null` when `source` is null/empty. Returns the raw `source` when it doesn't
 * match any allow-listed prefix (e.g. Facebook CDN URLs — the caller should render the
 * original image and accept no resize). Otherwise returns a composed imgproxy URL.
 */
export function buildImgproxyUrl(
  source: string | null | undefined,
  targetPx: number,
  imgproxyBase: string,
): string | null {
  if (!source) return null;
  // Fall back to the raw source when imgproxy isn't configured (e.g. dev device
  // missing `EXPO_PUBLIC_IMGPROXY_URL`). Building `/unsafe/...` against an empty
  // base would produce a truthy relative URL that silently 404s in <Image>.
  if (!imgproxyBase) return source;
  if (!sourceIsAllowed(source)) return source;

  const bucket = avatarPixelBucket(targetPx);
  return `${imgproxyBase}/unsafe/rs:fill:${bucket}:${bucket}/f:webp/plain/${encodeURIComponent(source)}`;
}

/**
 * Extract the S3 object key from an `s3://bucket/key` URL. Returns `null` for any
 * other scheme — anonymization and cleanup jobs should never delete OAuth or seed
 * URLs because those objects aren't ours.
 */
export function extractOurS3Key(url: string | null | undefined): string | null {
  if (!url?.startsWith("s3://")) return null;
  const match = url.match(/^s3:\/\/[^/]+\/(.+)$/);
  return match?.[1] ?? null;
}
