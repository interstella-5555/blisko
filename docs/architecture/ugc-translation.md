# UGC Translation

> v1 — On-demand translation of user-generated profile content. BLI-279, 2026-05-21.

Polish and Ukrainian users see each other on the map. Bios, "Kogo szukam", AI portraits, and "na teraz" statuses are written in whichever language the author picked, and translated for cross-locale viewers — Twitter/X pattern (original on the wire, viewer sees their language, "Pokaż oryginał" toggles back).

Chat messages are **out of scope** (workflow v4 §1.4 explicitly disables auto-translation for DMs).

## What gets translated

UGC fields on `profiles` visible to other users:

| Field | Source | Translation trigger |
|---|---|---|
| `bio` | AI-generated from Q&A, optionally hand-edited | Dual-language LLM output + inline translation on edit |
| `looking_for` | Same | Same |
| `portrait` | AI-generated from bio + lookingFor | Dual-language LLM output in `generatePortrait` |
| `current_status` | User-typed, max 150 chars | Inline OpenAI call in `setStatus` mutation |

Out of scope: `display_name` (proper nouns), `superpower` (rare, deferred), `social_links.*username` (proper nouns), profile messages (workflow v4 §1.4).

## Schema

Two columns/tables on top of the existing `profiles`:

```sql
-- profiles.content_locale: language of the original UGC text on this row.
ALTER TABLE profiles ADD COLUMN content_locale VARCHAR(2) DEFAULT 'pl' NOT NULL;

-- profile_translations: per-(user, field, locale) translation cache.
CREATE TABLE profile_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  field VARCHAR(32) NOT NULL,  -- 'bio' | 'looking_for' | 'portrait' | 'current_status'
  locale VARCHAR(2) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now() NOT NULL,
  updated_at TIMESTAMP DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX profile_translations_user_field_locale_uniq
  ON profile_translations (user_id, field, locale);
CREATE INDEX profile_translations_user_id_idx ON profile_translations (user_id);
```

**Invariant:** `profile_translations` NEVER holds a row where `locale = profiles.content_locale` for the same user. The canonical (source-language) version stays on `profiles.*` — hot reads (nearby, map, matching pipeline) read it without joining. The table only stores *other* locales.

Future-proof: new locale = widen `LOCALE_CODES` in `@repo/shared`, update prompts. No schema change. Migration: `0031_add_profile_translations.sql`.

## Generation paths

### AI-generated (bio, lookingFor, portrait)

`generateProfileFromQA` and `generatePortrait` now return `{ pl: …, uk: … }` in a single LLM call. The model receives `<source_language>pl|uk</source_language>` and writes both versions. Cheaper than chaining a translate pass (~10 % fewer tokens) and the translation is higher quality because the model has full source context for both.

Token budgets bumped 2× (4000 for `generateProfileFromQA`, 2000 for `generatePortrait`) to leave room for both languages plus reasoning overhead.

### User-typed (currentStatus)

`profiles.setStatus` is rate-limited and already optimistic on mobile. After moderation:

1. Read user's locale (`profiles.locale`, default `pl`).
2. `translateInline(text, statusLocale, otherLocale)` → ~1-2 s OpenAI call.
3. Inside one transaction: UPDATE `profiles.current_status` + `content_locale`, DELETE old translation row for the field, INSERT new translation.
4. Enqueue status-matching (canonical PL is used downstream).

Mobile shows the new status via optimistic UI, so the inline latency is invisible.

### Edits to bio/lookingFor (profiles.update)

User hand-edits in Settings → Edit profile. Single mutation:

1. Read user's `profiles.locale` to derive new `content_locale`.
2. UPDATE `profiles` with new text + new `content_locale`.
3. DELETE all translations for the user (D5 invalidation rule).
4. `enqueueProfileAI(userId, bio, lookingFor)` — the worker regenerates portrait dual-language AND translates the new bio/lookingFor inline before writing to `profile_translations`.

The 30-second BullMQ debounce already on `generate-profile-ai` collapses rapid edits.

### On-demand viewer trigger (`profiles.translateContent`)

Fallback when the cache hasn't been populated yet (race with the async job, AI fallback returned source text, or admin manually clearing). Mutation, 30 req / 5 min per viewer.

1. Block + visibility checks (same as `getById`).
2. Cache lookup on `profile_translations(user, field, viewerLocale)`. Hit → return immediately, no AI call.
3. Cache miss → `translateInline` → upsert → return.

Mobile renders a "Przetłumacz" button on UGC where `pickDisplayText` returns `state: "needs"`.

## Matching pipeline — canonical-PL always

The T1 cosine / T2 quick-score / T3 connection-analysis chain works exclusively in Polish. Mixing UA originals + their PL translations would distort embedding spaces and split-brain LLM scoring.

Helper:

```ts
function getCanonicalText(profile, field, translations) {
  if (profile.contentLocale === "pl") return profile[field];
  return translations.find(t => t.field === field && t.locale === "pl")?.content
      ?? profile[field];
}
```

Call sites (all in `apps/api/src/services/queue.ts`):
- `processAnalyzePair` — T3 portraits + lookingFor → `analyzeConnection`
- `processQuickScore` — same fields → `quickScore`
- `processStatusMatching` + `processProximityStatusMatching` — currentStatus, bio, lookingFor → embedding generation and `evaluateStatusMatch`
- `processGenerateProfileAI` — feeds embedding + interests off the PL portrait (the model gives us both languages; we pick PL for matching, canonical for storage).

The helper is in `apps/api/src/services/profile-translations.ts`. Profile translation rows are batch-fetched via `getTranslationsForUsers([id1, id2])` to keep these processors at 1 DB round-trip.

## Read paths — viewer-side translation

`profiles.me` and `profiles.getById` ship `translations: ProfileTranslationRow[]` (only fields visible to the viewer — soft-deleted users + private/inactive statuses get filtered).

Mobile component `<TranslatableText>` wraps each UGC field and uses `pickDisplayText`:

| State | When | UI |
|---|---|---|
| `original` | viewer locale === source | plain text, no affordance |
| `translated` | cached translation present | translated text + "Pokaż oryginał" toggle |
| `needs` | translation missing | original + "Przetłumacz" button |

`useTranslationStore` (USER_SCOPED) holds in-session "Pokaż oryginał" toggles and translations from the on-demand mutation that haven't been refetched into the profile yet.

## Cost model

| Path | Calls | Per-call cost (gpt-5-mini standard) |
|---|---|---|
| Profile gen from Q&A | 1 per onboarding/refresh | ~$0.005 (dual-language) |
| Portrait regen | 1 per profile edit | ~$0.0015 (dual-language) |
| Bio/lookingFor inline translate | 2 per profile edit | ~$0.0002 each |
| Status translate | 1 per setStatus | ~$0.0001 |
| On-demand `translateContent` | 1 per viewer hit (rate-limited 30/5min) | ~$0.0001 |

Dual-language generation actually saves money vs sequential translate (~10 % fewer input tokens, shared context). All calls go through `withAiLogging` so they show up in `metrics.ai_calls` with `jobName` = `generate-profile-ai` / `generate-profile-from-qa` / `translate-ugc` / `translate-status` / `translate-ugc-ondemand`.

## GDPR

- `profile_translations` cascades on `user.id` ON DELETE (hard-delete).
- Anonymization job (`anonymize-user` in `queue-ops.ts`) DELETEs all rows for the user inside the same transaction that scrubs `profiles.*`.
- Data export (`apps/api/src/services/data-export.ts`) includes `profileTranslations` + `contentLocale`.
- No soft-delete filter needed — translations are only queryable via the user's profile, which is already gated by `userIsVisibleTo` / `isStatusActive`.

## Impact map

If you change this system, also check:

- `docs/architecture/ai-matching.md` — pipeline must read canonical PL via `getCanonicalText`.
- `docs/architecture/ai-profiling.md` — dual-language prompts.
- `docs/architecture/database.md` — schema for `profile_translations` + `content_locale`.
- `docs/architecture/user-profiles.md` — `contentLocale` field.
- `docs/architecture/i18n.md` — UGC translation is the user-facing extension of UI i18n (BLI-277/278).
- `docs/architecture/gdpr-compliance.md` — anonymization + export coverage.
- `docs/architecture/data-export.md` — JSON schema includes translations.
- `docs/architecture/rate-limiting.md` — `profiles.translateContent` bucket.
- `docs/architecture/ai-cost-tracking.md` — three new `jobName` buckets.

## Out of scope (potential follow-ups)

- `superpower` translation (rare field, deferred).
- `social_links` (proper nouns / handles).
- English / Spanish / 3rd languages (schema future-proof, but no prompt examples).
- On-device translation fallback for offline use.
- Translation cache pruning (the table grows linearly with users × non-source locales; revisit at scale).
