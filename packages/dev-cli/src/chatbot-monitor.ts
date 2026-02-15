import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, gt, desc, sql, ne } from "drizzle-orm";
import {
  user,
  profiles,
  waves,
  messages,
  conversations,
  conversationParticipants,
  connectionAnalyses,
} from "../../../apps/api/src/db/schema";
import { readFileSync } from "fs";
import { resolve } from "path";

// --- DB connection ---

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const envPath = resolve(import.meta.dir, "../../../apps/api/.env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (match) return match[1].trim();
  } catch {}
  console.error("DATABASE_URL not found. Set it or ensure apps/api/.env exists.");
  process.exit(1);
}

const client = postgres(getDatabaseUrl());
const db = drizzle(client);

// --- Formatting ---

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;
}

function ago(date: Date): string {
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3600_000)}h ago`;
}

function timeStr(date: Date): string {
  return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// --- Queries ---

async function getPendingWaves() {
  return db
    .select({
      waveId: waves.id,
      fromUserId: waves.fromUserId,
      toUserId: waves.toUserId,
      createdAt: waves.createdAt,
      fromName: sql<string>`(SELECT display_name FROM profiles WHERE user_id = ${waves.fromUserId})`,
      toName: sql<string>`(SELECT display_name FROM profiles WHERE user_id = ${waves.toUserId})`,
      toEmail: sql<string>`(SELECT email FROM "user" WHERE id = ${waves.toUserId})`,
    })
    .from(waves)
    .innerJoin(user, eq(waves.toUserId, user.id))
    .where(
      and(
        eq(waves.status, "pending"),
        sql`${user.email} LIKE '%@example.com'`,
      )
    )
    .orderBy(desc(waves.createdAt))
    .limit(10);
}

async function getRecentWaveActions() {
  return db
    .select({
      waveId: waves.id,
      fromUserId: waves.fromUserId,
      toUserId: waves.toUserId,
      status: waves.status,
      createdAt: waves.createdAt,
      fromName: sql<string>`(SELECT display_name FROM profiles WHERE user_id = ${waves.fromUserId})`,
      toName: sql<string>`(SELECT display_name FROM profiles WHERE user_id = ${waves.toUserId})`,
      matchScore: sql<number | null>`(
        SELECT ai_match_score FROM connection_analyses
        WHERE from_user_id = ${waves.toUserId} AND to_user_id = ${waves.fromUserId}
        LIMIT 1
      )`,
    })
    .from(waves)
    .innerJoin(user, eq(waves.toUserId, user.id))
    .where(
      and(
        ne(waves.status, "pending"),
        sql`${user.email} LIKE '%@example.com'`,
        gt(waves.createdAt, new Date(Date.now() - 3600_000)), // last hour
      )
    )
    .orderBy(desc(waves.createdAt))
    .limit(15);
}

async function getActiveConversations() {
  // Find conversations with recent messages involving seed users
  const recentConvs = await db
    .select({
      conversationId: messages.conversationId,
      lastMessageAt: sql<Date>`MAX(${messages.createdAt})`,
      messageCount: sql<number>`COUNT(*)`,
    })
    .from(messages)
    .where(
      and(
        gt(messages.createdAt, new Date(Date.now() - 3600_000)),
        sql`${messages.deletedAt} IS NULL`,
      )
    )
    .groupBy(messages.conversationId)
    .orderBy(sql`MAX(${messages.createdAt}) DESC`)
    .limit(15);

  const result = [];

  for (const conv of recentConvs) {
    // Get participants
    const parts = await db
      .select({
        userId: conversationParticipants.userId,
        email: user.email,
        displayName: profiles.displayName,
      })
      .from(conversationParticipants)
      .innerJoin(user, eq(conversationParticipants.userId, user.id))
      .leftJoin(profiles, eq(conversationParticipants.userId, profiles.userId))
      .where(eq(conversationParticipants.conversationId, conv.conversationId));

    const hasSeed = parts.some((p) => p.email.endsWith("@example.com"));
    if (!hasSeed) continue;

    // Get last 3 messages
    const lastMsgs = await db
      .select({
        senderId: messages.senderId,
        content: messages.content,
        createdAt: messages.createdAt,
        metadata: messages.metadata,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conv.conversationId),
          sql`${messages.deletedAt} IS NULL`,
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(3);

    result.push({
      conversationId: conv.conversationId,
      lastMessageAt: conv.lastMessageAt,
      recentCount: conv.messageCount,
      participants: parts,
      lastMessages: lastMsgs.reverse(),
    });
  }

  return result;
}

async function getBotStats() {
  const oneHourAgo = new Date(Date.now() - 3600_000);

  const [botMsgs] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(messages)
    .where(
      and(
        gt(messages.createdAt, oneHourAgo),
        sql`${messages.deletedAt} IS NULL`,
        sql`${messages.metadata}->>'source' = 'chatbot'`,
      )
    );

  const [humanMsgs] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(messages)
    .where(
      and(
        gt(messages.createdAt, oneHourAgo),
        sql`${messages.deletedAt} IS NULL`,
        sql`(${messages.metadata} IS NULL OR ${messages.metadata}->>'source' != 'chatbot')`,
      )
    );

  const [acceptedWaves] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(waves)
    .innerJoin(user, eq(waves.toUserId, user.id))
    .where(
      and(
        eq(waves.status, "accepted"),
        gt(waves.createdAt, oneHourAgo),
        sql`${user.email} LIKE '%@example.com'`,
      )
    );

  const [declinedWaves] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(waves)
    .innerJoin(user, eq(waves.toUserId, user.id))
    .where(
      and(
        eq(waves.status, "declined"),
        gt(waves.createdAt, oneHourAgo),
        sql`${user.email} LIKE '%@example.com'`,
      )
    );

  return {
    botMessages: Number(botMsgs?.count ?? 0),
    humanMessages: Number(humanMsgs?.count ?? 0),
    acceptedWaves: Number(acceptedWaves?.count ?? 0),
    declinedWaves: Number(declinedWaves?.count ?? 0),
  };
}

// --- Render ---

async function render() {
  const [pendingWavesList, recentActions, activeConvs, stats] = await Promise.all([
    getPendingWaves(),
    getRecentWaveActions(),
    getActiveConversations(),
    getBotStats(),
  ]);

  const lines: string[] = [];

  // --- Stats ---
  lines.push("");
  lines.push("  Chatbot Monitor (last hour)");
  lines.push("  " + "─".repeat(70));
  lines.push(
    `  Bot messages: ${padLeft(String(stats.botMessages), 3)}    Human messages: ${padLeft(String(stats.humanMessages), 3)}    Waves accepted: ${padLeft(String(stats.acceptedWaves), 3)}    declined: ${padLeft(String(stats.declinedWaves), 3)}`
  );
  lines.push("");

  // --- Pending waves ---
  lines.push(`  Pending Waves for Seed Users (${pendingWavesList.length})`);
  lines.push("  " + "─".repeat(70));
  if (pendingWavesList.length === 0) {
    lines.push("  (none)");
  } else {
    for (const w of pendingWavesList) {
      const from = w.fromName || w.fromUserId.slice(0, 8);
      const to = w.toName || w.toUserId.slice(0, 8);
      lines.push(
        `  ${pad(from, 16)} → ${pad(to, 16)} ${ago(w.createdAt)}`
      );
    }
  }
  lines.push("");

  // --- Recent wave actions ---
  lines.push(`  Recent Wave Responses (last hour)`);
  lines.push("  " + "─".repeat(70));
  if (recentActions.length === 0) {
    lines.push("  (none)");
  } else {
    for (const w of recentActions) {
      const from = w.fromName || w.fromUserId.slice(0, 8);
      const to = w.toName || w.toUserId.slice(0, 8);
      const score = w.matchScore !== null ? `${Number(w.matchScore).toFixed(0)}%` : "?";
      const icon = w.status === "accepted" ? "✓" : "✗";
      lines.push(
        `  ${icon} ${pad(to, 14)} ${pad(w.status, 10)} wave from ${pad(from, 14)} match: ${padLeft(score, 4)}   ${ago(w.createdAt)}`
      );
    }
  }
  lines.push("");

  // --- Active conversations ---
  lines.push(`  Active Conversations (${activeConvs.length})`);
  lines.push("  " + "─".repeat(70));
  if (activeConvs.length === 0) {
    lines.push("  (no conversations with messages in the last hour)");
  } else {
    for (const conv of activeConvs) {
      const names = conv.participants.map((p) => {
        const name = p.displayName || p.userId.slice(0, 8);
        const isSeed = p.email.endsWith("@example.com");
        return isSeed ? `[${name}]` : name;
      });
      lines.push(
        `  ${names.join(" ↔ ")}   (${conv.recentCount} msgs, last ${ago(conv.lastMessageAt as unknown as Date)})`
      );

      for (const msg of conv.lastMessages) {
        const sender = conv.participants.find((p) => p.userId === msg.senderId);
        const senderName = sender?.displayName || msg.senderId.slice(0, 8);
        const isBot = (msg.metadata as any)?.source === "chatbot";
        const prefix = isBot ? "🤖" : "  ";
        const content = msg.content.length > 60 ? msg.content.slice(0, 57) + "..." : msg.content;
        lines.push(
          `    ${prefix} ${pad(senderName, 14)} ${timeStr(msg.createdAt)}  ${content}`
        );
      }
      lines.push("");
    }
  }

  const now = new Date().toLocaleTimeString();
  lines.push(`  Last updated: ${now}  (refreshing every 3s, Ctrl+C to exit)`);
  lines.push("");

  process.stdout.write("\x1Bc");
  console.log(lines.join("\n"));
}

// --- Main ---

console.log("Connecting to database...");
render().then(() => {
  setInterval(render, 3000);
});

process.on("SIGINT", () => {
  client.end();
  process.exit(0);
});
