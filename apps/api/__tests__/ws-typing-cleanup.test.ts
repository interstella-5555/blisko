import { describe, expect, it } from "vitest";
import { ee } from "../src/ws/events";
import { ensureTypingListener } from "../src/ws/handler";

describe("typing listener cleanup", () => {
  it("registers a listener for a conversation", () => {
    const convId = "test-conv-register";
    const eventName = `typing:${convId}`;

    ensureTypingListener(convId);
    expect(ee.listenerCount(eventName)).toBe(1);

    // Calling again should not add a duplicate
    ensureTypingListener(convId);
    expect(ee.listenerCount(eventName)).toBe(1);

    // Cleanup
    ee.emit("conversationDeleted", { userId: "u1", conversationId: convId });
  });

  it("removes the listener when conversation is deleted", () => {
    const convId = "test-conv-delete";
    const eventName = `typing:${convId}`;

    ensureTypingListener(convId);
    expect(ee.listenerCount(eventName)).toBe(1);

    // Simulate conversation deletion
    ee.emit("conversationDeleted", { userId: "u1", conversationId: convId });

    expect(ee.listenerCount(eventName)).toBe(0);
  });

  it("allows re-registering after deletion", () => {
    const convId = "test-conv-reregister";
    const eventName = `typing:${convId}`;

    ensureTypingListener(convId);
    ee.emit("conversationDeleted", { userId: "u1", conversationId: convId });
    expect(ee.listenerCount(eventName)).toBe(0);

    // Re-register should work
    ensureTypingListener(convId);
    expect(ee.listenerCount(eventName)).toBe(1);

    // Cleanup
    ee.emit("conversationDeleted", { userId: "u1", conversationId: convId });
  });
});
