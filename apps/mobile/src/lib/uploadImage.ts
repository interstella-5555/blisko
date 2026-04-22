import { showToast } from "@/lib/toast";
import { useAuthStore } from "@/stores/authStore";

export interface UploadImageAsset {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}

/**
 * Thrown when `POST /uploads` rejects the image via AI moderation
 * (see `apps/api/src/services/moderation.ts`). Callers should catch this
 * specifically and surface a moderation-flavored message — anything else
 * from `uploadImage` is a plain transport / server error.
 */
export class ContentModeratedError extends Error {
  constructor() {
    super("CONTENT_MODERATED");
    this.name = "ContentModeratedError";
  }
}

export async function uploadImage(asset: UploadImageAsset): Promise<{ source: string }> {
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: asset.fileName || "image.jpg",
    type: asset.mimeType || "image/jpeg",
  } as unknown as Blob);

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
  const response = await fetch(`${apiUrl}/uploads`, {
    method: "POST",
    body: formData,
    headers: {
      authorization: `Bearer ${useAuthStore.getState().session?.token || ""}`,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "CONTENT_MODERATED") {
      throw new ContentModeratedError();
    }
    throw new Error("Upload failed");
  }

  return (await response.json()) as { source: string };
}

/**
 * Convenience: show the standard moderation toast if the error is a
 * `ContentModeratedError`, otherwise return `false` so the caller can
 * show its own generic fallback. Toast id matches the text-moderation
 * handler in globalErrorHandler.ts so bursts collapse.
 */
export function showModerationToastIfApplicable(error: unknown): boolean {
  if (!(error instanceof ContentModeratedError)) return false;
  showToast("error", "Zdjęcie narusza regulamin", undefined, { id: "content-moderation" });
  return true;
}
