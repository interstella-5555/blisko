// UGC translation service — helpers for storing, fetching, and translating
// translation rows on `profile_translations`. See `docs/architecture/ugc-translation.md`.
//
// Two scopes here:
//   1) "Canonical" reads — matching pipeline (T1/T2/T3) always wants the PL
//      version of a UGC field. `getCanonicalText` looks at `profile.contentLocale`
//      and either returns the original (PL) or the PL translation row.
//   2) Inline translation — `translateInline` wraps OpenAI with `withAiLogging`
//      so cost tracking, latency, and retries flow through the existing pipeline.
//      Used by `setStatus`, the on-demand `translateContent` mutation, and the
//      debounced 30-min retranslation job for hand-edited bios.
//
// BLI-279.

import { openai } from "@ai-sdk/openai";
import {
  AI_MODELS,
  LOCALE_CODES,
  type LocaleCode,
  UGC_TRANSLATABLE_FIELDS,
  type UgcTranslatableField,
  VIEWER_TRANSLATABLE_FIELDS,
} from "@repo/shared";
import { generateText } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { type AiCallInput, type AiLogCtx, withAiLogging } from "./ai-log";

// biome-ignore lint/suspicious/noExplicitAny: drizzle transaction type uses extensive generics
type Tx = any;

/** Map from `profile_translations.field` (snake_case) to the `profiles.*` column it shadows. */
const FIELD_TO_PROFILE_COLUMN: Record<
  UgcTranslatableField,
  "bio" | "lookingFor" | "portrait" | "currentStatus" | "bioEssence"
> = {
  bio: "bio",
  looking_for: "lookingFor",
  portrait: "portrait",
  current_status: "currentStatus",
  bio_essence: "bioEssence",
};

export type ProfileTranslationRow = {
  field: UgcTranslatableField;
  locale: LocaleCode;
  content: string;
};

/** Subset of `profiles` columns required to derive canonical text. */
export type ProfileLocaleSlice = {
  contentLocale: LocaleCode;
  bio?: string | null;
  lookingFor?: string | null;
  portrait?: string | null;
  currentStatus?: string | null;
  bioEssence?: string | null;
};

/**
 * Return the PL version of a UGC field, regardless of which language the user
 * wrote it in. Used by T1 embedding, T2 quick-score, T3 connection analyses,
 * and status-matching — the LLM pipeline expects PL input.
 *
 * Fallback chain: original (if contentLocale === pl) → PL translation row →
 * original anyway. The last fallback shouldn't fire in practice — the AI gen
 * + inline translate jobs always populate the PL row when content_locale ≠ pl.
 */
export function getCanonicalText(
  profile: ProfileLocaleSlice,
  field: UgcTranslatableField,
  translations: ProfileTranslationRow[],
): string | null {
  const camelField = FIELD_TO_PROFILE_COLUMN[field];
  const original = profile[camelField] ?? null;
  if (profile.contentLocale === "pl") return original;
  const tr = translations.find((t) => t.field === field && t.locale === "pl");
  return tr?.content ?? original;
}

/**
 * Return the viewer-locale version of a UGC field for display in lists/cards.
 * Symmetric to `getCanonicalText`, but resolves to an arbitrary viewer locale
 * instead of always PL. Used by the nearby list to show bio essence + status in
 * the reader's language. Falls back to the canonical original when no translation
 * row exists for the viewer's locale (race with the async gen job, or AI fallback
 * returned source text).
 */
export function getViewerText(
  profile: ProfileLocaleSlice,
  field: UgcTranslatableField,
  translations: ProfileTranslationRow[],
  viewerLocale: LocaleCode,
): string | null {
  const camelField = FIELD_TO_PROFILE_COLUMN[field];
  const original = profile[camelField] ?? null;
  if (profile.contentLocale === viewerLocale) return original;
  const tr = translations.find((t) => t.field === field && t.locale === viewerLocale);
  return tr?.content ?? original;
}

/** Delete every translation row for the user. Use inside a transaction when you
 *  also rewrite `profiles.*` so viewers never see a stale row. */
export async function deleteAllTranslationsForUser(userId: string, tx?: Tx): Promise<void> {
  const conn = tx ?? db;
  await conn.delete(schema.profileTranslations).where(eq(schema.profileTranslations.userId, userId));
}

/** Delete translations only for one field (used by `setStatus` so we don't
 *  blow away bio translations on every status update). */
export async function deleteTranslationsForField(userId: string, field: UgcTranslatableField, tx?: Tx): Promise<void> {
  const conn = tx ?? db;
  await conn
    .delete(schema.profileTranslations)
    .where(and(eq(schema.profileTranslations.userId, userId), eq(schema.profileTranslations.field, field)));
}

/** Upsert one translation row. Idempotent on (userId, field, locale). */
export async function upsertTranslation(
  userId: string,
  field: UgcTranslatableField,
  locale: LocaleCode,
  content: string,
  tx?: Tx,
): Promise<void> {
  const conn = tx ?? db;
  await conn
    .insert(schema.profileTranslations)
    .values({ userId, field, locale, content, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.profileTranslations.userId, schema.profileTranslations.field, schema.profileTranslations.locale],
      set: { content, updatedAt: new Date() },
    });
}

/** Bulk insert — used after dual-language AI generation. Replaces any existing
 *  translations for the listed (field, locale) pairs. */
export async function replaceTranslations(
  userId: string,
  rows: { field: UgcTranslatableField; locale: LocaleCode; content: string }[],
  tx?: Tx,
): Promise<void> {
  const conn = tx ?? db;
  if (rows.length === 0) return;
  for (const row of rows) {
    await upsertTranslation(userId, row.field, row.locale, row.content, conn);
  }
}

/** Fetch translation rows for one user — for the profile-detail viewer flow
 *  (`me` / `getById` → `TranslatableText`). Scoped to `VIEWER_TRANSLATABLE_FIELDS`
 *  so the `bio_essence` rows (resolved server-side in the nearby list, never
 *  rendered on the detail screen) don't bloat the payload. BLI-304. */
export async function getTranslationsForUser(userId: string): Promise<ProfileTranslationRow[]> {
  const rows = await db
    .select({
      field: schema.profileTranslations.field,
      locale: schema.profileTranslations.locale,
      content: schema.profileTranslations.content,
    })
    .from(schema.profileTranslations)
    .where(eq(schema.profileTranslations.userId, userId));
  return rows.filter(
    (r): r is ProfileTranslationRow =>
      (VIEWER_TRANSLATABLE_FIELDS as readonly string[]).includes(r.field) &&
      (LOCALE_CODES as readonly string[]).includes(r.locale),
  );
}

/** Fetch translation rows for a batch of users — used by nearby queries to
 *  avoid an N+1 round-trip. Returns a Map keyed by userId. */
export async function getTranslationsForUsers(userIds: string[]): Promise<Map<string, ProfileTranslationRow[]>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: schema.profileTranslations.userId,
      field: schema.profileTranslations.field,
      locale: schema.profileTranslations.locale,
      content: schema.profileTranslations.content,
    })
    .from(schema.profileTranslations)
    .where(inArray(schema.profileTranslations.userId, userIds));
  const map = new Map<string, ProfileTranslationRow[]>();
  for (const row of rows) {
    if (
      !(UGC_TRANSLATABLE_FIELDS as readonly string[]).includes(row.field) ||
      !(LOCALE_CODES as readonly string[]).includes(row.locale)
    ) {
      continue;
    }
    const list = map.get(row.userId) ?? [];
    list.push({ field: row.field, locale: row.locale, content: row.content });
    map.set(row.userId, list);
  }
  return map;
}

const LOCALE_LABELS: Record<LocaleCode, string> = {
  pl: "polski (Polish)",
  ua: "ukraiński (Ukrainian)",
};

/** Translate one UGC text via gpt-4o-mini. Keep the voice and tone, no
 *  meta-commentary. Returns the translated string; on failure returns the
 *  original text (callers treat this as "translation unavailable"). */
export async function translateInline(
  text: string,
  fromLocale: LocaleCode,
  toLocale: LocaleCode,
  ctx: AiLogCtx,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) return text;
  if (fromLocale === toLocale) return text;
  if (!text.trim()) return text;

  const model = ctx.model ?? AI_MODELS.sync;
  const system = `Tłumaczysz UGC z aplikacji społecznościowej. Zachowaj 1. lub 3. osobę i ogólny styl — nie zmieniaj rejestru. Nie dodawaj wyjaśnień, nie tłumacz imion własnych. Zwróć WYŁĄCZNIE przetłumaczony tekst, bez cudzysłowów ani komentarzy.`;
  const prompt = `Język źródłowy: ${LOCALE_LABELS[fromLocale]}
Język docelowy: ${LOCALE_LABELS[toLocale]}

<tekst>${text}</tekst>`;

  const input: AiCallInput = {
    kind: "generateText",
    model,
    system,
    prompt,
    temperature: 0.2,
    maxOutputTokens: 1000,
    providerOptions: null,
  };

  try {
    return await withAiLogging(ctx, input, async () => {
      const {
        text: out,
        usage,
        finishReason,
      } = await generateText({
        model: openai(model),
        system,
        prompt,
        temperature: 0.2,
        maxOutputTokens: 1000,
      });
      const cleaned = (out || "").trim() || text;
      return {
        result: cleaned,
        model,
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
        output: { text: out, finishReason },
      };
    });
  } catch (error) {
    console.error("[profile-translations] translateInline failed:", error);
    return text;
  }
}

/** Translate one UGC field across every locale that isn't the source. Returns
 *  the rows ready to feed into `replaceTranslations`. */
export async function translateFieldToAllLocales(
  text: string,
  field: UgcTranslatableField,
  sourceLocale: LocaleCode,
  ctx: AiLogCtx,
): Promise<{ field: UgcTranslatableField; locale: LocaleCode; content: string }[]> {
  const targets = LOCALE_CODES.filter((l) => l !== sourceLocale);
  const rows: { field: UgcTranslatableField; locale: LocaleCode; content: string }[] = [];
  for (const locale of targets) {
    const content = await translateInline(text, sourceLocale, locale, ctx);
    if (content && content !== text) {
      rows.push({ field, locale, content });
    } else if (content === text) {
      // Fallback path returned the source text — skip, the read-side `pickDisplayText`
      // will show "Przetłumacz" instead of a misleading "translated to PL" badge.
    }
  }
  return rows;
}
