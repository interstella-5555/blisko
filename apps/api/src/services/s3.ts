// Shared S3 client for Tigris-backed object storage (uploads + quarantine).
//
// Previously three sites instantiated their own S3Client (index.ts /uploads,
// queue-ops hard-delete, data-export presign). One module keeps credentials
// configured in a single place and hosts the quarantine primitives for BLI-68.

import { S3Client } from "bun";

// `POST /uploads` writes fresh avatars here; `profiles.update` moves replaced
// ones to `quarantine/{userId}/` so abuse reports can still retrieve evidence
// even after the uploader has swapped the image. Tigris lifecycle policy on
// the quarantine prefix purges after 90 days; account anonymization purges
// the user's quarantine immediately.
const UPLOADS_PREFIX = "uploads/";
const QUARANTINE_PREFIX = "quarantine/";

export const s3Client = new S3Client({
  accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
  secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
  endpoint: process.env.BUCKET_ENDPOINT!,
  bucket: process.env.BUCKET_NAME!,
});

/**
 * Derive the quarantine S3 key for an uploaded avatar. Live uploads sit under
 * `uploads/` (see `POST /uploads`); the quarantine copy goes under
 * `quarantine/{userId}/{originalBasename}`. Anything else (e.g. an already-
 * quarantined key re-processed by mistake) is namespaced verbatim under the
 * user so the lifecycle policy still catches it.
 */
export function quarantineKeyForUpload(uploadKey: string, userId: string): string {
  const basename = uploadKey.startsWith(UPLOADS_PREFIX) ? uploadKey.slice(UPLOADS_PREFIX.length) : uploadKey;
  return `${QUARANTINE_PREFIX}${userId}/${basename}`;
}

/**
 * Move an uploaded avatar from `uploads/` to `quarantine/{userId}/`. Caller
 * should invoke this fire-and-forget — a failure must not block the profile
 * update. Tigris' lifecycle policy on the `quarantine/` prefix purges objects
 * after 90 days; `processHardDeleteUser` purges the whole prefix immediately
 * on account anonymization.
 *
 * Idempotent on repeat calls with the same source key: a missing source will
 * surface as a `delete()` / `write()` error which the caller logs.
 */
export async function quarantineAvatarKey(uploadKey: string, userId: string): Promise<void> {
  const quarantineKey = quarantineKeyForUpload(uploadKey, userId);
  await s3Client.write(quarantineKey, s3Client.file(uploadKey));
  await s3Client.delete(uploadKey);
}

/**
 * Delete every object under `quarantine/{userId}/`. Called during account
 * anonymization so that no previously-uploaded avatars remain after the user
 * has been forgotten. Independent of the lifecycle policy — GDPR erasure
 * happens immediately, not eventually.
 *
 * Paginates through 1000-key batches; individual deletes are swallowed + logged
 * so one missing object doesn't abort the whole purge.
 */
export async function purgeUserQuarantine(userId: string): Promise<void> {
  const prefix = `${QUARANTINE_PREFIX}${userId}/`;
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.list({ prefix, continuationToken, maxKeys: 1000 });
    const keys = response.contents?.map((obj) => obj.key) ?? [];

    await Promise.all(
      keys.map((key) =>
        s3Client.delete(key).catch((err) => {
          console.error(`[s3:quarantine] purge failed to delete ${key}:`, err);
        }),
      ),
    );

    continuationToken = response.isTruncated ? (response.nextContinuationToken ?? undefined) : undefined;
  } while (continuationToken);
}
