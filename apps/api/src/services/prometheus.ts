import { Counter, Histogram, Registry } from "prom-client";

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
