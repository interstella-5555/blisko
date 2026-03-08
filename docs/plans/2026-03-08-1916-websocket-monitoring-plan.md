# WebSocket Monitoring — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add real-time WebSocket observability (connections, throughput, auth failures, rate limit hits) to Prometheus and the metrics summary endpoint.

**Architecture:** A dedicated `ws-metrics.ts` module (following the `queue-metrics.ts` pattern) tracks in-memory counters. Hook calls are placed in `handler.ts` at connection open/close, auth, message handling, broadcast, and rate limit points. Prometheus metrics are updated inline. The summary endpoint gets a new `websocket` section.

**Tech Stack:** `prom-client` (Gauge, Counter), Bun WebSocket API, existing metrics infrastructure

**Design Doc:** `docs/plans/2026-03-08-1915-websocket-monitoring-design.md`

---

## Task 1: Add Prometheus metric definitions for WebSocket

**Files:**
- Modify: `apps/api/src/services/prometheus.ts:39-41`

**Step 1: Add WS metrics after BullMQ metrics**

After line 41 (end of `bullmqQueueDepth`), add:

```ts
// WebSocket metrics
export const wsConnectionsActive = new Gauge({
  name: "ws_connections_active",
  help: "Currently active WebSocket connections",
  registers: [registry],
});

export const wsSubscriptionsActive = new Gauge({
  name: "ws_subscriptions_active",
  help: "Currently active WebSocket conversation subscriptions",
  registers: [registry],
});

export const wsAuthTotal = new Counter({
  name: "ws_auth_total",
  help: "Total WebSocket authentication attempts",
  labelNames: ["result"] as const,
  registers: [registry],
});

export const wsEventsInboundTotal = new Counter({
  name: "ws_events_inbound_total",
  help: "Total inbound WebSocket messages from clients",
  labelNames: ["type"] as const,
  registers: [registry],
});

export const wsEventsOutboundTotal = new Counter({
  name: "ws_events_outbound_total",
  help: "Total outbound WebSocket messages to clients",
  labelNames: ["event_type"] as const,
  registers: [registry],
});

export const wsRateLimitHitsTotal = new Counter({
  name: "ws_rate_limit_hits_total",
  help: "Total WebSocket messages dropped by rate limiting",
  labelNames: ["limit"] as const,
  registers: [registry],
});
```

**Step 2: Commit**

```
Add WebSocket Prometheus metric definitions (BLI-69)
```

---

## Task 2: Create `ws-metrics.ts` module

**Files:**
- Create: `apps/api/src/services/ws-metrics.ts`

**Step 1: Write the module**

```ts
import {
  wsAuthTotal,
  wsConnectionsActive,
  wsEventsInboundTotal,
  wsEventsOutboundTotal,
  wsRateLimitHitsTotal,
  wsSubscriptionsActive,
} from "./prometheus";

interface WsStats {
  activeConnections: number;
  activeSubscriptions: number;
  auth: { success: number; failed: number };
  inbound: Map<string, number>;
  outbound: Map<string, number>;
  rateLimitHits: Map<string, number>;
}

const stats: WsStats = {
  activeConnections: 0,
  activeSubscriptions: 0,
  auth: { success: 0, failed: 0 },
  inbound: new Map(),
  outbound: new Map(),
  rateLimitHits: new Map(),
};

export function wsConnected(): void {
  stats.activeConnections++;
  wsConnectionsActive.inc();
}

export function wsDisconnected(subscriptionCount: number): void {
  stats.activeConnections = Math.max(0, stats.activeConnections - 1);
  stats.activeSubscriptions = Math.max(0, stats.activeSubscriptions - subscriptionCount);
  wsConnectionsActive.dec();
  wsSubscriptionsActive.dec(subscriptionCount);
}

export function wsSubscribed(): void {
  stats.activeSubscriptions++;
  wsSubscriptionsActive.inc();
}

export function wsAuthResult(success: boolean): void {
  if (success) {
    stats.auth.success++;
    wsAuthTotal.inc({ result: "success" });
  } else {
    stats.auth.failed++;
    wsAuthTotal.inc({ result: "failed" });
  }
}

export function wsInbound(type: string): void {
  stats.inbound.set(type, (stats.inbound.get(type) ?? 0) + 1);
  wsEventsInboundTotal.inc({ type });
}

export function wsOutbound(eventType: string, recipientCount: number): void {
  stats.outbound.set(eventType, (stats.outbound.get(eventType) ?? 0) + recipientCount);
  wsEventsOutboundTotal.inc({ event_type: eventType }, recipientCount);
}

export function wsRateLimitHit(limitName: string): void {
  stats.rateLimitHits.set(limitName, (stats.rateLimitHits.get(limitName) ?? 0) + 1);
  wsRateLimitHitsTotal.inc({ limit: limitName });
}

export function getWsStats() {
  return {
    activeConnections: stats.activeConnections,
    activeSubscriptions: stats.activeSubscriptions,
    auth: { ...stats.auth },
    inbound: Object.fromEntries(stats.inbound),
    outbound: Object.fromEntries(stats.outbound),
    rateLimitHits: Object.fromEntries(stats.rateLimitHits),
  };
}
```

**Step 2: Commit**

```
Add WebSocket metrics collector module (BLI-69)
```

---

## Task 3: Write tests for `ws-metrics.ts`

**Files:**
- Create: `apps/api/__tests__/ws-metrics.test.ts`

**Step 1: Write the test**

```ts
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
    wsDisconnected(2); // disconnecting removes 2 subscriptions
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
    // Disconnect more than connected — should floor at 0
    const before = getWsStats().activeConnections;
    for (let i = 0; i < before + 5; i++) wsDisconnected(0);
    expect(getWsStats().activeConnections).toBe(0);
    // Restore
    for (let i = 0; i < before; i++) wsConnected();
  });
});
```

**Step 2: Run tests**

Run: `pnpm --filter @repo/api test`

Expected: All pass.

**Step 3: Commit**

```
Add WebSocket metrics tests (BLI-69)
```

---

## Task 4: Hook `ws-metrics` into `handler.ts`

**Files:**
- Modify: `apps/api/src/ws/handler.ts`

**Step 1: Add import**

At the top of `handler.ts`, add:

```ts
import { wsAuthResult, wsConnected, wsDisconnected, wsInbound, wsOutbound, wsRateLimitHit, wsSubscribed } from "@/services/ws-metrics";
```

**Step 2: Hook `open` callback (line 67-69)**

Replace:
```ts
  async open(ws: ServerWebSocket<WSData>) {
    clients.add(ws);
  },
```

With:
```ts
  async open(ws: ServerWebSocket<WSData>) {
    clients.add(ws);
    wsConnected();
  },
```

**Step 3: Hook `close` callback (line 117-119)**

Replace:
```ts
  close(ws: ServerWebSocket<WSData>) {
    clients.delete(ws);
  },
```

With:
```ts
  close(ws: ServerWebSocket<WSData>) {
    clients.delete(ws);
    wsDisconnected(ws.data.subscriptions?.size ?? 0);
  },
```

**Step 4: Hook auth result (lines 78-88)**

Replace:
```ts
        if (userId) {
          ws.data.userId = userId;

          // Subscribe to all user's conversations
          const convIds = await getUserConversations(userId);
          ws.data.subscriptions = new Set(convIds);

          ws.send(JSON.stringify({ type: "auth", status: "ok", conversationIds: convIds }));
        } else {
          ws.send(JSON.stringify({ type: "auth", status: "error", message: "Invalid token" }));
        }
```

With:
```ts
        if (userId) {
          ws.data.userId = userId;

          // Subscribe to all user's conversations
          const convIds = await getUserConversations(userId);
          ws.data.subscriptions = new Set(convIds);

          wsAuthResult(true);
          wsInbound("auth");
          // Track initial subscriptions from auth
          for (let i = 0; i < convIds.length; i++) wsSubscribed();

          ws.send(JSON.stringify({ type: "auth", status: "ok", conversationIds: convIds }));
        } else {
          wsAuthResult(false);
          wsInbound("auth");
          ws.send(JSON.stringify({ type: "auth", status: "error", message: "Invalid token" }));
        }
```

**Step 5: Hook global rate limit (line 93)**

Replace:
```ts
      if (ws.data.userId && checkWsRateLimit(ws.data.userId, "ws", 30, 60_000)) return;
```

With:
```ts
      if (ws.data.userId && checkWsRateLimit(ws.data.userId, "ws", 30, 60_000)) {
        wsRateLimitHit("global");
        return;
      }
```

**Step 6: Hook typing with rate limit tracking (lines 96-105)**

Replace:
```ts
      if (data.type === "typing" && ws.data.userId && data.conversationId) {
        // Rate limit typing indicators: 10 per 10 seconds (silent drop)
        if (checkWsRateLimit(ws.data.userId, "typing", 10, 10_000)) return;
        ee.emit(`typing:${data.conversationId}`, {
          conversationId: data.conversationId,
          userId: ws.data.userId,
          isTyping: data.isTyping ?? true,
        });
        return;
      }
```

With:
```ts
      if (data.type === "typing" && ws.data.userId && data.conversationId) {
        // Rate limit typing indicators: 10 per 10 seconds (silent drop)
        if (checkWsRateLimit(ws.data.userId, "typing", 10, 10_000)) {
          wsRateLimitHit("typing");
          return;
        }
        wsInbound("typing");
        ee.emit(`typing:${data.conversationId}`, {
          conversationId: data.conversationId,
          userId: ws.data.userId,
          isTyping: data.isTyping ?? true,
        });
        return;
      }
```

**Step 7: Hook subscribe (lines 108-111)**

Replace:
```ts
      if (data.type === "subscribe" && data.conversationId) {
        ws.data.subscriptions.add(data.conversationId);
        return;
      }
```

With:
```ts
      if (data.type === "subscribe" && data.conversationId) {
        ws.data.subscriptions.add(data.conversationId);
        wsInbound("subscribe");
        wsSubscribed();
        return;
      }
```

**Step 8: Hook `broadcastToUser` (line 134-145)**

Replace:
```ts
function broadcastToUser(userId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.data.userId === userId) {
      try {
        ws.send(msg);
      } catch {
        // Client disconnected
      }
    }
  }
}
```

With:
```ts
function broadcastToUser(userId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  const eventType = (payload as { type?: string })?.type ?? "unknown";
  let sent = 0;
  for (const ws of clients) {
    if (ws.data.userId === userId) {
      try {
        ws.send(msg);
        sent++;
      } catch {
        // Client disconnected
      }
    }
  }
  if (sent > 0) wsOutbound(eventType, sent);
}
```

**Step 9: Hook `broadcastToConversation` (line 148-159)**

Replace:
```ts
function broadcastToConversation(conversationId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.data.subscriptions?.has(conversationId)) {
      try {
        ws.send(msg);
      } catch {
        // Client disconnected
      }
    }
  }
}
```

With:
```ts
function broadcastToConversation(conversationId: string, payload: unknown) {
  const msg = JSON.stringify(payload);
  const eventType = (payload as { type?: string })?.type ?? "unknown";
  let sent = 0;
  for (const ws of clients) {
    if (ws.data.subscriptions?.has(conversationId)) {
      try {
        ws.send(msg);
        sent++;
      } catch {
        // Client disconnected
      }
    }
  }
  if (sent > 0) wsOutbound(eventType, sent);
}
```

**Step 10: Commit**

```
Hook WebSocket metrics into WS handler (BLI-69)
```

---

## Task 5: Add WebSocket section to metrics summary

**Files:**
- Modify: `apps/api/src/services/metrics-summary.ts`

**Step 1: Import ws-metrics**

At the top of `metrics-summary.ts`, add:

```ts
import { getWsStats } from "./ws-metrics";
```

**Step 2: Add websocket to the summary response**

Replace lines 12-20:
```ts
  const [overview, slowest, errors, sloBreaches, queues] = await Promise.all([
    getOverview(since),
    getSlowestEndpoints(since),
    getTopErrors(since),
    checkSloBreaches(since),
    getQueueSummary(),
  ]);

  return { windowHours, since: since.toISOString(), overview, slowest, errors, sloBreaches, queues };
```

With:
```ts
  const [overview, slowest, errors, sloBreaches, queues] = await Promise.all([
    getOverview(since),
    getSlowestEndpoints(since),
    getTopErrors(since),
    checkSloBreaches(since),
    getQueueSummary(),
  ]);

  const websocket = getWsStats();

  return { windowHours, since: since.toISOString(), overview, slowest, errors, sloBreaches, queues, websocket };
```

**Step 3: Commit**

```
Add WebSocket stats to metrics summary endpoint (BLI-69)
```

---

## Task 6: Final verification

**Step 1: Run typecheck**

Run: `pnpm --filter @repo/api typecheck`

Expected: 0 errors.

**Step 2: Run biome**

Run: `npx @biomejs/biome check .`

Expected: 0 errors.

**Step 3: Run all tests**

Run: `pnpm --filter @repo/api test`

Expected: All pass.

**Step 4: Update architecture doc**

In `docs/architecture/instrumentation.md`, update milestone 2b section. Replace:

```markdown
### Milestone 2b — Intelligent monitoring
- WebSocket monitoring (connections, throughput, auth failures)
- Dependency health pings (DB, Redis, S3 latency)
- Anomaly detection (rate of change, not just thresholds)
```

With:

```markdown
### Milestone 2b — WebSocket monitoring ✅
- `ws-metrics.ts` module: in-memory counters for connections, subscriptions, auth, throughput, rate limit hits
- Prometheus: `ws_connections_active`, `ws_subscriptions_active`, `ws_auth_total`, `ws_events_inbound_total`, `ws_events_outbound_total`, `ws_rate_limit_hits_total`
- `websocket` section in `/api/metrics/summary` endpoint
- Hooks in `handler.ts`: open/close, auth success/failure, inbound messages, outbound broadcasts, rate limit drops
- Dependency health pings → BLI-91
- Anomaly detection → BLI-92
```

Also update the Prometheus endpoint section (line 107-111) to include WS metrics:

```markdown
**`GET /metrics`** — Prometheus text format (prom-client):
- `http_request_duration_ms` histogram (buckets: 10, 50, 100, 250, 500, 1000, 2500, 5000)
- `http_requests_total` counter (labels: endpoint, status, method)
- `bullmq_jobs_total` counter (labels: queue, status)
- `bullmq_job_duration_ms` histogram (labels: queue)
- `bullmq_queue_depth` gauge (labels: queue, state)
- `ws_connections_active` gauge
- `ws_subscriptions_active` gauge
- `ws_auth_total` counter (labels: result)
- `ws_events_inbound_total` counter (labels: type)
- `ws_events_outbound_total` counter (labels: event_type)
- `ws_rate_limit_hits_total` counter (labels: limit)
```

**Step 5: Commit**

```
Update instrumentation architecture doc for milestone 2b (BLI-69)
```
