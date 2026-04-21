import { buildImgproxyUrl } from "@repo/shared";

const IMGPROXY_URL = import.meta.env.VITE_IMGPROXY_URL ?? "";

/**
 * Admin-side avatar URL resolver. Takes the source pointer from the API and a logical
 * size in CSS pixels; returns an imgproxy URL sized for the current device's DPR.
 * Unknown sources (e.g. Facebook CDN) fall through as raw — see BLI-256.
 */
export function resolveAvatarUri(source: string | null | undefined, sizeCss: number): string | null {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const targetPx = Math.ceil(sizeCss * dpr);
  return buildImgproxyUrl(source, targetPx, IMGPROXY_URL);
}
