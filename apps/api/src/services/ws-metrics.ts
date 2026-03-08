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
