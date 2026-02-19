import { z } from 'zod';

// Profile validators
export const createProfileSchema = z.object({
  displayName: z.string().min(2).max(50),
  bio: z.string().min(10).max(500),
  lookingFor: z.string().min(10).max(500),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(50).optional(),
  bio: z.string().min(10).max(500).optional(),
  lookingFor: z.string().min(10).max(500).optional(),
  avatarUrl: z.string().url().optional(),
  isHidden: z.boolean().optional(),
});

export const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  skipAnalysis: z.boolean().optional(),
});

// Wave validators
export const sendWaveSchema = z.object({
  toUserId: z.string().min(1),
});

export const respondToWaveSchema = z.object({
  waveId: z.string().min(1),
  accept: z.boolean(),
});

// Message validators
export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(2000),
  type: z.enum(['text', 'image', 'location']).default('text'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  replyToId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
});

export const deleteMessageSchema = z.object({
  messageId: z.string().uuid(),
});

export const reactToMessageSchema = z.object({
  messageId: z.string().uuid(),
  emoji: z.string().min(1).max(8),
});

export const searchMessagesSchema = z.object({
  conversationId: z.string().uuid(),
  query: z.string().min(1).max(200),
  limit: z.number().min(1).max(50).default(20),
});

// Nearby users query
export const getNearbyUsersSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(100).max(50000).default(5000),
  limit: z.number().min(1).max(50).default(20),
});

// Nearby users for map (with grid-based privacy)
export const getNearbyUsersForMapSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(100).max(50000).default(5000),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.number().int().min(0).optional(),
});

// Block validator
export const blockUserSchema = z.object({
  userId: z.string().min(1),
});

// Profiling validators
export const startProfilingSchema = z.object({
  basedOnSessionId: z.string().uuid().optional(),
});

export const answerQuestionSchema = z.object({
  sessionId: z.string().uuid(),
  answer: z.string().min(1).max(500),
});

export const requestMoreQuestionsSchema = z.object({
  sessionId: z.string().uuid(),
  directionHint: z.string().max(200).optional(),
});

export const completeProfilingSchema = z.object({
  sessionId: z.string().uuid(),
});

export const applyProfilingSchema = z.object({
  sessionId: z.string().uuid(),
  displayName: z.string().min(2).max(50),
  portraitSharedForMatching: z.boolean(),
  bio: z.string().min(10).max(500).optional(),
  lookingFor: z.string().min(10).max(500).optional(),
});

// New onboarding validators
export const submitOnboardingSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().min(1),
    answer: z.string().min(1).max(500),
  })),
  skipped: z.array(z.string()),
});

export const answerFollowUpSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  answer: z.string().min(1).max(500),
});

export const createGhostProfileSchema = z.object({
  displayName: z.string().min(2).max(50),
});

// Group validators
export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isDiscoverable: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  memberUserIds: z.array(z.string()).max(199).default([]),
});

export const updateGroupSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  isDiscoverable: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  discoveryRadiusMeters: z.number().min(100).max(50000).optional(),
});

export const joinGroupSchema = z.object({
  inviteCode: z.string().min(1).max(20),
});

export const groupMemberActionSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().min(1),
});

export const setGroupRoleSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().min(1),
  role: z.enum(['admin', 'member']),
});

export const getDiscoverableGroupsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(100).max(50000).default(5000),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.number().int().min(0).optional(),
});

// Topic validators
export const createTopicSchema = z.object({
  conversationId: z.string().uuid(),
  name: z.string().min(1).max(100),
  emoji: z.string().max(8).optional(),
});

export const updateTopicSchema = z.object({
  topicId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().max(8).nullable().optional(),
  isPinned: z.boolean().optional(),
  isClosed: z.boolean().optional(),
});

// Type exports from schemas
export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type SendWaveInput = z.infer<typeof sendWaveSchema>;
export type RespondToWaveInput = z.infer<typeof respondToWaveSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
export type ReactToMessageInput = z.infer<typeof reactToMessageSchema>;
export type SearchMessagesInput = z.infer<typeof searchMessagesSchema>;
export type GetNearbyUsersInput = z.infer<typeof getNearbyUsersSchema>;
export type GetNearbyUsersForMapInput = z.infer<typeof getNearbyUsersForMapSchema>;
export type BlockUserInput = z.infer<typeof blockUserSchema>;
export type StartProfilingInput = z.infer<typeof startProfilingSchema>;
export type AnswerQuestionInput = z.infer<typeof answerQuestionSchema>;
export type RequestMoreQuestionsInput = z.infer<typeof requestMoreQuestionsSchema>;
export type CompleteProfilingInput = z.infer<typeof completeProfilingSchema>;
export type ApplyProfilingInput = z.infer<typeof applyProfilingSchema>;
export type SubmitOnboardingInput = z.infer<typeof submitOnboardingSchema>;
export type AnswerFollowUpInput = z.infer<typeof answerFollowUpSchema>;
export type CreateGhostProfileInput = z.infer<typeof createGhostProfileSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type GroupMemberActionInput = z.infer<typeof groupMemberActionSchema>;
export type SetGroupRoleInput = z.infer<typeof setGroupRoleSchema>;
export type GetDiscoverableGroupsInput = z.infer<typeof getDiscoverableGroupsSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
