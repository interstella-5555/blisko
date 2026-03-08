import type { ServerWebSocket } from "bun";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import type {
  AnalysisReadyEvent,
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
    const [session] = await db
      .select()
      .from(schema.session)
      .where(and(eq(schema.session.token, token), gt(schema.session.expiresAt, new Date())))
      .limit(1);
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

          ws.send(JSON.stringify({ type: "auth", status: "ok", conversationIds: convIds }));
        } else {
          ws.send(JSON.stringify({ type: "auth", status: "error", message: "Invalid token" }));
        }
        return;
      }

      // Global WS rate limit: 30 messages per minute (silent drop)
      if (ws.data.userId && checkWsRateLimit(ws.data.userId, "ws", 30, 60_000)) return;

      // Typing indicator: { type: 'typing', conversationId: '...', isTyping: true/false }
      if (data.type === "typing" && ws.data.userId && data.conversationId) {
        // Rate limit typing indicators: 10 per 10 seconds (silent drop)
        if (checkWsRateLimit(ws.data.userId, "typing", 10, 10_000)) return;
        ee.emit(`typing:${data.conversationId}`, {
          conversationId: data.conversationId,
          userId: ws.data.userId,
          isTyping: data.isTyping ?? true,
        });
        return;
      }

      // Subscribe to a specific conversation
      if (data.type === "subscribe" && data.conversationId) {
        ws.data.subscriptions.add(data.conversationId);
        return;
      }
    } catch {
      // Ignore malformed messages
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    clients.delete(ws);
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
  for (const ws of clients) {
    if (ws.data.userId === userId) {
      try {
        ws.send(msg);
      } catch {
        // Client disconnected
      }
    }
  }
}

// Broadcast events to subscribed WebSocket clients
function broadcastToConversation(conversationId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.data.subscriptions?.has(conversationId)) {
      try {
        ws.send(msg);
      } catch {
        // Client disconnected
      }
    }
  }
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
});

ee.on("groupUpdated", (event: GroupUpdatedEvent) => {
  broadcastToConversation(event.conversationId, {
    type: "groupUpdated",
    ...event,
  });
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

// Forward per-conversation typing events
ee.on("typing", (_event: TypingEvent) => {
  // Use a wildcard pattern — typing events come as typing:<id>
});

// Set up dynamic typing listeners
const typingListenerSetup = new Set<string>();

export function ensureTypingListener(conversationId: string) {
  if (typingListenerSetup.has(conversationId)) return;
  typingListenerSetup.add(conversationId);

  ee.on(`typing:${conversationId}`, (event: TypingEvent) => {
    broadcastToConversation(conversationId, {
      type: "typing",
      ...event,
    });
  });
}

export { clients };
