// In-session UGC translation cache. Stores the translated text + the user's
// "show original" toggle per (userId, field). Server already caches successful
// translations on `profile_translations` — this store covers two things on
// top: (1) viewer-driven `translateContent` results that haven't been refetched
// yet, (2) the per-screen "Pokaż oryginał" toggle state.
//
// Wiped on session change (USER_SCOPED). BLI-279.

import type { UgcTranslatableField } from "@repo/shared";
import { create } from "zustand";

type Key = `${string}:${UgcTranslatableField}`;

interface TranslationState {
  translations: Map<Key, string>;
  showOriginal: Map<Key, boolean>;

  setTranslation(userId: string, field: UgcTranslatableField, content: string): void;
  getTranslation(userId: string, field: UgcTranslatableField): string | undefined;

  toggleShowOriginal(userId: string, field: UgcTranslatableField): void;
  isShowingOriginal(userId: string, field: UgcTranslatableField): boolean;

  reset(): void;
}

function keyFor(userId: string, field: UgcTranslatableField): Key {
  return `${userId}:${field}`;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  translations: new Map(),
  showOriginal: new Map(),

  setTranslation(userId, field, content) {
    set((state) => {
      const next = new Map(state.translations);
      next.set(keyFor(userId, field), content);
      return { translations: next };
    });
  },

  getTranslation(userId, field) {
    return get().translations.get(keyFor(userId, field));
  },

  toggleShowOriginal(userId, field) {
    set((state) => {
      const k = keyFor(userId, field);
      const next = new Map(state.showOriginal);
      next.set(k, !next.get(k));
      return { showOriginal: next };
    });
  },

  isShowingOriginal(userId, field) {
    return get().showOriginal.get(keyFor(userId, field)) ?? false;
  },

  reset() {
    set({ translations: new Map(), showOriginal: new Map() });
  },
}));
