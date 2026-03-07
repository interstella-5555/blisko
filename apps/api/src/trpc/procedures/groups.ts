import { z } from "zod";
import { eq, and, sql, ne, isNotNull, notInArray, lte } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { db, schema } from "../../db";
import {
  createGroupSchema,
  updateGroupSchema,
  joinGroupSchema,
  groupMemberActionSchema,
  setGroupRoleSchema,
  getDiscoverableGroupsSchema,
} from "@repo/shared";
import { TRPCError } from "@trpc/server";
import { ee } from "../../ws/events";
import { sendPushToUser } from "../../services/push";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function requireGroupParticipant(conversationId: string, userId: string, minRole?: "admin" | "owner") {
  const [participant] = await db
    .select()
    .from(schema.conversationParticipants)
    .where(
      and(
        eq(schema.conversationParticipants.conversationId, conversationId),
        eq(schema.conversationParticipants.userId, userId),
      ),
    );

  if (!participant) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this group",
    });
  }

  if (minRole === "owner" && participant.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the group owner can perform this action",
    });
  }

  if (minRole === "admin" && participant.role !== "admin" && participant.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admins can perform this action",
    });
  }

  return participant;
}

async function requireGroup(conversationId: string) {
  const [conv] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, conversationId), eq(schema.conversations.type, "group")));

  if (!conv) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Group not found",
    });
  }

  return conv;
}

export const groupsRouter = router({
  create: protectedProcedure.input(createGroupSchema).mutation(async ({ ctx, input }) => {
    const inviteCode = generateInviteCode();

    const [conversation] = await db
      .insert(schema.conversations)
      .values({
        type: "group",
        name: input.name,
        description: input.description ?? null,
        inviteCode,
        creatorId: ctx.userId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isDiscoverable: input.isDiscoverable,
      })
      .returning();

    // Add creator as owner
    await db.insert(schema.conversationParticipants).values({
      conversationId: conversation.id,
      userId: ctx.userId,
      role: "owner",
    });

    // Add initial members
    if (input.memberUserIds.length > 0) {
      await db.insert(schema.conversationParticipants).values(
        input.memberUserIds.map((userId) => ({
          conversationId: conversation.id,
          userId,
          role: "member" as const,
        })),
      );

      // Notify invited members
      for (const userId of input.memberUserIds) {
        ee.emit("groupInvited", {
          userId,
          conversationId: conversation.id,
          groupName: input.name,
        });

        void sendPushToUser(userId, {
          title: input.name ?? "Grupa",
          body: "Nowe zaproszenie do grupy",
          data: { type: "group", conversationId: conversation.id },
        });
      }
    }

    // Create default topic
    await db.insert(schema.topics).values({
      conversationId: conversation.id,
      name: "Ogólny",
      emoji: "💬",
      creatorId: ctx.userId,
      isPinned: true,
      sortOrder: 0,
    });

    return conversation;
  }),

  update: protectedProcedure.input(updateGroupSchema).mutation(async ({ ctx, input }) => {
    await requireGroup(input.conversationId);
    await requireGroupParticipant(input.conversationId, ctx.userId, "admin");

    const { conversationId, ...updates } = input;
    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name !== undefined) setValues.name = updates.name;
    if (updates.description !== undefined) setValues.description = updates.description;
    if (updates.avatarUrl !== undefined) setValues.avatarUrl = updates.avatarUrl;
    if (updates.isDiscoverable !== undefined) setValues.isDiscoverable = updates.isDiscoverable;
    if (updates.latitude !== undefined) setValues.latitude = updates.latitude;
    if (updates.longitude !== undefined) setValues.longitude = updates.longitude;
    if (updates.discoveryRadiusMeters !== undefined) setValues.discoveryRadiusMeters = updates.discoveryRadiusMeters;

    const [updated] = await db
      .update(schema.conversations)
      .set(setValues)
      .where(eq(schema.conversations.id, conversationId))
      .returning();

    ee.emit("groupUpdated", {
      conversationId,
      updates: {
        name: updates.name,
        description: updates.description,
        avatarUrl: updates.avatarUrl,
      },
    });

    return updated;
  }),

  join: protectedProcedure.input(joinGroupSchema).mutation(async ({ ctx, input }) => {
    const [conv] = await db
      .select()
      .from(schema.conversations)
      .where(and(eq(schema.conversations.inviteCode, input.inviteCode), eq(schema.conversations.type, "group")));

    if (!conv) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invalid invite code",
      });
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, conv.id),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      );

    if (existing) {
      return conv;
    }

    // Check member limit
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.conversationParticipants)
      .where(eq(schema.conversationParticipants.conversationId, conv.id));

    if (Number(countResult.count) >= (conv.maxMembers ?? 200)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Group is full",
      });
    }

    await db.insert(schema.conversationParticipants).values({
      conversationId: conv.id,
      userId: ctx.userId,
      role: "member",
    });

    const [profile] = await db
      .select({ displayName: schema.profiles.displayName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, ctx.userId));

    ee.emit("groupMember", {
      conversationId: conv.id,
      userId: ctx.userId,
      action: "joined",
      displayName: profile?.displayName,
    });

    return conv;
  }),

  joinDiscoverable: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const conv = await requireGroup(input.conversationId);

      if (!conv.isDiscoverable) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This group is not discoverable",
        });
      }

      // Check if already a member
      const [existing] = await db
        .select()
        .from(schema.conversationParticipants)
        .where(
          and(
            eq(schema.conversationParticipants.conversationId, conv.id),
            eq(schema.conversationParticipants.userId, ctx.userId),
          ),
        );

      if (existing) {
        return conv;
      }

      // Check member limit
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.conversationParticipants)
        .where(eq(schema.conversationParticipants.conversationId, conv.id));

      if (Number(countResult.count) >= (conv.maxMembers ?? 200)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Group is full",
        });
      }

      await db.insert(schema.conversationParticipants).values({
        conversationId: conv.id,
        userId: ctx.userId,
        role: "member",
      });

      const [profile] = await db
        .select({ displayName: schema.profiles.displayName })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, ctx.userId));

      ee.emit("groupMember", {
        conversationId: conv.id,
        userId: ctx.userId,
        action: "joined",
        displayName: profile?.displayName,
      });

      return conv;
    }),

  leave: protectedProcedure.input(z.object({ conversationId: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const participant = await requireGroupParticipant(input.conversationId, ctx.userId);

    if (participant.role === "owner") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Owner cannot leave. Transfer ownership first.",
      });
    }

    await db
      .delete(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      );

    ee.emit("groupMember", {
      conversationId: input.conversationId,
      userId: ctx.userId,
      action: "left",
    });

    return { success: true };
  }),

  getMembers: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireGroupParticipant(input.conversationId, ctx.userId);

      const members = await db
        .select({
          userId: schema.conversationParticipants.userId,
          role: schema.conversationParticipants.role,
          joinedAt: schema.conversationParticipants.joinedAt,
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
        })
        .from(schema.conversationParticipants)
        .innerJoin(schema.profiles, eq(schema.conversationParticipants.userId, schema.profiles.userId))
        .where(
          and(
            eq(schema.conversationParticipants.conversationId, input.conversationId),
            notInArray(
              schema.conversationParticipants.userId,
              db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
            ),
          ),
        )
        .orderBy(
          sql`CASE ${schema.conversationParticipants.role}
            WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
          schema.conversationParticipants.joinedAt,
        )
        .limit(input.limit)
        .offset(input.cursor ?? 0);

      return members;
    }),

  addMember: protectedProcedure.input(groupMemberActionSchema).mutation(async ({ ctx, input }) => {
    await requireGroup(input.conversationId);
    await requireGroupParticipant(input.conversationId, ctx.userId, "admin");

    // Check if already a member
    const [existing] = await db
      .select()
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, input.userId),
        ),
      );

    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "User is already a member",
      });
    }

    // Check member limit
    const conv = await requireGroup(input.conversationId);
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.conversationParticipants)
      .where(eq(schema.conversationParticipants.conversationId, input.conversationId));

    if (Number(countResult.count) >= (conv.maxMembers ?? 200)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Group is full",
      });
    }

    await db.insert(schema.conversationParticipants).values({
      conversationId: input.conversationId,
      userId: input.userId,
      role: "member",
    });

    const [profile] = await db
      .select({ displayName: schema.profiles.displayName })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, input.userId));

    ee.emit("groupMember", {
      conversationId: input.conversationId,
      userId: input.userId,
      action: "joined",
      displayName: profile?.displayName,
    });

    ee.emit("groupInvited", {
      userId: input.userId,
      conversationId: input.conversationId,
      groupName: conv.name,
    });

    void sendPushToUser(input.userId, {
      title: conv.name ?? "Grupa",
      body: "Nowe zaproszenie do grupy",
      data: { type: "group", conversationId: input.conversationId },
    });

    return { success: true };
  }),

  removeMember: protectedProcedure.input(groupMemberActionSchema).mutation(async ({ ctx, input }) => {
    await requireGroup(input.conversationId);
    await requireGroupParticipant(input.conversationId, ctx.userId, "admin");

    // Can't remove the owner
    const [target] = await db
      .select()
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, input.userId),
        ),
      );

    if (!target) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User is not a member",
      });
    }

    if (target.role === "owner") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot remove the group owner",
      });
    }

    await db
      .delete(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, input.userId),
        ),
      );

    ee.emit("groupMember", {
      conversationId: input.conversationId,
      userId: input.userId,
      action: "removed",
    });

    return { success: true };
  }),

  setRole: protectedProcedure.input(setGroupRoleSchema).mutation(async ({ ctx, input }) => {
    await requireGroup(input.conversationId);
    await requireGroupParticipant(input.conversationId, ctx.userId, "owner");

    const [target] = await db
      .select()
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, input.userId),
        ),
      );

    if (!target) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User is not a member",
      });
    }

    if (target.role === "owner") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot change the owner role. Use transferOwnership instead.",
      });
    }

    await db
      .update(schema.conversationParticipants)
      .set({ role: input.role })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, input.userId),
        ),
      );

    ee.emit("groupMember", {
      conversationId: input.conversationId,
      userId: input.userId,
      action: "roleChanged",
      role: input.role,
    });

    return { success: true };
  }),

  getDiscoverable: protectedProcedure.input(getDiscoverableGroupsSchema).query(async ({ input }) => {
    const { latitude, longitude, radiusMeters, limit, cursor } = input;

    // Haversine distance filter
    const distanceSql = sql<number>`
        6371000 * acos(
          cos(radians(${latitude})) * cos(radians(${schema.conversations.latitude})) *
          cos(radians(${schema.conversations.longitude}) - radians(${longitude})) +
          sin(radians(${latitude})) * sin(radians(${schema.conversations.latitude}))
        )
      `;

    const groups = await db
      .select({
        conversation: schema.conversations,
        distance: distanceSql.as("distance"),
        memberCount: sql<number>`(
            SELECT count(*) FROM conversation_participants cp2
            WHERE cp2.conversation_id = ${schema.conversations.id}
              AND cp2.user_id NOT IN (SELECT id FROM "user" WHERE deleted_at IS NOT NULL)
          )`.as("member_count"),
        nearbyMemberCount: sql<number>`(
            SELECT count(*) FROM conversation_participants cp
            INNER JOIN profiles p ON cp.user_id = p.user_id
            WHERE cp.conversation_id = ${schema.conversations.id}
              AND cp.location_visible = true
              AND p.latitude IS NOT NULL
              AND cp.user_id NOT IN (SELECT id FROM "user" WHERE deleted_at IS NOT NULL)
              AND 6371000 * acos(
                cos(radians(${latitude})) * cos(radians(p.latitude)) *
                cos(radians(p.longitude) - radians(${longitude})) +
                sin(radians(${latitude})) * sin(radians(p.latitude))
              ) <= ${radiusMeters}
          )`.as("nearby_member_count"),
      })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.type, "group"),
          eq(schema.conversations.isDiscoverable, true),
          lte(distanceSql, radiusMeters),
        ),
      )
      .orderBy(sql`distance`)
      .limit(limit)
      .offset(cursor ?? 0);

    return groups.map((g) => ({
      ...g.conversation,
      distance: Math.round(g.distance),
      memberCount: Number(g.memberCount),
      nearbyMemberCount: Number(g.nearbyMemberCount),
    }));
  }),

  regenerateInviteCode: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireGroup(input.conversationId);
      await requireGroupParticipant(input.conversationId, ctx.userId, "admin");

      const newCode = generateInviteCode();
      await db
        .update(schema.conversations)
        .set({ inviteCode: newCode })
        .where(eq(schema.conversations.id, input.conversationId));

      return { inviteCode: newCode };
    }),

  transferOwnership: protectedProcedure.input(groupMemberActionSchema).mutation(async ({ ctx, input }) => {
    await requireGroup(input.conversationId);
    await requireGroupParticipant(input.conversationId, ctx.userId, "owner");

    // Verify target is a member
    const [target] = await db
      .select()
      .from(schema.conversationParticipants)
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, input.userId),
        ),
      );

    if (!target) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User is not a member of this group",
      });
    }

    // Transfer: new owner
    await db
      .update(schema.conversationParticipants)
      .set({ role: "owner" })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, input.userId),
        ),
      );

    // Demote old owner to admin
    await db
      .update(schema.conversationParticipants)
      .set({ role: "admin" })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, input.conversationId),
          eq(schema.conversationParticipants.userId, ctx.userId),
        ),
      );

    // Update creatorId
    await db
      .update(schema.conversations)
      .set({ creatorId: input.userId })
      .where(eq(schema.conversations.id, input.conversationId));

    ee.emit("groupMember", {
      conversationId: input.conversationId,
      userId: input.userId,
      action: "roleChanged",
      role: "owner",
    });

    ee.emit("groupMember", {
      conversationId: input.conversationId,
      userId: ctx.userId,
      action: "roleChanged",
      role: "admin",
    });

    return { success: true };
  }),

  getGroupInfo: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const conv = await requireGroup(input.conversationId);

      // Check if user is a member
      const [participant] = await db
        .select()
        .from(schema.conversationParticipants)
        .where(
          and(
            eq(schema.conversationParticipants.conversationId, input.conversationId),
            eq(schema.conversationParticipants.userId, ctx.userId),
          ),
        );

      const isMember = !!participant;

      // Non-members can only see discoverable groups
      if (!isMember && !conv.isDiscoverable) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this group",
        });
      }

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.conversationParticipants)
        .where(eq(schema.conversationParticipants.conversationId, input.conversationId));

      // Members get full info; non-members get a preview
      if (!isMember) {
        return {
          id: conv.id,
          name: conv.name,
          description: conv.description,
          avatarUrl: conv.avatarUrl,
          isDiscoverable: conv.isDiscoverable,
          memberCount: Number(countResult.count),
          isMember: false as const,
          topics: [],
          inviteCode: null,
          type: conv.type,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          creatorId: null,
          latitude: conv.latitude,
          longitude: conv.longitude,
          maxMembers: conv.maxMembers,
          discoveryRadiusMeters: conv.discoveryRadiusMeters,
        };
      }

      const topicsList = await db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.conversationId, input.conversationId))
        .orderBy(
          sql`${schema.topics.isPinned} DESC, ${schema.topics.sortOrder} ASC, ${schema.topics.lastMessageAt} DESC NULLS LAST`,
        );

      return {
        ...conv,
        memberCount: Number(countResult.count),
        isMember: true as const,
        topics: topicsList,
        locationVisible: participant.locationVisible,
      };
    }),

  setLocationVisibility: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        visible: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireGroupParticipant(input.conversationId, ctx.userId);

      await db
        .update(schema.conversationParticipants)
        .set({ locationVisible: input.visible })
        .where(
          and(
            eq(schema.conversationParticipants.conversationId, input.conversationId),
            eq(schema.conversationParticipants.userId, ctx.userId),
          ),
        );

      return { ok: true };
    }),

  getNearbyMembers: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        radiusMeters: z.number().min(100).max(50000).default(5000),
        limit: z.number().min(1).max(20).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { conversationId, latitude, longitude, radiusMeters, limit } = input;

      const distanceSql = sql<number>`
        6371000 * acos(
          cos(radians(${latitude})) * cos(radians(${schema.profiles.latitude})) *
          cos(radians(${schema.profiles.longitude}) - radians(${longitude})) +
          sin(radians(${latitude})) * sin(radians(${schema.profiles.latitude}))
        )
      `;

      const baseWhere = and(
        eq(schema.conversationParticipants.conversationId, conversationId),
        eq(schema.conversationParticipants.locationVisible, true),
        isNotNull(schema.profiles.latitude),
        lte(distanceSql, radiusMeters),
        ne(schema.conversationParticipants.userId, ctx.userId),
        notInArray(
          schema.conversationParticipants.userId,
          db.select({ id: schema.user.id }).from(schema.user).where(isNotNull(schema.user.deletedAt)),
        ),
      );

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.conversationParticipants)
        .innerJoin(schema.profiles, eq(schema.conversationParticipants.userId, schema.profiles.userId))
        .where(baseWhere);

      const totalNearby = Number(countResult.count);

      const members = await db
        .select({
          userId: schema.conversationParticipants.userId,
          displayName: schema.profiles.displayName,
          avatarUrl: schema.profiles.avatarUrl,
          distance: distanceSql.as("distance"),
        })
        .from(schema.conversationParticipants)
        .innerJoin(schema.profiles, eq(schema.conversationParticipants.userId, schema.profiles.userId))
        .where(baseWhere)
        .orderBy(sql`distance`)
        .limit(limit);

      return {
        totalNearby,
        members: members.map((m) => ({
          ...m,
          distance: Math.round(m.distance),
        })),
      };
    }),
});
