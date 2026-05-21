// UGC text display resolver — figures out which version of a profile text
// (bio / lookingFor / portrait / currentStatus) to show in the viewer's
// language and which affordance to render alongside. BLI-279.
//
// Three states:
//   - "original"   → viewer's locale matches the source. Show plain text.
//   - "translated" → cached translation hit. Show translation + "Pokaż oryginał".
//   - "needs"      → no cached row. Show original + "Przetłumacz" button.
//
// The mobile UI maps these to the matching React pieces. Translation state is
// not persisted across sessions — it lives in `useTranslationStore` (set after
// `translateContent` mutation returns).

import type { LocaleCode, UgcTranslatableField } from "@repo/shared";

export type UgcDisplayState =
  | { state: "original"; text: string }
  | { state: "translated"; text: string; sourceLocale: LocaleCode; original: string }
  | { state: "needs"; text: string; sourceLocale: LocaleCode };

export type ProfileTranslationView = {
  field: UgcTranslatableField;
  locale: LocaleCode;
  content: string;
};

export interface PickDisplayTextInput {
  field: UgcTranslatableField;
  /** The original text on the profile (in `sourceLocale`). */
  original: string | null | undefined;
  /** Language the original was written in. */
  sourceLocale: LocaleCode | null | undefined;
  /** Viewer's UI locale. */
  viewerLocale: LocaleCode;
  /** Server-side cached translations for the target user. */
  translations: ProfileTranslationView[];
  /** Local override added in-session via `translateContent` mutation. */
  liveTranslation?: string;
  /**
   * `true` if the user clicked "Pokaż oryginał" — flips display back to the
   * source language even when a translation is available.
   */
  showOriginalOverride?: boolean;
}

export function pickDisplayText(input: PickDisplayTextInput): UgcDisplayState | null {
  const { field, original, sourceLocale, viewerLocale, translations, liveTranslation, showOriginalOverride } = input;
  if (!original) return null;
  const src = sourceLocale ?? "pl";

  // Source matches viewer → no translation flow at all.
  if (src === viewerLocale) {
    return { state: "original", text: original };
  }

  // Forced "Pokaż oryginał".
  if (showOriginalOverride) {
    return { state: "translated", text: original, sourceLocale: src, original };
  }

  // 1) Session-local translation (just landed from translateContent mutation).
  if (liveTranslation) {
    return { state: "translated", text: liveTranslation, sourceLocale: src, original };
  }

  // 2) Server-side cached row for viewer's locale.
  const cached = translations.find((t) => t.field === field && t.locale === viewerLocale);
  if (cached) {
    return { state: "translated", text: cached.content, sourceLocale: src, original };
  }

  // 3) No translation available → show original + "Przetłumacz" affordance.
  return { state: "needs", text: original, sourceLocale: src };
}
