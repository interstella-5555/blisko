import { describe, expect, it } from "vitest";
import {
  getWsStats,
  wsAuthResult,
  wsConnected,
  wsDisconnected,
  wsInbound,
  wsOutbound,
  wsRateLimitHit,
  wsSubscribed,
} from "../src/services/ws-metrics";

describe("ws-metrics", () => {
  it("tracks connections", () => {
    const before = getWsStats().activeConnections;
    wsConnected();
    wsConnected();
    expect(getWsStats().activeConnections).toBe(before + 2);
    wsDisconnected(0);
    expect(getWsStats().activeConnections).toBe(before + 1);
  });

  it("tracks subscriptions via connect and disconnect", () => {
    const before = getWsStats().activeSubscriptions;
    wsSubscribed();
    wsSubscribed();
    wsSubscribed();
    expect(getWsStats().activeSubscriptions).toBe(before + 3);
    wsDisconnected(2);
    expect(getWsStats().activeSubscriptions).toBe(before + 1);
  });

  it("tracks auth results", () => {
    const before = getWsStats().auth;
    wsAuthResult(true);
    wsAuthResult(true);
    wsAuthResult(false);
    const after = getWsStats().auth;
    expect(after.success).toBe(before.success + 2);
    expect(after.failed).toBe(before.failed + 1);
  });

  it("tracks inbound events by type", () => {
    wsInbound("typing");
    wsInbound("typing");
    wsInbound("subscribe");
    const stats = getWsStats();
    expect(stats.inbound.typing).toBeGreaterThanOrEqual(2);
    expect(stats.inbound.subscribe).toBeGreaterThanOrEqual(1);
  });

  it("tracks outbound events with recipient count", () => {
    wsOutbound("newMessage", 3);
    wsOutbound("newMessage", 2);
    wsOutbound("newWave", 1);
    const stats = getWsStats();
    expect(stats.outbound.newMessage).toBeGreaterThanOrEqual(5);
    expect(stats.outbound.newWave).toBeGreaterThanOrEqual(1);
  });

  it("tracks rate limit hits", () => {
    wsRateLimitHit("global");
    wsRateLimitHit("global");
    wsRateLimitHit("typing");
    const stats = getWsStats();
    expect(stats.rateLimitHits.global).toBeGreaterThanOrEqual(2);
    expect(stats.rateLimitHits.typing).toBeGreaterThanOrEqual(1);
  });

  it("does not go below zero on connections", () => {
    const before = getWsStats().activeConnections;
    for (let i = 0; i < before + 5; i++) wsDisconnected(0);
    expect(getWsStats().activeConnections).toBe(0);
    for (let i = 0; i < before; i++) wsConnected();
  });
});
