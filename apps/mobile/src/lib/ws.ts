import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAuthStore } from "../stores/authStore";
import { authClient } from "./auth";

export interface WSNewMessage {
  id: string;
  conversationId?: string;
  senderId: string;
  content: string;
  type?: string;
  metadata?: Record<string, unknown> | null;
  replyToId?: string | null;
  createdAt: string;
  readAt?: string | null;
  deletedAt?: string | null;
  replyTo?: { id: string; content: string; senderName: string } | null;
}

export interface WSWave {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  createdAt: string;
}

export type WSMessage =
  | { type: "auth"; status: "ok"; conversationIds: string[] }
  | { type: "auth"; status: "error"; message: string }
  | {
      type: "newMessage";
      conversationId: string;
      message: WSNewMessage;
      senderName?: string | null;
      senderAvatarUrl?: string | null;
    }
  | { type: "typing"; conversationId: string; userId: string; isTyping: boolean }
  | {
      type: "reaction";
      conversationId: string;
      messageId: string;
      emoji: string;
      userId: string;
      action: "added" | "removed";
    }
  | { type: "newWave"; wave: WSWave; fromProfile: { displayName: string; avatarUrl: string | null } }
  | {
      type: "waveResponded";
      waveId: string;
      accepted: boolean;
      conversationId: string | null;
      responderId?: string;
      responderProfile?: { displayName: string; avatarUrl: string | null };
    }
  | { type: "analysisReady"; aboutUserId: string; shortSnippet: string }
  | { type: "analysisFailed"; aboutUserId: string }
  | { type: "nearbyChanged" }
  | { type: "statusMatchesReady" }
  | { type: "profileReady" }
  | { type: "questionReady"; sessionId: string; questionNumber: number }
  | { type: "profilingComplete"; sessionId: string }
  | {
      type: "groupMember";
      conversationId: string;
      userId: string;
      action: "joined" | "left" | "removed" | "roleChanged";
      role?: string;
      displayName?: string;
    }
  | {
      type: "groupUpdated";
      conversationId: string;
      updates: { name?: string; description?: string; avatarUrl?: string | null };
    }
  | {
      type: "topicEvent";
      conversationId: string;
      topic: { id: string; name: string; emoji: string | null };
      action: "created" | "updated" | "deleted" | "closed";
    }
  | { type: "groupInvited"; conversationId: string; groupName: string | null }
  | { type: "conversationDeleted"; conversationId: string }
  | { type: "forceDisconnect" }
  | { type: "reconnected" };

type MessageHandler = (msg: WSMessage) => void;

const getWsUrl = () => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
  return `${apiUrl.replace(/^http/, "ws")}/ws`;
};

let globalWs: WebSocket | null = null;
const handlers = new Set<MessageHandler>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
let hasConnectedBefore = false;
let forceDisconnected = false;

async function getToken(): Promise<string | null> {
  // 1. Zustand store — already has token from login, no network needed
  const session = useAuthStore.getState().session;
  if (session?.token) return session.token;

  // 2. Better Auth client (makes HTTP call)
  try {
    const { data } = await authClient.getSession();
    if (data?.session?.token) return data.session.token;
  } catch (e) {
    console.warn("[WS] authClient.getSession() failed:", e);
  }

  // 3. SecureStore fallback
  try {
    return await SecureStore.getItemAsync("blisko_session_token");
  } catch (e) {
    console.warn("[WS] SecureStore fallback failed:", e);
  }

  return null;
}

function connect() {
  if (forceDisconnected) return;
  if (isConnecting || (globalWs && globalWs.readyState === WebSocket.OPEN)) return;
  isConnecting = true;

  const url = getWsUrl();
  console.log("[WS] connecting to", url);
  const ws = new WebSocket(url);
  globalWs = ws;

  ws.onopen = async () => {
    isConnecting = false;
    console.log("[WS] connected, authenticating...");
    const token = await getToken();
    if (token) {
      ws.send(JSON.stringify({ type: "auth", token }));
      console.log("[WS] auth sent");
    } else {
      console.warn("[WS] no token available, cannot authenticate");
    }
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as WSMessage;
      if (data.type === "auth") {
        console.log("[WS] auth response:", data.status, data.status === "error" ? data.message : "");
        // On successful re-auth after reconnect, notify handlers to reconcile
        if (data.status === "ok") {
          if (hasConnectedBefore) {
            console.log("[WS] reconnected — dispatching reconciliation");
            for (const handler of handlers) {
              handler({ type: "reconnected" });
            }
          }
          hasConnectedBefore = true;
        }
      } else {
        console.log("[WS] received:", data.type, `(${handlers.size} handlers)`);
      }
      for (const handler of handlers) {
        handler(data);
      }

      // After dispatching to handlers, suppress reconnect for force disconnect
      if (data.type === "forceDisconnect") {
        forceDisconnected = true;
      }
    } catch (e) {
      console.warn("[WS] message parse error:", e);
    }
  };

  ws.onclose = (event) => {
    isConnecting = false;
    globalWs = null;
    if (forceDisconnected) {
      console.log("[WS] closed after forceDisconnect, not reconnecting");
      return;
    }
    console.log("[WS] closed (code:", event.code, "), reconnecting in 3s");
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = (event) => {
    isConnecting = false;
    console.warn("[WS] error:", event);
    ws.close();
  };
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  forceDisconnected = false;
  if (globalWs) {
    globalWs.close();
    globalWs = null;
  }
}

export function sendWsMessage(msg: Record<string, unknown>) {
  if (globalWs?.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(msg));
  }
}

/**
 * Hook to connect to WebSocket and listen for messages.
 * Manages connection lifecycle with AppState.
 */
export function useWebSocket(onMessage?: MessageHandler) {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    connect();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") connect();
      else if (state === "background") disconnect();
    });

    return () => {
      sub.remove();
    };
  }, [user?.id, user]);

  useEffect(() => {
    if (!onMessage) return;
    handlers.add(onMessage);
    return () => {
      handlers.delete(onMessage);
    };
  }, [onMessage]);
}

/**
 * Hook for typing indicators in a specific conversation.
 * Returns typing users and a function to send typing state.
 */
export function useTypingIndicator(conversationId: string | undefined) {
  const userId = useAuthStore((s) => s.user?.id);
  const [typingUsers, setTypingUsers] = useState<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleMessage = useCallback(
    (msg: WSMessage) => {
      if (msg.type !== "typing" || msg.conversationId !== conversationId) return;
      if (msg.userId === userId) return; // Ignore own typing

      setTypingUsers((prev) => {
        const next = new Map(prev);
        if (msg.isTyping) {
          // Clear existing timeout for this user
          const existingTimeout = next.get(msg.userId);
          if (existingTimeout) clearTimeout(existingTimeout);

          // Auto-clear after 5s
          const timeout = setTimeout(() => {
            setTypingUsers((p) => {
              const n = new Map(p);
              n.delete(msg.userId);
              return n;
            });
          }, 5000);
          next.set(msg.userId, timeout);
        } else {
          const existingTimeout = next.get(msg.userId);
          if (existingTimeout) clearTimeout(existingTimeout);
          next.delete(msg.userId);
        }
        return next;
      });
    },
    [conversationId, userId],
  );

  useWebSocket(handleMessage);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversationId) return;
      sendWsMessage({ type: "typing", conversationId, isTyping });

      // Auto-stop after 3s
      if (isTyping) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          sendWsMessage({ type: "typing", conversationId, isTyping: false });
        }, 3000);
      }
    },
    [conversationId],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      for (const timeout of typingUsers.values()) clearTimeout(timeout);
    };
  }, [typingUsers.values]);

  return {
    isTyping: typingUsers.size > 0,
    typingUserIds: Array.from(typingUsers.keys()),
    sendTyping,
  };
}
