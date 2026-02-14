import type { ServerWebSocket } from 'bun';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { session as sessionTable, conversationParticipants } from '../db/schema';
import { ee } from './events';
import type { NewMessageEvent, TypingEvent, ReactionEvent, NewWaveEvent, WaveRespondedEvent, AnalysisReadyEvent, NearbyChangedEvent, ProfileReadyEvent, QuestionReadyEvent, ProfilingCompleteEvent } from './events';

export interface WSData {
  userId: string | null;
  subscriptions: Set<string>;
}

// Track all connected clients
const clients = new Set<ServerWebSocket<WSData>>();

async function authenticateToken(token: string): Promise<string | null> {
  try {
    const [session] = await db
      .select()
      .from(sessionTable)
      .where(
        and(
          eq(sessionTable.token, token),
          gt(sessionTable.expiresAt, new Date())
        )
      )
      .limit(1);
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

async function getUserConversations(userId: string): Promise<string[]> {
  const rows = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));
  return rows.map((r) => r.conversationId);
}

export const wsHandler = {
  async open(ws: ServerWebSocket<WSData>) {
    clients.add(ws);
  },

  async message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
    try {
      const data = JSON.parse(typeof message === 'string' ? message : message.toString());

      // Auth message: { type: 'auth', token: '...' }
      if (data.type === 'auth' && data.token) {
        const userId = await authenticateToken(data.token);
        if (userId) {
          ws.data.userId = userId;

          // Subscribe to all user's conversations
          const convIds = await getUserConversations(userId);
          ws.data.subscriptions = new Set(convIds);

          ws.send(JSON.stringify({ type: 'auth', status: 'ok', conversationIds: convIds }));
        } else {
          ws.send(JSON.stringify({ type: 'auth', status: 'error', message: 'Invalid token' }));
        }
        return;
      }

      // Typing indicator: { type: 'typing', conversationId: '...', isTyping: true/false }
      if (data.type === 'typing' && ws.data.userId && data.conversationId) {
        ee.emit(`typing:${data.conversationId}`, {
          conversationId: data.conversationId,
          userId: ws.data.userId,
          isTyping: data.isTyping ?? true,
        });
        return;
      }

      // Subscribe to a specific conversation
      if (data.type === 'subscribe' && data.conversationId) {
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
ee.on('newMessage', (event: NewMessageEvent) => {
  broadcastToConversation(event.conversationId, {
    type: 'newMessage',
    ...event,
  });
});

ee.on('reaction', (event: ReactionEvent) => {
  broadcastToConversation(event.conversationId, {
    type: 'reaction',
    ...event,
  });
});

ee.on('newWave', (event: NewWaveEvent) => {
  broadcastToUser(event.toUserId, {
    type: 'newWave',
    wave: event.wave,
  });
});

ee.on('waveResponded', (event: WaveRespondedEvent) => {
  broadcastToUser(event.fromUserId, {
    type: 'waveResponded',
    waveId: event.waveId,
    accepted: event.accepted,
    conversationId: event.conversationId,
  });
});

ee.on('analysisReady', (event: AnalysisReadyEvent) => {
  broadcastToUser(event.forUserId, {
    type: 'analysisReady',
    aboutUserId: event.aboutUserId,
    shortSnippet: event.shortSnippet,
  });
});

ee.on('nearbyChanged', (event: NearbyChangedEvent) => {
  broadcastToUser(event.forUserId, { type: 'nearbyChanged' });
});

ee.on('profileReady', (event: ProfileReadyEvent) => {
  broadcastToUser(event.userId, { type: 'profileReady' });
});

ee.on('questionReady', (event: QuestionReadyEvent) => {
  broadcastToUser(event.userId, {
    type: 'questionReady',
    sessionId: event.sessionId,
    questionNumber: event.questionNumber,
  });
});

ee.on('profilingComplete', (event: ProfilingCompleteEvent) => {
  broadcastToUser(event.userId, {
    type: 'profilingComplete',
    sessionId: event.sessionId,
  });
});

// Forward per-conversation typing events
ee.on('typing', (event: TypingEvent) => {
  // Use a wildcard pattern — typing events come as typing:<id>
});

// Set up dynamic typing listeners
const typingListenerSetup = new Set<string>();

export function ensureTypingListener(conversationId: string) {
  if (typingListenerSetup.has(conversationId)) return;
  typingListenerSetup.add(conversationId);

  ee.on(`typing:${conversationId}`, (event: TypingEvent) => {
    broadcastToConversation(conversationId, {
      type: 'typing',
      ...event,
    });
  });
}

export { clients };
