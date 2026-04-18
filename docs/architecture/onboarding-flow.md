# Onboarding Flow

> v1 --- AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 --- Onboarding audit fixes: ghost-to-full visibility transition, inline AI fallback, answer persistence (BLI-173).
> Updated 2026-04-18 — Review screen no longer renders the "PORTRET OSOBOWOŚCI" section or the share-portrait toggle; portrait is applied silently and stays internal (BLI-199).

Onboarding turns a freshly authenticated user into a discoverable profile. Two paths: full AI-driven profiling (visible on map) or ghost profile (invisible, group-invite only). The flow generates a bio, "looking for" text, personality portrait, embedding vector, and extracted interests --- all via async BullMQ jobs with WS notification on completion.

## Terminology & Product Alignment

| PRODUCT.md term | Code term | UI label (PL) |
|-----------------|-----------|---------------|
| Onboarding Krok 1 (Kim jestes) | `intro` question (required) | "Czym sie zajmujesz i co sprawia ze tracisz poczucie czasu?" |
| Onboarding Krok 2 (Co oferujesz) | `offer` question (optional) | "Co mozesz zaoferowac innym?" |
| Onboarding Krok 3 (Status) | Not in onboarding --- set-status is post-onboarding | "Twoj status" |
| Onboarding Krok 4 (Widocznosc) | `visibility.tsx` (ghost vs fill) | "Chcesz byc widoczny?" |
| Potwierdzenie AI | `profiling-result.tsx` | "Oto jak Cie widze --- powiedz czy trafilem" |
| Ninja / Semi-Open / Full Nomad | visibilityMode in profile | (not set during onboarding, defaults to semi_open) |
| Ghost profile | `createGhostProfile`, isComplete=false | "Na razie tylko imie" |
| Follow-up questions | `generateFollowUpQuestions` (0--3 AI-generated) | "Jeszcze X pytanie/pytania" |

**Divergence from PRODUCT.md:** The product bible describes a 4-step flow ending with status setup and visibility mode selection. The implementation splits into: name+age, ghost-or-fill choice, questions, AI review. Status setup and visibility mode are available post-onboarding from the main app (set-status sheet, profile settings) rather than being mandatory onboarding steps.

---

## Full Flow Step-by-Step

### Step 0: Hook Screen

**File:** `apps/mobile/app/onboarding/hook.tsx`

Animated dark screen with 10 pulsing orange bubbles (#D4851C) and a headline: "Swiat jest pelen ludzi, ktorych potrzebujesz." CTA button "Zacznij" appears after 500ms fade-in. Auto-advances to Step 1 after 5 seconds via `setTimeout`. Both CTA tap and timeout call `router.replace("/onboarding")`.

### Step 1: Name + Age Confirmation

**File:** `apps/mobile/app/onboarding/index.tsx`

Labeled "Krok 1". User enters display name (server validator allows 2--50 characters, see `user-profiles.md`; the onboarding `TextInput` caps at `maxLength={30}` to keep the first-impression tile compact — users can extend it later via profile edit). `autoCapitalize: "words"`. Pre-filled from OAuth `user.name` if available. Age confirmation toggle: "Potwierdzam, ze mam ukonczone 18 lat" --- must be toggled on to proceed.

**Why display name is locked:** Prevents name-change spam. Once set, it can only be changed through profile edit (which has rate limiting).

**Why age confirmation, not date of birth:** The current implementation uses a boolean toggle, not a date picker. `dateOfBirth` is mentioned in PRODUCT.md but not yet implemented in the onboarding flow. The 18+ gate is a legal requirement.

Logout button (IconX + "Wyloguj") in the step header --- clears push token, signs out, resets all stores.

Proceeds to: `/onboarding/visibility`

### Step 2: Visibility Choice

**File:** `apps/mobile/app/onboarding/visibility.tsx`

Two options:
- **"Wypelnij profil"** (accent button) --- continues to questions flow
- **"Na razie tylko imie"** (ghost button) --- creates ghost profile and skips to tabs

This is the fork point between the full and ghost paths.

### Step 3: Questions

**File:** `apps/mobile/app/onboarding/questions.tsx`

Four phases: `questions` -> `submitting` -> `followups` -> `generating`.

#### Phase: questions (7 fixed questions)

Questions are defined in `packages/shared/src/models.ts` (`ONBOARDING_QUESTIONS`):

| # | ID | Question | Required | Examples |
|---|---|---------|----------|----------|
| 1 | `intro` | Czesc! Wyobraz sobie, ze siadamy przy jednym stoliku. Czym sie zajmujesz i co sprawia ze tracisz poczucie czasu? | Yes | "Gram w squasha i szukam zespolu do jam session", "Projektantka, po pracy biegam i ogladam dokumenty o oceanach", "Inzynier w korpo, weekendy na szlaku lub przy planszowkach" |
| 2 | `recent_obsession` | Co ostatnio Cie pochlonelo? Miejsce, ksiazka, serial, cokolwiek. | No | --- |
| 3 | `looking_for` | Kogo szukasz? Znajomych, grupe, konkretna osobe? | Yes | --- |
| 4 | `activities` | Jakie aktywnosci chcialbys robic z innymi? | No | --- |
| 5 | `offer` | Co mozesz zaoferowac innym? | No | --- |
| 6 | `conversation_trigger` | Co sprawiloby, ze chcialbys z kims pogadac? | No | --- |
| 7 | `public_self` | Co chcialbys zeby inni o tobie wiedzieli? | No | --- |

UI: progress bar (fraction of 7), question counter "N / 7", back chevron, text input (multiline, max 500 chars). Required questions disable "Dalej" if empty. Optional questions show "Pomin" link. Slide animation between questions (200ms timing + spring).

Answers stored in `onboardingStore.answers` (Record<questionId, string>). Skipped questions stored in `onboardingStore.skipped`.

#### Phase: submitting

After the last question, calls `profiling.submitOnboarding` mutation (rate-limited: 5/5min) with all answers + skipped list. Server validates required questions, moderates content, creates a `profilingSessions` row, batch-inserts all answers into `profilingQA`, then calls `generateFollowUpQuestions` inline. If the AI call fails (OpenAI outage, rate limit), it degrades gracefully --- returns 0 follow-ups and proceeds directly to profile generation.

Shows: ThinkingIndicator with "Analizuje Twoje odpowiedzi..."

#### Phase: followups (0--3 AI-generated questions)

`generateFollowUpQuestions` (in `apps/api/src/services/profiling-ai.ts`) uses GPT to analyze answer quality and generate 0--3 follow-up questions. Rules:
- < 5 answers: MUST generate 2--3 questions (not enough data for good profile)
- 5--7 answers but short/generic: generate 1--2
- Rich, diverse answers: may generate 0

If 0 follow-ups, skips straight to profile generation. Otherwise, shows each follow-up one at a time. Progress bar stays at 100%. Counter shows "Jeszcze N pytanie/pytania". Each answer saved via `profiling.answerFollowUp` mutation.

#### Phase: generating

After all follow-ups answered (or if none), calls `profiling.completeSession` mutation. This validates min 3 answered questions, then enqueues `profileFromQA` BullMQ job. Shows ThinkingIndicator cycling through messages.

### Step 4: AI Summary Review

**File:** `apps/mobile/app/onboarding/profiling-result.tsx`

Waits for profile generation to complete. Two mechanisms:
1. **WebSocket:** Listens for `profilingComplete` event with matching `sessionId`, then refetches session state
2. **Fallback polling:** Refetches `profiling.getSessionState` every 5s while `isGenerating` is true

Once generated data arrives (`generatedBio`, `generatedLookingFor`), shows editable form:
- **"O MNIE"** --- generated bio, editable TextInput, 500 char max
- **"KOGO SZUKAM"** --- generated lookingFor, editable, 500 char max
- **"Tak, to ja"** button --- requires bio >= 10 chars and lookingFor >= 10 chars

The generated portrait is applied silently in the background — no UI element for it in the review screen (BLI-199). Portrait is internal-only ("never shown to user" per `ai-profiling.md`); users can still retrieve it via GDPR data-export.

Calls `profiling.applyProfile` which:
1. Upserts profile (insert or update on conflict) with displayName, bio, lookingFor, portrait, `portraitSharedForMatching: true`, `isComplete: true`, `visibilityMode: "semi_open"`. The visibility mode change ensures ghost users who later complete profiling become visible in discovery. The `portraitSharedForMatching` field is an optional input (validator: `z.boolean().optional()`) defaulted to `true` on the server side — the field is retained for audit purposes but has no functional effect on matching.
2. Copies OAuth avatar URL to profile if available
3. Enqueues `profileAI` job (embedding + interests extraction)
4. Sets authStore profile and hasCheckedProfile, marks onboarding complete
5. Navigates to `/(tabs)`

---

## Ghost Profile Path

When user chooses "Na razie tylko imie" in Step 2:

1. Calls `profiling.createGhostProfile({ displayName })`
2. Server creates profile with empty bio, empty lookingFor, `visibilityMode: "ninja"`, `isComplete` not explicitly set (defaults per schema)
3. Sets authStore profile and hasCheckedProfile
4. Navigates directly to `/(tabs)`

Ghost users are invisible in discovery (ninja mode), cannot send pings (app prompts mode change), can only join groups via invite. They can complete full profiling later from Settings > Profilowanie.

---

## Profile Generation Pipeline (Server-Side)

After `completeSession`, the server enqueues a `profileFromQA` BullMQ job that:
1. Takes all answered Q&A from the session
2. Calls `generateProfileFromQA` (GPT) to produce bio, lookingFor, and portrait text
3. Updates the `profilingSessions` row with generated fields, sets status to `completed`
4. Publishes `profilingComplete` WS event

After `applyProfile`, the server enqueues a `profileAI` job that:
1. Generates text embedding from bio + lookingFor
2. Extracts structured interests (tags)
3. Generates personality portrait (if not already present)
4. Stores results in the profiles table
5. Publishes `profileReady` WS event

---

## Mobile Screens Summary

| File | Purpose | Key interaction |
|------|---------|----------------|
| `onboarding/hook.tsx` | Animated intro | Auto-advance 5s, or tap "Zacznij" |
| `onboarding/index.tsx` | Name + age (Step 1) | Text input + toggle, "Dalej" |
| `onboarding/visibility.tsx` | Ghost vs fill (Step 2) | Two buttons, fork point |
| `onboarding/questions.tsx` | Q&A + follow-ups (Step 3) | Slide between questions, 4 phases |
| `onboarding/profiling-result.tsx` | AI review (Step 4) | Editable fields, "Tak, to ja" |

---

## Re-Profiling (Post-Onboarding)

Users can redo profiling from Settings > Profilowanie (`settings/profiling.tsx`). This uses the **interactive Q&A flow** which is different from the batch onboarding flow:

### Interactive Flow (startSession -> answerQuestion -> completeSession)

1. `startSession` --- creates a new `profilingSessions` row, optionally linked to a previous session via `basedOnSessionId`. Abandons any existing active session. Enqueues the first AI-generated question via BullMQ.
2. AI generates each question dynamically based on all previous answers (not fixed like onboarding). The question arrives via `questionReady` WS event.
3. `answerQuestion` --- saves the answer, moderates content, enqueues the next question. AI decides when answers are `sufficient` (enough data for a good profile).
4. After AI signals sufficient, user can either complete or `requestMoreQuestions` (up to 5 extra beyond the sufficient point, with optional `directionHint`).
5. `completeSession` --- requires minimum 3 answered questions, enqueues `profileFromQA` job.

**Hard cap:** 12 questions total per session. **Extra questions after sufficient:** maximum 5.

### Key Differences from Onboarding

| Aspect | Onboarding (batch) | Re-profiling (interactive) |
|--------|-------------------|---------------------------|
| Questions | 7 fixed + 0-3 AI follow-ups | All AI-generated, one at a time |
| Submission | All answers sent at once | Answer-by-answer |
| Previous context | None | Can reference `basedOnSessionId` |
| UI location | `onboarding/questions.tsx` | `settings/profiling.tsx` |
| Result review | `onboarding/profiling-result.tsx` | `settings/profiling-result.tsx` |

---

## Onboarding Store

`apps/mobile/src/stores/onboardingStore.ts` --- Zustand store tracking progress:

| Field | Type | Purpose |
|-------|------|---------|
| `displayName` | string | Name entered in Step 1 |
| `bio` | string | Generated/edited bio |
| `lookingFor` | string | Generated/edited lookingFor |
| `profilingSessionId` | string or null | Server session ID from submitOnboarding |
| `step` | number | Current step index |
| `isComplete` | boolean | Whether onboarding is done |
| `answers` | Record<string, string> | Question answers keyed by questionId |
| `skipped` | string[] | IDs of skipped questions |
| `isGhost` | boolean | Whether ghost path was chosen |

`reset()` clears all fields. Called on logout and fresh onboarding start.

**Persistence:** The store uses `zustand/middleware` persist with `expo-secure-store` as the storage backend. Persisted fields: `displayName`, `profilingSessionId`, `answers`, `skipped`, `isGhost`. This means answers survive app kills and restarts --- the user can resume onboarding from where they left off. Non-persisted fields (`bio`, `lookingFor`, `step`, `isComplete`) are transient UI state that resets on mount.

---

## Validation & Moderation

- Display name: server validator 2--50 chars; onboarding UI capped at 30 chars (`maxLength` on the `TextInput`)
- Question answers: max 500 characters each
- Bio and lookingFor: min 10 chars to apply, max 500
- All user text runs through `moderateContent()` (AI-powered content filter) before storage
- Required questions validated server-side (intro + looking_for)

---

## Impact Map

If you change this system, also check:

- **ONBOARDING_QUESTIONS in `packages/shared/src/models.ts`** --- changing questions affects both mobile UI and server validation in `profiling.submitOnboarding`
- **`profilingSessions` / `profilingQA` schema** --- migration needed for any new fields; affects `profiling-ai.ts` generation and `data-export.ts` GDPR export
- **WS event types** --- `profilingComplete` and `profileReady` must match between `apps/api/src/services/queue.ts` and `apps/mobile/src/lib/ws.ts`
- **AI prompts in `profiling-ai.ts`** --- follow-up generation rules, profile generation quality. After changes: `bun run dev-cli -- reanalyze user42@example.com --clear-all`
- **Ghost profile visibility** --- `visibilityMode: "ninja"` set on creation; changing default affects discovery queries in `nearby` and `groups` procedures
- **Settings profiling flow** --- `settings/profiling.tsx` and `settings/profiling-result.tsx` share patterns with onboarding but use the interactive (question-by-question) API, not the batch onboarding API
- **Auth store** --- `setProfile` + `setHasCheckedProfile` + `complete()` must all be called for proper transition; missing any causes redirect loops
