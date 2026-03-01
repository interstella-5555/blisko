import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../../db';
import {
  conversations,
  conversationParticipants,
  profiles,
  topics,
} from '../../db/schema';
import {
  createGroupSchema,
  updateGroupSchema,
  joinGroupSchema,
  groupMemberActionSchema,
  setGroupRoleSchema,
  getDiscoverableGroupsSchema,
} from '@repo/shared';
import { TRPCError } from '@trpc/server';
import { ee } from '../../ws/events';

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function requireGroupParticipant(
  conversationId: string,
  userId: string,
  minRole?: 'admin' | 'owner'
) {
  const [participant] = await db
    .select()
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.userId, userId)
      )
    );

  if (!participant) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are not a member of this group',
    });
  }

  if (minRole === 'owner' && participant.role !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the group owner can perform this action',
    });
  }

  if (
    minRole === 'admin' &&
    participant.role !== 'admin' &&
    participant.role !== 'owner'
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only admins can perform this action',
    });
  }

  return participant;
}

async function requireGroup(conversationId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.type, 'group')
      )
    );

  if (!conv) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Group not found',
    });
  }

  return conv;
}

export const groupsRouter = router({
  create: protectedProcedure
    .input(createGroupSchema)
    .mutation(async ({ ctx, input }) => {
      const inviteCode = generateInviteCode();

      const [conversation] = await db
        .insert(conversations)
        .values({
          type: 'group',
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
      await db.insert(conversationParticipants).values({
        conversationId: conversation.id,
        userId: ctx.userId,
        role: 'owner',
      });

      // Add initial members
      if (input.memberUserIds.length > 0) {
        await db.insert(conversationParticipants).values(
          input.memberUserIds.map((userId) => ({
            conversationId: conversation.id,
            userId,
            role: 'member' as const,
          }))
        );

        // Notify invited members
        for (const userId of input.memberUserIds) {
          ee.emit('groupInvited', {
            userId,
            conversationId: conversation.id,
            groupName: input.name,
          });
        }
      }

      // Create default topic
      await db.insert(topics).values({
        conversationId: conversation.id,
        name: 'Ogólny',
        emoji: '💬',
        creatorId: ctx.userId,
        isPinned: true,
        sortOrder: 0,
      });

      return conversation;
    }),

  update: protectedProcedure
    .input(updateGroupSchema)
    .mutation(async ({ ctx, input }) => {
      await requireGroup(input.conversationId);
      await requireGroupParticipant(input.conversationId, ctx.userId, 'admin');

      const { conversationId, ...updates } = input;
      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.name !== undefined) setValues.name = updates.name;
      if (updates.description !== undefined)
        setValues.description = updates.description;
      if (updates.avatarUrl !== undefined)
        setValues.avatarUrl = updates.avatarUrl;
      if (updates.isDiscoverable !== undefined)
        setValues.isDiscoverable = updates.isDiscoverable;
      if (updates.latitude !== undefined) setValues.latitude = updates.latitude;
      if (updates.longitude !== undefined)
        setValues.longitude = updates.longitude;
      if (updates.discoveryRadiusMeters !== undefined)
        setValues.discoveryRadiusMeters = updates.discoveryRadiusMeters;

      const [updated] = await db
        .update(conversations)
        .set(setValues)
        .where(eq(conversations.id, conversationId))
        .returning();

      ee.emit('groupUpdated', {
        conversationId,
        updates: {
          name: updates.name,
          description: updates.description,
          avatarUrl: updates.avatarUrl,
        },
      });

      return updated;
    }),

  join: protectedProcedure
    .input(joinGroupSchema)
    .mutation(async ({ ctx, input }) => {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.inviteCode, input.inviteCode),
            eq(conversations.type, 'group')
          )
        );

      if (!conv) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invalid invite code',
        });
      }

      // Check if already a member
      const [existing] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conv.id),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      if (existing) {
        return conv;
      }

      // Check member limit
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id));

      if (Number(countResult.count) >= (conv.maxMembers ?? 200)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Group is full',
        });
      }

      await db.insert(conversationParticipants).values({
        conversationId: conv.id,
        userId: ctx.userId,
        role: 'member',
      });

      const [profile] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      ee.emit('groupMember', {
        conversationId: conv.id,
        userId: ctx.userId,
        action: 'joined',
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
          code: 'FORBIDDEN',
          message: 'This group is not discoverable',
        });
      }

      // Check if already a member
      const [existing] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, conv.id),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      if (existing) {
        return conv;
      }

      // Check member limit
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id));

      if (Number(countResult.count) >= (conv.maxMembers ?? 200)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Group is full',
        });
      }

      await db.insert(conversationParticipants).values({
        conversationId: conv.id,
        userId: ctx.userId,
        role: 'member',
      });

      const [profile] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.userId, ctx.userId));

      ee.emit('groupMember', {
        conversationId: conv.id,
        userId: ctx.userId,
        action: 'joined',
        displayName: profile?.displayName,
      });

      return conv;
    }),

  leave: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const participant = await requireGroupParticipant(
        input.conversationId,
        ctx.userId
      );

      if (participant.role === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'Owner cannot leave. Transfer ownership first.',
        });
      }

      await db
        .delete(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      ee.emit('groupMember', {
        conversationId: input.conversationId,
        userId: ctx.userId,
        action: 'left',
      });

      return { success: true };
    }),

  getMembers: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.number().int().min(0).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await requireGroupParticipant(input.conversationId, ctx.userId);

      const members = await db
        .select({
          userId: conversationParticipants.userId,
          role: conversationParticipants.role,
          joinedAt: conversationParticipants.joinedAt,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(conversationParticipants)
        .innerJoin(
          profiles,
          eq(conversationParticipants.userId, profiles.userId)
        )
        .where(
          eq(conversationParticipants.conversationId, input.conversationId)
        )
        .orderBy(
          sql`CASE ${conversationParticipants.role}
            WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`,
          conversationParticipants.joinedAt
        )
        .limit(input.limit)
        .offset(input.cursor ?? 0);

      return members;
    }),

  addMember: protectedProcedure
    .input(groupMemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireGroup(input.conversationId);
      await requireGroupParticipant(input.conversationId, ctx.userId, 'admin');

      // Check if already a member
      const [existing] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.userId)
          )
        );

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User is already a member',
        });
      }

      // Check member limit
      const conv = await requireGroup(input.conversationId);
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, input.conversationId));

      if (Number(countResult.count) >= (conv.maxMembers ?? 200)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Group is full',
        });
      }

      await db.insert(conversationParticipants).values({
        conversationId: input.conversationId,
        userId: input.userId,
        role: 'member',
      });

      const [profile] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.userId, input.userId));

      ee.emit('groupMember', {
        conversationId: input.conversationId,
        userId: input.userId,
        action: 'joined',
        displayName: profile?.displayName,
      });

      ee.emit('groupInvited', {
        userId: input.userId,
        conversationId: input.conversationId,
        groupName: conv.name,
      });

      return { success: true };
    }),

  removeMember: protectedProcedure
    .input(groupMemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireGroup(input.conversationId);
      await requireGroupParticipant(input.conversationId, ctx.userId, 'admin');

      // Can't remove the owner
      const [target] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.userId)
          )
        );

      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User is not a member',
        });
      }

      if (target.role === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot remove the group owner',
        });
      }

      await db
        .delete(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.userId)
          )
        );

      ee.emit('groupMember', {
        conversationId: input.conversationId,
        userId: input.userId,
        action: 'removed',
      });

      return { success: true };
    }),

  setRole: protectedProcedure
    .input(setGroupRoleSchema)
    .mutation(async ({ ctx, input }) => {
      await requireGroup(input.conversationId);
      await requireGroupParticipant(input.conversationId, ctx.userId, 'owner');

      const [target] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.userId)
          )
        );

      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User is not a member',
        });
      }

      if (target.role === 'owner') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot change the owner role. Use transferOwnership instead.',
        });
      }

      await db
        .update(conversationParticipants)
        .set({ role: input.role })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.userId)
          )
        );

      ee.emit('groupMember', {
        conversationId: input.conversationId,
        userId: input.userId,
        action: 'roleChanged',
        role: input.role,
      });

      return { success: true };
    }),

  getDiscoverable: protectedProcedure
    .input(getDiscoverableGroupsSchema)
    .query(async ({ input }) => {
      const { latitude, longitude, radiusMeters, limit, cursor } = input;

      // Haversine distance filter
      const distanceSql = sql<number>`
        6371000 * acos(
          cos(radians(${latitude})) * cos(radians(${conversations.latitude})) *
          cos(radians(${conversations.longitude}) - radians(${longitude})) +
          sin(radians(${latitude})) * sin(radians(${conversations.latitude}))
        )
      `;

      const groups = await db
        .select({
          conversation: conversations,
          distance: distanceSql.as('distance'),
          memberCount: sql<number>`(
            SELECT count(*) FROM conversation_participants
            WHERE conversation_id = ${conversations.id}
          )`.as('member_count'),
          nearbyMemberCount: sql<number>`(
            SELECT count(*) FROM conversation_participants cp
            INNER JOIN profiles p ON cp.user_id = p.user_id
            WHERE cp.conversation_id = ${conversations.id}
              AND cp.location_visible = true
              AND p.latitude IS NOT NULL
              AND 6371000 * acos(
                cos(radians(${latitude})) * cos(radians(p.latitude)) *
                cos(radians(p.longitude) - radians(${longitude})) +
                sin(radians(${latitude})) * sin(radians(p.latitude))
              ) <= ${radiusMeters}
          )`.as('nearby_member_count'),
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.type, 'group'),
            eq(conversations.isDiscoverable, true),
            sql`${distanceSql} <= ${radiusMeters}`
          )
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
      await requireGroupParticipant(input.conversationId, ctx.userId, 'admin');

      const newCode = generateInviteCode();
      await db
        .update(conversations)
        .set({ inviteCode: newCode })
        .where(eq(conversations.id, input.conversationId));

      return { inviteCode: newCode };
    }),

  transferOwnership: protectedProcedure
    .input(groupMemberActionSchema)
    .mutation(async ({ ctx, input }) => {
      await requireGroup(input.conversationId);
      await requireGroupParticipant(input.conversationId, ctx.userId, 'owner');

      // Verify target is a member
      const [target] = await db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.userId)
          )
        );

      if (!target) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User is not a member of this group',
        });
      }

      // Transfer: new owner
      await db
        .update(conversationParticipants)
        .set({ role: 'owner' })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, input.userId)
          )
        );

      // Demote old owner to admin
      await db
        .update(conversationParticipants)
        .set({ role: 'admin' })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      // Update creatorId
      await db
        .update(conversations)
        .set({ creatorId: input.userId })
        .where(eq(conversations.id, input.conversationId));

      ee.emit('groupMember', {
        conversationId: input.conversationId,
        userId: input.userId,
        action: 'roleChanged',
        role: 'owner',
      });

      ee.emit('groupMember', {
        conversationId: input.conversationId,
        userId: ctx.userId,
        action: 'roleChanged',
        role: 'admin',
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
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
        );

      const isMember = !!participant;

      // Non-members can only see discoverable groups
      if (!isMember && !conv.isDiscoverable) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You are not a member of this group',
        });
      }

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, input.conversationId));

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
        .from(topics)
        .where(eq(topics.conversationId, input.conversationId))
        .orderBy(
          sql`${topics.isPinned} DESC, ${topics.sortOrder} ASC, ${topics.lastMessageAt} DESC NULLS LAST`
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireGroupParticipant(input.conversationId, ctx.userId);

      await db
        .update(conversationParticipants)
        .set({ locationVisible: input.visible })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.userId)
          )
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
      })
    )
    .query(async ({ ctx, input }) => {
      const { conversationId, latitude, longitude, radiusMeters, limit } = input;

      const distanceSql = sql<number>`
        6371000 * acos(
          cos(radians(${latitude})) * cos(radians(${profiles.latitude})) *
          cos(radians(${profiles.longitude}) - radians(${longitude})) +
          sin(radians(${latitude})) * sin(radians(${profiles.latitude}))
        )
      `;

      const baseWhere = and(
        eq(conversationParticipants.conversationId, conversationId),
        eq(conversationParticipants.locationVisible, true),
        sql`${profiles.latitude} IS NOT NULL`,
        sql`${distanceSql} <= ${radiusMeters}`,
        sql`${conversationParticipants.userId} != ${ctx.userId}`
      );

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversationParticipants)
        .innerJoin(profiles, eq(conversationParticipants.userId, profiles.userId))
        .where(baseWhere);

      const totalNearby = Number(countResult.count);

      const members = await db
        .select({
          userId: conversationParticipants.userId,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
          distance: distanceSql.as('distance'),
        })
        .from(conversationParticipants)
        .innerJoin(profiles, eq(conversationParticipants.userId, profiles.userId))
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
