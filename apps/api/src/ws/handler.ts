import type { ServerWebSocket } from "bun";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  wsAuthResult,
  wsConnected,
  wsDisconnected,
  wsInbound,
  wsOutbound,
  wsRateLimitHit,
  wsSubscribed,
} from "@/services/ws-metrics";
import { sessionByToken } from "@/trpc/context";
import type {
  AnalysisFailedEvent,
  AnalysisReadyEvent,
  ConversationDeletedEvent,
  ForceDisconnectEvent,
  GroupInvitedEvent,
  GroupMemberEvent,
  GroupUpdatedEvent,
  NearbyChangedEvent,
  NewMessageEvent,
  NewWaveEvent,
  ProfileReadyEvent,
  ProfilingCompleteEvent,
  QuestionReadyEvent,
  ReactionEvent,
  StatusMatchesReadyEvent,
  TopicEvent,
  TypingEvent,
  WaveRespondedEvent,
} from "./events";
import { ee } from "./events";

export interface WSData {
  userId: string | null;
  subscriptions: Set<string>;
}

// Track all connected clients
const clients = new Set<ServerWebSocket<WSData>>();

// In-memory sliding window for WebSocket rate limiting
const wsCounters = new Map<string, { count: number; resetAt: number }>();

function checkWsRateLimit(userId: string, type: string, limit: number, windowMs: number): boolean {
  const key = `${type}:${userId}`;
  const now = Date.now();
  const entry = wsCounters.get(key);

  if (!entry || now > entry.resetAt) {
    wsCounters.set(key, { count: 1, resetAt: now + windowMs });
    return false; // not limited
  }

  entry.count++;
  return entry.count > limit; // limited if over
}

async function authenticateToken(token: string): Promise<string | null> {
  try {
    const [session] = await sessionByToken.execute({ token, now: new Date().toISOString() });
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

async function getUserConversations(userId: string): Promise<string[]> {
  const rows = await db
    .select({ conversationId: schema.conversationParticipants.conversationId })
    .from(schema.conversationParticipants)
    .where(eq(schema.conversationParticipants.userId, userId));
  return rows.map((r) => r.conversationId);
}

export const wsHandler = {
  async open(ws: ServerWebSocket<WSData>) {
    clients.add(ws);
    wsConnected();
  },

  async message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
    try {
      const data = JSON.parse(typeof message === "string" ? message : message.toString());

      // Auth messages bypass rate limiting
      if (data.type === "auth" && data.token) {
        const userId = await authenticateToken(data.token);
        if (userId) {
          ws.data.userId = userId;

          // Subscribe to all user's conversations
          const convIds = await getUserConversations(userId);
          ws.data.subscriptions = new Set(convIds);

          wsAuthResult(true);
          wsInbound("auth");
          // Track initial subscriptions from auth
          for (let i = 0; i < convIds.length; i++) wsSubscribed();

          ws.send(JSON.stringify({ type: "auth", status: "ok", conversationIds: convIds }));
        } else {
          wsAuthResult(false);
          wsInbound("auth");
          ws.send(JSON.stringify({ type: "auth", status: "error", message: "Invalid token" }));
        }
        return;
      }

      // Global WS rate limit: 30 messages per minute (silent drop)
      if (ws.data.userId && checkWsRateLimit(ws.data.userId, "ws", 30, 60_000)) {
        wsRateLimitHit("global");
        return;
      }

      // Typing indicator: { type: 'typing', conversationId: '...', isTyping: true/false }
      if (data.type === "typing" && ws.data.userId && data.conversationId) {
        // Rate limit typing indicators: 10 per 10 seconds (silent drop)
        if (checkWsRateLimit(ws.data.userId, "typing", 10, 10_000)) {
          wsRateLimitHit("typing");
          return;
        }
        wsInbound("typing");
        ee.emit(`typing:${data.conversationId}`, {
          conversationId: data.conversationId,
          userId: ws.data.userId,
          isTyping: data.isTyping ?? true,
        });
        return;
      }

      // Subscribe to a specific conversation (verify membership first)
      if (data.type === "subscribe" && ws.data.userId && data.conversationId) {
        const participant = await db.query.conversationParticipants.findFirst({
          where: and(
            eq(schema.conversationParticipants.conversationId, data.conversationId),
            eq(schema.conversationParticipants.userId, ws.data.userId),
          ),
          columns: { conversationId: true },
        });

        if (!participant) return;

        ws.data.subscriptions.add(data.conversationId);
        wsInbound("subscribe");
        wsSubscribed();
        return;
      }
    } catch {
      // Ignore malformed messages
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    clients.delete(ws);
    wsDisconnected(ws.data.subscriptions?.size ?? 0);
  },
};

// Periodic cleanup of expired WS rate limit entries
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of wsCounters) {
      if (now > entry.resetAt) wsCounters.delete(key);
    }
  },
  5 * 60 * 1000,
);

// Broadcast events to a specific user (all their connected clients)
function broadcastToUser(userId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  const eventType = (payload as { type?: string })?.type ?? "unknown";
  let sent = 0;
  for (const ws of clients) {
    if (ws.data.userId === userId) {
      try {
        ws.send(msg);
        sent++;
      } catch {
        // Client disconnected
      }
    }
  }
  if (sent > 0) wsOutbound(eventType, sent);
}

// Broadcast events to subscribed WebSocket clients
function broadcastToConversation(conversationId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  const eventType = (payload as { type?: string })?.type ?? "unknown";
  let sent = 0;
  for (const ws of clients) {
    if (ws.data.subscriptions?.has(conversationId)) {
      try {
        ws.send(msg);
        sent++;
      } catch {
        // Client disconnected
      }
    }
  }
  if (sent > 0) wsOutbound(eventType, sent);
}

// Listen for events from tRPC mutations
ee.on("newMessage", (event: NewMessageEvent) => {
  broadcastToConversation(event.conversationId, {
    type: "newMessage",
    ...event,
  });
});

ee.on("reaction", (event: ReactionEvent) => {
  broadcastToConversation(event.conversationId, {
    type: "reaction",
    ...event,
  });
});

ee.on("newWave", (event: NewWaveEvent) => {
  broadcastToUser(event.toUserId, {
    type: "newWave",
    wave: event.wave,
    fromProfile: event.fromProfile,
  });
});

ee.on("waveResponded", (event: WaveRespondedEvent) => {
  broadcastToUser(event.fromUserId, {
    type: "waveResponded",
    responderId: event.responderId,
    waveId: event.waveId,
    accepted: event.accepted,
    conversationId: event.conversationId,
    responderProfile: event.responderProfile,
  });
});

ee.on("analysisReady", (event: AnalysisReadyEvent) => {
  broadcastToUser(event.forUserId, {
    type: "analysisReady",
    aboutUserId: event.aboutUserId,
    shortSnippet: event.shortSnippet,
  });
});

ee.on("analysisFailed", (event: AnalysisFailedEvent) => {
  broadcastToUser(event.userAId, {
    type: "analysisFailed",
    aboutUserId: event.userBId,
  });
  broadcastToUser(event.userBId, {
    type: "analysisFailed",
    aboutUserId: event.userAId,
  });
});

ee.on("nearbyChanged", (event: NearbyChangedEvent) => {
  broadcastToUser(event.forUserId, { type: "nearbyChanged" });
});

ee.on("profileReady", (event: ProfileReadyEvent) => {
  broadcastToUser(event.userId, { type: "profileReady" });
});

ee.on("statusMatchesReady", (event: StatusMatchesReadyEvent) => {
  broadcastToUser(event.userId, { type: "statusMatchesReady" });
});

ee.on("questionReady", (event: QuestionReadyEvent) => {
  broadcastToUser(event.userId, {
    type: "questionReady",
    sessionId: event.sessionId,
    questionNumber: event.questionNumber,
  });
});

ee.on("profilingComplete", (event: ProfilingCompleteEvent) => {
  broadcastToUser(event.userId, {
    type: "profilingComplete",
    sessionId: event.sessionId,
  });
});

// Group events
ee.on("groupMember", (event: GroupMemberEvent) => {
  broadcastToConversation(event.conversationId, {
    type: "groupMember",
    ...event,
  });

  // Remove WS subscription for users who left or were kicked
  if (event.action === "left" || event.action === "removed") {
    for (const ws of clients) {
      if (ws.data.userId === event.userId) {
        ws.data.subscriptions.delete(event.conversationId);
      }
    }
  }
});

ee.on("groupUpdated", (event: GroupUpdatedEvent) => {
  broadcastToConversation(event.conversationId, {
    type: "groupUpdated",
    ...event,
  });
});

ee.on("conversationDeleted", (event: ConversationDeletedEvent) => {
  broadcastToUser(event.userId, { type: "conversationDeleted", conversationId: event.conversationId });
  removeTypingListener(event.conversationId);
});

ee.on("topicEvent", (event: TopicEvent) => {
  broadcastToConversation(event.conversationId, {
    type: "topicEvent",
    ...event,
  });
});

ee.on("groupInvited", (event: GroupInvitedEvent) => {
  broadcastToUser(event.userId, {
    type: "groupInvited",
    conversationId: event.conversationId,
    groupName: event.groupName,
  });
});

ee.on("forceDisconnect", (event: ForceDisconnectEvent) => {
  // Notify client before closing so it can suppress auto-reconnect
  broadcastToUser(event.userId, { type: "forceDisconnect" });
  // Close all WS connections for this user
  for (const ws of clients) {
    if (ws.data.userId === event.userId) {
      ws.close(1000, "account_deleted");
    }
  }
});

// Set up dynamic typing listeners (Map stores handler ref for cleanup)
const typingListeners = new Map<string, (event: TypingEvent) => void>();

export function ensureTypingListener(conversationId: string) {
  if (typingListeners.has(conversationId)) return;

  const handler = (event: TypingEvent) => {
    broadcastToConversation(conversationId, {
      type: "typing",
      ...event,
    });
  };

  typingListeners.set(conversationId, handler);
  ee.on(`typing:${conversationId}`, handler);
}

function removeTypingListener(conversationId: string) {
  const handler = typingListeners.get(conversationId);
  if (!handler) return;
  ee.removeListener(`typing:${conversationId}`, handler);
  typingListeners.delete(conversationId);
}

export { clients };
