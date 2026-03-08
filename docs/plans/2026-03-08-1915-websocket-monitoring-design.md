# WebSocket Monitoring — Design

**Ticket:** BLI-69 (milestone 2b)
**Date:** 2026-03-08
**Parent design:** `docs/architecture/instrumentation.md`

## Goal

Add real-time WebSocket observability: active connections, message throughput per event type, auth success/failure rate, and rate limit hit tracking. All in-memory, exposed via Prometheus metrics and `/api/metrics/summary`.

## Architecture

### Module: `ws-metrics.ts`

In-memory counters following the `queue-metrics.ts` pattern. No DB persistence — WS metrics are real-time by nature; Prometheus scrape handles history.

**State:**

| Field | Type | Description |
|-------|------|-------------|
| `activeConnections` | number (gauge) | Inc on open, dec on close |
| `activeSubscriptions` | number (gauge) | Inc on subscribe, dec on close |
| `authAttempts` | `{ success, failed }` | Auth result tracking |
| `inboundByType` | `Map<string, number>` | Client → server: "auth", "typing", "subscribe" |
| `outboundByType` | `Map<string, number>` | Server → client: "newMessage", "newWave", etc. |
| `rateLimitHits` | `Map<string, number>` | Dropped messages: "global", "typing" |

**Exports:**
- `wsConnected()` / `wsDisconnected(subscriptionCount)` — connection lifecycle
- `wsAuthResult(success: boolean)` — auth tracking
- `wsInbound(type: string)` — client → server message
- `wsOutbound(eventType: string, count: number)` — server → client broadcast (count = recipients)
- `wsRateLimitHit(limitName: string)` — dropped message
- `getWsStats()` — snapshot for summary endpoint

### Hooks in `handler.ts`

| Location | Hook |
|----------|------|
| `open` callback | `wsConnected()` |
| `close` callback | `wsDisconnected(ws.data.subscriptions.size)` |
| Auth success | `wsAuthResult(true)` |
| Auth failure (bad token) | `wsAuthResult(false)` |
| Typing message received | `wsInbound("typing")` |
| Subscribe message received | `wsInbound("subscribe")` |
| Global rate limit drop (30/min) | `wsRateLimitHit("global")` |
| Typing rate limit drop (10/10s) | `wsRateLimitHit("typing")` |
| `broadcastToUser()` | `wsOutbound(payload.type, recipientCount)` |
| `broadcastToConversation()` | `wsOutbound("typing", recipientCount)` |

### Prometheus metrics (in `prometheus.ts`)

| Metric | Type | Labels |
|--------|------|--------|
| `ws_connections_active` | Gauge | — |
| `ws_subscriptions_active` | Gauge | — |
| `ws_auth_total` | Counter | `result`: success/failed |
| `ws_events_inbound_total` | Counter | `type`: auth/typing/subscribe |
| `ws_events_outbound_total` | Counter | `event_type`: newMessage/newWave/... |
| `ws_rate_limit_hits_total` | Counter | `limit`: global/typing |

### Summary endpoint addition

New `websocket` section in `/api/metrics/summary` response:

```json
{
  "websocket": {
    "activeConnections": 42,
    "activeSubscriptions": 156,
    "auth": { "success": 1200, "failed": 15 },
    "inbound": { "typing": 890, "subscribe": 340, "auth": 1215 },
    "outbound": { "newMessage": 2300, "newWave": 120, "analysisReady": 45 },
    "rateLimitHits": { "global": 3, "typing": 12 }
  }
}
```

## Non-goals

- No DB schema changes (all in-memory)
- No per-user connection tracking (aggregate only)
- No connection duration tracking (future milestone)
- Dependency health pings → separate ticket
- Anomaly detection → separate ticket
