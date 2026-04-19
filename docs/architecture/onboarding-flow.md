# Onboarding Flow

> v1 --- AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 --- Onboarding audit fixes: ghost-to-full visibility transition, inline AI fallback, answer persistence (BLI-173).
> Updated 2026-04-18 — Review screen no longer renders the "PORTRET OSOBOWOŚCI" section or the share-portrait toggle; portrait is applied silently and stays internal (BLI-199).
> Updated 2026-04-19 — BLI-196 visibility screen redesign: accordion cards "Na razie przeglądam" / "Opowiem o sobie" with NIEWIDOCZNY/WIDOCZNY badges (replaces accent + ghost buttons). Shared onboarding primitives introduced: `OnboardingStepHeader` (Stack.Screen header slot, not in-content), `OnboardingScreen` (footer at viewport bottom for short content, below content for tall). `Toggle` pill replaces native `Switch` on 18+ confirm. Examples on `ONBOARDING_QUESTIONS` rewritten under 3 target personas — full profiles in `packages/shared/src/models.ts` (read before adding/editing questions).
> Updated 2026-04-19 — BLI-198: inserted `/onboarding/questions-intro` screen between visibility and questions. Sets expectations (7 questions + up to 3 follow-ups, profile gets generated from answers, answers don't need to be polished) before user starts typing. Step numbering shifts: Questions now Step 4, AI Summary Review now Step 5.
> Updated 2026-04-19 — BLI-201: visibility screen copy tweak. Footnote now addresses reversibility of privacy choice directly ("Widoczność i prywatność zmienisz w każdej chwili w ustawieniach."), and the ghost option body ends with "Profil uzupełnisz później." to reassure users the choice is not permanent.

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
| Ghost profile | `createGhostProfile`, isComplete=false | "Na razie przeglądam" (BLI-196 rename, was "Na razie tylko imie") |
| Full profile option | continues to questions flow | "Opowiem o sobie" (BLI-196 rename, was "Wypelnij profil") |
| Visibility mode on visibility screen | badge beneath card title | "NIEWIDOCZNY" (ghost) / "WIDOCZNY" (fill) |
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

Header: "Krok 2" (back chevron + "Wyloguj"). Title: "Chcesz być widoczny?". Above the two cards sits a ~20%-of-screen graphic: 12 scattered avatars (4×3 grid with jitter, hand-picked randomuser.me portraits) with a pulsing sonar dot in the center. Dotted 1-px SVG lines connect nearest avatar pairs. In "fill" mode, the sonar dot gets 4 solid 1-px lines to the nearest pins (guaranteed ≥1 left + ≥1 right + 1 random from top-5 + 1 from the 2 furthest on the underrepresented side). In "ghost" mode, avatars render with `blurRadius = ghostBlurRadius` via `GridClusterMarker` (`isGhost` prop override).

Two equal-weight accordion cards (neither expanded by default — user must pick):

- **"Na razie przeglądam"** — badge `NIEWIDOCZNY`. Prose expanded body describes: sees others on the map with partial info, cannot ping/message/join groups, can still write in groups they're invited to. Positioned for "chcę najpierw zobaczyć co jest w appce".
- **"Opowiem o sobie"** — badge `WIDOCZNY`. Prose expanded body describes: will answer a few questions, get full access to people/groups in the area, receive ambient match pushes, be visible on the map to others.

Both are `Pressable` wrapping the whole card (not just the header). Below the graphic and the cards sits a `footnote` ("Widoczność i prywatność zmienisz w każdej chwili w ustawieniach.") and a single CTA in the footer. The CTA label is dynamic: `Dalej` when "Opowiem o sobie" is selected (proceeds to the questions-intro screen), `Wchodzę do aplikacji` when "Na razie przeglądam" is selected (creates ghost profile and jumps to tabs). Disabled state: no card picked.

`testID`s preserved for Maestro E2E: `ghost-option`, `fill-option`, `ghost-profile-button`, `fill-profile-button`.

This is the fork point between the full and ghost paths.

### Step 3: Questions Intro

**File:** `apps/mobile/app/onboarding/questions-intro.tsx`

Purely presentational screen between the visibility fork and the first question. Sets expectations before the user commits to typing. Header: `Krok 3` (back chevron returns to visibility; no logout button). Title: `Jak to działa`. Three bullets with an accent vertical rule (no numbers):

- **Kilka pytań** — "Zaczniemy od 7 krótkich pytań. Jeśli coś będzie wymagało doprecyzowania, dopytamy maksymalnie o 3 rzeczy." (primes the user on the question count — 7 fixed + up to 3 AI follow-ups per Step 4's rules)
- **Zrobimy z tego profil** — "Na podstawie Twoich odpowiedzi przygotujemy bio i opis tego, kogo lub czego szukasz. Zobaczysz gotowy tekst i poprawisz, zanim pokażemy go innym." (frames the outcome — deliberately does NOT mention AI; reasoning: avoid polarized AI reactions, disclosure is in the privacy policy)
- **Nie musi być idealnie** — "Odpowiedzi nie muszą być pełnymi zdaniami. Mogą być krótkie, w punktach, nawet pojedyncze słowa — liczy się co napiszesz, nie jak. Pod każdym pytaniem zobaczysz kilka przykładowych odpowiedzi." (lowers the bar for writing effort; references the examples rendered in Step 4)

CTA: `Dalej` (`testID: questions-intro-start`) → `/onboarding/questions`. Back gesture / chevron → `/onboarding/visibility`.

No store writes, no API calls, no state beyond the bullet render.

### Step 4: Questions

**File:** `apps/mobile/app/onboarding/questions.tsx`

Four phases: `questions` -> `submitting` -> `followups` -> `generating`.

#### Phase: questions (7 fixed questions)

Questions are defined in `packages/shared/src/models.ts` (`ONBOARDING_QUESTIONS`):

| # | ID | Question | Required |
|---|---|---------|----------|
| 1 | `intro` | Czesc! Wyobraz sobie, ze siadamy przy jednym stoliku. Czym sie zajmujesz i co sprawia ze tracisz poczucie czasu? | Yes |
| 2 | `recent_obsession` | Co ostatnio Cie pochlonelo? Miejsce, ksiazka, serial, cokolwiek. | No |
| 3 | `looking_for` | Kogo szukasz? Znajomych, grupe, konkretna osobe? | Yes |
| 4 | `activities` | Jakie aktywnosci chcialbys robic z innymi? | No |
| 5 | `offer` | Co mozesz zaoferowac innym? | No |
| 6 | `conversation_trigger` | Co sprawiloby, ze chcialbys z kims pogadac? | No |
| 7 | `public_self` | Co chcialbys zeby inni o tobie wiedzieli? | No |

Every question has `examples: string[]` — 3 sample answers rendered below the input as a bullet list ("Przykładowe odpowiedzi:" label + "·" prefix per item, hanging indent for line wraps). Examples are calibrated for 3 distinct Warsaw target personas (Kacper — student/builder, Maja — fizjoterapeutka, Paweł — angel investor) in a fixed order. Full persona profiles (context, daily rhythm, values, consumption, goals, tone) live in the JSDoc block above `ONBOARDING_QUESTIONS` in `packages/shared/src/models.ts` — read that block before adding or rewording questions so new examples stay consistent.

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

### Step 5: AI Summary Review

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
1. Upserts profile (insert or update on conflict) with displayName, bio, lookingFor, portrait, `isComplete: true`, `visibilityMode: "semi_open"`. The visibility mode change ensures ghost users who later complete profiling become visible in discovery. `portraitSharedForMatching` is no longer written by this procedure — the DB default (`true` since BLI-199) handles inserts and the column is never updated on re-profiling; retained as an audit-only column with no functional effect on matching.
2. Copies OAuth avatar URL to profile if available
3. Enqueues `profileAI` job (embedding + interests extraction)
4. Sets authStore profile and hasCheckedProfile, marks onboarding complete
5. Navigates to `/(tabs)`

---

## Ghost Profile Path

When user chooses "Na razie przeglądam" in Step 2 (BLI-196 rename; was "Na razie tylko imie" pre-redesign):

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
| `onboarding/index.tsx` | Name + age (Step 1) | Text input + `Toggle` primitive, "Dalej" |
| `onboarding/visibility.tsx` | Ghost vs fill (Step 2) | Two accordion cards + scattered avatars graphic, dynamic CTA (`Dalej` / `Wchodzę do aplikacji`) |
| `onboarding/questions-intro.tsx` | Pre-questions intro (Step 3) | Title + 3 bullets with accent vertical rule, CTA `Dalej` |
| `onboarding/questions.tsx` | Q&A + follow-ups (Step 4) | Slide between questions, 4 phases |
| `onboarding/profiling-result.tsx` | AI review (Step 5) | Editable fields, "Tak, to ja" |

**Shared primitives** (`apps/mobile/src/components/onboarding/`):
- `OnboardingStepHeader` — rendered via Stack.Screen `header: () => (...)` slot. Props: `label`, optional `onBack`, optional `onLogout`, optional `rightLabel`. Used by Step 1 (`Krok 1` + logout), Step 2 (`Krok 2` + back + logout), Step 3 questions-intro (`Krok 3` + back), Step 4 standard (`Krok 3` + back + `Pytanie N / 7`), Step 4 follow-ups (`Krok 3` + `Zostało ostatnie pytanie` / `Zostały tylko N pytania`), Step 5 (`Ostatni krok`). Note: questions-intro and questions share the `Krok 3` UI label because they're conceptually the same user step.
- `OnboardingScreen` — wrapper with `ScrollView contentContainerStyle={{ flexGrow: 1 }}` + inner `flex: 1` content + footer slot. Footer sticks to viewport bottom when content is short, flows naturally below when content is tall. Used by all screens with a primary CTA.

See also `mobile-architecture.md` for the Stack.Screen header slot pattern and `Toggle` primitive spec.

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
