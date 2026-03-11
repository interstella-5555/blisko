import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { dataExportReady, sendEmail } from "@/services/email";

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

function shortHash(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 6);
}

function buildUserLabelMap(userIds: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of userIds) {
    map.set(id, `Użytkownik (${shortHash(id)})`);
  }
  return map;
}

export async function collectAndExportUserData(userId: string, email: string) {
  // 1. User
  const userData = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!userData) throw new Error(`User ${userId} not found`);

  // 2. Profile
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });

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

  const conversationIds = participations.map((p) => p.conversationId);

  // Batch-fetch all participants and messages for all conversations
  const allParticipants =
    conversationIds.length > 0
      ? await db
          .select({
            conversationId: schema.conversationParticipants.conversationId,
            userId: schema.conversationParticipants.userId,
          })
          .from(schema.conversationParticipants)
          .where(inArray(schema.conversationParticipants.conversationId, conversationIds))
      : [];

  const allMessages =
    conversationIds.length > 0
      ? await db
          .select()
          .from(schema.messages)
          .where(and(inArray(schema.messages.conversationId, conversationIds), isNull(schema.messages.deletedAt)))
      : [];

  // Group by conversationId
  const participantsByConv = new Map<string, typeof allParticipants>();
  for (const p of allParticipants) {
    const arr = participantsByConv.get(p.conversationId);
    if (arr) arr.push(p);
    else participantsByConv.set(p.conversationId, [p]);
  }

  const messagesByConv = new Map<string, typeof allMessages>();
  for (const m of allMessages) {
    const arr = messagesByConv.get(m.conversationId);
    if (arr) arr.push(m);
    else messagesByConv.set(m.conversationId, [m]);
  }

  const otherUserIds = new Set<string>();

  // Collect other user IDs from waves
  for (const w of sentWaves) otherUserIds.add(w.toUserId);
  for (const w of receivedWaves) otherUserIds.add(w.fromUserId);

  // Collect from conversations
  const conversationsExport = conversationIds.map((convId) => {
    const convParticipants = participantsByConv.get(convId) ?? [];
    const convMessages = messagesByConv.get(convId) ?? [];

    for (const pp of convParticipants) {
      if (pp.userId !== userId) otherUserIds.add(pp.userId);
    }
    for (const m of convMessages) {
      if (m.senderId !== userId) otherUserIds.add(m.senderId);
    }

    return { conversationId: convId, allParticipants: convParticipants, messages: convMessages };
  });

  // 6. Reactions
  const reactions = await db.select().from(schema.messageReactions).where(eq(schema.messageReactions.userId, userId));

  // 7. Connection analyses
  const analyses = await db
    .select()
    .from(schema.connectionAnalyses)
    .where(or(eq(schema.connectionAnalyses.fromUserId, userId), eq(schema.connectionAnalyses.toUserId, userId)));

  for (const a of analyses) {
    otherUserIds.add(a.fromUserId === userId ? a.toUserId : a.fromUserId);
  }

  // 8. Profiling sessions & QA
  const sessions = await db.select().from(schema.profilingSessions).where(eq(schema.profilingSessions.userId, userId));

  const sessionIds = sessions.map((s) => s.id);
  const allQA =
    sessionIds.length > 0
      ? await db.select().from(schema.profilingQA).where(inArray(schema.profilingQA.sessionId, sessionIds))
      : [];

  const qaBySession = new Map<string, typeof allQA>();
  for (const q of allQA) {
    const arr = qaBySession.get(q.sessionId);
    if (arr) arr.push(q);
    else qaBySession.set(q.sessionId, [q]);
  }

  const sessionsExport = sessions.map((s) => ({
    createdAt: s.createdAt.toISOString(),
    questions: (qaBySession.get(s.id) ?? []).map((q) => ({
      question: q.question,
      answer: q.answer,
    })),
  }));

  // 9. Blocks
  const blocks = await db.select().from(schema.blocks).where(eq(schema.blocks.blockerId, userId));
  for (const b of blocks) otherUserIds.add(b.blockedId);

  // 10. Status matches
  const statusMatches = await db.select().from(schema.statusMatches).where(eq(schema.statusMatches.userId, userId));
  for (const m of statusMatches) otherUserIds.add(m.matchedUserId);

  // Build label map: "Ania (a3f8c2)" format
  const labelMap = buildUserLabelMap([...otherUserIds]);
  const label = (id: string) => labelMap.get(id) ?? `Użytkownik (${shortHash(id)})`;

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
        toUser: label(w.toUserId),
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
      received: receivedWaves.map((w) => ({
        fromUser: label(w.fromUserId),
        status: w.status,
        createdAt: w.createdAt.toISOString(),
      })),
    },
    conversations: conversationsExport.map((c) => ({
      id: c.conversationId,
      participants: c.allParticipants.filter((pp) => pp.userId !== userId).map((pp) => label(pp.userId)),
      messages: c.messages.map((m) => ({
        content: m.content,
        type: m.type,
        sentByMe: m.senderId === userId,
        senderName: m.senderId === userId ? null : label(m.senderId),
        createdAt: m.createdAt.toISOString(),
      })),
    })),
    reactions: reactions.map((r) => ({
      messageId: r.messageId,
      reaction: r.emoji,
      createdAt: r.createdAt.toISOString(),
    })),
    connectionAnalyses: analyses.map((a) => ({
      otherUser: label(a.fromUserId === userId ? a.toUserId : a.fromUserId),
      matchScore: a.aiMatchScore,
      description: a.longDescription,
      createdAt: a.createdAt.toISOString(),
    })),
    profilingSessions: sessionsExport,
    blocks: blocks.map((b) => ({
      blockedUser: label(b.blockedId),
      createdAt: b.createdAt.toISOString(),
    })),
    statusMatches: statusMatches.map((m) => ({
      otherUser: label(m.matchedUserId),
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

  // Send email notification
  await sendEmail(email, dataExportReady(downloadUrl));
}
