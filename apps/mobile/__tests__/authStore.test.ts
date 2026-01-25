import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../src/stores/authStore';
import type { Session } from '@supabase/supabase-js';

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAuthStore.setState({
      session: null,
      isLoading: true,
    });
  });

  it('has correct initial state', () => {
    const state = useAuthStore.getState();

    expect(state.session).toBe(null);
    expect(state.isLoading).toBe(true);
  });

  it('sets session correctly', () => {
    const mockSession = {
      access_token: 'test-token',
      refresh_token: 'refresh-token',
      user: {
        id: '123',
        email: 'test@example.com',
      },
    } as unknown as Session;

    useAuthStore.getState().setSession(mockSession);

    const state = useAuthStore.getState();
    expect(state.session).toBe(mockSession);
    expect(state.session?.user.email).toBe('test@example.com');
  });

  it('clears session on logout', () => {
    const mockSession = {
      access_token: 'test-token',
      user: { id: '123' },
    } as unknown as Session;

    useAuthStore.getState().setSession(mockSession);
    expect(useAuthStore.getState().session).not.toBe(null);

    useAuthStore.getState().setSession(null);
    expect(useAuthStore.getState().session).toBe(null);
  });

  it('sets loading state correctly', () => {
    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);

    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });
});
