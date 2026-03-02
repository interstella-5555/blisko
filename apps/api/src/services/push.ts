import Expo, { type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { pushTokens } from '../db/schema';
import { clients } from '../ws/handler';

const expo = new Expo();

function isUserConnected(userId: string): boolean {
  for (const ws of clients) {
    if (ws.data.userId === userId) return true;
  }
  return false;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  try {
    // Don't send push if user is connected via WebSocket (in-app banner handles it)
    if (isUserConnected(userId)) return;

    const tokens = await db
      .select({ id: pushTokens.id, token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));

    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        sound: 'default' as const,
        title: payload.title,
        body: payload.body,
        data: payload.data,
      }));

    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

      // Clean up invalid tokens
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          const invalidToken = tokens[i];
          if (invalidToken) {
            await db.delete(pushTokens).where(eq(pushTokens.id, invalidToken.id));
          }
        }
      }
    }
  } catch (err) {
    console.error('Push send error:', err);
  }
}
