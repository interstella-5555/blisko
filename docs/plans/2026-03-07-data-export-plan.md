# User Data Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Users can request a JSON export of all their data from the mobile app. A background job collects the data, uploads it to S3, and emails a download link.

**Architecture:** tRPC mutation enqueues a BullMQ job. Worker queries all user tables, anonymizes other users, serializes to JSON, uploads to S3, sends email via Resend with presigned URL (7-day expiry). Rate limited to 1 request per 24h.

**Tech Stack:** Bun, tRPC, BullMQ, Drizzle ORM, S3 (Tigris), Resend

---

### Task 1: Add job type and enqueue function to queue

**Files:**
- Modify: `apps/api/src/services/queue.ts`

**Step 1: Add ExportUserDataJob interface**

After `HardDeleteUserJob` interface (line 83):

```ts
interface ExportUserDataJob {
  type: "export-user-data";
  userId: string;
  email: string;
}
```

**Step 2: Add to AIJob union type**

Add `| ExportUserDataJob` to the union (line 93):

```ts
type AIJob =
  | AnalyzePairJob
  | AnalyzeUserPairsJob
  | GenerateProfileAIJob
  | GenerateProfilingQuestionJob
  | GenerateProfileFromQAJob
  | StatusMatchingJob
  | HardDeleteUserJob
  | ExportUserDataJob;
```

**Step 3: Add case to processJob switch**

In the `processJob` function switch (around line 658):

```ts
    case "export-user-data":
      await processExportUserData(data.userId, data.email);
      break;
```

**Step 4: Add enqueue function**

After `cancelHardDeleteUser` (line 889):

```ts
export async function enqueueDataExport(userId: string, email: string) {
  if (!process.env.REDIS_URL) return;

  const queue = getQueue();
  await queue.add(
    "export-user-data",
    { type: "export-user-data", userId, email },
    {
      jobId: `export-${userId}-${Date.now()}`,
      removeOnComplete: true,
    },
  );
}
```

**Step 5: Add a placeholder processor** (will be implemented in Task 2)

Before `processJob`:

```ts
async function processExportUserData(userId: string, email: string) {
  console.log(`[queue] export-user-data starting for ${userId}`);
  const { collectAndExportUserData } = await import("./data-export");
  await collectAndExportUserData(userId, email);
  console.log(`[queue] export-user-data completed for ${userId}`);
}
```

**Step 6: Commit**

```bash
git add apps/api/src/services/queue.ts
git commit -m "Add export-user-data job type and enqueue function (BLI-66)"
```

---

### Task 2: Create data export service

**Files:**
- Create: `apps/api/src/services/data-export.ts`

**Step 1: Create the file with the full export logic**

```ts
import { eq, or } from "drizzle-orm";
import { db, schema } from "@/db";

interface ExportData {
  exportedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    updatedAt: string;
  };
  profile: {
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    lookingFor: string;
    interests: string[] | null;
    socialLinks: unknown;
    visibilityMode: string;
    portraitUrl: string | null;
    status: string | null;
    location: { lat: number; lng: number } | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  connectedAccounts: { provider: string; scope: string | null }[];
  waves: {
    sent: { toUser: string; status: string; createdAt: string }[];
    received: { fromUser: string; status: string; createdAt: string }[];
  };
  conversations: {
    id: string;
    participants: string[];
    messages: {
      content: string | null;
      type: string;
      sentByMe: boolean;
      senderName: string | null;
      createdAt: string;
    }[];
  }[];
  reactions: { messageId: string; reaction: string; createdAt: string }[];
  connectionAnalyses: {
    otherUser: string;
    matchScore: number | null;
    description: string | null;
    createdAt: string;
  }[];
  profilingSessions: {
    createdAt: string;
    questions: { question: string; answer: string }[];
  }[];
  blocks: { blockedUser: string; createdAt: string }[];
  statusMatches: { otherUser: string; status: string | null; createdAt: string }[];
}

function buildAnonymizer() {
  const map = new Map<string, string>();
  let counter = 0;
  return (userId: string): string => {
    if (!map.has(userId)) {
      counter++;
      map.set(userId, `Anonymized User #${counter}`);
    }
    return map.get(userId)!;
  };
}

export async function collectAndExportUserData(userId: string, email: string) {
  const anon = buildAnonymizer();

  // 1. User
  const [userData] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      createdAt: schema.user.createdAt,
      updatedAt: schema.user.updatedAt,
    })
    .from(schema.user)
    .where(eq(schema.user.id, userId));

  if (!userData) throw new Error(`User ${userId} not found`);

  // 2. Profile
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId));

  // 3. Connected accounts (no tokens!)
  const accounts = await db
    .select({
      providerId: schema.account.providerId,
      scope: schema.account.scope,
    })
    .from(schema.account)
    .where(eq(schema.account.userId, userId));

  // 4. Waves
  const sentWaves = await db
    .select()
    .from(schema.waves)
    .where(eq(schema.waves.fromUserId, userId));

  const receivedWaves = await db
    .select()
    .from(schema.waves)
    .where(eq(schema.waves.toUserId, userId));

  // 5. Conversations & messages
  const participations = await db
    .select()
    .from(schema.conversationParticipants)
    .where(eq(schema.conversationParticipants.userId, userId));

  const conversationsExport = [];
  for (const p of participations) {
    const allParticipants = await db
      .select({ userId: schema.conversationParticipants.userId })
      .from(schema.conversationParticipants)
      .where(eq(schema.conversationParticipants.conversationId, p.conversationId));

    const otherParticipants = allParticipants
      .filter((pp) => pp.userId !== userId)
      .map((pp) => anon(pp.userId));

    const messages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.conversationId, p.conversationId));

    conversationsExport.push({
      id: p.conversationId,
      participants: otherParticipants,
      messages: messages.map((m) => ({
        content: m.content,
        type: m.type,
        sentByMe: m.senderId === userId,
        senderName: m.senderId === userId ? null : anon(m.senderId),
        createdAt: m.createdAt.toISOString(),
      })),
    });
  }

  // 6. Reactions
  const reactions = await db
    .select()
    .from(schema.messageReactions)
    .where(eq(schema.messageReactions.userId, userId));

  // 7. Connection analyses
  const analyses = await db
    .select()
    .from(schema.connectionAnalyses)
    .where(
      or(
        eq(schema.connectionAnalyses.fromUserId, userId),
        eq(schema.connectionAnalyses.toUserId, userId),
      ),
    );

  // 8. Profiling sessions & QA
  const sessions = await db
    .select()
    .from(schema.profilingSessions)
    .where(eq(schema.profilingSessions.userId, userId));

  const sessionsExport = [];
  for (const s of sessions) {
    const qa = await db
      .select()
      .from(schema.profilingQA)
      .where(eq(schema.profilingQA.sessionId, s.id));

    sessionsExport.push({
      createdAt: s.createdAt.toISOString(),
      questions: qa.map((q) => ({
        question: q.question,
        answer: q.answer,
      })),
    });
  }

  // 9. Blocks
  const blocks = await db
    .select()
    .from(schema.blocks)
    .where(eq(schema.blocks.blockerId, userId));

  // 10. Status matches
  const statusMatches = await db
    .select()
    .from(schema.statusMatches)
    .where(eq(schema.statusMatches.userId, userId));

  // Assemble export
  const exportData: ExportData = {
    exportedAt: new Date().toISOString(),
    user: {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      createdAt: userData.createdAt.toISOString(),
      updatedAt: userData.updatedAt.toISOString(),
    },
    profile: profile
      ? {
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          bio: profile.bio,
          lookingFor: profile.lookingFor,
          interests: profile.interests,
          socialLinks: profile.socialLinks,
          visibilityMode: profile.visibilityMode,
          portraitUrl: profile.portrait,
          status: profile.currentStatus,
          location:
            profile.latitude && profile.longitude
              ? { lat: profile.latitude, lng: profile.longitude }
              : null,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    connectedAccounts: accounts
      .filter((a) => ["apple", "google", "facebook", "linkedin"].includes(a.providerId))
      .map((a) => ({ provider: a.providerId, scope: a.scope })),
    waves: {
      sent: sentWaves.map((w) => ({
        toUser: anon(w.toUserId),
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
      received: receivedWaves.map((w) => ({
        fromUser: anon(w.fromUserId),
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
    },
    conversations: conversationsExport,
    reactions: reactions.map((r) => ({
      messageId: r.messageId,
      reaction: r.reaction,
      createdAt: r.createdAt.toISOString(),
    })),
    connectionAnalyses: analyses.map((a) => ({
      otherUser: anon(a.fromUserId === userId ? a.toUserId : a.fromUserId),
      matchScore: a.aiMatchScore,
      description: a.longDescription,
      createdAt: a.createdAt.toISOString(),
    })),
    profilingSessions: sessionsExport,
    blocks: blocks.map((b) => ({
      blockedUser: anon(b.blockedId),
      createdAt: b.createdAt.toISOString(),
    })),
    statusMatches: statusMatches.map((m) => ({
      otherUser: anon(m.matchedUserId),
      status: m.reason,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  // Upload to S3
  const { S3Client } = await import("bun");
  const s3 = new S3Client({
    accessKeyId: process.env.BUCKET_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BUCKET_SECRET_ACCESS_KEY!,
    endpoint: process.env.BUCKET_ENDPOINT!,
    bucket: process.env.BUCKET_NAME!,
  });

  const key = `exports/${userId}/${Date.now()}.json`;
  const json = JSON.stringify(exportData, null, 2);
  await s3.write(key, json, { type: "application/json" });

  const downloadUrl = s3.file(key).presign({ expiresIn: 7 * 24 * 60 * 60 });

  // Send email via Resend
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Blisko <noreply@blisko.app>",
    to: email,
    subject: "Twoje dane z Blisko są gotowe do pobrania",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <p style="font-size: 24px; font-weight: 300; letter-spacing: 4px; margin-bottom: 24px;">BLISKO</p>
        <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Cześć!</p>
        <p style="font-size: 15px; color: #3A3A3A; line-height: 1.6;">Twoje dane są gotowe. Kliknij poniższy link, aby pobrać plik JSON z eksportem wszystkich Twoich danych z aplikacji Blisko.</p>
        <p style="margin: 24px 0;">
          <a href="${downloadUrl}" style="background: #C0392B; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 13px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">Pobierz dane</a>
        </p>
        <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Link jest ważny przez 7 dni. Po tym czasie możesz złożyć nowe żądanie w ustawieniach aplikacji.</p>
        <p style="font-size: 13px; color: #8B8680; line-height: 1.6;">Jeśli nie prosiłeś/aś o eksport danych, zignoruj tę wiadomość.</p>
        <p style="font-size: 13px; color: #8B8680; margin-top: 32px;">Pozdrawiamy,<br>Zespół Blisko</p>
      </div>
    `,
  });
}
```

**Step 2: Commit**

```bash
git add apps/api/src/services/data-export.ts
git commit -m "Add data export service with anonymization and email (BLI-66)"
```

---

### Task 3: Add tRPC mutation

**Files:**
- Modify: `apps/api/src/trpc/procedures/accounts.ts`

**Step 1: Add import**

Add to the imports at the top:

```ts
import { enqueueDataExport } from "@/services/queue";
```

**Step 2: Add requestDataExport mutation**

Add before the closing `})` of the router (before line 107):

```ts
  requestDataExport: protectedProcedure.mutation(async ({ ctx }) => {
    // Get user email
    const [userData] = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(eq(schema.user.id, ctx.userId));

    if (!userData) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    // Rate limit: check for recent export jobs (24h cooldown)
    // Using BullMQ job lookup — if a completed/active job exists within 24h, reject
    const { Queue } = await import("bullmq");
    const url = new URL(process.env.REDIS_URL!);
    const queue = new Queue("ai-jobs", {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
        maxRetriesPerRequest: null as null,
      },
    });

    try {
      const jobs = await queue.getJobs(["completed", "active", "waiting", "delayed"]);
      const recentExport = jobs.find(
        (j) =>
          j.data.type === "export-user-data" &&
          j.data.userId === ctx.userId &&
          j.timestamp > Date.now() - 24 * 60 * 60 * 1000,
      );

      if (recentExport) {
        return { status: "already_requested" as const };
      }
    } finally {
      await queue.close();
    }

    await enqueueDataExport(ctx.userId, userData.email);
    return { status: "queued" as const };
  }),
```

**Step 3: Commit**

```bash
git add apps/api/src/trpc/procedures/accounts.ts
git commit -m "Add requestDataExport tRPC mutation with 24h rate limit (BLI-66)"
```

---

### Task 4: Add mobile UI

**Files:**
- Modify: `apps/mobile/app/settings/account.tsx`

**Step 1: Add the export section**

Add the `useToast` import — check if it's already imported, if not add:

```ts
import { useToast } from "@/providers/ToastProvider";
```

Inside `AccountScreen()`, add the mutation and handler after the existing `requestDeletion` mutation (around line 169):

```ts
  const { showToast } = useToast();
  const requestExport = trpc.accounts.requestDataExport.useMutation({
    onSuccess: (data) => {
      if (data.status === "already_requested") {
        showToast({ type: "info", title: "Eksport danych", message: "Eksport jest już w trakcie przygotowywania." });
      } else {
        showToast({ type: "success", title: "Eksport danych", message: "Eksport został zlecony. Sprawdź swój e-mail." });
      }
    },
    onError: () => {
      showToast({ type: "error", title: "Błąd", message: "Nie udało się zlecić eksportu. Spróbuj ponownie." });
    },
  });
```

**Step 2: Add the UI section**

In the JSX, add a new section between the connected accounts section and the delete section. Before the `{otpStep ? (` block (line 266), add:

```tsx
      <View style={styles.divider} />
      <Text style={styles.sectionLabel}>EKSPORT DANYCH</Text>
      <Text style={styles.exportDescription}>
        Pobierz kopię wszystkich swoich danych w formacie JSON. Link do pobrania zostanie wysłany na Twój adres e-mail.
      </Text>
      <Pressable
        style={styles.exportButton}
        onPress={() => requestExport.mutate()}
        disabled={requestExport.isPending}
      >
        {requestExport.isPending ? (
          <ActivityIndicator color={colors.ink} size="small" />
        ) : (
          <Text style={styles.exportButtonText}>POBIERZ MOJE DANE</Text>
        )}
      </Pressable>
```

**Step 3: Add styles**

Add to the StyleSheet:

```ts
  exportDescription: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginBottom: spacing.column,
  },
  exportButton: {
    borderWidth: 1,
    borderColor: colors.rule,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 44,
  },
  exportButtonText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.ink,
  },
```

**Step 4: Commit**

```bash
git add apps/mobile/app/settings/account.tsx
git commit -m "Add data export button in account settings (BLI-66)"
```

---

### Task 5: Typecheck, lint, and test

**Step 1: Run typechecks**

```bash
pnpm --filter @repo/api typecheck
pnpm --filter @repo/shared typecheck
pnpm --filter @repo/mobile typecheck
```

Expected: 0 errors for all three. Fix any type issues (likely around schema field names — check exact column names in `schema.ts` match what's used in `data-export.ts`).

**Step 2: Run biome**

```bash
npx @biomejs/biome check .
```

Expected: 0 errors

**Step 3: Run API tests**

```bash
pnpm --filter @repo/api test
```

Expected: existing tests pass

**Step 4: Manual test**

1. Start the API locally: `cd apps/api && pnpm dev`
2. Use dev-cli or mobile app to log in
3. Navigate to Settings > Account > "POBIERZ MOJE DANE"
4. Check email for download link
5. Download JSON and verify it contains user data with anonymized other-user names

**Step 5: Final commit if fixes needed**

```bash
git commit -m "Fix typecheck and lint issues for data export (BLI-66)"
```
