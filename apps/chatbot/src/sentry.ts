import * as Sentry from "@sentry/bun";

const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "x-internal-secret"]);

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? "local",
    release: process.env.RAILWAY_DEPLOYMENT_ID,
    tracesSampleRate: 0,
    // Same rationale as the api service — the chatbot calls /trpc with bearer tokens,
    // so the http breadcrumbs would otherwise include `Authorization` headers.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.data && typeof crumb.data === "object") {
            for (const key of Object.keys(crumb.data)) {
              if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
                (crumb.data as Record<string, unknown>)[key] = "[redacted]";
              }
            }
            if ("body" in crumb.data) (crumb.data as Record<string, unknown>).body = undefined;
          }
        }
      }
      return event;
    },
  });
  initialized = true;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const lastReportedAt = new Map<string, number>();

/**
 * Capture an exception, but only once per `source` per RATE_LIMIT_WINDOW_MS.
 *
 * The chatbot polls every 3s; if a transient outage (DB/API/network) keeps throwing,
 * an unrate-limited capture path emits ~20 events/min/source — which would burn
 * Bugsink ingest quota and drown the dashboard without surfacing more information
 * than a single capture would. Sentry's built-in `eventsPerSecond` is per-DSN, not
 * per-source, so it doesn't help here.
 */
export function captureExceptionRateLimited(
  source: string,
  err: unknown,
  context?: Parameters<typeof Sentry.captureException>[1],
): void {
  const now = Date.now();
  const last = lastReportedAt.get(source) ?? 0;
  if (now - last < RATE_LIMIT_WINDOW_MS) return;
  lastReportedAt.set(source, now);
  Sentry.captureException(err, context);
}

export { Sentry };
