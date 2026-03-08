import { deleteMessageSchema, reactToMessageSchema, searchMessagesSchema, sendMessageSchema } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { RedisClient } from "bun";
import { and, desc, eq, gt, ilike, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { sendPushToUser } from "@/services/push";
import { rateLimit } from "@/trpc/middleware/rateLimit";
import { protectedProcedure, router } from "@/trpc/trpc";
import { ee } from "@/ws/events";
import { ensureTypingListener } from "@/ws/handler";

const idempotencyRedis = new RedisClient(process.env.REDIS_URL!);

export const messagesRouter = router({
  // Get all conversations for current user
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    // Get conversations where user is participant
    const userConversations = await db
      .select({
        conversationId: schema.conversationParticipants.conversationId,
        lastReadAt: schema.conversationParticipants.lastReadAt,
      })
      .from(schema.conversationParticipants)
      .where(eq(schema.conversationParticipants.userId, ctx.userId));

    const conversationIds = userConversations.map((c) => c.conversationId);

    if (conversationIds.length === 0) {
      return [];
    }

    const lastReadMap = new Map(userConversations.map((c) => [c.conversationId, c.lastReadAt]));

    // For each conversation, get the other participant and last message
    const result = await Promise.all(
      conversationIds.map(async (conversationId) => {
        // Get conversation
        const [conversation] = await db
          .select()
          .from(schema.conversations)
          .where(eq(schema.conversations.id, conversationId));

        const isGroup = conversation.type === "group";

        // For DMs: get other participant. For groups: get member count.
        let participant = null;
        let memberCount = null;

        if (isGroup) {
          const [countResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.conversationParticipants)
            .where(eq(schema.conversationParticipants.conversationId, conversationId));
          memberCount = Number(countResult.count);
        } else {
          const [otherParticipant] = await db
            .select({ profile: schema.profiles })
            .from(schema.conversationParticipants)
            .innerJoin(schema.profiles, eq(schema.conversationParticipants.userId, schema.profiles.userId))
            .where(
              and(
                eq(schema.conversationParticipants.conversationId, conversationId),
                ne(schema.conversationParticipants.userId, ctx.userId),
                notInArray(
                  schema.conversationParticipants.userId,
                  db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
                ),
              ),
            );
          participant = otherParticipant?.profile || null;
        }

        // Get last message (skip deleted)
        const [lastMessage] = await db
          .select()
          .from(schema.messages)
          .where(and(eq(schema.messages.conversationId, conversationId), isNull(schema.messages.deletedAt)))
          .orderBy(desc(schema.messages.createdAt))
          .limit(1);

        // Get sender name for last message (for groups)
        let lastMessageSenderName: string | null = null;
        if (isGroup && lastMessage) {
          const [senderProfile] = await db
            .select({ displayName: schema.profiles.displayName })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, lastMessage.senderId));
          lastMessageSenderName = senderProfile?.displayName ?? null;
        }

        // Count unread messages
        let unreadCount = 0;
        if (isGroup) {
          // Groups: count messages after lastReadAt
          const lastReadAt = lastReadMap.get(conversationId);
          if (lastReadAt) {
            const [unreadResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(schema.messages)
              .where(
                and(
                  eq(schema.messages.conversationId, conversationId),
                  ne(schema.messages.senderId, ctx.userId),
                  isNull(schema.messages.deletedAt),
                  gt(schema.messages.createdAt, lastReadAt),
                ),
              );
            unreadCount = Number(unreadResult?.count || 0);
          } else {
            // Never read — count all messages from others
            const [unreadResult] = await db
              .select({ count: sql<number>`count(*)` })
              .from(schema.messages)
              .where(
                and(
                  eq(schema.messages.conversationId, conversationId),
                  ne(schema.messages.senderId, ctx.userId),
                  isNull(schema.messages.deletedAt),
                ),
              );
            unreadCount = Number(unreadResult?.count || 0);
          }
        } else {
          // DMs: use per-message readAt
          const [unreadResult] = await db
            .select({ count: sql<number>`count(*)` })
            .from(schema.messages)
            .where(
              and(
                eq(schema.messages.conversationId, conversationId),
                ne(schema.messages.senderId, ctx.userId),
                isNull(schema.messages.readAt),
                isNull(schema.messages.deletedAt),
              ),
            );
          unreadCount = Number(unreadResult?.count || 0);
        }

        return {
          conversation,
          participant,
          lastMessage: lastMessage || null,
          lastMessageSenderName,
          memberCount,
          unreadCount,
        };
      }),
    );

    // Sort by last message date — keep groups even without participant
    return result
      .filter((r) => r.conversation.type === "group" || r.participant !== null)
      .sort((a, b) => {
        const dateA = a.lastMessage?.createdAt || a.conversation.createdAt;
        const dateB = b.lastMessage?.createdAt || b.conversation.createdAt;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
  }),

  // Get messages for a conversation
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        topicId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Verify user is participant
      const [participant] = await db
        .select()
        .from(schema.conversationParticipants)
        .where(
          and(
            eq(schema.conversationParticipants.conversationId, input.conversationId),
            eq(schema.conversationParticipants.userId, ctx.userId),
          ),
        );

      if (!participant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Check if group conversation for sender enrichment
      const [conversation] = await db
        .select({ type: schema.conversations.type })
        .from(schema.conversations)
        .where(eq(schema.conversations.id, input.conversationId));

      const isGroup = conversation?.type === "group";

      // Ensure typing listener is set up for this conversation
      ensureTypingListener(input.conversationId);

      // Build WHERE conditions
      const whereConditions = [eq(schema.messages.conversationId, input.conversationId)];
      if (input.topicId) {
        whereConditions.push(eq(schema.messages.topicId, input.topicId));
      }

      let query = db
        .select()
        .from(schema.messages)
        .where(and(...whereConditions))
        .orderBy(desc(schema.messages.createdAt))
        .limit(input.limit + 1);

      if (input.cursor) {
        const [cursorMessage] = await db.select().from(schema.messages).where(eq(schema.messages.id, input.cursor));

        if (cursorMessage) {
          query = db
            .select()
            .from(schema.messages)
            .where(and(...whereConditions, lt(schema.messages.createdAt, cursorMessage.createdAt)))
            .orderBy(desc(schema.messages.createdAt))
            .limit(input.limit + 1);
        }
      }

      const result = await query;

      let nextCursor: string | undefined;
      if (result.length > input.limit) {
        const nextItem = result.pop();
        nextCursor = nextItem?.id;
      }

      // For groups, batch-fetch sender profiles
      const senderProfileMap = new Map<string, { displayName: string; avatarUrl: string | null }>();
      if (isGroup) {
        const senderIds = [...new Set(result.map((m) => m.senderId))];
        if (senderIds.length > 0) {
          const senderProfiles = await db
            .select({
              userId: schema.profiles.userId,
              displayName: schema.profiles.displayName,
              avatarUrl: schema.profiles.avatarUrl,
            })
            .from(schema.profiles)
            .where(inArray(schema.profiles.userId, senderIds));
          for (const sp of senderProfiles) {
            senderProfileMap.set(sp.userId, {
              displayName: sp.displayName,
              avatarUrl: sp.avatarUrl,
            });
          }
        }
      }

      // Batch-fetch all reactions for these messages
      const messageIds = result.map((m) => m.id);
      const allReactions =
        messageIds.length > 0
          ? await db
              .select()
              .from(schema.messageReactions)
              .where(inArray(schema.messageReactions.messageId, messageIds))
          : [];

      // Group reactions by messageId
      const reactionsMap = new Map<string, typeof allReactions>();
      for (const r of allReactions) {
        const arr = reactionsMap.get(r.messageId);
        if (arr) arr.push(r);
        else reactionsMap.set(r.messageId, [r]);
      }

      // Batch-fetch reply-to messages
      const replyToIds = result.map((m) => m.replyToId).filter((id): id is string => id !== null);
      const replyToMessages =
        replyToIds.length > 0
          ? await db
              .select({
                id: schema.messages.id,
                content: schema.messages.content,
                senderId: schema.messages.senderId,
              })
              .from(schema.messages)
              .where(inArray(schema.messages.id, replyToIds))
          : [];

      // Fetch any reply sender profiles not already in senderProfileMap
      const replySenderIds = replyToMessages.map((m) => m.senderId).filter((id) => !senderProfileMap.has(id));
      if (replySenderIds.length > 0) {
        const replyProfiles = await db
          .select({
            userId: schema.profiles.userId,
            displayName: schema.profiles.displayName,
            avatarUrl: schema.profiles.avatarUrl,
          })
          .from(schema.profiles)
          .where(inArray(schema.profiles.userId, replySenderIds));
        for (const sp of replyProfiles) {
          senderProfileMap.set(sp.userId, {
            displayName: sp.displayName,
            avatarUrl: sp.avatarUrl,
          });
        }
      }

      const replyToMap = new Map(replyToMessages.map((m) => [m.id, m]));

      // Enrich messages (no more async — all data pre-fetched)
      const enrichedMessages = result.map((msg) => {
        // Reply-to
        let replyTo = null;
        if (msg.replyToId) {
          const replyMsg = replyToMap.get(msg.replyToId);
          if (replyMsg) {
            const senderProfile = senderProfileMap.get(replyMsg.senderId);
            replyTo = {
              id: replyMsg.id,
              content: replyMsg.content,
              senderName: senderProfile?.displayName ?? "Użytkownik",
            };
          }
        }

        // Reactions — group by emoji
        const reactionsData = reactionsMap.get(msg.id) ?? [];
        const reactionGroups = new Map<string, { emoji: string; count: number; userIds: string[] }>();
        for (const r of reactionsData) {
          const existing = reactionGroups.get(r.emoji);
          if (existing) {
            existing.count++;
            existing.userIds.push(r.userId);
          } else {
            reactionGroups.set(r.emoji, { emoji: r.emoji, count: 1, userIds: [r.userId] });
          }
        }
        const reactions = Array.from(reactionGroups.values()).map((r) => ({
          emoji: r.emoji,
          count: r.count,
          myReaction: r.userIds.includes(ctx.userId),
        }));

        // Sender info for groups
        const senderInfo = isGroup ? (senderProfileMap.get(msg.senderId) ?? null) : null;

        return {
          ...msg,
          replyTo,
          reactions,
          senderName: senderInfo?.displayName ?? null,
          senderAvatarUrl: senderInfo?.avatarUrl ?? null,
        };
      });

      return {
        messages: enrichedMessages,
        nextCursor,
      };
    }),

  // Send a message
  send: protectedProcedure
    .use(rateLimit("messages.send", ({ input }) => input.conversationId))
    .use(rateLimit("messages.sendGlobal"))
    .input(sendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user is participant
      const [participant] = await db
        .select()
        .from(schema.conversationParticipants)
        .where(
          and(
            eq(schema.conversationParticipants.conversationId, input.conversationId),
            eq(schema.conversationParticipants.userId, ctx.userId),
          ),
        );

      if (!participant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Idempotency check — prevent duplicate messages on retry
      if (input.idempotencyKey) {
        const idemKey = `idem:msg:${ctx.userId}:${input.idempotencyKey}`;
        try {
          const existing = await idempotencyRedis.get(idemKey);
          if (existing) {
            return JSON.parse(existing);
          }
        } catch {
          // Redis failure — proceed without idempotency (fail open)
        }
      }

      const [message] = await db
        .insert(schema.messages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.userId,
          content: input.content,
          type: input.type ?? "text",
          metadata: input.metadata ?? null,
          replyToId: input.replyToId ?? null,
          topicId: input.topicId ?? null,
        })
        .returning();

      // Cache for idempotency (5 min TTL)
      if (input.idempotencyKey) {
        const idemKey = `idem:msg:${ctx.userId}:${input.idempotencyKey}`;
        try {
          await idempotencyRedis.send("SET", [idemKey, JSON.stringify(message), "EX", "300"]);
        } catch {
          // Redis failure — non-critical, just skip caching
        }
      }

      // Update conversation updatedAt
      await db
        .update(schema.conversations)
        .set({ updatedAt: new Date() })
        .where(eq(schema.conversations.id, input.conversationId));

      // If message belongs to a topic, update topic stats
      if (input.topicId) {
        await db
          .update(schema.topics)
          .set({
            lastMessageAt: new Date(),
            messageCount: sql`${schema.topics.messageCount} + 1`,
          })
          .where(eq(schema.topics.id, input.topicId));
      }

      // Get sender profile for WS event enrichment
      const [senderProfile] = await db
        .select({
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
        })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, ctx.userId));

      // Push notifications to other participants
      const participants = await db
        .select({ userId: schema.conversationParticipants.userId })
        .from(schema.conversationParticipants)
        .where(eq(schema.conversationParticipants.conversationId, input.conversationId));

      const messagePreview = message.content.length > 100 ? `${message.content.slice(0, 97)}...` : message.content;

      for (const p of participants) {
        if (p.userId === ctx.userId) continue;
        void sendPushToUser(p.userId, {
          title: senderProfile?.displayName ?? "Ktoś",
          body: messagePreview,
          data: { type: "chat", conversationId: input.conversationId },
        });
      }

      // Emit real-time event
      ee.emit("newMessage", {
        conversationId: input.conversationId,
        message,
        senderName: senderProfile?.displayName ?? null,
        senderAvatarUrl: senderProfile?.avatarUrl ?? null,
      });

      return message;
    }),

  // Mark messages as read
  markAsRead: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check if this is a group conversation
      const [conv] = await db
        .select({ type: schema.conversations.type })
        .from(schema.conversations)
        .where(eq(schema.conversations.id, input.conversationId));

      if (conv?.type === "group") {
        // Groups: update lastReadAt on participant row
        await db
          .update(schema.conversationParticipants)
          .set({ lastReadAt: new Date() })
          .where(
            and(
              eq(schema.conversationParticipants.conversationId, input.conversationId),
              eq(schema.conversationParticipants.userId, ctx.userId),
            ),
          );
      } else {
        // DMs: mark individual messages as read
        await db
          .update(schema.messages)
          .set({ readAt: new Date() })
          .where(
            and(
              eq(schema.messages.conversationId, input.conversationId),
              ne(schema.messages.senderId, ctx.userId),
              isNull(schema.messages.readAt),
            ),
          );
      }

      return { success: true };
    }),

  // Delete a message (soft delete)
  deleteMessage: protectedProcedure.input(deleteMessageSchema).mutation(async ({ ctx, input }) => {
    const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.id, input.messageId));

    if (!msg) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Message not found",
      });
    }

    // Check if user can delete: own message OR group admin
    if (msg.senderId !== ctx.userId) {
      // Check if this is a group and user is admin/owner
      const [conv] = await db
        .select({ type: schema.conversations.type })
        .from(schema.conversations)
        .where(eq(schema.conversations.id, msg.conversationId));

      if (conv?.type === "group") {
        const [participant] = await db
          .select({ role: schema.conversationParticipants.role })
          .from(schema.conversationParticipants)
          .where(
            and(
              eq(schema.conversationParticipants.conversationId, msg.conversationId),
              eq(schema.conversationParticipants.userId, ctx.userId),
            ),
          );

        if (!participant || (participant.role !== "admin" && participant.role !== "owner")) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only delete your own messages",
          });
        }
      } else {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own messages",
        });
      }
    }

    await db.update(schema.messages).set({ deletedAt: new Date() }).where(eq(schema.messages.id, input.messageId));

    return { success: true };
  }),

  // React to a message (toggle)
  react: protectedProcedure.input(reactToMessageSchema).mutation(async ({ ctx, input }) => {
    // Verify message exists
    const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.id, input.messageId));

    if (!msg) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Message not found",
      });
    }

    // Verify user is participant in this conversation
    const [participant] = await db
      .select()
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, msg.conversationId),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      );

    if (!participant) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
      });
    }

    // Check if reaction already exists (toggle)
    const [existing] = await db
      .select()
      .from(schema.messageReactions)
      .where(
        and(
          eq(schema.messageReactions.messageId, input.messageId),
          eq(schema.messageReactions.userId, ctx.userId),
          eq(schema.messageReactions.emoji, input.emoji),
        ),
      );

    if (existing) {
      // Remove reaction
      await db.delete(schema.messageReactions).where(eq(schema.messageReactions.id, existing.id));

      ee.emit("reaction", {
        conversationId: msg.conversationId,
        messageId: input.messageId,
        emoji: input.emoji,
        userId: ctx.userId,
        action: "removed" as const,
      });

      return { action: "removed" as const };
    } else {
      // Add reaction
      await db.insert(schema.messageReactions).values({
        messageId: input.messageId,
        userId: ctx.userId,
        emoji: input.emoji,
      });

      ee.emit("reaction", {
        conversationId: msg.conversationId,
        messageId: input.messageId,
        emoji: input.emoji,
        userId: ctx.userId,
        action: "added" as const,
      });

      return { action: "added" as const };
    }
  }),

  // Set typing indicator
  setTyping: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().min(1),
        isTyping: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ensureTypingListener(input.conversationId);
      ee.emit(`typing:${input.conversationId}`, {
        conversationId: input.conversationId,
        userId: ctx.userId,
        isTyping: input.isTyping,
      });
      return { success: true };
    }),

  // Search messages in a conversation
  search: protectedProcedure.input(searchMessagesSchema).query(async ({ ctx, input }) => {
    // Verify user is participant
    const [participant] = await db
      .select()
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      );

    if (!participant) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
      });
    }

    const results = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, input.conversationId),
          isNull(schema.messages.deletedAt),
          ilike(schema.messages.content, `%${input.query}%`),
        ),
      )
      .orderBy(desc(schema.messages.createdAt))
      .limit(input.limit);

    return results;
  }),
});
