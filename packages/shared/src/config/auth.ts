/** Length of OTP verification codes (digits for mobile, alphanumeric for admin). */
export const OTP_LENGTH = 6;

/** Seconds between OTP resend attempts. */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * OAuth providers exposed on the login screen. Drives both API registration
 * (`socialProviders` + `accountLinking.trustedProviders` in `apps/api/src/auth.ts`)
 * and the buttons rendered in mobile login + settings. Disabled providers stay
 * wired in code (hooks, schema, listConnected/disconnect) so legacy connections
 * keep working and re-enabling is a one-line change here. BLI-276 dropped FB/LinkedIn
 * for MVP per Workflow v4 §2.1.
 */
export const ENABLED_OAUTH_PROVIDERS = ["apple", "google"] as const;

export type OAuthProvider = "apple" | "google" | "facebook" | "linkedin";
export type EnabledOAuthProvider = (typeof ENABLED_OAUTH_PROVIDERS)[number];

export function isOAuthProviderEnabled(provider: OAuthProvider): provider is EnabledOAuthProvider {
  return (ENABLED_OAUTH_PROVIDERS as readonly OAuthProvider[]).includes(provider);
}
