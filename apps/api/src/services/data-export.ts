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
      content: string;
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
    questions: { question: string; answer: string | null }[];
  }[];
  blocks: { blockedUser: string; createdAt: string }[];
  statusMatches: {
    otherUser: string;
    status: string;
    createdAt: string;
  }[];
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
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));

  // 3. Connected accounts (no tokens!)
  const accounts = await db
    .select({
      providerId: schema.account.providerId,
      scope: schema.account.scope,
    })
    .from(schema.account)
    .where(eq(schema.account.userId, userId));

  // 4. Waves
  const sentWaves = await db.select().from(schema.waves).where(eq(schema.waves.fromUserId, userId));

  const receivedWaves = await db.select().from(schema.waves).where(eq(schema.waves.toUserId, userId));

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

    const otherParticipants = allParticipants.filter((pp) => pp.userId !== userId).map((pp) => anon(pp.userId));

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
  const reactions = await db.select().from(schema.messageReactions).where(eq(schema.messageReactions.userId, userId));

  // 7. Connection analyses
  const analyses = await db
    .select()
    .from(schema.connectionAnalyses)
    .where(or(eq(schema.connectionAnalyses.fromUserId, userId), eq(schema.connectionAnalyses.toUserId, userId)));

  // 8. Profiling sessions & QA
  const sessions = await db.select().from(schema.profilingSessions).where(eq(schema.profilingSessions.userId, userId));

  const sessionsExport = [];
  for (const s of sessions) {
    const qa = await db.select().from(schema.profilingQA).where(eq(schema.profilingQA.sessionId, s.id));

    sessionsExport.push({
      createdAt: s.createdAt.toISOString(),
      questions: qa.map((q) => ({
        question: q.question,
        answer: q.answer,
      })),
    });
  }

  // 9. Blocks
  const blocks = await db.select().from(schema.blocks).where(eq(schema.blocks.blockerId, userId));

  // 10. Status matches
  const statusMatches = await db.select().from(schema.statusMatches).where(eq(schema.statusMatches.userId, userId));

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
          location: profile.latitude && profile.longitude ? { lat: profile.latitude, lng: profile.longitude } : null,
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
      reaction: r.emoji,
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
