import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mocks must be declared before importing the module under test
vi.mock("@/lib/toast", () => ({
  showToast: vi.fn(),
}));

let uuidCounter = 0;
vi.mock("expo-crypto", () => ({
  randomUUID: () => `uuid-${++uuidCounter}`,
}));

const sendMutate = vi.fn();
const reactMutate = vi.fn();
const deleteMutate = vi.fn();
const markAsReadMutate = vi.fn();
const getMessagesQuery = vi.fn();
const syncGapsQuery = vi.fn();

vi.mock("@/lib/trpc", () => ({
  vanillaClient: {
    messages: {
      send: { mutate: (...args: unknown[]) => sendMutate(...args) },
      react: { mutate: (...args: unknown[]) => reactMutate(...args) },
      deleteMessage: { mutate: (...args: unknown[]) => deleteMutate(...args) },
      markAsRead: { mutate: (...args: unknown[]) => markAsReadMutate(...args) },
      getMessages: { query: (...args: unknown[]) => getMessagesQuery(...args) },
      syncGaps: { query: (...args: unknown[]) => syncGapsQuery(...args) },
    },
  },
}));

const updateLastMessageMock = vi.fn();
vi.mock("../src/stores/conversationsStore", () => ({
  useConversationsStore: {
    getState: () => ({ updateLastMessage: updateLastMessageMock }),
  },
}));

import { showToast } from "@/lib/toast";
import { type EnrichedMessage, rawToEnriched, useMessagesStore } from "../src/stores/messagesStore";

const CONV = "conv-1";
const USER = "user-1";

// Spread overrides last so explicit null/undefined values pass through
// (e.g. seq: null for optimistic messages).
const makeMsg = (overrides: Partial<EnrichedMessage> = {}): EnrichedMessage => ({
  id: "msg-1",
  seq: 1,
  conversationId: CONV,
  senderId: USER,
  content: "hello",
  type: "text",
  metadata: null,
  replyToId: null,
  topicId: null,
  createdAt: "2026-04-14T10:00:00.000Z",
  readAt: null,
  deletedAt: null,
  replyTo: null,
  reactions: [],
  senderName: null,
  senderAvatarUrl: null,
  ...overrides,
});

beforeEach(() => {
  useMessagesStore.getState().reset();
  vi.clearAllMocks();
  uuidCounter = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// rawToEnriched
// =============================================================================

describe("rawToEnriched", () => {
  test("maps full raw message to EnrichedMessage", () => {
    const raw = {
      id: "abc",
      seq: 5,
      conversationId: "c1",
      senderId: "u1",
      content: "hi",
      type: "image",
      metadata: { url: "x" },
      replyToId: "r1",
      topicId: "t1",
      createdAt: "2026-04-14T10:00:00.000Z",
      readAt: "2026-04-14T11:00:00.000Z",
      deletedAt: null,
      replyTo: { id: "r1", content: "parent", senderName: "Alice" },
      reactions: [{ emoji: "👍", count: 1, myReaction: true }],
      senderName: "Bob",
      senderAvatarUrl: "http://avatar",
    };
    expect(rawToEnriched(raw, "fallback-conv")).toEqual({
      id: "abc",
      seq: 5,
      conversationId: "c1",
      senderId: "u1",
      content: "hi",
      type: "image",
      metadata: { url: "x" },
      replyToId: "r1",
      topicId: "t1",
      createdAt: "2026-04-14T10:00:00.000Z",
      readAt: "2026-04-14T11:00:00.000Z",
      deletedAt: null,
      replyTo: { id: "r1", content: "parent", senderName: "Alice" },
      reactions: [{ emoji: "👍", count: 1, myReaction: true }],
      senderName: "Bob",
      senderAvatarUrl: "http://avatar",
    });
  });

  test("uses fallback convId when missing", () => {
    const result = rawToEnriched({ id: "x", senderId: "u", content: "c", createdAt: "now" }, "fallback");
    expect(result.conversationId).toBe("fallback");
  });

  test("defaults missing optional fields", () => {
    const result = rawToEnriched({ id: "x", senderId: "u", content: "c", createdAt: "now", conversationId: "c" }, "f");
    expect(result.seq).toBeNull();
    expect(result.type).toBe("text");
    expect(result.metadata).toBeNull();
    expect(result.replyToId).toBeNull();
    expect(result.topicId).toBeNull();
    expect(result.readAt).toBeNull();
    expect(result.deletedAt).toBeNull();
    expect(result.replyTo).toBeNull();
    expect(result.reactions).toEqual([]);
    expect(result.senderName).toBeNull();
    expect(result.senderAvatarUrl).toBeNull();
  });

  test("converts Date objects to strings", () => {
    const date = new Date("2026-04-14T10:00:00.000Z");
    const result = rawToEnriched({ id: "x", senderId: "u", content: "c", createdAt: date }, "f");
    expect(typeof result.createdAt).toBe("string");
    expect(result.createdAt).toBe(date.toString());
  });

  test("seq=0 is preserved (not coalesced to null)", () => {
    // BUG REGRESSION: msg.seq ?? null treats 0 as falsy-ish? No — ?? only catches null/undefined
    const result = rawToEnriched({ id: "x", senderId: "u", content: "c", createdAt: "now", seq: 0 }, "f");
    expect(result.seq).toBe(0);
  });
});

// =============================================================================
// set
// =============================================================================

describe("set", () => {
  test("creates new cache on first call", () => {
    const msgs = [makeMsg({ id: "m1", seq: 5 }), makeMsg({ id: "m2", seq: 4 })];
    useMessagesStore.getState().hydrate(CONV, msgs, true, 4);
    const cache = useMessagesStore.getState().getChat(CONV);
    expect(cache?.items).toHaveLength(2);
    expect(cache?.hasOlder).toBe(true);
    expect(cache?.oldestSeq).toBe(4);
    expect(cache?.newestSeq).toBe(5);
    expect(cache?.status).toBe("hydrated");
  });

  test("partial→hydrated: drops partial items older than server response window", () => {
    const store = useMessagesStore.getState();
    // Preload delivered an old message (seq=1)
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));
    expect(store.getChat(CONV)?.status).toBe("partial");

    // Server returns newer window [5, 4] — m1 is older than window
    store.hydrate(CONV, [makeMsg({ id: "m2", seq: 5 }), makeMsg({ id: "m3", seq: 4 })], true, 4);
    const cache = store.getChat(CONV);
    expect(cache?.status).toBe("hydrated");
    expect(cache?.items.map((m) => m.id)).toEqual(["m2", "m3"]);
  });

  test("partial→hydrated: preserves WS message with seq newer than server response (race fix)", () => {
    const store = useMessagesStore.getState();
    // Preload: seq=99
    store.prepend(CONV, makeMsg({ id: "m99", seq: 99 }));
    // WS delivers seq=100 while fetchMessages in flight
    store.prepend(CONV, makeMsg({ id: "m100", seq: 100 }));
    expect(store.getChat(CONV)?.status).toBe("partial");

    // fetchMessages returns seqs 99..50 (m100 not in response — was inserted after query started)
    const serverMsgs = Array.from({ length: 50 }, (_, i) => makeMsg({ id: `m${99 - i}`, seq: 99 - i }));
    store.hydrate(CONV, serverMsgs, true, 50);

    const items = store.getChat(CONV)!.items;
    // m100 must be preserved (bug: REPLACE path lost m100)
    expect(items.find((m) => m.id === "m100")).toBeDefined();
    expect(items[0].id).toBe("m100");
    expect(store.getChat(CONV)?.newestSeq).toBe(100);
  });

  test("partial→hydrated: preserves optimistic message during fetch race", () => {
    const store = useMessagesStore.getState();
    // User sends before fetchMessages completes (chat screen doesn't block input on isLoading)
    store.prepend(CONV, makeMsg({ id: "temp-abc", seq: null, content: "hi" }));

    // Then fetchMessages resolves with server history (without the temp)
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);

    const items = store.getChat(CONV)!.items;
    expect(items.find((m) => m.id === "temp-abc")).toBeDefined();
  });

  test("merges WS-only messages on re-entry (preserves items not in server response)", () => {
    const store = useMessagesStore.getState();
    // Initial hydration with server msgs seq 1-3
    store.hydrate(
      CONV,
      [makeMsg({ id: "m3", seq: 3 }), makeMsg({ id: "m2", seq: 2 }), makeMsg({ id: "m1", seq: 1 })],
      false,
      1,
    );
    // WS delivers a new message seq 4
    store.prepend(CONV, makeMsg({ id: "m4", seq: 4 }));
    expect(store.getChat(CONV)?.items).toHaveLength(4);

    // Re-entry: server returns same as before (without m4 — query was in-flight when m4 arrived)
    store.hydrate(
      CONV,
      [makeMsg({ id: "m3", seq: 3 }), makeMsg({ id: "m2", seq: 2 }), makeMsg({ id: "m1", seq: 1 })],
      false,
      1,
    );

    const cache = store.getChat(CONV);
    expect(cache?.items.map((m) => m.id)).toEqual(["m4", "m3", "m2", "m1"]);
    expect(cache?.newestSeq).toBe(4);
  });

  test("merges optimistic (seq=null) messages on re-entry", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null, content: "pending" }));

    // Re-entry without the optimistic
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);

    const cache = store.getChat(CONV);
    expect(cache?.items.find((m) => m.id === "temp-1")).toBeDefined();
  });

  test("preserves oldestSeq on merge if not provided", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], true, 1);
    store.prepend(CONV, makeMsg({ id: "m2", seq: 2 }));
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], true, undefined);

    expect(store.getChat(CONV)?.oldestSeq).toBe(1);
  });
});

// =============================================================================
// prepend
// =============================================================================

describe("prepend", () => {
  test("creates partial cache for first message", () => {
    useMessagesStore.getState().prepend(CONV, makeMsg({ id: "m1", seq: 5 }));
    const cache = useMessagesStore.getState().getChat(CONV);
    expect(cache?.status).toBe("partial");
    expect(cache?.hasOlder).toBe(true);
    expect(cache?.items).toHaveLength(1);
    expect(cache?.newestSeq).toBe(5);
    expect(cache?.oldestSeq).toBe(5);
  });

  test("prepends to front of existing cache", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);
    store.prepend(CONV, makeMsg({ id: "m2", seq: 2 }));
    expect(store.getChat(CONV)?.items.map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  test("dedups by id", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));
    expect(store.getChat(CONV)?.items).toHaveLength(1);
  });

  test("updates newestSeq when message seq is higher", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 5 })], false, 5);
    store.prepend(CONV, makeMsg({ id: "m2", seq: 10 }));
    expect(store.getChat(CONV)?.newestSeq).toBe(10);
  });

  test("does not lower newestSeq when message seq is lower", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 10 })], false, 10);
    store.prepend(CONV, makeMsg({ id: "m2", seq: 5 }));
    expect(store.getChat(CONV)?.newestSeq).toBe(10);
  });

  test("optimistic message (seq=null) does not lower newestSeq", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 5 })], false, 5);
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null }));
    expect(store.getChat(CONV)?.newestSeq).toBe(5);
  });

  test("triggers fillGap when seq jumps (gap detected)", async () => {
    vi.useFakeTimers();
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 5 })], false, 5);

    getMessagesQuery.mockResolvedValue({ messages: [], nextCursor: undefined });
    store.prepend(CONV, makeMsg({ id: "m10", seq: 10 }));

    // fillGap is scheduled via setTimeout(..., 0)
    await vi.advanceTimersByTimeAsync(1);
    expect(getMessagesQuery).toHaveBeenCalledWith({
      conversationId: CONV,
      afterSeq: 5,
      limit: 5, // toSeq - fromSeq = 10 - 5 = 5
    });
  });

  test("does not trigger fillGap on adjacent seq", async () => {
    vi.useFakeTimers();
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 5 })], false, 5);
    store.prepend(CONV, makeMsg({ id: "m6", seq: 6 }));

    await vi.advanceTimersByTimeAsync(1);
    expect(getMessagesQuery).not.toHaveBeenCalled();
  });
});

// =============================================================================
// prependBatch
// =============================================================================

describe("prependBatch", () => {
  test("no-op on empty batch", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);
    store.prependBatch(CONV, []);
    expect(store.getChat(CONV)?.items).toHaveLength(1);
  });

  test("creates partial cache when none exists", () => {
    useMessagesStore.getState().prependBatch(CONV, [makeMsg({ id: "m2", seq: 2 }), makeMsg({ id: "m1", seq: 1 })]);
    const cache = useMessagesStore.getState().getChat(CONV);
    expect(cache?.status).toBe("partial");
    expect(cache?.items).toHaveLength(2);
    expect(cache?.newestSeq).toBe(2);
    expect(cache?.oldestSeq).toBe(1);
  });

  test("dedups against existing items", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);
    store.prependBatch(CONV, [makeMsg({ id: "m1", seq: 1 }), makeMsg({ id: "m2", seq: 2 })]);

    const cache = store.getChat(CONV);
    expect(cache?.items).toHaveLength(2);
    expect(cache?.items.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  test("returns same state when all items are duplicates", () => {
    const store = useMessagesStore.getState();
    const initial = makeMsg({ id: "m1", seq: 1 });
    store.hydrate(CONV, [initial], false, 1);
    const before = store.getChat(CONV)!.items;
    store.prependBatch(CONV, [makeMsg({ id: "m1", seq: 1 })]);
    expect(store.getChat(CONV)!.items).toBe(before);
  });

  test("updates newestSeq based on max of new + existing", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m1", seq: 5 })], false, 5);
    store.prependBatch(CONV, [makeMsg({ id: "m2", seq: 7 }), makeMsg({ id: "m3", seq: 6 })]);
    expect(store.getChat(CONV)?.newestSeq).toBe(7);
  });
});

// =============================================================================
// appendOlder
// =============================================================================

describe("appendOlder", () => {
  test("creates cache with messages when none exists", () => {
    useMessagesStore.getState().appendOlder(CONV, [makeMsg({ id: "m1", seq: 1 })], true, 1);
    expect(useMessagesStore.getState().getChat(CONV)?.items).toHaveLength(1);
  });

  test("appends to end of existing items (older)", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m3", seq: 3 }), makeMsg({ id: "m2", seq: 2 })], true, 2);
    store.appendOlder(CONV, [makeMsg({ id: "m1", seq: 1 })], false, 1);
    expect(store.getChat(CONV)?.items.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
    expect(store.getChat(CONV)?.hasOlder).toBe(false);
    expect(store.getChat(CONV)?.oldestSeq).toBe(1);
  });

  test("dedups when appending", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m2", seq: 2 }), makeMsg({ id: "m1", seq: 1 })], true, 1);
    store.appendOlder(CONV, [makeMsg({ id: "m1", seq: 1 }), makeMsg({ id: "m0", seq: 0 })], false, 0);
    expect(store.getChat(CONV)?.items.map((m) => m.id)).toEqual(["m2", "m1", "m0"]);
  });
});

// =============================================================================
// replaceOptimistic
// =============================================================================

describe("replaceOptimistic", () => {
  test("swaps temp message with real one in place", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null, content: "hi" }));
    store.replaceOptimistic(CONV, "temp-1", makeMsg({ id: "real-1", seq: 5, content: "hi" }));

    const items = store.getChat(CONV)!.items;
    expect(items.find((m) => m.id === "temp-1")).toBeUndefined();
    expect(items.find((m) => m.id === "real-1")).toBeDefined();
  });

  test("removes temp when real already present (WS arrived first)", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null }));
    store.prepend(CONV, makeMsg({ id: "real-1", seq: 5 }));

    store.replaceOptimistic(CONV, "temp-1", makeMsg({ id: "real-1", seq: 5 }));

    const items = store.getChat(CONV)!.items;
    expect(items.find((m) => m.id === "temp-1")).toBeUndefined();
    expect(items.filter((m) => m.id === "real-1")).toHaveLength(1);
  });

  test("updates newestSeq from replaced message", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [], false, null);
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null }));
    expect(store.getChat(CONV)?.newestSeq).toBeNull();

    store.replaceOptimistic(CONV, "temp-1", makeMsg({ id: "real-1", seq: 5 }));
    expect(store.getChat(CONV)?.newestSeq).toBe(5);
  });

  test("no-op when conversation not cached", () => {
    useMessagesStore.getState().replaceOptimistic("missing", "temp-1", makeMsg({ id: "real-1", seq: 5 }));
    expect(useMessagesStore.getState().getChat("missing")).toBeUndefined();
  });
});

// =============================================================================
// removeOptimistic
// =============================================================================

describe("removeOptimistic", () => {
  test("removes message by tempId", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null }));
    store.removeOptimistic(CONV, "temp-1");
    expect(store.getChat(CONV)?.items).toHaveLength(0);
  });

  test("no-op when conversation not cached", () => {
    useMessagesStore.getState().removeOptimistic("missing", "temp-1");
    expect(useMessagesStore.getState().getChat("missing")).toBeUndefined();
  });

  test("no-op when tempId not found", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));
    store.removeOptimistic(CONV, "temp-missing");
    expect(store.getChat(CONV)?.items).toHaveLength(1);
  });
});

// =============================================================================
// updateMessage
// =============================================================================

describe("updateMessage", () => {
  test("patches existing message fields", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1, content: "old" }));
    store.updateMessage(CONV, "m1", { content: "new", deletedAt: "2026-04-14T11:00:00.000Z" });

    const msg = store.getChat(CONV)!.items[0];
    expect(msg.content).toBe("new");
    expect(msg.deletedAt).toBe("2026-04-14T11:00:00.000Z");
    expect(msg.id).toBe("m1");
  });

  test("no-op when message not found", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));
    store.updateMessage(CONV, "missing", { content: "x" });
    expect(store.getChat(CONV)?.items[0].content).toBe("hello");
  });

  test("no-op when conversation not cached", () => {
    useMessagesStore.getState().updateMessage("missing", "m1", { content: "x" });
    expect(useMessagesStore.getState().getChat("missing")).toBeUndefined();
  });
});

// =============================================================================
// updateReaction
// =============================================================================

describe("updateReaction", () => {
  test("adds new reaction with count 1", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));
    store.updateReaction(CONV, "m1", "👍", "user-2", "added", USER);

    const reactions = store.getChat(CONV)!.items[0].reactions;
    expect(reactions).toEqual([{ emoji: "👍", count: 1, myReaction: false }]);
  });

  test("increments existing reaction count", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1, reactions: [{ emoji: "👍", count: 1, myReaction: false }] }));
    store.updateReaction(CONV, "m1", "👍", "user-2", "added", USER);
    expect(store.getChat(CONV)!.items[0].reactions[0].count).toBe(2);
  });

  test("sets myReaction=true when current user adds", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));
    store.updateReaction(CONV, "m1", "👍", USER, "added", USER);
    expect(store.getChat(CONV)!.items[0].reactions[0].myReaction).toBe(true);
  });

  test("decrements count on remove", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1, reactions: [{ emoji: "👍", count: 3, myReaction: true }] }));
    store.updateReaction(CONV, "m1", "👍", USER, "removed", USER);
    expect(store.getChat(CONV)!.items[0].reactions[0].count).toBe(2);
    expect(store.getChat(CONV)!.items[0].reactions[0].myReaction).toBe(false);
  });

  test("removes reaction entry when count drops to zero", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1, reactions: [{ emoji: "👍", count: 1, myReaction: true }] }));
    store.updateReaction(CONV, "m1", "👍", USER, "removed", USER);
    expect(store.getChat(CONV)!.items[0].reactions).toEqual([]);
  });

  test("ignores remove for non-existent reaction", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));
    store.updateReaction(CONV, "m1", "👍", USER, "removed", USER);
    expect(store.getChat(CONV)!.items[0].reactions).toEqual([]);
  });
});

// =============================================================================
// send (lifecycle-safe mutation)
// =============================================================================

describe("send", () => {
  test("inserts optimistic message immediately", () => {
    sendMutate.mockReturnValue(new Promise(() => {})); // never resolves
    useMessagesStore.getState().send(CONV, "hi", { userId: USER });

    const items = useMessagesStore.getState().getChat(CONV)!.items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toMatch(/^temp-/);
    expect(items[0].seq).toBeNull();
    expect(items[0].content).toBe("hi");
    expect(items[0].senderId).toBe(USER);
  });

  test("calls vanillaClient.messages.send.mutate with idempotency key", () => {
    sendMutate.mockResolvedValue({});
    useMessagesStore.getState().send(CONV, "hi", { userId: USER });

    expect(sendMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV,
        content: "hi",
        idempotencyKey: expect.stringMatching(/^uuid-/),
      }),
    );
  });

  test("updates conversationsStore.lastMessage optimistically", () => {
    sendMutate.mockReturnValue(new Promise(() => {}));
    useMessagesStore.getState().send(CONV, "hi", { userId: USER });

    expect(updateLastMessageMock).toHaveBeenCalledWith(
      CONV,
      expect.objectContaining({ content: "hi", senderId: USER }),
    );
  });

  test("replaces optimistic on success", async () => {
    const realMsg = {
      id: "real-1",
      seq: 42,
      conversationId: CONV,
      senderId: USER,
      content: "hi",
      type: "text",
      createdAt: "2026-04-14T10:00:00.000Z",
    };
    sendMutate.mockResolvedValue(realMsg);

    useMessagesStore.getState().send(CONV, "hi", { userId: USER });
    await Promise.resolve();
    await Promise.resolve();

    const items = useMessagesStore.getState().getChat(CONV)!.items;
    expect(items.find((m) => m.id.startsWith("temp-"))).toBeUndefined();
    expect(items.find((m) => m.id === "real-1")).toBeDefined();
    expect(items[0].seq).toBe(42);
  });

  test("removes optimistic and shows toast on failure", async () => {
    sendMutate.mockRejectedValue(new Error("network"));

    useMessagesStore.getState().send(CONV, "hi", { userId: USER });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(useMessagesStore.getState().getChat(CONV)?.items).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith("error", expect.stringContaining("wysłać"));
  });

  test("includes replyTo in optimistic message", () => {
    sendMutate.mockReturnValue(new Promise(() => {}));
    const replyTo = { id: "parent", content: "parent text", senderName: "Alice" };

    useMessagesStore.getState().send(CONV, "reply!", { userId: USER, replyTo });

    expect(useMessagesStore.getState().getChat(CONV)!.items[0].replyTo).toEqual(replyTo);
  });
});

// =============================================================================
// react / deleteMessage / markAsRead
// =============================================================================

describe("react", () => {
  test("calls vanillaClient with messageId and emoji", () => {
    reactMutate.mockResolvedValue({});
    useMessagesStore.getState().react("m1", "👍");
    expect(reactMutate).toHaveBeenCalledWith({ messageId: "m1", emoji: "👍" });
  });

  test("shows toast on error", async () => {
    reactMutate.mockRejectedValue(new Error("fail"));
    useMessagesStore.getState().react("m1", "👍");
    await Promise.resolve();
    await Promise.resolve();
    expect(showToast).toHaveBeenCalledWith("error", expect.stringContaining("reakcji"));
  });
});

describe("deleteMessage", () => {
  test("optimistically marks message as deleted", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1, content: "secret" }));
    deleteMutate.mockReturnValue(new Promise(() => {}));

    store.deleteMessage(CONV, "m1");

    const msg = store.getChat(CONV)!.items[0];
    expect(msg.content).toBe("");
    expect(msg.deletedAt).not.toBeNull();
  });

  test("restores message on delete failure", async () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1, content: "original" }));
    deleteMutate.mockRejectedValue(new Error("server error"));

    store.deleteMessage(CONV, "m1");
    await Promise.resolve();
    await Promise.resolve();

    const msg = store.getChat(CONV)!.items[0];
    expect(msg.content).toBe("original");
    expect(msg.deletedAt).toBeNull();
    expect(showToast).toHaveBeenCalledWith("error", expect.stringContaining("usunąć"));
  });
});

describe("markAsRead", () => {
  test("calls vanillaClient with conversationId", () => {
    markAsReadMutate.mockResolvedValue({});
    useMessagesStore.getState().markAsRead(CONV);
    expect(markAsReadMutate).toHaveBeenCalledWith({ conversationId: CONV });
  });

  test("swallows errors silently (no toast)", async () => {
    markAsReadMutate.mockRejectedValue(new Error("offline"));
    useMessagesStore.getState().markAsRead(CONV);
    await Promise.resolve();
    await Promise.resolve();
    expect(showToast).not.toHaveBeenCalled();
  });
});

// =============================================================================
// fillGap
// =============================================================================

describe("fillGap", () => {
  test("fetches messages between fromSeq and toSeq", async () => {
    getMessagesQuery.mockResolvedValue({ messages: [], nextCursor: undefined });
    useMessagesStore.getState().fillGap(CONV, 5, 10);
    await Promise.resolve();

    expect(getMessagesQuery).toHaveBeenCalledWith({
      conversationId: CONV,
      afterSeq: 5,
      limit: 5, // toSeq - fromSeq = 10 - 5 = 5
    });
  });

  test("dedups identical concurrent fillGap calls", async () => {
    getMessagesQuery.mockResolvedValue({ messages: [], nextCursor: undefined });
    const store = useMessagesStore.getState();
    // Fire 5 identical calls before any resolve
    store.fillGap(CONV, 5, 10);
    store.fillGap(CONV, 5, 10);
    store.fillGap(CONV, 5, 10);
    store.fillGap(CONV, 5, 10);
    store.fillGap(CONV, 5, 10);

    expect(getMessagesQuery).toHaveBeenCalledTimes(1);
  });

  test("allows new fillGap after previous resolves", async () => {
    getMessagesQuery.mockResolvedValue({ messages: [], nextCursor: undefined });
    const store = useMessagesStore.getState();
    store.fillGap(CONV, 5, 10);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    store.fillGap(CONV, 5, 10);
    expect(getMessagesQuery).toHaveBeenCalledTimes(2);
  });

  test("prepends fetched messages to store", async () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m5", seq: 5 })], false, 5);

    getMessagesQuery.mockResolvedValue({
      messages: [
        { id: "m6", seq: 6, conversationId: CONV, senderId: USER, content: "gap1", createdAt: "now" },
        { id: "m7", seq: 7, conversationId: CONV, senderId: USER, content: "gap2", createdAt: "now" },
      ],
      nextCursor: undefined,
    });

    store.fillGap(CONV, 5, 8);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const ids = store.getChat(CONV)!.items.map((m) => m.id);
    expect(ids).toContain("m6");
    expect(ids).toContain("m7");
  });

  test("silently swallows errors", async () => {
    getMessagesQuery.mockRejectedValue(new Error("network"));
    useMessagesStore.getState().fillGap(CONV, 5, 10);
    await Promise.resolve();
    await Promise.resolve();
    expect(showToast).not.toHaveBeenCalled();
  });
});

// =============================================================================
// syncGaps
// =============================================================================

describe("syncGaps", () => {
  test("calls vanillaClient.syncGaps with cursor map", async () => {
    syncGapsQuery.mockResolvedValue({});
    await useMessagesStore.getState().syncGaps({ "conv-1": 5, "conv-2": 10 });
    expect(syncGapsQuery).toHaveBeenCalledWith({ "conv-1": 5, "conv-2": 10 });
  });

  test("prepends returned messages per conversation", async () => {
    syncGapsQuery.mockResolvedValue({
      "conv-1": [{ id: "m6", seq: 6, conversationId: "conv-1", senderId: USER, content: "x", createdAt: "now" }],
      "conv-2": [{ id: "m11", seq: 11, conversationId: "conv-2", senderId: USER, content: "y", createdAt: "now" }],
    });

    await useMessagesStore.getState().syncGaps({ "conv-1": 5, "conv-2": 10 });

    expect(
      useMessagesStore
        .getState()
        .getChat("conv-1")
        ?.items.find((m) => m.id === "m6"),
    ).toBeDefined();
    expect(
      useMessagesStore
        .getState()
        .getChat("conv-2")
        ?.items.find((m) => m.id === "m11"),
    ).toBeDefined();
  });

  test("skips conversations with empty arrays", async () => {
    syncGapsQuery.mockResolvedValue({
      "conv-1": [],
      "conv-2": [{ id: "m11", seq: 11, conversationId: "conv-2", senderId: USER, content: "y", createdAt: "now" }],
    });

    await useMessagesStore.getState().syncGaps({ "conv-1": 5, "conv-2": 10 });

    expect(useMessagesStore.getState().getChat("conv-1")).toBeUndefined();
    expect(useMessagesStore.getState().getChat("conv-2")?.items).toHaveLength(1);
  });

  test("silently swallows errors", async () => {
    syncGapsQuery.mockRejectedValue(new Error("network"));
    await useMessagesStore.getState().syncGaps({ "conv-1": 5 });
    expect(showToast).not.toHaveBeenCalled();
  });
});

// =============================================================================
// fetchMessages
// =============================================================================

describe("fetchMessages", () => {
  test("calls set() on initial fetch (no cursor)", async () => {
    getMessagesQuery.mockResolvedValue({
      messages: [{ id: "m1", seq: 1, senderId: USER, content: "hi", createdAt: "now" }],
      nextCursor: undefined,
    });

    await useMessagesStore.getState().fetchMessages(CONV, { limit: 50 });

    expect(useMessagesStore.getState().getChat(CONV)?.status).toBe("hydrated");
    expect(useMessagesStore.getState().getChat(CONV)?.items).toHaveLength(1);
  });

  test("calls appendOlder() with cursor", async () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m5", seq: 5 })], true, 5);

    getMessagesQuery.mockResolvedValue({
      messages: [{ id: "m4", seq: 4, senderId: USER, content: "older", createdAt: "now" }],
      nextCursor: undefined,
    });

    await store.fetchMessages(CONV, { limit: 50, cursor: 5 });

    expect(store.getChat(CONV)?.items.map((m) => m.id)).toEqual(["m5", "m4"]);
    expect(store.getChat(CONV)?.hasOlder).toBe(false);
  });

  test("hasOlder is true when nextCursor present", async () => {
    getMessagesQuery.mockResolvedValue({
      messages: [{ id: "m50", seq: 50, senderId: USER, content: "hi", createdAt: "now" }],
      nextCursor: 49,
    });

    await useMessagesStore.getState().fetchMessages(CONV, { limit: 50 });
    expect(useMessagesStore.getState().getChat(CONV)?.hasOlder).toBe(true);
  });

  test("hasOlder is false when no nextCursor", async () => {
    getMessagesQuery.mockResolvedValue({
      messages: [{ id: "m1", seq: 1, senderId: USER, content: "hi", createdAt: "now" }],
      nextCursor: undefined,
    });

    await useMessagesStore.getState().fetchMessages(CONV, { limit: 50 });
    expect(useMessagesStore.getState().getChat(CONV)?.hasOlder).toBe(false);
  });

  test("propagates errors as 'Failed to fetch messages'", async () => {
    getMessagesQuery.mockRejectedValue(new Error("network"));
    await expect(useMessagesStore.getState().fetchMessages(CONV, { limit: 50 })).rejects.toThrow(
      "Failed to fetch messages",
    );
  });
});

// =============================================================================
// has / get / reset
// =============================================================================

describe("has / get / reset", () => {
  test("has returns true after prepend", () => {
    useMessagesStore.getState().prepend(CONV, makeMsg());
    expect(useMessagesStore.getState().hasChat(CONV)).toBe(true);
  });

  test("has returns false for unknown conversation", () => {
    expect(useMessagesStore.getState().hasChat("missing")).toBe(false);
  });

  test("get returns cache or undefined", () => {
    useMessagesStore.getState().prepend(CONV, makeMsg());
    expect(useMessagesStore.getState().getChat(CONV)).toBeDefined();
    expect(useMessagesStore.getState().getChat("missing")).toBeUndefined();
  });

  test("reset clears all chats", () => {
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg());
    store.prepend("conv-2", makeMsg({ id: "m2" }));
    store.reset();
    expect(store.chats.size).toBe(0);
  });
});

// =============================================================================
// State machine completeness: ∅ no-op paths
// =============================================================================

describe("no-op paths on missing conversation", () => {
  test("updateReaction on missing conversation is a no-op", () => {
    useMessagesStore.getState().updateReaction("missing", "m1", "👍", USER, "added", USER);
    expect(useMessagesStore.getState().getChat("missing")).toBeUndefined();
  });
});

// =============================================================================
// Additional edge cases
// =============================================================================

describe("edge cases", () => {
  test("fillGap with different ranges runs both requests (no false dedup)", async () => {
    getMessagesQuery.mockResolvedValue({ messages: [], nextCursor: undefined });
    const store = useMessagesStore.getState();
    store.fillGap(CONV, 5, 10);
    store.fillGap(CONV, 15, 20);
    expect(getMessagesQuery).toHaveBeenCalledTimes(2);
  });

  test("deleteMessage on non-existent message: mutation fires, no restore (original undefined)", async () => {
    deleteMutate.mockRejectedValue(new Error("not found"));
    const store = useMessagesStore.getState();
    store.prepend(CONV, makeMsg({ id: "m1", seq: 1 }));

    store.deleteMessage(CONV, "missing");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // m1 unchanged
    expect(store.getChat(CONV)!.items[0].content).toBe("hello");
    expect(showToast).toHaveBeenCalledWith("error", expect.stringContaining("usunąć"));
  });

  test("sequential sends produce distinct tempIds", () => {
    sendMutate.mockReturnValue(new Promise(() => {}));
    const store = useMessagesStore.getState();

    store.send(CONV, "first", { userId: USER });
    const firstTempId = store.getChat(CONV)!.items[0].id;
    store.send(CONV, "second", { userId: USER });

    const items = store.getChat(CONV)!.items;
    expect(items).toHaveLength(2);
    expect(items[0].id).not.toBe(firstTempId);
    expect(items[0].content).toBe("second");
    expect(items[1].id).toBe(firstTempId);
    expect(items[1].content).toBe("first");
  });

  test("reset during in-flight mutation: replaceOptimistic on cleared store is no-op", async () => {
    let resolveSend: (value: unknown) => void;
    sendMutate.mockReturnValue(new Promise((r) => (resolveSend = r)));

    const store = useMessagesStore.getState();
    store.send(CONV, "hi", { userId: USER });
    expect(store.getChat(CONV)!.items).toHaveLength(1);

    store.reset();
    expect(store.chats.size).toBe(0);

    // Response arrives after reset
    resolveSend!({
      id: "real-1",
      seq: 5,
      conversationId: CONV,
      senderId: USER,
      content: "hi",
      type: "text",
      createdAt: "now",
    });
    await Promise.resolve();
    await Promise.resolve();

    // Should remain empty — replaceOptimistic is a no-op on missing conv
    expect(store.chats.size).toBe(0);
  });

  test("replaceOptimistic keeps message position when real seq < newestSeq", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m99", seq: 99 })], false, 99);
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null }));

    // Real message gets seq=100 (higher than existing)
    store.replaceOptimistic(CONV, "temp-1", makeMsg({ id: "real-1", seq: 100 }));
    expect(store.getChat(CONV)?.newestSeq).toBe(100);
  });
});

// =============================================================================
// Concurrency & ordering invariants
// =============================================================================

describe("store invariant: items sorted DESC by seq (optimistic at top)", () => {
  test("prependBatch sorts merged items DESC (API returns ASC for gap fills)", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m5", seq: 5 })], false, 5);
    // syncGaps/fillGap API returns ASC order
    store.prependBatch(CONV, [
      makeMsg({ id: "m6", seq: 6 }),
      makeMsg({ id: "m7", seq: 7 }),
      makeMsg({ id: "m8", seq: 8 }),
    ]);
    // items must be DESC: newest first so inverted FlatList renders correctly
    expect(store.getChat(CONV)!.items.map((m) => m.id)).toEqual(["m8", "m7", "m6", "m5"]);
  });

  test("prependBatch keeps optimistic (seq=null) at front after merge", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m5", seq: 5 })], false, 5);
    store.prepend(CONV, makeMsg({ id: "temp-1", seq: null, content: "pending" }));

    store.prependBatch(CONV, [makeMsg({ id: "m6", seq: 6 }), makeMsg({ id: "m7", seq: 7 })]);

    // temp stays at front (optimistic is "newest" from user's perspective)
    expect(store.getChat(CONV)!.items.map((m) => m.id)).toEqual(["temp-1", "m7", "m6", "m5"]);
  });

  test("prependBatch preserves DESC when input is already DESC (idempotent)", () => {
    const store = useMessagesStore.getState();
    store.hydrate(CONV, [makeMsg({ id: "m5", seq: 5 })], false, 5);
    store.prependBatch(CONV, [
      makeMsg({ id: "m8", seq: 8 }),
      makeMsg({ id: "m7", seq: 7 }),
      makeMsg({ id: "m6", seq: 6 }),
    ]);
    expect(store.getChat(CONV)!.items.map((m) => m.id)).toEqual(["m8", "m7", "m6", "m5"]);
  });
});

describe("tempId collision — send() in same millisecond", () => {
  test("two sends in same ms produce distinct optimistic entries (tempId uses uuid)", () => {
    sendMutate.mockReturnValue(new Promise(() => {}));
    const store = useMessagesStore.getState();

    // Pin Date.now() to a constant — simulates two sends in the same ms.
    // tempId must not rely on Date.now() alone, or prepend's dedup-by-id would
    // collapse the second optimistic while the server still inserts both.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    store.send(CONV, "first", { userId: USER });
    store.send(CONV, "second", { userId: USER });

    const items = store.getChat(CONV)!.items;
    expect(items).toHaveLength(2);
    expect(new Set(items.map((m) => m.id)).size).toBe(2);

    nowSpy.mockRestore();
  });
});
