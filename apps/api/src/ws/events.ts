import { EventEmitter } from 'events';

// Global event emitter for real-time events
export const ee = new EventEmitter();
ee.setMaxListeners(100);

export interface NewMessageEvent {
  conversationId: string;
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    type: string;
    metadata: string | null;
    replyToId: string | null;
    createdAt: Date;
    readAt: Date | null;
    deletedAt: Date | null;
  };
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface ReactionEvent {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
  action: 'added' | 'removed';
}

export interface NewWaveEvent {
  toUserId: string;
  wave: {
    id: string;
    fromUserId: string;
    toUserId: string;
    message: string | null;
    status: string;
    createdAt: Date;
  };
}

export interface WaveRespondedEvent {
  fromUserId: string;
  waveId: string;
  accepted: boolean;
  conversationId: string | null;
}
