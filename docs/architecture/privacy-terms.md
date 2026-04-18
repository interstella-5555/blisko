# Privacy Policy & Terms of Service

> v1 — AI-generated from source analysis, 2026-04-06.
> Updated 2026-04-18 — Corrected portrait storage (text in DB, not S3 file). Added explicit privacy disclosure that AI generates an internal personality description visible only via data-export (BLI-199).

Polish-language privacy policy and terms of service, served as web pages from the website app, linked from the mobile app. Required for RODO/GDPR compliance before public release.

Parent doc: `docs/architecture/gdpr-compliance.md`

## Terminology & Product Alignment

| PRODUCT.md | Code / Route | UI (Polish) |
|------------|-------------|-------------|
| Prywatnosc | `/privacy` route in `apps/website/src/routes/privacy.tsx` | "Polityka Prywatnosci" |
| Regulamin | `/terms` route in `apps/website/src/routes/terms.tsx` | "Regulamin" |
| Wave / ping | `waves` table | "Wave" (terms: "zaproszenie do kontaktu") |
| Status | `profiles.currentStatus` | "Status" (terms: "intencja") |
| Grupy | `conversations` (type=group) | "Grupy" |

## Where Served

#### What

Both documents are TanStack Start routes in the website app (`apps/website/`), rendered as React components using shared `LegalPage` layout components (`apps/website/src/components/LegalPage.tsx`).

- Privacy policy: `https://blisko.app/privacy`
- Terms of service: `https://blisko.app/terms`

Both pages set `<html lang="pl">`, have proper meta tags (title, viewport), display a last-updated date, and use a clean, mobile-friendly layout.

#### Config

- Last updated dates (hardcoded in each route, independent per document):
  - `privacy.tsx` → "Ostatnia aktualizacja: 8 kwietnia 2026"
  - `terms.tsx` → "Ostatnia aktualizacja: 7 marca 2026"
  Each document ships its own date because the Privacy Policy gets amended more often than Terms (RODO/schema changes vs. commercial terms). Update the relevant route whenever you change the corresponding legal content.
- Privacy title meta: "Polityka Prywatnosci -- Blisko"
- Terms title meta: "Regulamin -- Blisko"

## Mobile Integration

#### What

The legal documents are linked from two places in the mobile app:

**Login screen** (`apps/mobile/app/(auth)/login.tsx`): Acceptance text below all OAuth buttons: "Rejestrujac sie akceptujesz Regulamin i Polityke Prywatnosci". Both terms are tappable links that open in the system browser via `Linking.openURL()`.

**Help screen** (`apps/mobile/app/settings/help.tsx`): Two rows: "Regulamin" and "Polityka prywatnosci", each opening the corresponding URL via `Linking.openURL()`.

#### Why

Registration implies acceptance of both documents (no separate checkbox). This is standard practice for mobile apps under RODO -- explicit acceptance of privacy policy is required via consent mechanism at the point of registration.

#### Config

- Regulamin URL: `https://blisko.app/terms`
- Privacy URL: `https://blisko.app/privacy`
- Support email: `support@blisko.app` (help screen)
- Contact email: `kontakt@blisko.app` (privacy policy, terms)

## Privacy Policy Content

The privacy policy (`privacy.tsx`) has 11 sections covering all required RODO disclosures:

#### Section 1 — Administrator danych
Data controller: Karol Wypchlo (individual developer). Contact: kontakt@blisko.app. Controller under Art. 4(7) RODO.

#### Section 2 — Jakie dane zbieramy
Seven data categories disclosed:
- **Dane konta:** email, name, bio, interests, social links, status, visibility mode
- **Lokalizacja:** last known position (foreground only, not background tracking)
- **Pliki:** avatar photo (cloud-stored on Tigris/S3)
- **Dane generowane przez AI:** wewnętrzny opis osobowości (tekst w DB, nie obraz) — nie jest widoczny dla innych użytkowników ani dla Ciebie w aplikacji; dostępny przez data-export
- **Wiadomosci:** chat message content, waves (contact invitations)
- **Analiza AI:** profile embeddings, compatibility scores between users
- **Sesje profilowania:** question-and-answer history from AI questionnaire
- **Konta OAuth:** provider connections (Apple, Google, Facebook, LinkedIn) -- no passwords stored

#### Section 3 — Cel i podstawa przetwarzania
Three legal bases:
- Art. 6(1)(b) -- contract performance (service delivery, user matching, chat)
- Art. 6(1)(f) -- legitimate interest (security, abuse prevention)
- Art. 6(1)(a) -- consent (location processing, AI compatibility analysis)

#### Section 4 — Podmioty przetwarzajace
Four data processors disclosed:
- **OpenAI** (USA) -- AI profile analysis, compatibility scoring
- **Railway** (EU hosting) -- PostgreSQL, Redis
- **Resend** (USA) -- transactional email (OTP codes)
- **Tigris/S3** -- file storage (avatars)

#### Section 5 — Transfer danych poza EOG
OpenAI and Resend are US-based. Transfer on the basis of Standard Contractual Clauses (SCC) per Art. 46(2)(c) RODO.

#### Section 6 — Okres przechowywania
- Account data: until account deletion
- Post-deletion: 14-day grace period, then permanent deletion of all data
- AI analytics data: deleted with account

#### Section 7 — Twoje prawa
Five rights disclosed:
- Access (Art. 15) -- request a data copy
- Rectification (Art. 16) -- edit profile in-app
- Erasure (Art. 17) -- delete account in settings (14-day grace period)
- Portability (Art. 20) -- download data as JSON
- Object to profiling (Art. 22) -- AI generates recommendations, user makes decisions

#### Section 8 — Profilowanie AI
Disclosure that AI generates compatibility scores. These are recommendations only. No fully automated decision-making under Art. 22 RODO. User always decides whether to send a wave.

#### Section 9 — Pliki cookies
Mobile app does not use cookies. Website (blisko.app) does not use tracking or analytics cookies.

#### Section 10 — Kontakt i skargi
Contact: kontakt@blisko.app. Right to file complaint with UODO (Urzad Ochrony Danych Osobowych), ul. Stawki 2, 00-193 Warszawa.

#### Section 11 — Zmiany polityki prywatnosci
Significant changes announced in-app. Last update date displayed at top of document.

## Terms of Service Content

The terms of service (`terms.tsx`) has 10 sections plus a contact section:

#### Section 1 — Postanowienia ogolne
Operator: Karol Wypchlo. Registration implies acceptance.

#### Section 2 — Warunki korzystania
- Minimum age: 16 years (declarative clause, registration = confirmation)
- One account per person
- Truthful profile data required

#### Section 3 — Opis uslugi
Service description: connecting nearby people based on location, interests, and AI compatibility. Features: waves (contact invitations), chat after acceptance, groups, status with discovery.

#### Section 4 — Zasady korzystania
Prohibited: spam, harassment, illegal content, impersonation, scraping, bots/automation.

#### Section 5 — Konto i bezpieczenstwo
User responsible for account security. Login via OAuth or email + OTP. No passwords stored.

#### Section 6 — Tresci uzytkownika
User retains rights to their content. License granted to operator for service operation. Right to remove content violating terms.

#### Section 7 — Usuniecie konta
Account deletion available in app settings. After OTP confirmation: immediate logout and profile hiding. 14-day grace period (can contact support to cancel). After 14 days: permanent data deletion.

#### Section 8 — Ograniczenie odpowiedzialnosci
Service provided "as is". No guarantee of uninterrupted operation. No responsibility for other users' behavior. AI analysis results are approximate.

#### Section 9 — Zmiany regulaminu
Advance notice in-app for significant changes. Continued use = acceptance.

#### Section 10 — Prawo wlasciwe
Polish law. Competent court: Warsaw.

#### Contact section
Questions: kontakt@blisko.app.

## Data Categories & Legal Basis (Cross-Reference)

| Data category | Schema table(s) | Legal basis | Retention | Disclosed in policy section |
|---------------|----------------|-------------|-----------|---------------------------|
| Account identity | `user` | Contract (b) | Until deletion | 2 |
| Profile content | `profiles` | Contract (b) | Until deletion | 2 |
| Location | `profiles` (lat/lng) | Consent (a) | Overwritten on update | 2 |
| Files | `profiles.avatarUrl` + S3 | Contract (b) | Until deletion (S3 deleted) | 2 |
| AI-generated portrait | `profiles.portrait` (text, DB only) | Contract (b) | Until deletion (nullified on anonymization) | 2 |
| Messages | `messages` | Contract (b) | Preserved (anonymized user) | 2 |
| Waves | `waves` | Contract (b) | Preserved (anonymized user) | 2 |
| AI embeddings | `profiles` (embedding, statusEmbedding) | Consent (a) | Cleared on deletion | 2 |
| AI analyses | `connectionAnalyses` | Consent (a) | Preserved (anonymized user) | 2, 8 |
| Profiling Q&A | `profilingSessions`, `profilingQA` | Contract (b) | Answers nullified on deletion | 2 |
| OAuth connections | `account` | Contract (b) | Until disconnect or deletion | 2 |
| Blocks | `blocks` | Legitimate interest (f) | Preserved | 2 |
| Status matches | `statusMatches` | Contract (b) | Preserved (anonymized user) | 2 |
| Conversation ratings | `conversationRatings` | Contract (b) | Preserved | 2 |
| Behavioral metrics | `metrics.requestEvents` | Legitimate interest (f) | userId nullified on deletion | 2 |
| AI cost metrics | `metrics.aiCalls` | Legitimate interest (f) | userId nullified on deletion | 2 |

## Gaps

**Re-audit pending (2026-04-12).** The following profile fields have been added since the last privacy-policy cross-reference pass and need to be checked against the Polish copy in `privacy.tsx`:

- `superpower`, `superpowerTags`, `offerType` — user-provided strengths and offers (visible to other users)
- `dateOfBirth` — optional, never exposed beyond age-in-years on profile
- `statusCategories`, `currentStatus`, `statusExpiresAt`, `statusSetAt`, `statusVisibility` — ambient status system (BLI-108)
- `doNotDisturb` — per-user push mute flag (BLI-157)
- `metrics.aiCalls` table — added in BLI-174 for AI cost tracking

Action: confirm each field is either covered by an existing disclosure section in `privacy.tsx` or that the policy needs an amendment + fresh "Ostatnia aktualizacja" date.

## Impact Map

If you change this system, also check:

- **Adding new data categories** -- update privacy policy section 2 (data collected) and the cross-reference table in this doc
- **Adding new data processors** -- update privacy policy section 4 and `gdpr-compliance.md` processor table
- **Changing deletion behavior** -- update terms section 7 and privacy policy section 6
- **Changing AI usage** -- update privacy policy section 8 (profiling disclosure)
- **Changing minimum age** -- update terms section 2
- **Adding cookies or analytics** -- update privacy policy section 9
- **Changing contact info** -- update both documents' contact sections and mobile help screen URLs
- **Changing the last-updated date** -- hardcoded in both `privacy.tsx` and `terms.tsx` component props
- **New legal requirements** -- consider whether terms or privacy policy need new sections
