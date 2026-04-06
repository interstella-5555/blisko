# Data Export

> v1 — AI-generated from source analysis, 2026-04-06.

GDPR/RODO Art. 15 (right of access) and Art. 20 (right to data portability). User requests export from mobile app settings, receives an email with a presigned S3 download link within minutes.

Parent doc: `docs/architecture/gdpr-compliance.md`

## Terminology & Product Alignment

| PRODUCT.md | Code | UI (Polish) |
|------------|------|-------------|
| GDPR data export | `requestDataExport` mutation, `export-user-data` BullMQ job | "Pobierz moje dane" button |
| -- | `collectAndExportUserData()` in `data-export.ts` | "Eksport danych" section header |
| -- | `dataExportReady()` email template | "Twoje dane z Blisko sa gotowe do pobrania" (email subject) |
| Anonimizacja w eksporcie | `buildUserLabelMap()` + `shortHash()` | "Uzytkownik (a3f8c2)" labels |

## Trigger Flow

#### What

The `accounts.requestDataExport` tRPC mutation (in `apps/api/src/trpc/procedures/accounts.ts`) is a protected procedure with rate limiting. No OTP required -- the user is already authenticated.

**Flow:**
1. User taps "Pobierz moje dane" in mobile settings
2. Backend checks for existing recent export job (24h cooldown)
3. If no recent job, enqueues `export-user-data` BullMQ job with `{ userId, email }`
4. Returns `{ status: "queued" }` or `{ status: "already_requested" }`
5. Mobile shows success toast: "Eksport zostal zlecony. Sprawdz swoj e-mail."

**Duplicate detection:** Queries BullMQ for jobs in `completed`, `active`, `waiting`, `delayed` states matching this userId and `export-user-data` type within the last 24 hours.

#### Why

No OTP because the user is already authenticated (unlike deletion, which is irreversible). Rate limiting prevents abuse of a heavy database operation.

#### Config

- Rate limit: 1 request per 24 hours (`rateLimits.dataExport` in `apps/api/src/config/rateLimits.ts`)
- Rate limit message: "Eksport danych jest dostepny raz na 24 godziny."
- BullMQ job ID: `export-${userId}-${Date.now()}` (unique per request)
- Queue name: `ai-jobs` (shared queue)

## BullMQ Job Processing

#### What

The `processExportUserData()` function in `queue.ts` delegates to `collectAndExportUserData()` in `apps/api/src/services/data-export.ts`. This function:

1. Queries all user-related tables from the database
2. Collects all other-user IDs encountered across all tables
3. Builds an anonymization label map for other users
4. Assembles a typed `ExportData` JSON object
5. Uploads JSON to S3
6. Generates a presigned download URL (7-day expiry)
7. Sends notification email with the download link

## Data Collected

The export queries 12 database tables. All data belonging to the requesting user is included. Other users' identities are anonymized.

#### `user` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `id` | `user.id` | |
| `name` | `user.name` | |
| `email` | `user.email` | |
| `createdAt` | `user.createdAt` | ISO 8601 |
| `updatedAt` | `user.updatedAt` | ISO 8601 |

#### `profiles` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `displayName` | `profile.displayName` | |
| `avatarUrl` | `profile.avatarUrl` | Direct URL |
| `bio` | `profile.bio` | |
| `lookingFor` | `profile.lookingFor` | |
| `interests` | `profile.interests` | String array |
| `socialLinks` | `profile.socialLinks` | JSON object |
| `visibilityMode` | `profile.visibilityMode` | `"ninja"` / `"semi_open"` / `"full_nomad"` |
| `portrait` | `profile.portraitUrl` | Mapped from `portrait` column |
| `currentStatus` | `profile.status` | |
| `statusVisibility` | `profile.statusVisibility` | `"public"` / `"private"` |
| `superpower` | `profile.superpower` | |
| `superpowerTags` | `profile.superpowerTags` | String array |
| `offerType` | `profile.offerType` | `"volunteer"` / `"exchange"` / `"gig"` |
| `dateOfBirth` | `profile.dateOfBirth` | ISO 8601 or null |
| `doNotDisturb` | `profile.doNotDisturb` | Boolean |
| `latitude` + `longitude` | `profile.location` | `{ lat, lng }` object or null |
| `createdAt` | `profile.createdAt` | ISO 8601 |
| `updatedAt` | `profile.updatedAt` | ISO 8601 |

#### `account` table (connected OAuth accounts)

| Field | Export key | Notes |
|-------|-----------|-------|
| `providerId` | `connectedAccounts[].provider` | Filtered to apple/google/facebook/linkedin only |
| `scope` | `connectedAccounts[].scope` | OAuth scope string |

Tokens (`accessToken`, `refreshToken`, `idToken`) are never exported.

#### `waves` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `toUserId` / `fromUserId` | `waves.sent[].toUser` / `waves.received[].fromUser` | Anonymized label |
| `status` | `status` | `"pending"` / `"accepted"` / `"declined"` |
| `senderStatusSnapshot` | `senderStatusSnapshot` | Status text at time of wave |
| `recipientStatusSnapshot` | `recipientStatusSnapshot` | Status text at time of wave |
| `respondedAt` | `respondedAt` | ISO 8601 or null |
| `createdAt` | `createdAt` | ISO 8601 |

#### `conversations` + `conversationParticipants` + `messages`

Conversations are exported with full message history. Only conversations where the user is a participant are included. Soft-deleted messages (`deletedAt IS NOT NULL`) are excluded.

| Field | Export key | Notes |
|-------|-----------|-------|
| `conversationId` | `conversations[].id` | |
| participant userIds | `conversations[].participants` | Other participants only, anonymized |
| `content` | `messages[].content` | Full message text for all participants |
| `type` | `messages[].type` | `"text"` / etc. |
| `senderId` | `messages[].sentByMe` | Boolean (true if requesting user) |
| `senderId` | `messages[].senderName` | Anonymized label (null if sentByMe) |
| `createdAt` | `messages[].createdAt` | ISO 8601 |

#### `messageReactions` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `messageId` | `reactions[].messageId` | |
| `emoji` | `reactions[].reaction` | |
| `createdAt` | `reactions[].createdAt` | ISO 8601 |

#### `connectionAnalyses` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `fromUserId` / `toUserId` | `connectionAnalyses[].otherUser` | Anonymized label |
| `aiMatchScore` | `connectionAnalyses[].matchScore` | Float 0-100 or null |
| `longDescription` | `connectionAnalyses[].description` | AI-generated text |
| `createdAt` | `connectionAnalyses[].createdAt` | ISO 8601 |

#### `profilingSessions` + `profilingQA` tables

| Field | Export key | Notes |
|-------|-----------|-------|
| session `createdAt` | `profilingSessions[].createdAt` | ISO 8601 |
| `question` | `profilingSessions[].questions[].question` | AI-generated question text |
| `answer` | `profilingSessions[].questions[].answer` | User's answer or null |

#### `blocks` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `blockedId` | `blocks[].blockedUser` | Anonymized label |
| `createdAt` | `blocks[].createdAt` | ISO 8601 |

#### `statusMatches` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `matchedUserId` | `statusMatches[].otherUser` | Anonymized label |
| `reason` | `statusMatches[].status` | Match reason text |
| `createdAt` | `statusMatches[].createdAt` | ISO 8601 |

#### `conversationRatings` table

| Field | Export key | Notes |
|-------|-----------|-------|
| `conversationId` | `conversationRatings[].conversationId` | |
| `rating` | `conversationRatings[].rating` | Integer |
| `createdAt` | `conversationRatings[].createdAt` | ISO 8601 |

## Other-User Anonymization

#### What

Other users' identities are replaced with deterministic anonymous labels in the format `"Uzytkownik (a3f8c2)"` where `a3f8c2` is the first 6 characters of the SHA-256 hash of their user ID.

**Implementation:** `buildUserLabelMap()` and `shortHash()` in `data-export.ts`. All other-user IDs are collected during data gathering (from waves, conversations, messages, analyses, blocks, status matches). A single `Map<userId, label>` is built, and the `label()` helper replaces user IDs consistently across all sections.

#### Why

Other users' avatars, portraits, and real identities must not appear in another user's export (privacy of third parties). The deterministic hash ensures the same user gets the same label across all sections within one export, making the data cross-referenceable without revealing identity.

#### Config

- Hash algorithm: SHA-256
- Hash truncation: first 6 hex characters
- Label format: `"Uzytkownik (XXXXXX)"`
- Hash is per-export deterministic (same user ID always produces the same label)

## S3 Upload & Email Delivery

#### What

The assembled JSON is uploaded to Tigris/S3, a presigned URL is generated, and a notification email is sent via Resend.

#### Config

- S3 key pattern: `exports/${userId}/${Date.now()}.json`
- Content type: `application/json`
- Presigned URL expiry: 7 days (`7 * 24 * 60 * 60` seconds)
- Email template: `dataExportReady(downloadUrl)` in `apps/api/src/services/email.ts`
- Email subject: "Twoje dane z Blisko sa gotowe do pobrania"
- Email body includes: download button, 7-day expiry notice, ignore notice for unsolicited requests
- S3 client credentials: `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_ENDPOINT`, `BUCKET_NAME` env vars

## Impact Map

If you change this system, also check:

- **Adding new tables with user data** -- add queries and mapping to `collectAndExportUserData()` in `data-export.ts`, update the `ExportData` interface, update this doc
- **Adding fields to existing tables** -- decide if the field should be in the export, update the mapping in `data-export.ts`
- **Fields referencing other users** -- ensure the new field uses the `label()` anonymization helper
- **Changing S3 bucket config** -- verify `data-export.ts` uses the same env vars as other S3 operations
- **Changing email templates** -- `dataExportReady()` in `apps/api/src/services/email.ts`
- **Changing rate limits** -- `rateLimits.dataExport` in `apps/api/src/config/rateLimits.ts` and the 24h job dedup check in `accounts.requestDataExport`
- **Privacy policy** -- section 7 discloses the right to data export; update if export scope changes
