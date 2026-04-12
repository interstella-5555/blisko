/**
 * Rate limit configuration — single source of truth.
 *
 * Each entry defines a rate limit rule:
 * - limit: max requests allowed in the time window
 * - window: time window in seconds
 *
 * Limits are intentionally generous — only abusers should ever hit them.
 * Normal users will never see a rate limit error.
 *
 * When adding new API endpoints, check if they need a rate limit:
 * - Triggers push notifications? -> Yes
 * - Enqueues AI jobs? -> Yes
 * - Sends emails? -> Yes
 * - Writes to S3? -> Yes
 * - Could be abused by bots? -> Yes
 *
 * See: docs/plans/2026-03-08-rate-limiting-design.md
 */
export const rateLimits = {
  // -- Pre-auth (key: client IP) --

  // OTP email send — protects Resend costs (free tier: 3000/month)
  "auth.otpRequest": { limit: 5, window: 15 * 60 },

  // OTP code verification — prevents brute-force (6-digit = 1M combinations)
  "auth.otpVerify": { limit: 8, window: 5 * 60 },

  // -- Post-auth (key: userId) --

  // Wave sending — prevents mass-waving bots (Bumble: 25/day, Tinder: ~50/day)
  "waves.send": { limit: 30, window: 4 * 60 * 60 },

  // Wave responding — generous for users catching up on pending waves
  "waves.respond": { limit: 60, window: 60 * 60 },

  // Messages per conversation — prevents flooding a single chat
  "messages.send": { limit: 30, window: 60 },

  // Messages globally — catches cross-conversation spam
  "messages.sendGlobal": { limit: 500, window: 60 * 60 },

  // Profile edits — prevents rapid-fire updates triggering AI jobs
  "profiles.update": { limit: 10, window: 60 * 60 },

  // Onboarding submission — inline AI call (~2-3s), prevents repeated expensive calls
  "profiling.submitOnboarding": { limit: 5, window: 5 * 60 },

  // Profiling question retry — self-healing re-enqueue, prevents AI job flooding
  "profiling.retryQuestion": { limit: 10, window: 60 * 60 },

  // Profile generation retry — self-healing re-enqueue after generate-profile-from-qa failure
  "profiling.retryProfileGeneration": { limit: 10, window: 60 * 60 },

  // Profile AI retry — self-healing re-enqueue after generate-profile-ai failure
  "profiles.retryProfileAI": { limit: 10, window: 60 * 60 },

  // Status matching retry — self-healing re-enqueue after status-matching failure
  "profiles.retryStatusMatching": { limit: 10, window: 60 * 60 },

  // File uploads — S3 write protection
  uploads: { limit: 10, window: 60 * 60 },

  // Nearby user queries — list with viewport bbox (500ms debounce = max 2/s = 20/10s)
  "profiles.getNearby": { limit: 20, window: 10 },

  // Lightweight map markers — separate from rich list
  "profiles.getNearbyMap": { limit: 20, window: 10 },

  // Data export — heavy operation, once per day
  dataExport: { limit: 1, window: 24 * 60 * 60 },

  // Metrics endpoints — prevent scraping abuse
  "metrics.summary": { limit: 30, window: 60 },
  "metrics.prometheus": { limit: 30, window: 60 },

  // Global catch-all — safety net for all authenticated requests
  global: { limit: 200, window: 60 },
} as const;

export type RateLimitName = keyof typeof rateLimits;

/**
 * User-facing error messages per rate limit context.
 * Mobile app uses these directly in toast notifications.
 */
export const rateLimitMessages: Partial<Record<RateLimitName, string>> = {
  "waves.send": "Wysłałeś dużo pingów. Odpocznij chwilę i spróbuj później.",
  "messages.send": "Za dużo wiadomości naraz. Zwolnij trochę.",
  "messages.sendGlobal": "Za dużo wiadomości. Spróbuj ponownie za chwilę.",
  "profiles.update": "Za dużo zmian w profilu. Spróbuj ponownie za chwilę.",
  uploads: "Za dużo przesłanych plików. Spróbuj ponownie za chwilę.",
  dataExport: "Eksport danych jest dostępny raz na 24 godziny.",
  "auth.otpRequest": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
  "auth.otpVerify": "Za dużo prób logowania. Spróbuj ponownie za kilka minut.",
};

export const DEFAULT_RATE_LIMIT_MESSAGE = "Zbyt wiele prób. Spróbuj ponownie za chwilę.";
