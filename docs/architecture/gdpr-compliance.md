# GDPR/RODO Compliance

> v1 — AI-generated from source analysis, 2026-04-06.

Blisko processes personal data under RODO (Polish implementation of GDPR). Polish-market focus, single data controller (individual developer). This is the umbrella doc linking the three subsystems that implement GDPR rights: account deletion, data export, and privacy/terms disclosure.

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|------------|------|-------------|
| Usuwanie konta | `requestDeletion` mutation, `hard-delete-user` BullMQ job | "Usun konto" |
| Grace period / okres karencji | `user.deletedAt` + 14-day delayed job | "Twoje konto jest w trakcie usuwania" |
| Anonimizacja | `processHardDeleteUser()` in `queue.ts`, `user.anonymizedAt` | "Usuniety uzytkownik" (displayed to others) |
| Eksport danych | `requestDataExport` mutation, `export-user-data` BullMQ job | "Pobierz moje dane" |
| Polityka prywatnosci | `/privacy` route in website | "Polityka Prywatnosci" |
| Regulamin | `/terms` route in website | "Regulamin" |

## Two-Phase Deletion Model

**What:** Account deletion uses a soft-delete-then-anonymize approach, not hard delete.

1. **Phase 1 — Soft-delete (immediate):** `user.deletedAt` set. `isAuthed` middleware blocks all API calls. Sessions, push tokens deleted. WebSocket force-disconnected. User invisible in discovery.
2. **Phase 2 — Anonymization (14 days later):** BullMQ delayed job fires. PII overwritten with generic values in `user` and `profiles` tables. Profiling Q&A answers nullified. S3 files (avatar, portrait) deleted. Metrics anonymized. `user.anonymizedAt` set.

**Why not hard delete:** Deleting user rows would cascade-delete or orphan relational data (messages, waves, conversations). Other users would lose conversation history. Anonymization preserves relational integrity while removing all PII. The deleted user appears as "Usuniety uzytkownik" via FK references to `user.name`.

**Why not hashing:** Hashing without salt is pseudonymization, which still falls under GDPR scope. Salted hashing adds complexity for no privacy benefit over plain overwrite. Per Recital 26 (Motyw 26), anonymized data falls entirely outside GDPR scope. Plain overwrite with generic values achieves true anonymization with zero complexity.

**Details:** `docs/architecture/account-deletion.md`

## Legal Basis (Art. 6(1))

| Purpose | GDPR Article | Rationale |
|---------|-------------|-----------|
| Service delivery, user matching, chat | Art. 6(1)(b) — contract performance | Core app functionality |
| Security, abuse prevention, rate limiting | Art. 6(1)(f) — legitimate interest | Platform safety |
| Location processing, AI compatibility analysis | Art. 6(1)(a) — consent | Explicit opt-in via registration + status setting |

## Data Processors

| Processor | Location | Transfer basis | Purpose |
|-----------|----------|---------------|---------|
| OpenAI | USA | SCC (Art. 46(2)(c)) | Profile AI analysis, compatibility scoring, embeddings |
| Railway | EU | N/A (within EEA) | PostgreSQL + Redis hosting |
| Resend | USA | SCC (Art. 46(2)(c)) | Transactional email (OTP codes, export notifications) |
| Tigris/S3 | -- | -- | File storage (avatars, portraits, data exports) |

## Data Categories

| Category | Tables | Legal basis | Retention |
|----------|--------|-------------|-----------|
| Account identity | `user` (name, email) | Contract | Until deletion + 14-day grace |
| Profile data | `profiles` (bio, interests, status, location, etc.) | Contract | Until deletion |
| OAuth connections | `account` (provider IDs, tokens) | Contract | Until disconnect or deletion |
| Location | `profiles` (latitude, longitude) | Consent | Overwritten on each update, cleared on deletion |
| Messages & conversations | `messages`, `conversations`, `conversationParticipants` | Contract | Preserved after deletion (user anonymized) |
| Contact requests | `waves` | Contract | Preserved after deletion |
| AI analysis | `connectionAnalyses`, `profiles.embedding` | Consent | Embeddings cleared on deletion, analyses preserved |
| Profiling Q&A | `profilingSessions`, `profilingQA` | Contract | Answers nullified on deletion, questions preserved |
| Behavioral data | `metrics.requestEvents` | Legitimate interest | userId nullified on deletion |
| Blocks | `blocks` | Legitimate interest | Preserved after deletion |
| Status matches | `statusMatches` | Contract | Preserved after deletion |

## User Rights Implementation

| Right | Article | Implementation |
|-------|---------|---------------|
| Access | Art. 15 | Data export (JSON via email) |
| Rectification | Art. 16 | Profile editing in-app |
| Erasure | Art. 17 | Two-phase deletion (soft-delete + anonymization) |
| Portability | Art. 20 | Data export as machine-readable JSON |
| Object to profiling | Art. 22 | AI generates recommendations only; user makes all contact decisions |

**Details:** `docs/architecture/data-export.md`

## Profiling Disclosure (Art. 22)

Blisko uses AI to generate compatibility scores (`connectionAnalyses.aiMatchScore`) and status matching (`statusMatches`). These are recommendations only. No fully automated decision-making occurs — the user always decides whether to send a wave (ping). Disclosed in privacy policy section 8.

AI processing involves:
- **Profile embeddings** (`profiles.embedding`) — generated from bio and interests via OpenAI, used for compatibility scoring. Cleared on deletion.
- **Status embeddings** (`profiles.statusEmbedding`) — generated from current status text, used for status matching. Cleared on deletion.
- **Connection analyses** (`connectionAnalyses`) — pairwise AI evaluation with match score (0-100) and description. Preserved after deletion (other user's data too).
- **Profiling Q&A** (`profilingQA`) — AI-generated questions, user-provided answers. Answers nullified on deletion, questions preserved (generic prompts).

## Privacy Policy & Terms

Served at `blisko.app/privacy` and `blisko.app/terms` (TanStack Start routes in `apps/website/src/routes/`). Written in Polish. Linked from the mobile login screen (acceptance text below OAuth buttons) and the help screen in settings.

**Details:** `docs/architecture/privacy-terms.md`

## Soft-Delete Filtering

During the 14-day grace period, soft-deleted users must be invisible in all discovery surfaces. Standard pattern: INNER JOIN to `user` table with `isNull(schema.user.deletedAt)`.

Applied to:
- Nearby user queries
- Group discovery (discoverable conversations)
- Status matching (both global and proximity)
- Wave queries (sent/received lists)
- All user-facing search and list endpoints

The `isAuthed` tRPC middleware blocks soft-deleted users from making any API calls. After anonymization, filtering is redundant (profile data is generic and `visibilityMode` is set to `"ninja"`) but stays as a safety net.

## Data Controller

Karol Wypchlo, individual developer (jednoosobowa dzialalnosc). Not a company entity. Data controller under Art. 4(7) RODO.

- Contact: kontakt@blisko.app
- Support: support@blisko.app
- Supervisory authority: UODO (Urzad Ochrony Danych Osobowych), ul. Stawki 2, 00-193 Warszawa
- Privacy policy last updated: 7 March 2026
- Terms of service last updated: 7 March 2026

## New Table Checklist

When adding tables or queries that reference users, check all four:

1. **Soft-delete filtering** — Should soft-deleted users be excluded from this query? Standard pattern: INNER JOIN to `user` with `isNull(schema.user.deletedAt)`.
2. **Anonymization** — Does `processHardDeleteUser()` in `queue.ts` need to clear/overwrite data in this table?
3. **Data export** — Does `collectAndExportUserData()` in `data-export.ts` need to include this data? If it references other users, are their identities anonymized?
4. **Privacy policy** — Does the privacy policy at `apps/website/src/routes/privacy.tsx` need to disclose this data category?

## GDPR Article Coverage

| Article | Requirement | Status |
|---------|-------------|--------|
| Art. 5 | Data minimization, purpose limitation | Profile fields scoped to service needs |
| Art. 6 | Lawful basis | Three bases documented (contract, legitimate interest, consent) |
| Art. 12-14 | Transparency | Privacy policy at `/privacy` |
| Art. 15 | Right of access | Data export feature |
| Art. 16 | Right to rectification | In-app profile editing |
| Art. 17 | Right to erasure | Two-phase account deletion |
| Art. 20 | Right to portability | JSON data export |
| Art. 22 | Automated decision-making | AI is advisory only, disclosed in policy |
| Art. 25 | Data protection by design | Anonymization (not deletion), no data sales, no tracking cookies |
| Art. 28 | Processor agreements | DPA/SCC with OpenAI, Resend |
| Art. 33-34 | Breach notification | Contact: kontakt@blisko.app |
| Art. 44-46 | International transfers | SCC for US processors (OpenAI, Resend) |
| Art. 77 | Right to lodge complaint | UODO reference in privacy policy |
| Recital 26 | Anonymization scope | Anonymized data outside GDPR (plain overwrite, not pseudonymization) |

## Impact Map

If you change this system, also check:

- **Adding a new table with user data** -- run through the 4-item checklist above
- **Changing anonymization logic** -- update `account-deletion.md`, verify `data-export.ts` still covers the same fields
- **Changing data export fields** -- update `data-export.md`, verify privacy policy still covers all disclosed categories
- **Adding a new data processor** -- update privacy policy, this doc's processor table, and check SCC/DPA requirements
- **Changing legal text** -- update both `apps/website/src/routes/privacy.tsx` and `apps/website/src/routes/terms.tsx`
- **Changing deletion flow** -- update `account-deletion.md`, verify mobile UI still matches (login error, settings screen)
