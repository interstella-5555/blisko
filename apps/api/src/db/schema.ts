import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  varchar,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Profiles table (extends Supabase auth.users)
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().unique(), // References auth.users
    displayName: varchar('display_name', { length: 50 }).notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio').notNull(),
    lookingFor: text('looking_for').notNull(),
    embedding: real('embedding').array(), // Vector for AI matching
    latitude: real('latitude'),
    longitude: real('longitude'),
    lastLocationUpdate: timestamp('last_location_update'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('profiles_user_id_idx').on(table.userId),
    locationIdx: index('profiles_location_idx').on(
      table.latitude,
      table.longitude
    ),
  })
);

// Waves (zaczepianie)
export const waves = pgTable(
  'waves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => profiles.userId),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => profiles.userId),
    message: text('message'),
    status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, accepted, declined
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    fromUserIdx: index('waves_from_user_idx').on(table.fromUserId),
    toUserIdx: index('waves_to_user_idx').on(table.toUserId),
    statusIdx: index('waves_status_idx').on(table.status),
  })
);

// Conversations
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Conversation participants
export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.conversationId, table.userId] }),
    conversationIdx: index('cp_conversation_idx').on(table.conversationId),
    userIdx: index('cp_user_idx').on(table.userId),
  })
);

// Messages
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => profiles.userId),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    readAt: timestamp('read_at'),
  },
  (table) => ({
    conversationIdx: index('messages_conversation_idx').on(table.conversationId),
    senderIdx: index('messages_sender_idx').on(table.senderId),
    createdAtIdx: index('messages_created_at_idx').on(table.createdAt),
  })
);

// Blocks
export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => profiles.userId),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => profiles.userId),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    blockerIdx: index('blocks_blocker_idx').on(table.blockerId),
    blockedIdx: index('blocks_blocked_idx').on(table.blockedId),
  })
);

// Push tokens
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.userId),
    token: text('token').notNull().unique(),
    platform: varchar('platform', { length: 10 }).notNull(), // ios, android
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('push_tokens_user_idx').on(table.userId),
  })
);

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  sentWaves: many(waves, { relationName: 'sentWaves' }),
  receivedWaves: many(waves, { relationName: 'receivedWaves' }),
  conversations: many(conversationParticipants),
  messages: many(messages),
  blockedUsers: many(blocks, { relationName: 'blocker' }),
  blockedBy: many(blocks, { relationName: 'blocked' }),
  pushTokens: many(pushTokens),
}));

export const wavesRelations = relations(waves, ({ one }) => ({
  fromUser: one(profiles, {
    fields: [waves.fromUserId],
    references: [profiles.userId],
    relationName: 'sentWaves',
  }),
  toUser: one(profiles, {
    fields: [waves.toUserId],
    references: [profiles.userId],
    relationName: 'receivedWaves',
  }),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(profiles, {
      fields: [conversationParticipants.userId],
      references: [profiles.userId],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(profiles, {
    fields: [messages.senderId],
    references: [profiles.userId],
  }),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  blocker: one(profiles, {
    fields: [blocks.blockerId],
    references: [profiles.userId],
    relationName: 'blocker',
  }),
  blocked: one(profiles, {
    fields: [blocks.blockedId],
    references: [profiles.userId],
    relationName: 'blocked',
  }),
}));

export const pushTokensRelations = relations(pushTokens, ({ one }) => ({
  user: one(profiles, {
    fields: [pushTokens.userId],
    references: [profiles.userId],
  }),
}));
