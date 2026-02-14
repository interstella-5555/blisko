import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  varchar,
  index,
  primaryKey,
  boolean,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Better Auth tables (managed by better-auth)
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// App-specific tables

// Profiles table (extends Better Auth user)
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    displayName: varchar('display_name', { length: 50 }).notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio').notNull(),
    lookingFor: text('looking_for').notNull(),
    isHidden: boolean('is_hidden').default(false).notNull(),
    socialProfile: text('social_profile'),
    interests: text('interests').array(),
    embedding: real('embedding').array(),
    portrait: text('portrait'),
    portraitSharedForMatching: boolean('portrait_shared_for_matching')
      .default(false)
      .notNull(),
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
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => user.id),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => user.id),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
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
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
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
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id),
    content: text('content').notNull(),
    type: varchar('type', { length: 20 }).notNull().default('text'),
    metadata: text('metadata'),
    replyToId: uuid('reply_to_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    readAt: timestamp('read_at'),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    conversationIdx: index('messages_conversation_idx').on(
      table.conversationId
    ),
    senderIdx: index('messages_sender_idx').on(table.senderId),
    createdAtIdx: index('messages_created_at_idx').on(table.createdAt),
  })
);

// Message reactions
export const messageReactions = pgTable(
  'message_reactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    emoji: varchar('emoji', { length: 8 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    messageIdx: index('reactions_message_idx').on(table.messageId),
    userEmojiIdx: index('reactions_user_emoji_idx').on(
      table.messageId,
      table.userId,
      table.emoji
    ),
  })
);

// Blocks
export const blocks = pgTable(
  'blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    blockerId: text('blocker_id')
      .notNull()
      .references(() => user.id),
    blockedId: text('blocked_id')
      .notNull()
      .references(() => user.id),
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
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    token: text('token').notNull().unique(),
    platform: varchar('platform', { length: 10 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index('push_tokens_user_idx').on(table.userId),
  })
);

// Connection analyses (AI-generated per-viewer descriptions of what connects two users)
export const connectionAnalyses = pgTable(
  'connection_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => user.id),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => user.id),
    shortSnippet: text('short_snippet').notNull(),
    longDescription: text('long_description').notNull(),
    aiMatchScore: real('ai_match_score').notNull(),
    fromProfileHash: varchar('from_profile_hash', { length: 8 }).notNull(),
    toProfileHash: varchar('to_profile_hash', { length: 8 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    pairIdx: index('ca_pair_idx').on(table.fromUserId, table.toUserId),
    toUserIdx: index('ca_to_user_idx').on(table.toUserId),
  })
);

// Profiling sessions (AI-driven Q&A profiling)
export const profilingSessions = pgTable(
  'profiling_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    basedOnSessionId: uuid('based_on_session_id'),
    generatedBio: text('generated_bio'),
    generatedLookingFor: text('generated_looking_for'),
    generatedPortrait: text('generated_portrait'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (table) => ({
    userIdIdx: index('ps_user_id_idx').on(table.userId),
  })
);

// Profiling Q&A (individual questions/answers within a session)
export const profilingQA = pgTable(
  'profiling_qa',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => profilingSessions.id, { onDelete: 'cascade' }),
    questionNumber: integer('question_number').notNull(),
    question: text('question').notNull(),
    suggestions: text('suggestions').array().notNull(),
    answer: text('answer'),
    sufficient: boolean('sufficient').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    sessionIdIdx: index('pqa_session_id_idx').on(table.sessionId),
  })
);

// Relations
export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(profiles),
  sessions: many(session),
  accounts: many(account),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(user, {
    fields: [profiles.userId],
    references: [user.id],
  }),
  sentWaves: many(waves, { relationName: 'sentWaves' }),
  receivedWaves: many(waves, { relationName: 'receivedWaves' }),
  conversations: many(conversationParticipants),
  messages: many(messages),
  blockedUsers: many(blocks, { relationName: 'blocker' }),
  blockedBy: many(blocks, { relationName: 'blocked' }),
  pushTokens: many(pushTokens),
}));

export const wavesRelations = relations(waves, ({ one }) => ({
  fromUser: one(user, {
    fields: [waves.fromUserId],
    references: [user.id],
    relationName: 'sentWaves',
  }),
  toUser: one(user, {
    fields: [waves.toUserId],
    references: [user.id],
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
    user: one(user, {
      fields: [conversationParticipants.userId],
      references: [user.id],
    }),
  })
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(user, {
    fields: [messages.senderId],
    references: [user.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: 'replies',
  }),
  replies: many(messages, { relationName: 'replies' }),
  reactions: many(messageReactions),
}));

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
    user: one(user, {
      fields: [messageReactions.userId],
      references: [user.id],
    }),
  })
);

export const blocksRelations = relations(blocks, ({ one }) => ({
  blocker: one(user, {
    fields: [blocks.blockerId],
    references: [user.id],
    relationName: 'blocker',
  }),
  blocked: one(user, {
    fields: [blocks.blockedId],
    references: [user.id],
    relationName: 'blocked',
  }),
}));

export const pushTokensRelations = relations(pushTokens, ({ one }) => ({
  user: one(user, {
    fields: [pushTokens.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const profilingSessionsRelations = relations(
  profilingSessions,
  ({ one, many }) => ({
    user: one(user, {
      fields: [profilingSessions.userId],
      references: [user.id],
    }),
    basedOnSession: one(profilingSessions, {
      fields: [profilingSessions.basedOnSessionId],
      references: [profilingSessions.id],
      relationName: 'basedOn',
    }),
    questions: many(profilingQA),
  })
);

export const profilingQARelations = relations(profilingQA, ({ one }) => ({
  session: one(profilingSessions, {
    fields: [profilingQA.sessionId],
    references: [profilingSessions.id],
  }),
}));
