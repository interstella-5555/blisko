export interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  lookingFor: string;
  socialProfile: string | null;
  interests: string[] | null;
  embedding: number[] | null;
  latitude: number | null;
  longitude: number | null;
  lastLocationUpdate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Wave {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: WaveStatus;
  createdAt: Date;
}

export type WaveStatus = 'pending' | 'accepted' | 'declined';

export interface Conversation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationParticipant {
  conversationId: string;
  userId: string;
  joinedAt: Date;
}

export type MessageType = 'text' | 'image' | 'location';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  metadata: Record<string, unknown> | null;
  replyToId: string | null;
  createdAt: Date;
  readAt: Date | null;
  deletedAt: Date | null;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

export interface Block {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  createdAt: Date;
}

// API Response types
export interface NearbyUser {
  profile: Profile;
  distance: number; // in meters
  similarityScore: number | null;
}

export interface ConnectionAnalysis {
  shortSnippet: string;
  longDescription: string;
  aiMatchScore: number;
}

export interface ConversationWithLastMessage {
  conversation: Conversation;
  participant: Profile;
  lastMessage: Message | null;
  unreadCount: number;
}
