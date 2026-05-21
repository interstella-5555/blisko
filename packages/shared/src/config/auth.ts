/** Length of OTP verification codes (digits for mobile, alphanumeric for admin). */
export const OTP_LENGTH = 6;

/** Seconds between OTP resend attempts. */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * OAuth providers the app accepts for NEW account connections (login + linking).
 * FB and LinkedIn dropped on MVP per Workflow v4 §2.2 — keep `OAuthProvider` wider
 * so settings can still display + disconnect legacy linked accounts.
 */
export const ACTIVE_OAUTH_PROVIDERS = ["apple", "google"] as const;

export type OAuthProvider = "apple" | "google" | "facebook" | "linkedin";
export type ActiveOAuthProvider = (typeof ACTIVE_OAUTH_PROVIDERS)[number];

export function isActiveOAuthProvider(provider: OAuthProvider): provider is ActiveOAuthProvider {
  return (ACTIVE_OAUTH_PROVIDERS as readonly OAuthProvider[]).includes(provider);
}
