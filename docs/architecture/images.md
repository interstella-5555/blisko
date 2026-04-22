# Image Pipeline (Avatars + Portraits)

> v1 — BLI-254, 2026-04-22. Replaces earlier "presigned URL straight into `profiles.avatarUrl`" scheme.
> Updated 2026-04-22 — Quarantine prefix for replaced avatars (BLI-68). Old avatars move to `quarantine/{userId}/` on `profiles.update` instead of being orphaned or hard-deleted.

All user-facing image rendering goes through **imgproxy**, a self-hosted resize/transcode sidecar running on Railway. Mobile and admin never pull the original bytes — they build an imgproxy URL sized for the current device's pixel ratio, and imgproxy handles the rest (resize, WebP transcode, cache).

## Actors

```
[Mobile / Admin]
       │
       │ https://img.blisko.app/unsafe/rs:fill:144:144/f:webp/plain/<SOURCE>
       ▼
[Cloudflare]          ← orange-cloud proxy, 1-month edge cache
       │
       ▼
[imgproxy on Railway] ← darthsim/imgproxy:latest, reads IMGPROXY_ALLOWED_SOURCES
       │
       ▼
[Tigris S3 (private)] ← via S3 creds (s3:// sources)
[OAuth CDNs]          ← via HTTPS (Google / Apple / LinkedIn)
[Seed placeholders]   ← via HTTPS (randomuser.me)
```

## Source URL scheme

`profiles.avatarUrl` and `profiles.portrait` store a **source pointer**, not a render URL. The source is stable (no querystring, no expiry).

| Source | Example | Who stores it |
|---|---|---|
| Our uploads | `s3://${BUCKET_NAME}/uploads/{uuid}.{ext}` | `POST /uploads` returns this (`apps/api/src/index.ts`) |
| OAuth | `https://lh3.googleusercontent.com/...` | `profiles.create` copies `authUser.image` (`apps/api/src/trpc/procedures/profiles.ts:74`) |
| Seeds | `https://randomuser.me/...` | `apps/api/scripts/seed-users.ts` |

The API never stores presigned URLs with querystrings. The only time we presign is (a) inside `data-export.ts` when composing the export JSON and (b) inside `queue-ops.ts` for delete operations.

## Resolver helper (shared)

`packages/shared/src/avatar.ts` exports:

- **`IMGPROXY_SOURCES`** — prefix allow-list matching the imgproxy service's `IMGPROXY_ALLOWED_SOURCES` env var. Keep in sync.
- **`AVATAR_PIXEL_BUCKETS = [96, 144, 288, 384, 576]`** — cache-bucket ladder. A target pixel size rounds up to the smallest bucket that covers it. Used to keep the imgproxy cache topology small across many call-site sizes.
- **`buildImgproxyUrl(source, targetPx, imgproxyBase)`** — composes the imgproxy URL; returns `null` for empty source, returns the raw source for non-allow-listed URLs (Facebook CDN → see BLI-256).
- **`extractOurS3Key(url)`** — pulls the object key from `s3://bucket/key`; returns `null` for any other scheme so cleanup / deletion jobs never touch OAuth or seed URLs.

Platform wrappers (so each app supplies its own DPR + env var):

- `apps/mobile/src/lib/avatar.ts` → `resolveAvatarUri(source, sizePt)` — uses `PixelRatio.get()` and `EXPO_PUBLIC_IMGPROXY_URL`.
- `apps/admin/src/lib/avatar.ts` → `resolveAvatarUri(source, sizeCss)` — uses `window.devicePixelRatio` and `VITE_IMGPROXY_URL`.

## Pixel-bucket rationale

Retina devices have DPR 2 or 3. Rendering a `<Avatar size={44}>` on iPhone 15 needs 132 physical pixels. Without DPR scaling the image is blurry; with raw `size × DPR` every call-site size produces a unique cache entry. Buckets round up to compress N sizes × M DPRs into a fixed ladder.

Today's render matrix (DPR=3 column is what iPhones hit):

| Logical size (pt) | DPR=2 | DPR=3 | Bucket |
|---|---|---|---|
| 28 | 56 | 84 | 96 |
| 32 | 64 | 96 | 96 |
| 40 | 80 | 120 | 144 |
| 48 | 96 | 144 | 144 |
| 80 | 160 | 240 | 288 |
| 100 | 200 | 300 | 384 |

BLI-257 tracks collapsing the current 8 distinct `size` prop values into 4 design tokens (`sm/md/lg/xl`), after which the `288` bucket can be dropped.

## Imgproxy service

Deployed as a separate Railway service in the Blisko project (image: `darthsim/imgproxy:latest`). Stateless — no DB, no Redis. Request format:

```
/unsafe/rs:fill:{N}:{N}/f:webp/plain/{encoded-source}
```

`unsafe` = no signing. We lock down inbound via `IMGPROXY_ALLOWED_SOURCES` instead. Motivation: a mobile-side signing key could be extracted from an IPA/APK, and a server-side pre-sign endpoint would add a per-image round-trip. Public social-app avatars don't justify that complexity.

### Env vars

| Var | Value |
|---|---|
| `IMGPROXY_BIND` | `:8080` |
| `IMGPROXY_USE_S3` | `true` |
| `IMGPROXY_S3_ENDPOINT` | Tigris endpoint (same as api `BUCKET_ENDPOINT`) |
| `IMGPROXY_S3_REGION` | `auto` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Tigris creds (same as api `BUCKET_*`) |
| `IMGPROXY_ENFORCE_WEBP` | `true` (auto-serve WebP when Accept allows) |
| `IMGPROXY_QUALITY` | `82` |
| `IMGPROXY_MAX_SRC_RESOLUTION` | `20` (megapixels — pixel-bomb guard) |
| `IMGPROXY_MAX_SRC_FILE_SIZE` | `10485760` (10 MB) |
| `IMGPROXY_TTL` | `2592000` (30 days response `Cache-Control`) |
| `IMGPROXY_SET_CANONICAL_HEADER` | `true` |
| `IMGPROXY_ALLOWED_SOURCES` | `s3://${BUCKET_NAME}/,https://lh[1-6].googleusercontent.com/a/,https://media.licdn.com/dms/image/,https://randomuser.me/api/portraits/` — substitute the real bucket name from api's `BUCKET_NAME`, and expand `lh[1-6]` into 6 explicit prefixes (imgproxy doesn't support wildcards). Path prefixes `/a/`, `/dms/image/`, `/api/portraits/` narrow the allow-list to the specific OAuth-profile / seed-avatar routes on each CDN — prevents proxying arbitrary Google Photos, LinkedIn post images, or randomuser JSON through our imgproxy hostname (which would otherwise cache at Cloudflare for a month). Apple OAuth is not in the list because Sign in with Apple does not return a profile image URL. |

### Domain

CNAME `img.blisko.app` → Railway-generated domain. Cloudflare proxies (orange cloud) with a Cache Rule matching `Hostname equals img.blisko.app` and Edge TTL 1 month. Railway auto-renews Let's Encrypt.

### Healthcheck

`/health` — always returns 200. Wired in Railway service settings.

## Quarantine (replaced avatars)

When a user swaps their avatar via `profiles.update`, the previous `s3://` object is moved to `quarantine/{userId}/{basename}` before the DB row is overwritten. OAuth / seed URLs are skipped — `extractOurS3Key()` returns `null` for anything that isn't ours.

The move is **fire-and-forget**: `profiles.update` does not await it and does not fail the user's request on a quarantine error. Orphans log to stderr but can't happen silently.

### Why quarantine, not hard-delete

A hard-delete-on-swap approach destroys evidence. A user uploads something abusive, gets reported, then swaps the avatar before an admin looks — the S3 object is gone and there's nothing to forward to an abuse authority. Quarantine gives moderation a 90-day window. See `blocking-moderation.md` for the (unimplemented) report system that will eventually pin specific keys past the lifecycle expiry.

### Lifecycle

Tigris runs an S3-compatible lifecycle policy on the `quarantine/` prefix with an `Expiration` rule of 90 days from the object's `LastModified`. Configured via `PutBucketLifecycleConfiguration` (one-time setup, not in application code). The rule lives outside the app so adding a new quarantine consumer doesn't require code changes, just routing to the same prefix.

One-time setup against the prod bucket (Tigris is S3-compatible — works via aws CLI with Tigris endpoint + credentials):

```bash
# config.json
{
  "Rules": [{
    "ID": "quarantine-90d",
    "Status": "Enabled",
    "Filter": { "Prefix": "quarantine/" },
    "Expiration": { "Days": 90 }
  }]
}

AWS_ACCESS_KEY_ID=$BUCKET_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$BUCKET_SECRET_ACCESS_KEY \
aws s3api put-bucket-lifecycle-configuration \
  --endpoint-url $BUCKET_ENDPOINT \
  --bucket $BUCKET_NAME \
  --lifecycle-configuration file://config.json
```

Verify with `aws s3api get-bucket-lifecycle-configuration --endpoint-url $BUCKET_ENDPOINT --bucket $BUCKET_NAME`.

### GDPR erasure

`processHardDeleteUser()` calls `purgeUserQuarantine(userId)` alongside the current-avatar delete. Anonymization must forget the user immediately — we cannot wait up to 90 days for lifecycle to catch up. Purge paginates `ListObjectsV2` with `prefix=quarantine/{userId}/` and deletes each key.

### Helpers

`apps/api/src/services/s3.ts` exports the shared `s3Client` plus:

| Function | Purpose |
|---|---|
| `quarantineKeyForUpload(uploadKey, userId)` | Derive `quarantine/{userId}/{basename}` from an `uploads/` key |
| `quarantineAvatarKey(uploadKey, userId)` | Move the object. Called fire-and-forget from `profiles.update` |
| `purgeUserQuarantine(userId)` | List + delete the user's whole quarantine prefix. Called from `processHardDeleteUser` |

The `s3Client` export replaces three previous inline `new S3Client(...)` calls (`index.ts` `POST /uploads`, `queue-ops.ts` anonymization, `data-export.ts` presign) so credentials live in one place.

## Upload flow

`POST /uploads` (`apps/api/src/index.ts`):

1. Auth check → bearer token from session.
2. Rate limit check → `uploads` key, per user.
3. File validation (`image/*`, ≤5 MB).
4. Write raw bytes to `s3://${BUCKET_NAME}/uploads/{uuid}.{ext}` via Bun S3Client.
5. Return `{ source: "s3://blisko-bucket/uploads/{uuid}.{ext}" }`.

Mobile's `edit-profile.tsx` stores `source` straight into `profiles.avatarUrl` via `profiles.update` mutation. No client-side transformation.

Pre-BLI-254 the response was `{ url, key }` where `url` was a 7-day presigned URL. That URL went straight into `profiles.avatarUrl` and silently expired in prod — most users never noticed because they stayed on OAuth provider URLs. BLI-254 cutover script (`apps/api/scripts/bli254-migrate-avatar-urls.ts`) rewrote those legacy rows to the new `s3://` scheme in a one-shot migration.

## Consumers

- **Mobile `Avatar` component** (`apps/mobile/src/components/ui/Avatar.tsx`) — calls `resolveAvatarUri(uri, size)` to build an imgproxy URL for the current device pixel density. All 18 call-sites pass through it.
- **Mobile `GridClusterMarker`** (`apps/mobile/src/components/nearby/GridClusterMarker.tsx`) — renders raw `<Image>` inside a `<Marker>` for the single-user cluster case. Uses the same helper at 40pt. This is the most load-bearing imgproxy consumer — the map may render 50 distinct avatars simultaneously; imgproxy + Cloudflare cache is what keeps this cheap.
- **Admin `UserCell`** (`apps/admin/src/components/user-cell.tsx`) — the canonical shared component after dedup; waves / conversations / matching / user-analyses all route their `avatarUrl` through this.
- **Data export** (`apps/api/src/services/data-export.ts`) — `resolveExportableUrl()` presigns `s3://` sources to 7-day download URLs for the export JSON; OAuth / seed HTTPS URLs pass through untouched.
- **Anonymization** (`apps/api/src/services/queue-ops.ts`) — `extractOurS3Key()` pulls the object key from `s3://` URLs only; OAuth and seed URLs are intentionally skipped (they aren't ours to delete).

## Facebook OAuth caveat

Facebook avatar URLs (`graph.facebook.com/{user-id}/picture`) **redirect** to a dynamic CDN (`scontent-*.xx.fbcdn.net`) whose hostname rotates. Static allow-listing can't cover it, so the helper falls back to returning the raw source for any non-allow-listed URL. Mobile renders the full-resolution FB avatar directly, bypassing imgproxy. BLI-256 tracks rehosting FB avatars to our S3 at signup so they flow through the pipeline like everything else.

## Cost / scale

At current scale imgproxy runs comfortably on Railway's base tier (idle ~50 MB RAM, ~300 MB under active resize). Cloudflare's free tier handles the egress. A 96×96 WebP is typically ~3-5 KB; a full-resolution upload is ~2 MB — the bandwidth reduction per map marker is >99%.

## Impact Map

If you change this system, also check:

- `docs/architecture/mobile-architecture.md` — Avatar component section, map markers
- `docs/architecture/infrastructure.md` — imgproxy as a Railway service, env vars
- `docs/architecture/gdpr-compliance.md` — data-export presigns `s3://` sources
- `docs/architecture/account-deletion.md` — anonymization uses `extractOurS3Key` and calls `purgeUserQuarantine()`
- `docs/architecture/blocking-moderation.md` — quarantine is the evidence-preservation leg; image moderation on upload is the prevention leg (BLI-268)
- `packages/shared/src/avatar.ts` — helper source of truth
- Railway env var `IMGPROXY_ALLOWED_SOURCES` must stay in sync with `IMGPROXY_SOURCES` in the shared helper
