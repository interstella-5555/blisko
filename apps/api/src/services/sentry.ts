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
    // sendDefaultPii: false (Sentry default). The previous true setting would auto-attach
    // request body, query string, cookies, and breadcrumb payloads — which include OTP
    // codes (POST /api/auth/email-otp/verify-email), the AI-log shared secret payload
    // (POST /internal/ai-log), and uploaded file bytes (POST /uploads). Bugsink being
    // self-hosted is a privacy mitigation, not a license to ship raw user input.
    sendDefaultPii: false,
    beforeSend(event) {
      // Even with sendDefaultPii: false the SDK still attaches request headers via
      // requestDataIntegration's defaults. Strip sensitive ones — bearer tokens,
      // Better Auth cookies, the /internal/ai-log shared secret.
      const headers = event.request?.headers;
      if (headers) {
        for (const key of Object.keys(headers)) {
          if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
            headers[key] = "[redacted]";
          }
        }
      }
      // Drop request body / query string / cookies even if some integration tries to
      // re-attach them. Belt-and-suspenders against a future SDK default change.
      if (event.request) {
        event.request.data = undefined;
        event.request.query_string = undefined;
        event.request.cookies = undefined;
      }
      // Same scrub for breadcrumb data (e.g. http breadcrumbs include outgoing
      // request bodies if instrumentation captured them).
      if (event.breadcrumbs) {
        for (const crumb of event.breadcrumbs) {
          if (crumb.data && typeof crumb.data === "object") {
            for (const key of Object.keys(crumb.data)) {
              if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
                (crumb.data as Record<string, unknown>)[key] = "[redacted]";
              }
            }
            // Drop bodies attached to breadcrumbs entirely.
            if ("body" in crumb.data) (crumb.data as Record<string, unknown>).body = undefined;
          }
        }
      }
      return event;
    },
  });
  initialized = true;
}

export { Sentry };
