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
    sendDefaultPii: true,
    beforeSend(event) {
      const headers = event.request?.headers;
      if (headers) {
        for (const key of Object.keys(headers)) {
          if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
            headers[key] = "[redacted]";
          }
        }
      }
      return event;
    },
  });
  initialized = true;
}

export { Sentry };
