# AI Profiling & Onboarding

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-10 — Self-healing: `questionFailed`/`profilingFailed` events, BullMQ deduplication, mobile retry hooks (BLI-161, BLI-162).
> Updated 2026-04-10 — `submitOnboarding` rate limit, inline AI fallback on failure, ghost-to-full visibility fix (BLI-173).

Two profiling paths exist: fixed onboarding questions with AI follow-ups, and fully interactive AI-driven profiling sessions. Both produce the same output (bio, lookingFor, portrait) and feed into the matching pipeline. Source files: `apps/api/src/services/profiling-ai.ts` (AI functions), `apps/api/src/trpc/procedures/profiling.ts` (tRPC mutations), `packages/shared/src/models.ts` (onboarding questions), `apps/api/src/services/moderation.ts` (content filter), `apps/api/src/services/queue.ts` (BullMQ processors).

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) | Notes |
|---|---|---|---|
| The Persona (Krok 1) | `intro` question | "Czym sie zajmujesz..." | Required onboarding question |
| Superpower (Krok 2) | `offer` question + `superpower` profile field | "Co mozesz zaoferowac..." | Optional onboarding question |
| Status na teraz (Krok 3) | `setStatus` procedure | Kafle kategorii | Separate from profiling flow |
| Bio wygenerowane przez AI | `profiles.bio` / `generatedBio` | Bio (edytowalne) | 1st person, 100-300 chars |
| Kogo szukasz | `profiles.lookingFor` / `generatedLookingFor` | Kogo szukasz | 1st person, 100-300 chars |
| Portret spoleczny | `profiles.portrait` / `generatedPortrait` | (internal) | 3rd person, 200-400 words, never shown to user |
| Profil duch / Ghost | Ghost profile (`visibilityMode: "ninja"`) | Ninja mode | Minimal profile, `isComplete: false` |
| Sesja profilowa | `profilingSessions` table | AI rozmowa | Interactive Q&A with AI |
| Pytanie poglabiajace | Follow-up question | Pytanie dodatkowe | AI-generated after onboarding |

## Fixed Onboarding (7 Questions)

Defined in `ONBOARDING_QUESTIONS` array in `packages/shared/src/models.ts`. This is the primary onboarding path — the user answers a fixed set of questions, then AI generates follow-up questions to fill gaps.

### Questions

| # | ID | Question (Polish) | Required | Examples |
|---|---|---|---|---|
| 1 | `intro` | "Czesci! Wyobraz sobie, ze siadamy przy jednym stoliku. Czym sie zajmujesz i co sprawia ze tracisz poczucie czasu?" | Yes | "Gram w squasha i szukam zespolu do jam session", "Projektantka, po pracy biegam i ogladam dokumenty o oceanach" |
| 2 | `recent_obsession` | "Co ostatnio Cie pochlonelo? Miejsce, ksiazka, serial, cokolwiek." | No | — |
| 3 | `looking_for` | "Kogo szukasz? Znajomych, grupe, konkretna osobe?" | Yes | — |
| 4 | `activities` | "Jakie aktywnosci chcialbys robic z innymi?" | No | — |
| 5 | `offer` | "Co mozesz zaoferowac innym?" | No | — |
| 6 | `conversation_trigger` | "Co sprawiloby, ze chcialbys z kims pogadac?" | No | — |
| 7 | `public_self` | "Co chcialbys zeby inni o tobie wiedzieli?" | No | — |

Only `intro` and `looking_for` are required. Users can skip the rest. Each answer is validated: min 1 char, max 500 chars.

### submitOnboarding Flow

**Procedure:** `profiling.submitOnboarding` (rate-limited: 5/5min)

1. Validate required questions are answered (`intro`, `looking_for`)
2. Validate all `questionId` values are known (exist in `ONBOARDING_QUESTIONS`)
3. **Moderate all answers** — concatenate all answer text and pass to `moderateContent()`
4. Abandon any existing active profiling session for this user
5. Create a new `profilingSessions` row (status: `active`)
6. Batch-insert all answers as `profilingQA` rows
7. **Generate follow-up questions inline** — calls `generateFollowUpQuestions()` synchronously (not via BullMQ). This takes approximately 2-3 seconds. Wrapped in try-catch: if OpenAI fails (outage, rate limit, timeout), degrades to 0 follow-ups and proceeds directly to profile generation.
8. Batch-insert follow-up questions as `profilingQA` rows (with `answer: null`)
9. Return `{ sessionId, followUpQuestions }` — client renders follow-up questions for the user to answer

### Follow-Up Question Generation

**Function:** `generateFollowUpQuestions()` in `profiling-ai.ts`.

**What:** Analyzes the user's onboarding answers and generates 0-3 follow-up questions to fill gaps in the profile data. This is the bridge between the structured onboarding and the AI-driven profiling.

**Sufficiency logic:**
- < 5 questions answered: MUST generate 2-3 follow-ups (not enough data for a good profile)
- 5-7 questions answered but short/generic answers: generate 1-2 follow-ups
- Rich, diverse answers covering personality, social style, motivations: may return 0 follow-ups

**System prompt rules:**
- Never repeat questions already asked — approach topics from a different angle
- If important topics were skipped (social style, what they can offer, interests), ask about them naturally
- Questions should be warm, natural Polish, short and concrete (1-2 sentences)
- Prefer scenarios and open-ended questions

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: 0.8 (high creativity for natural question variety)
- maxOutputTokens: 400
- Output schema: `{ questions: string[] }` — array of 0-3 strings
- Cost: ~$0.001/call

### answerFollowUp Flow

**Procedure:** `profiling.answerFollowUp`

1. Validate session exists and belongs to user
2. **Moderate the answer** via `moderateContent()`
3. Save answer to the specific `profilingQA` row (matched by `questionId` + `sessionId`)
4. Check if all follow-ups are answered (no null answers remaining)
5. Return `{ allAnswered: boolean }` — client knows when to show the "generate profile" button

## AI Profiling Sessions (Interactive)

A fully dynamic Q&A experience where the AI generates each question based on the conversation so far. Used for deeper profiling or when the user wants to refine their profile.

### Session Lifecycle

1. **Start:** `profiling.startSession` — abandons any existing active session, creates a new `profilingSessions` row. If `basedOnSessionId` is provided, the new session builds on a previous one (lineage). Enqueues first question via BullMQ (`generate-profiling-question` job).

2. **Answer:** `profiling.answerQuestion` — saves answer to the latest unanswered `profilingQA` row. Moderates the answer. Enqueues next question via BullMQ. Returns `{ done: true }` when hard cap of 12 questions is reached.

3. **Request more:** `profiling.requestMoreQuestions` — user asks for more questions after AI marked the session as sufficient. Optional `directionHint` lets the user steer the conversation (e.g., "ask me more about my hobbies"). Moderates the direction hint. Maximum 5 extra questions after the first `sufficient: true` marker.

4. **Complete:** `profiling.completeSession` — validates all questions are answered and at least 3 exist. Enqueues `generate-profile-from-qa` BullMQ job. Returns `{ status: "generating" }`.

5. **Apply:** `profiling.applyProfile` — user reviews AI-generated bio/lookingFor/portrait. Can override bio and lookingFor with their own edits. Moderates the final display name + bio + lookingFor. Upserts the `profiles` row with `isComplete: true` and `visibilityMode: "semi_open"` (on conflict update). The visibility mode change ensures ghost users who later complete profiling become visible in discovery. Enqueues `generate-profile-ai` job (portrait regeneration + embedding + interests). If the user has an auth provider image, it's set as the initial avatar.

### Session Lineage

Sessions can chain: `basedOnSessionId` links to a previous session. When generating questions or profiles, the previous session's Q&A is passed as additional context (`previousSessionQA`). This enables progressive refinement — a user can do a quick onboarding, then later start a deeper session that builds on what was already said.

### AI Question Generation (Interactive)

**Function:** `generateNextQuestion()` in `profiling-ai.ts`.

**What:** Generates the next question in an adaptive profiling conversation. The AI plays the role of an "adaptive personality profiler" for a social app.

**Sufficiency logic:** After 5-7 good answers, the AI sets `sufficient: true` if it has enough material for a rich profile. The client can show a "finish" button while still allowing the user to request more.

**System prompt rules:**
- Use previous answers to go deeper — don't repeat topics
- Diversify across: values, social style, interests, motivations, dreams, daily life
- Prefer scenarios over direct questions ("Opisz idealny dzien" > "Jaki jestes?")
- If `userRequestedMore` is true, the AI is told the user explicitly wants more questions
- If `directionHint` is provided, it's included as `<user_hint>` for the AI to steer toward

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: 0.8
- maxOutputTokens: 300
- Output schema: `{ question: string, sufficient: boolean }`
- BullMQ job: `generate-profiling-question`, dedup: `profiling-q-{sessionId}-{questionNumber}` (BullMQ `deduplication` option — auto-releases on failure for self-healing)
- Cost: ~$0.001/call

**WebSocket:** Emits `questionReady` with `{ userId, sessionId, questionNumber }` when the question is stored.

### Hard Caps

- Maximum 12 questions per session (enforced in `answerQuestion`)
- Maximum 5 extra questions after first `sufficient: true` (enforced in `requestMoreQuestions`)
- Minimum 3 answered questions to complete a session (enforced in `completeSession`)

## Profile Generation from Q&A

**Function:** `generateProfileFromQA()` in `profiling-ai.ts`.

**What:** Takes the full Q&A history from a profiling session (plus optional previous session context) and generates three texts that form the user's profile.

**Output:**

1. **bio** (100-300 chars, 1st person, Polish) — who the person is: interests, character, lifestyle. Written as if the person wrote it themselves. Rules: consistent 1st person ("Programuje", never mix with 3rd), no defensive disclaimers ("ale nie oceniam"), no ambiguity (clarify vague statements).

2. **lookingFor** (100-300 chars, 1st person, Polish) — who they're looking for: type of people, relationships, shared activities. Rules: correct Polish grammar after prepositions ("na" + accusative, "do" + genitive), no exclamation marks or double punctuation.

3. **portrait** (200-400 words, 3rd person, Polish) — deep personality description: how they think, what they value, social functioning, motivations. This is a private document used only for AI matching — honest and insightful, not flattering. Avoids platitudes.

**Config:**
- Model: `gpt-4.1-mini` (GPT_MODEL)
- Temperature: 0.7
- maxOutputTokens: 1000
- Output schema: `{ bio: string, lookingFor: string, portrait: string }` (Zod-validated via `generateObject`)
- BullMQ job: `generate-profile-from-qa`, dedup: `profile-from-qa-{sessionId}` (BullMQ `deduplication` option — auto-releases on failure for self-healing)
- Cost: ~$0.005/call

**Processing flow in BullMQ:**
1. `processGenerateProfileFromQA` calls `generateProfileFromQA()`
2. Updates `profilingSessions` row: stores `generatedBio`, `generatedLookingFor`, `generatedPortrait`, sets status to `completed`, records `completedAt`
3. Emits `profilingComplete` WebSocket event with `{ userId, sessionId }`

**After apply:** When the user applies the generated profile via `applyProfile`, a separate `generate-profile-ai` job fires. This runs `generatePortrait()` on the (possibly user-edited) bio/lookingFor to produce the final matching-optimized portrait, plus embedding and interest extraction. The portrait from `generateProfileFromQA` is stored on the session; the portrait from `generatePortrait` is what ends up on the `profiles` table and gets used for matching.

## Ghost Profiles

**Procedure:** `profiling.createGhostProfile`

**What:** Creates a minimal profile with just a `displayName`. Used for users who want to skip onboarding entirely and browse in ninja mode first.

**Characteristics:**
- `bio: ""`, `lookingFor: ""` — empty
- `visibilityMode: "ninja"` — invisible on the map
- `isComplete: false` — excluded from matching, nearby discovery, and pair analysis
- If the user has an auth provider image, it's used as avatar
- Cannot create if a profile already exists (returns CONFLICT error)

**Why:** Reduces onboarding friction. Users can explore the app without committing to a full profile. They can later start a profiling session to complete their profile.

## Content Moderation

**File:** `apps/api/src/services/moderation.ts`

**What:** Uses the OpenAI Moderation API (not gpt-4.1-mini — the dedicated moderation endpoint) to detect inappropriate content before it's saved.

**API:** `POST https://api.openai.com/v1/moderations` — a separate, free endpoint that returns flagged categories.

**Where called:**
- `answerQuestion` — every profiling answer
- `answerFollowUp` — every follow-up answer
- `requestMoreQuestions` — direction hint text (if provided)
- `submitOnboarding` — all answers concatenated
- `applyProfile` — final displayName + bio + lookingFor
- `createGhostProfile` — displayName only

**Behavior:**
- If the content is flagged, throws `TRPCError` with code `BAD_REQUEST` and message `{ error: "CONTENT_MODERATED" }` (JSON string — mobile client parses this to show a localized error)
- Logs the flagged categories (e.g., `harassment`, `sexual`, `hate`) as a warning
- **Graceful degradation:** If the API returns an error (non-200), the function returns without blocking — content passes through. This prevents the moderation API from being a single point of failure.
- **No-op when unconfigured:** If `OPENAI_API_KEY` is not set, moderation is silently skipped

**Cost:** $0 — the OpenAI Moderation API is free.

## WebSocket Events

| Event | Payload | When |
|---|---|---|
| `questionReady` | `{ userId, sessionId, questionNumber }` | AI generated next profiling question (interactive session) |
| `questionFailed` | `{ userId, sessionId, questionNumber }` | Question generation permanently failed — mobile retries via `retryQuestion` |
| `profilingComplete` | `{ userId, sessionId }` | Profile generation from Q&A completed, user can review |
| `profilingFailed` | `{ userId, sessionId }` | Profile generation permanently failed — mobile retries via `retryProfileGeneration` |
| `profileFailed` | `{ userId }` | Post-apply portrait + embedding + interests pipeline permanently failed — mobile retries via `retryProfileAI` |
| `profileReady` | `{ userId }` | Portrait + embedding + interests pipeline finished (post-apply) |

All events are published via `publishEvent()` which routes through Redis pub/sub for cross-replica delivery.

## Complete User Journey

### Path A: Fixed Onboarding (primary)

1. User answers 2-7 onboarding questions on the mobile client
2. Client calls `submitOnboarding` with answers + list of skipped question IDs
3. Server moderates, creates session, generates 0-3 follow-up questions (synchronous, ~2-3s)
4. Client receives follow-up questions and presents them one by one
5. User answers follow-ups via `answerFollowUp` (each answer moderated)
6. When all follow-ups answered, client calls `completeSession`
7. BullMQ processes `generate-profile-from-qa` → generates bio, lookingFor, portrait
8. `profilingComplete` WebSocket event fires → client shows preview screen
9. User reviews and optionally edits bio/lookingFor, then calls `applyProfile`
10. Profile saved, `generate-profile-ai` job fires (portrait + embedding + interests)
11. `profileReady` WebSocket event fires → user is fully onboarded

### Path B: Interactive AI Session (refinement)

1. User starts via `startSession` (optionally chaining from a previous session)
2. BullMQ generates first question → `questionReady` WebSocket event
3. User answers → BullMQ generates next question → repeat
4. After 5-7 good answers, AI marks `sufficient: true` → client shows "finish" option
5. User can finish or request more (up to 5 extra) with optional direction hint
6. User calls `completeSession` → same flow as Path A from step 7 onward

### Path C: Ghost Profile (skip everything)

1. User provides only a displayName
2. `createGhostProfile` creates ninja-mode profile with `isComplete: false`
3. User can browse but is invisible and excluded from matching
4. Later: start Path A or B to complete the profile

## Impact Map

If you change this system, also check:
- `docs/architecture/ai-matching.md` — portrait generation feeds into matching pipeline; embedding and interests are used for T1 cosine scoring
- `docs/architecture/onboarding-flow.md` — mobile onboarding screens consume the profiling tRPC procedures
- `docs/architecture/user-profiles.md` — profiles table fields (bio, lookingFor, portrait, embedding, interests, isComplete, visibilityMode)
- `docs/architecture/queues-jobs.md` — generate-profiling-question, generate-profile-from-qa, generate-profile-ai job types
- `docs/architecture/websockets-realtime.md` — questionReady, profilingComplete, profileReady events
- `docs/architecture/gdpr-compliance.md` — profiling session data (Q&A answers) is anonymized on account deletion
- `docs/architecture/account-deletion.md` — profilingSessions generatedBio/lookingFor/portrait nullified, profilingQA answers nullified
- `docs/architecture/data-export.md` — GDPR export includes profiling session data
- `apps/api/src/services/ai.ts` — generatePortrait, extractInterests, generateEmbedding run as part of the post-apply pipeline
- `packages/shared/src/models.ts` — ONBOARDING_QUESTIONS definition, GPT_MODEL constant
- `packages/shared/src/validators.ts` — all Zod schemas for profiling mutations
