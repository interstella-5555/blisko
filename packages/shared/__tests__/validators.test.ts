import { describe, it, expect } from 'vitest';
import {
  createProfileSchema,
  updateProfileSchema,
  sendWaveSchema,
  getNearbyUsersSchema,
} from '../src/validators';

describe('createProfileSchema', () => {
  it('validates correct profile data', () => {
    const result = createProfileSchema.safeParse({
      displayName: 'John',
      bio: 'Hello, I am John and I love coding',
      lookingFor: 'Looking for people who share my passion for technology',
    });

    expect(result.success).toBe(true);
  });

  it('rejects short display name', () => {
    const result = createProfileSchema.safeParse({
      displayName: 'J',
      bio: 'Hello, I am John and I love coding',
      lookingFor: 'Looking for people who share my passion for technology',
    });

    expect(result.success).toBe(false);
  });

  it('rejects short bio', () => {
    const result = createProfileSchema.safeParse({
      displayName: 'John',
      bio: 'Short',
      lookingFor: 'Looking for people who share my passion for technology',
    });

    expect(result.success).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  it('allows partial updates', () => {
    const result = updateProfileSchema.safeParse({
      displayName: 'Jane',
    });

    expect(result.success).toBe(true);
  });

  it('validates avatar URL', () => {
    const result = updateProfileSchema.safeParse({
      avatarUrl: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid avatar URL', () => {
    const result = updateProfileSchema.safeParse({
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    expect(result.success).toBe(true);
  });
});

describe('sendWaveSchema', () => {
  it('validates wave with message', () => {
    const result = sendWaveSchema.safeParse({
      toUserId: '123e4567-e89b-12d3-a456-426614174000',
      message: 'Hi there!',
    });

    expect(result.success).toBe(true);
  });

  it('validates wave without message', () => {
    const result = sendWaveSchema.safeParse({
      toUserId: '123e4567-e89b-12d3-a456-426614174000',
    });

    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = sendWaveSchema.safeParse({
      toUserId: 'not-a-uuid',
    });

    expect(result.success).toBe(false);
  });
});

describe('getNearbyUsersSchema', () => {
  it('validates correct location data', () => {
    const result = getNearbyUsersSchema.safeParse({
      latitude: 52.2297,
      longitude: 21.0122,
      radiusMeters: 5000,
    });

    expect(result.success).toBe(true);
  });

  it('uses default values', () => {
    const result = getNearbyUsersSchema.safeParse({
      latitude: 52.2297,
      longitude: 21.0122,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.radiusMeters).toBe(5000);
      expect(result.data.limit).toBe(20);
    }
  });

  it('rejects out of range latitude', () => {
    const result = getNearbyUsersSchema.safeParse({
      latitude: 100,
      longitude: 21.0122,
    });

    expect(result.success).toBe(false);
  });

  it('rejects out of range longitude', () => {
    const result = getNearbyUsersSchema.safeParse({
      latitude: 52.2297,
      longitude: 200,
    });

    expect(result.success).toBe(false);
  });
});
