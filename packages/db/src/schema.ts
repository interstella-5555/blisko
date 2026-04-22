import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Better Auth tables (managed by better-auth)
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
    anonymizedAt: timestamp("anonymized_at"),
    suspendedAt: timestamp("suspended_at"),
    suspendReason: text("suspend_reason"),
  },
  (table) => ({
    suspendedAtIdx: index("user_suspended_at_idx").on(table.suspendedAt).where(sql`${table.suspendedAt} IS NOT NULL`),
  }),
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userIdIdx: index("session_user_id_idx").on(table.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId),
  }),
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// App-specific tables

// Profiles table (extends Better Auth user)
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 50 }).notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio").notNull(),
    lookingFor: text("looking_for").notNull(),
    socialLinks: jsonb("social_links").$type<{ facebook?: string; linkedin?: string }>(),
    visibilityMode: text("visibility_mode")
      .$type<"ninja" | "semi_open" | "full_nomad">()
      .default("semi_open")
      .notNull(),
    doNotDisturb: boolean("do_not_disturb").default(false).notNull(),
    superpower: text("superpower"),
    superpowerTags: text("superpower_tags").array(),
    offerType: text("offer_type").$type<"volunteer" | "exchange" | "gig">(),
    interests: text("interests").array(),
    embedding: real("embedding").array(),
    portrait: text("portrait"),
    portraitSharedForMatching: boolean("portrait_shared_for_matching").default(true).notNull(),
    isComplete: boolean("is_complete").default(false).notNull(),
    currentStatus: text("current_status"),
    statusExpiresAt: timestamp("status_expires_at"),
    statusEmbedding: real("status_embedding").array(),
    statusSetAt: timestamp("status_set_at"),
    statusVisibility: text("status_visibility").$type<"public" | "private">(),
    dateOfBirth: timestamp("date_of_birth"),
    statusCategories: text("status_categories").array(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    lastLocationUpdate: timestamp("last_location_update"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("profiles_user_id_idx").on(table.userId),
    locationIdx: index("profiles_location_idx").on(table.latitude, table.longitude),
  }),
);

// Waves (pings)
export const waves = pgTable(
  "waves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    senderStatusSnapshot: text("sender_status_snapshot"),
    recipientStatusSnapshot: text("recipient_status_snapshot"),
    respondedAt: timestamp("responded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Stored generated column canonicalising the user pair (direction-agnostic).
    // (A,B) and (B,A) produce the same `pair_key`, which lets a plain unique
    // index treat them as one. md5 of `least || ':' || greatest` gives a
    // fixed-width 32-char hex string regardless of source ID length and
    // sidesteps any worry about separator collisions in user IDs. GENERATED
    // ALWAYS AS ... STORED — applications never write to it; Postgres
    // recomputes it on every UPDATE that touches from_user_id / to_user_id.
    pairKey: text("pair_key")
      .notNull()
      .generatedAlwaysAs(
        sql`md5(LEAST("from_user_id", "to_user_id") || ':' || GREATEST("from_user_id", "to_user_id"))`,
      ),
  },
  (table) => ({
    fromUserStatusIdx: index("waves_from_user_status_idx").on(table.fromUserId, table.status),
    toUserStatusIdx: index("waves_to_user_status_idx").on(table.toUserId, table.status),
    // At most one *active* wave per pair of users (direction-agnostic).
    // Active = pending OR accepted. Built on the `pair_key` generated column
    // above so the unique check is symmetric without needing an expression-
    // based index. This single constraint enforces three rules:
    //   1. No duplicate pending waves (same direction race)
    //   2. No re-waving someone you are already connected with (any direction)
    //   3. No two pending waves in opposite directions — the second send hits
    //      this constraint and waves.send treats it as an "implicit accept"
    //      of the existing pending wave from the other user.
    // Declined waves do not occupy a slot, so re-waving after the decline
    // cooldown remains possible.
    activeUnique: uniqueIndex("waves_active_unique")
      .on(table.pairKey)
      .where(sql`${table.status} in ('pending', 'accepted')`),
  }),
);

// Conversations
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 10 }).notNull().default("dm"),
    name: varchar("name", { length: 100 }),
    description: text("description"),
    avatarUrl: text("avatar_url"),
    inviteCode: varchar("invite_code", { length: 20 }).unique(),
    creatorId: text("creator_id").references(() => user.id),
    maxMembers: integer("max_members").default(200),
    latitude: real("latitude"),
    longitude: real("longitude"),
    isDiscoverable: boolean("is_discoverable").default(false),
    discoveryRadiusMeters: integer("discovery_radius_meters").default(5000),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index("conversations_type_idx").on(table.type),
    inviteCodeIdx: index("conversations_invite_code_idx").on(table.inviteCode),
    locationIdx: index("conversations_location_idx").on(table.latitude, table.longitude),
    discoverableIdx: index("conversations_discoverable_idx").on(table.isDiscoverable),
  }),
);

// Conversation ratings (optional, on delete)
export const conversationRatings = pgTable(
  "conversation_ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("cr_conversation_idx").on(table.conversationId),
    userIdx: index("cr_user_idx").on(table.userId),
  }),
);

// Conversation participants
export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: varchar("role", { length: 10 }).notNull().default("member"),
    mutedUntil: timestamp("muted_until"),
    lastReadAt: timestamp("last_read_at"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    locationVisible: boolean("location_visible").default(true).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.conversationId, table.userId] }),
    conversationIdx: index("cp_conversation_idx").on(table.conversationId),
    userIdx: index("cp_user_idx").on(table.userId),
  }),
);

// Topics (for group conversations)
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    emoji: varchar("emoji", { length: 8 }),
    creatorId: text("creator_id").references(() => user.id),
    isPinned: boolean("is_pinned").default(false),
    isClosed: boolean("is_closed").default(false),
    sortOrder: integer("sort_order").default(0),
    lastMessageAt: timestamp("last_message_at"),
    messageCount: integer("message_count").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    conversationIdx: index("topics_conversation_idx").on(table.conversationId),
    sortIdx: index("topics_sort_idx").on(table.conversationId, table.isPinned, table.sortOrder),
  }),
);

// Messages
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id),
    topicId: uuid("topic_id").references(() => topics.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    type: varchar("type", { length: 20 }).notNull().default("text"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    replyToId: uuid("reply_to_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    readAt: timestamp("read_at"),
    deletedAt: timestamp("deleted_at"),
    seq: bigint("seq", { mode: "number" }).notNull(),
  },
  (table) => ({
    convCreatedIdx: index("messages_conv_created_idx").on(table.conversationId, table.createdAt),
    senderIdx: index("messages_sender_idx").on(table.senderId),
    topicIdx: index("messages_topic_idx").on(table.topicId),
    convSeqUniq: uniqueIndex("messages_conv_seq_uniq").on(table.conversationId, table.seq),
  }),
);

// Message reactions
export const messageReactions = pgTable(
  "message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    emoji: varchar("emoji", { length: 8 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    messageIdx: index("reactions_message_idx").on(table.messageId),
    userEmojiIdx: index("reactions_user_emoji_idx").on(table.messageId, table.userId, table.emoji),
  }),
);

// Blocks
export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: text("blocker_id")
      .notNull()
      .references(() => user.id),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    blockerIdx: index("blocks_blocker_idx").on(table.blockerId),
    blockedIdx: index("blocks_blocked_idx").on(table.blockedId),
  }),
);

// Push tokens
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    token: text("token").notNull().unique(),
    platform: varchar("platform", { length: 10 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("push_tokens_user_idx").on(table.userId),
  }),
);

// Push notification log (batch-flushed from Redis every 15s)
export const pushSends = pgTable(
  "push_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data"),
    collapseId: varchar("collapse_id", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull(), // sent | suppressed | failed
    suppressionReason: varchar("suppression_reason", { length: 30 }), // ws_active | dnd | no_tokens | invalid_tokens
    tokenCount: integer("token_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("push_sends_user_idx").on(table.userId),
    createdAtIdx: index("push_sends_created_at_idx").on(table.createdAt),
    statusIdx: index("push_sends_status_idx").on(table.status),
  }),
);

// Status matches (AI-evaluated "na teraz" status matches between users)
export const statusMatches = pgTable(
  "status_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    matchedUserId: text("matched_user_id")
      .notNull()
      .references(() => user.id),
    reason: text("reason").notNull(),
    matchedVia: text("matched_via").notNull(), // 'status' | 'profile'
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("sm_user_id_idx").on(table.userId),
    matchedUserIdIdx: index("sm_matched_user_id_idx").on(table.matchedUserId),
    userMatchedUserUniq: unique("sm_user_matched_user_uniq").on(table.userId, table.matchedUserId),
  }),
);

// Connection analyses (AI-generated per-viewer descriptions of what connects two users)
export const connectionAnalyses = pgTable(
  "connection_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id),
    shortSnippet: text("short_snippet"),
    longDescription: text("long_description"),
    aiMatchScore: real("ai_match_score").notNull(),
    tier: text("tier", { enum: ["t1", "t2", "t3"] }).notNull(),
    fromProfileHash: varchar("from_profile_hash", { length: 8 }).notNull(),
    toProfileHash: varchar("to_profile_hash", { length: 8 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    pairUniq: uniqueIndex("ca_pair_uniq").on(table.fromUserId, table.toUserId),
    toUserIdx: index("ca_to_user_idx").on(table.toUserId),
  }),
);

// Profiling sessions (AI-driven Q&A profiling)
export const profilingSessions = pgTable(
  "profiling_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    basedOnSessionId: uuid("based_on_session_id"),
    generatedBio: text("generated_bio"),
    generatedLookingFor: text("generated_looking_for"),
    generatedPortrait: text("generated_portrait"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => ({
    userStatusIdx: index("ps_user_status_idx").on(table.userId, table.status),
  }),
);

// Profiling Q&A (individual questions/answers within a session)
export const profilingQA = pgTable(
  "profiling_qa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => profilingSessions.id, { onDelete: "cascade" }),
    questionNumber: integer("question_number").notNull(),
    question: text("question").notNull(),
    answer: text("answer"),
    sufficient: boolean("sufficient").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionIdIdx: index("pqa_session_id_idx").on(table.sessionId),
  }),
);

// --- Metrics (separate Postgres schema) ---

const metricsSchema = pgSchema("metrics");

export const requestEvents = metricsSchema.table(
  "request_events",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    requestId: text("request_id").notNull(),
    method: text("method").notNull(),
    endpoint: text("endpoint").notNull(),
    userId: text("user_id"),
    durationMs: integer("duration_ms").notNull(),
    statusCode: smallint("status_code").notNull(),
    appVersion: text("app_version"),
    platform: text("platform"),
    authProvider: text("auth_provider"),
    sessionId: text("session_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    errorMessage: text("error_message"),
    targetUserId: text("target_user_id"),
    targetGroupId: text("target_group_id"),
    dbQueryCount: integer("db_query_count"),
    dbDurationMs: integer("db_duration_ms"),
  },
  (table) => [
    index("idx_re_timestamp").on(table.timestamp),
    index("idx_re_endpoint_ts").on(table.endpoint, table.timestamp),
    index("idx_re_user_ts").on(table.userId, table.timestamp),
    index("idx_re_target_user_ts").on(table.targetUserId, table.timestamp),
    index("idx_re_target_group").on(table.targetGroupId),
  ],
);

export const sloTargets = metricsSchema.table("slo_targets", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint"),
  metricType: text("metric_type").notNull(),
  thresholdMs: integer("threshold_ms"),
  thresholdPct: numeric("threshold_pct"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const aiCalls = metricsSchema.table(
  "ai_calls",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
    queueName: text("queue_name").notNull(),
    jobName: text("job_name").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull(),
    completionTokens: integer("completion_tokens").notNull(),
    totalTokens: integer("total_tokens").notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 12, scale: 6 }).notNull(),
    userId: text("user_id"),
    targetUserId: text("target_user_id"),
    serviceTier: text("service_tier").notNull().default("standard"),
    reasoningEffort: text("reasoning_effort"),
    durationMs: integer("duration_ms").notNull(),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    // Full prompt + completion for debug. Nullified by `prune-ai-payloads` after 24h
    // (metadata columns above stay 7d — see ai-cost-tracking.md).
    inputJsonb: jsonb("input_jsonb").$type<Record<string, unknown>>(),
    outputJsonb: jsonb("output_jsonb").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_ai_calls_timestamp").on(table.timestamp),
    index("idx_ai_calls_job_ts").on(table.jobName, table.timestamp),
    index("idx_ai_calls_user_ts").on(table.userId, table.timestamp),
    index("idx_ai_calls_model_ts").on(table.model, table.timestamp),
    index("idx_ai_calls_tier_ts").on(table.serviceTier, table.timestamp),
  ],
);

export type NewRequestEvent = typeof requestEvents.$inferInsert;
export type NewAiCall = typeof aiCalls.$inferInsert;

// Feature gates (simplified ABAC)
export const featureGates = pgTable("feature_gates", {
  feature: text("feature").primaryKey(),
  requires: text("requires").array().notNull(),
  enabled: boolean("enabled").default(true).notNull(),
});

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
  sentWaves: many(waves, { relationName: "sentWaves" }),
  receivedWaves: many(waves, { relationName: "receivedWaves" }),
  conversations: many(conversationParticipants),
  messages: many(messages),
  blockedUsers: many(blocks, { relationName: "blocker" }),
  blockedBy: many(blocks, { relationName: "blocked" }),
  pushTokens: many(pushTokens),
}));

export const wavesRelations = relations(waves, ({ one }) => ({
  fromUser: one(user, {
    fields: [waves.fromUserId],
    references: [user.id],
    relationName: "sentWaves",
  }),
  toUser: one(user, {
    fields: [waves.toUserId],
    references: [user.id],
    relationName: "receivedWaves",
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  creator: one(user, {
    fields: [conversations.creatorId],
    references: [user.id],
  }),
  participants: many(conversationParticipants),
  messages: many(messages),
  topics: many(topics),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(user, {
    fields: [conversationParticipants.userId],
    references: [user.id],
  }),
}));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [topics.conversationId],
    references: [conversations.id],
  }),
  creator: one(user, {
    fields: [topics.creatorId],
    references: [user.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(user, {
    fields: [messages.senderId],
    references: [user.id],
  }),
  topic: one(topics, {
    fields: [messages.topicId],
    references: [topics.id],
  }),
  replyTo: one(messages, {
    fields: [messages.replyToId],
    references: [messages.id],
    relationName: "replies",
  }),
  replies: many(messages, { relationName: "replies" }),
  reactions: many(messageReactions),
}));

export const messageReactionsRelations = relations(messageReactions, ({ one }) => ({
  message: one(messages, {
    fields: [messageReactions.messageId],
    references: [messages.id],
  }),
  user: one(user, {
    fields: [messageReactions.userId],
    references: [user.id],
  }),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  blocker: one(user, {
    fields: [blocks.blockerId],
    references: [user.id],
    relationName: "blocker",
  }),
  blocked: one(user, {
    fields: [blocks.blockedId],
    references: [user.id],
    relationName: "blocked",
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

export const statusMatchesRelations = relations(statusMatches, ({ one }) => ({
  user: one(user, {
    fields: [statusMatches.userId],
    references: [user.id],
    relationName: "statusMatchesFrom",
  }),
  matchedUser: one(user, {
    fields: [statusMatches.matchedUserId],
    references: [user.id],
    relationName: "statusMatchesTo",
  }),
}));

export const profilingSessionsRelations = relations(profilingSessions, ({ one, many }) => ({
  user: one(user, {
    fields: [profilingSessions.userId],
    references: [user.id],
  }),
  basedOnSession: one(profilingSessions, {
    fields: [profilingSessions.basedOnSessionId],
    references: [profilingSessions.id],
    relationName: "basedOn",
  }),
  questions: many(profilingQA),
}));

export const profilingQARelations = relations(profilingQA, ({ one }) => ({
  session: one(profilingSessions, {
    fields: [profilingQA.sessionId],
    references: [profilingSessions.id],
  }),
}));

// AI moderation audit trail. Written by `POST /uploads` whenever OpenAI returns
// flagged=true. Three statuses:
// - `blocked_csam`: sync hard block (sexual/minors category). Bytes never
//   reached S3, so `uploadKey` is null. User saw a 400.
// - `flagged_review`: upload went through (bytes live at `uploadKey`), but
//   OpenAI flagged something sub-CSAM (nudity, violence, harassment).
//   Waiting for admin verdict via BLI-269 UI.
// - `reviewed_ok` / `reviewed_removed`: admin has verdicted, `reviewedBy`/
//   `reviewedAt`/`reviewDecision` are filled.
// Clean uploads produce no row — the table is admin-review + legal audit only.
// `userId` is nullable + `ON DELETE SET NULL` as a defensive cascade for
// future hard-delete paths; account anonymization (today's flow) keeps the FK
// pointing at the "Usunięty użytkownik" row, same pattern as `blocks`.
export const moderationResults = pgTable(
  "moderation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    uploadKey: text("upload_key"),
    mimeType: text("mime_type").notNull(),
    status: text("status").notNull(),
    flaggedCategories: text("flagged_categories").array().notNull(),
    categoryScores: jsonb("category_scores").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by"),
    reviewDecision: text("review_decision"),
    reviewNotes: text("review_notes"),
  },
  (table) => ({
    statusCreatedIdx: index("moderation_results_status_created_idx").on(table.status, table.createdAt),
    userIdx: index("moderation_results_user_idx").on(table.userId),
  }),
);

export const moderationResultsRelations = relations(moderationResults, ({ one }) => ({
  user: one(user, {
    fields: [moderationResults.userId],
    references: [user.id],
  }),
}));
