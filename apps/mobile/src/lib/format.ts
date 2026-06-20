import { t } from "@lingui/core/macro";
import ms from "ms";

export const formatDistance = (meters: number): string => {
  if (meters < 50) return t`tuż obok`;
  const rounded = Math.round(meters / 100) * 100;
  if (rounded < 1000) return `~${rounded} m`;
  return `~${(rounded / 1000).toFixed(1)} km`;
};

/**
 * "teraz" / "X min temu" / "X godz. temu" / "wczoraj" / "X dni temu" / "dawno temu".
 * Returns empty string for null/undefined — caller decides whether to render anything.
 *
 * "Teraz" threshold is 5 minutes because location updates fire foreground-only
 * (tab mount + 3s retry — see docs/architecture/location-privacy.md), so anything
 * under 5 min effectively means the other user just had the app open.
 */
const FRESH_WINDOW = ms("5 minutes");

export const formatLastActive = (lastLocationUpdate: Date | string | null | undefined): string => {
  if (!lastLocationUpdate) return "";
  const ts = typeof lastLocationUpdate === "string" ? new Date(lastLocationUpdate) : lastLocationUpdate;
  const diffMs = Date.now() - ts.getTime();
  if (diffMs < FRESH_WINDOW) return t`teraz`;

  const diffMin = Math.floor(diffMs / ms("1 minute"));
  if (diffMin < 60) return t`${diffMin} min temu`;

  const diffHours = Math.floor(diffMs / ms("1 hour"));
  if (diffHours < 24) return t`${diffHours} godz. temu`;

  const diffDays = Math.floor(diffMs / ms("1 day"));
  if (diffDays < 2) return t`wczoraj`;
  // diffDays is 2–6 here (1 → "wczoraj" above, ≥7 → "dawno temu" below), which is
  // uniformly "dni" in Polish — so a plain `t` interpolation is correct. We avoid the
  // standalone `plural()` macro: @lingui/babel-plugin-lingui-macro doesn't compile it
  // here (it stays an undefined runtime symbol → "prototype of undefined" redbox). BLI-303.
  if (diffDays < 7) return t`${diffDays} dni temu`;

  return t`dawno temu`;
};
