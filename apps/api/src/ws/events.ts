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
    metadata: Record<string, unknown> | null;
    replyToId: string | null;
    topicId: string | null;
    createdAt: Date;
    readAt: Date | null;
    deletedAt: Date | null;
  };
  senderName?: string | null;
  senderAvatarUrl?: string | null;
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
  fromProfile: { displayName: string; avatarUrl: string | null };
}

export interface WaveRespondedEvent {
  fromUserId: string;
  waveId: string;
  accepted: boolean;
  conversationId: string | null;
  responderProfile: { displayName: string; avatarUrl: string | null };
}

export interface AnalysisReadyEvent {
  forUserId: string;
  aboutUserId: string;
  shortSnippet: string;
}

export interface NearbyChangedEvent {
  forUserId: string;
}

export interface ProfileReadyEvent {
  userId: string;
}

export interface QuestionReadyEvent {
  userId: string;
  sessionId: string;
  questionNumber: number;
}

export interface ProfilingCompleteEvent {
  userId: string;
  sessionId: string;
}

export interface StatusMatchesReadyEvent {
  userId: string;
}

export interface GroupMemberEvent {
  conversationId: string;
  userId: string;
  action: 'joined' | 'left' | 'removed' | 'roleChanged';
  role?: string;
  displayName?: string;
}

export interface GroupUpdatedEvent {
  conversationId: string;
  updates: {
    name?: string;
    description?: string;
    avatarUrl?: string | null;
  };
}

export interface TopicEvent {
  conversationId: string;
  topic: { id: string; name: string; emoji: string | null };
  action: 'created' | 'updated' | 'deleted' | 'closed';
}

export interface GroupInvitedEvent {
  userId: string;
  conversationId: string;
  groupName: string | null;
}
