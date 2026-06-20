export type NearbySnippet = { text: string | null; isHighlight: boolean };

/**
 * Pick the subtitle shown under a person in the nearby ("W okolicy") list, in
 * priority order (BLI-304):
 *   1. active status (`currentStatus`) — what they're up to right now
 *   2. bio essence (`bioEssence`) — one-sentence AI condensation of their bio
 *   3. raw bio — fallback while the essence hasn't been generated yet
 *
 * Status + essence read as the "signal" line and are highlighted; the raw-bio
 * fallback is muted. We deliberately never surface raw interest tags
 * ("Wspólne: …") or the per-pair pitch here — those live on the profile screen.
 */
export function getNearbySnippet(
  currentStatus: string | null | undefined,
  bioEssence: string | null | undefined,
  bio: string | null | undefined,
): NearbySnippet {
  const status = currentStatus?.trim();
  if (status) return { text: status, isHighlight: true };

  const essence = bioEssence?.trim();
  if (essence) return { text: essence, isHighlight: true };

  const fallback = bio?.trim();
  return { text: fallback || null, isHighlight: false };
}
