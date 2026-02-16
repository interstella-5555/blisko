import { create } from 'zustand';
import { useProfilesStore } from './profilesStore';

export interface ConversationEntry {
  id: string;
  participant: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
    type: string;
  } | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ConversationsStore {
  conversations: ConversationEntry[];
  activeConversationId: string | null;
  _hydrated: boolean;

  set(conversations: ConversationEntry[]): void;
  addNew(conv: ConversationEntry): void;
  updateLastMessage(
    convId: string,
    msg: ConversationEntry['lastMessage'],
  ): void;
  incrementUnread(convId: string): void;
  markAsRead(convId: string): void;
  setActiveConversation(id: string | null): void;
  reset(): void;
}

export const useConversationsStore = create<ConversationsStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  _hydrated: false,

  set(conversations) {
    // Also populate profiles store with participant data
    const profileEntries = conversations
      .filter((c) => c.participant)
      .map((c) => ({
        userId: c.participant!.userId,
        displayName: c.participant!.displayName,
        avatarUrl: c.participant!.avatarUrl,
        _partial: true as const,
      }));
    if (profileEntries.length > 0) {
      useProfilesStore.getState().mergeMany(profileEntries);
    }

    const activeId = get().activeConversationId;
    const mapped = activeId
      ? conversations.map((c) =>
          c.id === activeId ? { ...c, unreadCount: 0 } : c,
        )
      : conversations;
    set({ conversations: mapped, _hydrated: true });
  },

  addNew(conv) {
    set((state) => {
      // Dedup by id
      if (state.conversations.some((c) => c.id === conv.id)) {
        return state;
      }
      return { conversations: [conv, ...state.conversations] };
    });
  },

  updateLastMessage(convId, msg) {
    set((state) => {
      const updated = state.conversations.map((c) =>
        c.id === convId
          ? { ...c, lastMessage: msg, updatedAt: msg?.createdAt ?? c.updatedAt }
          : c,
      );
      // Re-sort by updatedAt desc
      updated.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      return { conversations: updated };
    });
  },

  incrementUnread(convId) {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, unreadCount: c.unreadCount + 1 } : c,
      ),
    }));
  },

  markAsRead(convId) {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, unreadCount: 0 } : c,
      ),
    }));
  },

  setActiveConversation(id) {
    set({ activeConversationId: id });
    // Auto-mark as read when opening
    if (id) {
      get().markAsRead(id);
    }
  },

  reset() {
    set({ conversations: [], activeConversationId: null, _hydrated: false });
  },
}));
