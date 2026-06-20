import { buildImgproxyUrl } from "@repo/shared";
import { PixelRatio } from "react-native";

const IMGPROXY_URL = process.env.EXPO_PUBLIC_IMGPROXY_URL ?? "";

/**
 * Mobile-side avatar URL resolver. Takes the source pointer from the server
 * (`profiles.avatarUrl`) and a logical `sizePt` in React Native points; returns
 * an imgproxy URL sized for the current device's pixel ratio. Unknown sources
 * (e.g. Facebook CDN) fall through as raw — see BLI-256.
 */
export function resolveAvatarUri(source: string | null | undefined, sizePt: number): string | null {
  const targetPx = Math.ceil(sizePt * PixelRatio.get());
  const resolved = buildImgproxyUrl(source, targetPx, IMGPROXY_URL);
  // React Native's <Image> cannot load `s3://` pointers. If imgproxy is
  // misconfigured (e.g. EXPO_PUBLIC_IMGPROXY_URL missing in the build env),
  // buildImgproxyUrl returns the raw `s3://` source — handing that to <Image>
  // throws "No suitable image URL loader found". Drop to the initials fallback
  // (null) instead of crashing the render tree. BLI-303.
  if (resolved?.startsWith("s3://")) return null;
  return resolved;
}
