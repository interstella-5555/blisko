import * as Sentry from "@sentry/bun";

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
  });
  initialized = true;
}

export { Sentry };
