# User Data Export — Design Doc (BLI-66)

RODO Art. 15 (right of access) and Art. 20 (data portability). User requests export from mobile app, receives email with download link within minutes.

## 1. Architecture

```
User taps "Pobierz moje dane"
  → tRPC mutation `account.requestDataExport`
  → enqueue BullMQ job `export-user-data` with { userId, email }
  → worker collects all user data from DB
  → serializes to JSON
  → uploads to S3 at `exports/{userId}/{uuid}.json`
  → generates presigned URL (7-day expiry)
  → sends email via Resend with download link
  → mobile shows success toast
```

No OTP required — user is already authenticated. One export at a time: if a job is already queued/active for this user, return early with a message.

## 2. JSON Export Schema

```json
{
  "exportedAt": "2026-03-07T12:00:00.000Z",
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "createdAt": "iso8601",
    "updatedAt": "iso8601"
  },
  "profile": {
    "displayName": "string",
    "avatarUrl": "https://...",
    "bio": "string",
    "lookingFor": "string",
    "interests": ["string"],
    "socialLinks": {},
    "visibilityMode": "string",
    "portraitUrl": "https://...",
    "status": "string",
    "location": { "lat": 52.20, "lng": 20.96 },
    "createdAt": "iso8601",
    "updatedAt": "iso8601"
  },
  "connectedAccounts": [
    { "provider": "google", "providerId": "123", "scope": "email profile" }
  ],
  "waves": {
    "sent": [
      { "toUser": "Anonymized User #1", "status": "accepted", "createdAt": "iso8601" }
    ],
    "received": [
      { "fromUser": "Anonymized User #2", "status": "pending", "createdAt": "iso8601" }
    ]
  },
  "conversations": [
    {
      "id": "uuid",
      "participants": ["Anonymized User #1"],
      "messages": [
        {
          "content": "Cześć!",
          "type": "text",
          "sentByMe": true,
          "createdAt": "iso8601"
        },
        {
          "content": "Hej!",
          "type": "text",
          "sentByMe": false,
          "senderName": "Anonymized User #1",
          "createdAt": "iso8601"
        }
      ]
    }
  ],
  "reactions": [
    { "messageId": "uuid", "reaction": "heart", "createdAt": "iso8601" }
  ],
  "connectionAnalyses": [
    {
      "otherUser": "Anonymized User #1",
      "matchScore": 85,
      "description": "string",
      "createdAt": "iso8601"
    }
  ],
  "profilingSessions": [
    {
      "createdAt": "iso8601",
      "questions": [
        { "question": "string", "answer": "string" }
      ]
    }
  ],
  "blocks": [
    { "blockedUser": "Anonymized User #3", "createdAt": "iso8601" }
  ],
  "statusMatches": [
    { "otherUser": "Anonymized User #4", "status": "string", "createdAt": "iso8601" }
  ]
}
```

## 3. Data Anonymization Rules

Other users' data must not be personally identifiable in the export:

- **Display names replaced** with stable anonymous labels: `Anonymized User #N` where N is a per-export sequential ID derived from deterministic ordering of other-user UUIDs. Same user gets the same label across all sections within one export.
- **Other users' avatars/portraits**: omitted entirely.
- **Message content**: included for all messages in the user's conversations (both sent and received) — content is part of the requesting user's data. Only the sender identity is anonymized.
- **Account tokens/secrets**: never included (OAuth tokens are excluded, only provider name and scope).
- **Connection analysis text**: included as-is (it describes the relationship, which is the user's data), but the other user's name is replaced with the anonymous label.

Implementation: build a `Map<userId, string>` at the start of the job. For each distinct other-user ID encountered, assign the next sequential label.

## 4. API Endpoint

```
tRPC mutation: account.requestDataExport
```

- **Auth**: requires `isAuthed` middleware (standard)
- **Input**: none (userId from context)
- **Logic**:
  1. Check for existing pending/active `export-user-data` job for this userId (query BullMQ). If found, return `{ status: 'already_requested' }`.
  2. Enqueue `export-user-data` job with `{ userId, email }`.
  3. Return `{ status: 'queued' }`.
- **Rate limit**: one export per 24 hours per user. Store `lastExportRequestedAt` in the `user` table or check job completion timestamps.

## 5. BullMQ Job

Job type: `export-user-data`

Payload:
```ts
interface ExportUserDataJob {
  type: 'export-user-data'
  userId: string
  email: string
}
```

Processor outline:
1. Query all tables listed in section 2 for the given userId.
2. Build anonymization map from all other-user IDs encountered.
3. Assemble the JSON object.
4. Upload to S3: `exports/{userId}/{jobId}.json` with `type: 'application/json'`.
5. Generate presigned URL with 7-day expiry.
6. Send email via Resend with the download link.
7. Log completion.

Add the job type to `processJob` switch in `apps/api/src/services/queue.ts` and export an `enqueueDataExport(userId, email)` function.

## 6. Email Template

**Subject:** Twoje dane z Blisko sa gotowe do pobrania

**Body (HTML):**
```
Cześć!

Twoje dane są gotowe. Kliknij poniższy link, aby pobrać plik JSON
z eksportem wszystkich Twoich danych z aplikacji Blisko.

[Pobierz dane] ← presigned S3 link

Link jest ważny przez 7 dni. Po tym czasie musisz złożyć nowe żądanie
w ustawieniach aplikacji.

Jeśli nie prosiłeś/aś o eksport danych, zignoruj tę wiadomość.

Pozdrawiamy,
Zespół Blisko
```

Use the same `from` address pattern as existing emails: `process.env.EMAIL_FROM || "Blisko <noreply@blisko.app>"`.

## 7. Mobile UI

**Location:** `apps/mobile/app/settings/account.tsx` — new section above the "Usuń konto" (delete account) section.

**Components:**
- Section header: "Eksport danych"
- Description text: "Pobierz kopię wszystkich swoich danych w formacie JSON. Link do pobrania zostanie wysłany na Twój adres e-mail."
- Button: `Pressable` labeled "Pobierz moje dane"
- Loading state: button disabled + ActivityIndicator while mutation is in flight
- Success: toast "Eksport został zlecony. Sprawdź swój e-mail." (use existing toast system)
- Already requested: toast "Eksport jest już w trakcie przygotowywania."
- Error: toast "Nie udało się zlecić eksportu. Spróbuj ponownie."

Follow existing patterns from the delete account section for styling and spacing.

## 8. Files to Modify/Create

**Modify:**
- `apps/api/src/services/queue.ts` — add `export-user-data` job type, enqueue function, processor case
- `apps/api/src/trpc/procedures/accounts.ts` — add `requestDataExport` mutation
- `apps/api/src/trpc/router.ts` — wire up if needed (likely already includes accounts)
- `apps/mobile/app/settings/account.tsx` — add export section UI

**Create:**
- `apps/api/src/services/data-export.ts` — data collection, anonymization, JSON assembly, S3 upload, email sending

## 9. Implementation Steps

1. **Schema/types** — add `ExportUserDataJob` interface to queue types in `queue.ts`.
2. **Data collector** — create `apps/api/src/services/data-export.ts` with a function that queries all tables, builds the anonymization map, and returns the JSON object.
3. **Job processor** — add `export-user-data` case to `processJob` in `queue.ts`. Calls data collector, uploads to S3, sends email.
4. **Enqueue function** — export `enqueueDataExport(userId, email)` from `queue.ts`.
5. **tRPC mutation** — add `requestDataExport` to `accounts.ts`. Checks for duplicate requests, enqueues job.
6. **Mobile UI** — add "Eksport danych" section to `account.tsx` with button, loading state, and toast feedback.
7. **Test** — trigger export for a test user, verify JSON content, download link, and email delivery.
