import { deleteMessageSchema, reactToMessageSchema, searchMessagesSchema, sendMessageSchema } from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { RedisClient } from "bun";
import { and, desc, eq, ilike, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { setTargetGroupId, setTargetUserId } from "@/services/metrics";
import { moderateContent } from "@/services/moderation";
import { sendPushToUser } from "@/services/push";
import { rateLimit } from "@/trpc/middleware/rateLimit";
import { protectedProcedure, router } from "@/trpc/trpc";
import { ensureTypingListener } from "@/ws/handler";
import { publishEvent } from "@/ws/redis-bridge";

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

    // Batch-fetch all data in parallel
    const [conversations, allParticipants, lastMessages, unreadCounts] = await Promise.all([
      // 1. All conversations (exclude soft-deleted)
      db
        .select()
        .from(schema.conversations)
        .where(and(inArray(schema.conversations.id, conversationIds), isNull(schema.conversations.deletedAt))),

      // 2. All participants (for DM other-user + group member count)
      db
        .select({
          conversationId: schema.conversationParticipants.conversationId,
          userId: schema.conversationParticipants.userId,
        })
        .from(schema.conversationParticipants)
        .where(inArray(schema.conversationParticipants.conversationId, conversationIds)),

      // 3. Last message per conversation
      // Raw SQL: DISTINCT ON is PostgreSQL-specific, no Drizzle equivalent (BLI-87)
      db.execute(sql`
        SELECT DISTINCT ON (conversation_id) *
        FROM messages
        WHERE conversation_id IN (${sql.join(
          conversationIds.map((id) => sql`${id}`),
          sql`, `,
        )})
          AND deleted_at IS NULL
        ORDER BY conversation_id, created_at DESC
      `),

      // 4. Unread counts per conversation
      db
        .select({
          conversationId: schema.messages.conversationId,
          count: sql<number>`count(*)`,
        })
        .from(schema.messages)
        .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
        .innerJoin(
          schema.conversationParticipants,
          and(
            eq(schema.conversationParticipants.conversationId, schema.messages.conversationId),
            eq(schema.conversationParticipants.userId, ctx.userId),
          ),
        )
        .where(
          and(
            inArray(schema.messages.conversationId, conversationIds),
            ne(schema.messages.senderId, ctx.userId),
            isNull(schema.messages.deletedAt),
            // CASE WHEN: groups use lastReadAt cursor, DMs use per-message readAt
            sql`CASE WHEN ${schema.conversations.type} = 'group' THEN ${schema.messages.createdAt} > COALESCE(${schema.conversationParticipants.lastReadAt}, '1970-01-01'::timestamp) ELSE ${schema.messages.readAt} IS NULL END`,
          ),
        )
        .groupBy(schema.messages.conversationId),
    ]);

    // Build lookup maps
    const convMap = new Map(conversations.map((c) => [c.id, c]));

    // Participants grouped by conversation
    const participantsByConv = new Map<string, string[]>();
    for (const p of allParticipants) {
      const arr = participantsByConv.get(p.conversationId);
      if (arr) arr.push(p.userId);
      else participantsByConv.set(p.conversationId, [p.userId]);
    }

    // Last messages map
    const lastMsgMap = new Map<string, (typeof lastMessages)[0]>();
    for (const row of lastMessages) {
      lastMsgMap.set(row.conversation_id as string, row);
    }

    // Unread counts map
    const unreadMap = new Map<string, number>();
    for (const row of unreadCounts) {
      unreadMap.set(row.conversationId, Number(row.count));
    }

    // For DMs: batch-fetch other participant profiles (filter soft-deleted)
    const dmOtherUserIds: string[] = [];
    for (const [convId, members] of participantsByConv) {
      const conv = convMap.get(convId);
      if (conv?.type !== "group") {
        const otherId = members.find((id) => id !== ctx.userId);
        if (otherId) dmOtherUserIds.push(otherId);
      }
    }

    const dmProfiles =
      dmOtherUserIds.length > 0
        ? await db
            .select({ profile: schema.profiles })
            .from(schema.profiles)
            .innerJoin(schema.user, eq(schema.profiles.userId, schema.user.id))
            .where(and(inArray(schema.profiles.userId, dmOtherUserIds), isNull(schema.user.deletedAt)))
        : [];

    const profileMap = new Map(dmProfiles.map((p) => [p.profile.userId, p.profile]));

    // For groups: batch-fetch sender names for last messages
    const groupLastMsgSenderIds: string[] = [];
    for (const [convId, row] of lastMsgMap) {
      const conv = convMap.get(convId);
      if (conv?.type === "group" && row.sender_id) {
        groupLastMsgSenderIds.push(row.sender_id as string);
      }
    }

    const senderProfiles =
      groupLastMsgSenderIds.length > 0
        ? await db
            .select({ userId: schema.profiles.userId, displayName: schema.profiles.displayName })
            .from(schema.profiles)
            .where(inArray(schema.profiles.userId, groupLastMsgSenderIds))
        : [];

    const senderNameMap = new Map(senderProfiles.map((p) => [p.userId, p.displayName]));

    // Assemble results
    const result = conversationIds
      .map((convId) => {
        const conversation = convMap.get(convId);
        if (!conversation) return null;

        const isGroup = conversation.type === "group";
        const members = participantsByConv.get(convId) ?? [];

        // DM: other participant profile. Group: member count.
        let participant = null;
        let memberCount = null;

        if (isGroup) {
          memberCount = members.length;
        } else {
          const otherId = members.find((id) => id !== ctx.userId);
          participant = otherId ? (profileMap.get(otherId) ?? null) : null;
        }

        // Skip DMs where other participant is deleted
        if (!isGroup && !participant) return null;

        // Last message
        const lastMsgRow = lastMsgMap.get(convId);
        const lastMessage = lastMsgRow
          ? {
              id: lastMsgRow.id as string,
              conversationId: lastMsgRow.conversation_id as string,
              senderId: lastMsgRow.sender_id as string,
              content: lastMsgRow.content as string,
              type: lastMsgRow.type as string,
              metadata: lastMsgRow.metadata,
              replyToId: lastMsgRow.reply_to_id as string | null,
              topicId: lastMsgRow.topic_id as string | null,
              createdAt: new Date(lastMsgRow.created_at as string),
              readAt: lastMsgRow.read_at ? new Date(lastMsgRow.read_at as string) : null,
              deletedAt: null,
            }
          : null;

        const lastMessageSenderName =
          isGroup && lastMsgRow ? (senderNameMap.get(lastMsgRow.sender_id as string) ?? null) : null;

        const unreadCount = unreadMap.get(convId) ?? 0;

        return {
          conversation,
          participant,
          lastMessage,
          lastMessageSenderName,
          memberCount,
          unreadCount,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Sort by last message date
    result.sort((a, b) => {
      const dateA = a.lastMessage?.createdAt || a.conversation.createdAt;
      const dateB = b.lastMessage?.createdAt || b.conversation.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return result;
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
      const participant = await db.query.conversationParticipants.findFirst({
        where: and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      });

      if (!participant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Check if group conversation for sender enrichment
      const conversation = await db.query.conversations.findFirst({
        where: eq(schema.conversations.id, input.conversationId),
        columns: { type: true },
      });

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
        const cursorMessage = await db.query.messages.findFirst({
          where: eq(schema.messages.id, input.cursor),
        });

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
      const participant = await db.query.conversationParticipants.findFirst({
        where: and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      });

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

      // Content moderation (text messages only — skip images, locations, etc.)
      if (!input.type || input.type === "text") {
        await moderateContent(input.content);
      }

      const message = await db.transaction(async (tx) => {
        const [msg] = await tx
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

        // Update conversation updatedAt
        await tx
          .update(schema.conversations)
          .set({ updatedAt: new Date() })
          .where(eq(schema.conversations.id, input.conversationId));

        // If message belongs to a topic, update topic stats
        if (input.topicId) {
          await tx
            .update(schema.topics)
            .set({
              lastMessageAt: new Date(),
              messageCount: sql`${schema.topics.messageCount} + 1`,
            })
            .where(eq(schema.topics.id, input.topicId));
        }

        return msg;
      });

      // Cache for idempotency (5 min TTL)
      if (input.idempotencyKey) {
        const idemKey = `idem:msg:${ctx.userId}:${input.idempotencyKey}`;
        try {
          await idempotencyRedis.send("SET", [idemKey, JSON.stringify(message), "EX", "300"]);
        } catch {
          // Redis failure — non-critical, just skip caching
        }
      }

      // Fetch sender profile, participants, and conversation type in parallel
      const [senderProfile, participants, conversation] = await Promise.all([
        db.query.profiles.findFirst({
          where: eq(schema.profiles.userId, ctx.userId),
          columns: { displayName: true, avatarUrl: true },
        }),
        db
          .select({ userId: schema.conversationParticipants.userId })
          .from(schema.conversationParticipants)
          .where(eq(schema.conversationParticipants.conversationId, input.conversationId)),
        db.query.conversations.findFirst({
          where: eq(schema.conversations.id, input.conversationId),
          columns: { type: true, name: true },
        }),
      ]);

      const messagePreview = message.content.length > 100 ? `${message.content.slice(0, 97)}...` : message.content;

      const isGroup = conversation?.type === "group";

      if (isGroup) {
        setTargetGroupId(ctx.req, input.conversationId);
      } else {
        const recipient = participants.find((p) => p.userId !== ctx.userId);
        if (recipient) setTargetUserId(ctx.req, recipient.userId);
      }

      const otherParticipantIds = participants.filter((p) => p.userId !== ctx.userId).map((p) => p.userId);

      if (isGroup && otherParticipantIds.length > 0) {
        // Batch: single query to get per-recipient unread counts
        const unreadCounts = await db
          .select({
            userId: schema.conversationParticipants.userId,
            unreadCount: sql<number>`count(${schema.messages.id})`,
          })
          .from(schema.conversationParticipants)
          .leftJoin(
            schema.messages,
            and(
              eq(schema.messages.conversationId, schema.conversationParticipants.conversationId),
              ne(schema.messages.senderId, schema.conversationParticipants.userId),
              isNull(schema.messages.deletedAt),
              sql`${schema.messages.createdAt} > COALESCE(${schema.conversationParticipants.lastReadAt}, '1970-01-01'::timestamp)`,
            ),
          )
          .where(
            and(
              eq(schema.conversationParticipants.conversationId, input.conversationId),
              inArray(schema.conversationParticipants.userId, otherParticipantIds),
            ),
          )
          .groupBy(schema.conversationParticipants.userId);

        const unreadMap = new Map<string, number>();
        for (const row of unreadCounts) {
          unreadMap.set(row.userId, Number(row.unreadCount));
        }

        for (const recipientId of otherParticipantIds) {
          const unreadCount = unreadMap.get(recipientId) ?? 0;
          const hasUnread = unreadCount > 1; // >1 because current message already inserted

          void sendPushToUser(recipientId, {
            title: conversation?.name ?? senderProfile?.displayName ?? "Blisko",
            body: hasUnread
              ? `${unreadCount} nowych wiadomości`
              : `${senderProfile?.displayName ?? "Ktoś"}: ${messagePreview}`,
            data: { type: "chat", conversationId: input.conversationId },
            collapseId: hasUnread ? `group:${input.conversationId}` : undefined,
          });
        }
      } else {
        // DM: push every message
        for (const p of participants) {
          if (p.userId === ctx.userId) continue;
          void sendPushToUser(p.userId, {
            title: senderProfile?.displayName ?? "Ktoś",
            body: messagePreview,
            data: { type: "chat", conversationId: input.conversationId },
          });
        }
      }

      // Emit real-time event
      publishEvent("newMessage", {
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
      const conv = await db.query.conversations.findFirst({
        where: eq(schema.conversations.id, input.conversationId),
        columns: { type: true },
      });

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
    const msg = await db.query.messages.findFirst({
      where: eq(schema.messages.id, input.messageId),
    });

    if (!msg) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Message not found",
      });
    }

    // Check if user can delete: own message OR group admin
    if (msg.senderId !== ctx.userId) {
      // Check if this is a group and user is admin/owner
      const conv = await db.query.conversations.findFirst({
        where: eq(schema.conversations.id, msg.conversationId),
        columns: { type: true },
      });

      if (conv?.type === "group") {
        const participant = await db.query.conversationParticipants.findFirst({
          where: and(
            eq(schema.conversationParticipants.conversationId, msg.conversationId),
            eq(schema.conversationParticipants.userId, ctx.userId),
          ),
          columns: { role: true },
        });

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
    const msg = await db.query.messages.findFirst({
      where: eq(schema.messages.id, input.messageId),
    });

    if (!msg) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Message not found",
      });
    }

    // Verify user is participant in this conversation
    const participant = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(schema.conversationParticipants.conversationId, msg.conversationId),
        eq(schema.conversationParticipants.userId, ctx.userId),
      ),
    });

    if (!participant) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
      });
    }

    // Check if reaction already exists (toggle)
    const existing = await db.query.messageReactions.findFirst({
      where: and(
        eq(schema.messageReactions.messageId, input.messageId),
        eq(schema.messageReactions.userId, ctx.userId),
        eq(schema.messageReactions.emoji, input.emoji),
      ),
    });

    if (existing) {
      // Remove reaction
      await db.delete(schema.messageReactions).where(eq(schema.messageReactions.id, existing.id));

      publishEvent("reaction", {
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

      publishEvent("reaction", {
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
      publishEvent(`typing:${input.conversationId}`, {
        conversationId: input.conversationId,
        userId: ctx.userId,
        isTyping: input.isTyping,
      });
      return { success: true };
    }),

  // Search messages in a conversation
  search: protectedProcedure.input(searchMessagesSchema).query(async ({ ctx, input }) => {
    // Verify user is participant
    const participant = await db.query.conversationParticipants.findFirst({
      where: and(
        eq(schema.conversationParticipants.conversationId, input.conversationId),
        eq(schema.conversationParticipants.userId, ctx.userId),
      ),
    });

    if (!participant) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a participant in this conversation",
      });
    }

    const escapedQuery = input.query.replace(/[%_\\]/g, "\\$&");

    const results = await db
      .select({
        id: schema.messages.id,
        conversationId: schema.messages.conversationId,
        senderId: schema.messages.senderId,
        content: schema.messages.content,
        createdAt: schema.messages.createdAt,
      })
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, input.conversationId),
          isNull(schema.messages.deletedAt),
          ilike(schema.messages.content, `%${escapedQuery}%`),
        ),
      )
      .orderBy(desc(schema.messages.createdAt))
      .limit(input.limit);

    return results;
  }),

  // Delete conversation (bilateral — both sides lose access)
  deleteConversation: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid(), rating: z.number().int().min(1).max(5).optional() }))
    .mutation(async ({ ctx, input }) => {
      // Verify user is participant
      const participant = await db.query.conversationParticipants.findFirst({
        where: and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      });
      if (!participant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // Only DMs can be deleted — group chats require leave, not delete
      const conversation = await db.query.conversations.findFirst({
        where: eq(schema.conversations.id, input.conversationId),
        columns: { type: true },
      });
      if (conversation?.type === "group") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Group conversations cannot be deleted" });
      }

      // Save optional rating
      if (input.rating) {
        await db.insert(schema.conversationRatings).values({
          conversationId: input.conversationId,
          userId: ctx.userId,
          rating: input.rating,
        });
      }

      // Soft-delete conversation
      await db
        .update(schema.conversations)
        .set({ deletedAt: new Date() })
        .where(eq(schema.conversations.id, input.conversationId));

      // Notify other participants via WS
      const allParticipants = await db
        .select({ userId: schema.conversationParticipants.userId })
        .from(schema.conversationParticipants)
        .where(
          and(
            eq(schema.conversationParticipants.conversationId, input.conversationId),
            ne(schema.conversationParticipants.userId, ctx.userId),
          ),
        );

      for (const p of allParticipants) {
        publishEvent("conversationDeleted", { userId: p.userId, conversationId: input.conversationId });
      }

      return { ok: true };
    }),
});
