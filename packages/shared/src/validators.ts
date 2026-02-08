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
});

// Wave validators
export const sendWaveSchema = z.object({
  toUserId: z.string().min(1),
  message: z.string().max(200).optional(),
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
  metadata: z.string().optional(),
  replyToId: z.string().uuid().optional(),
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
});

// Block validator
export const blockUserSchema = z.object({
  userId: z.string().min(1),
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
