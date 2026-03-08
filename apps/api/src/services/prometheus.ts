import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_ms",
  help: "HTTP request duration in milliseconds",
  labelNames: ["method", "endpoint", "status_code"] as const,
  buckets: [10, 25, 50, 100, 200, 500, 1000, 2500, 5000],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "endpoint", "status_code"] as const,
  registers: [registry],
});

export const bullmqJobsTotal = new Counter({
  name: "bullmq_jobs_total",
  help: "Total BullMQ jobs by queue and status",
  labelNames: ["queue", "status"] as const,
  registers: [registry],
});

export const bullmqJobDuration = new Histogram({
  name: "bullmq_job_duration_ms",
  help: "BullMQ job processing duration in milliseconds",
  labelNames: ["queue"] as const,
  buckets: [100, 500, 1000, 2500, 5000, 10000, 30000, 60000],
  registers: [registry],
});

export const bullmqQueueDepth = new Gauge({
  name: "bullmq_queue_depth",
  help: "Current BullMQ queue depth by state",
  labelNames: ["queue", "state"] as const,
  registers: [registry],
});

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
