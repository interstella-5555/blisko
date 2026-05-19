/** Length of OTP verification codes (digits for mobile, alphanumeric for admin). */
export const OTP_LENGTH = 6;

/** Seconds between OTP resend attempts. */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * OAuth providers exposed in the app. Drives API `socialProviders` +
 * `accountLinking.trustedProviders` and the buttons in mobile login / settings.
 */
export const ENABLED_OAUTH_PROVIDERS = ["apple", "google"] as const;

export type OAuthProvider = "apple" | "google" | "facebook" | "linkedin";
export type EnabledOAuthProvider = (typeof ENABLED_OAUTH_PROVIDERS)[number];

export function isOAuthProviderEnabled(provider: OAuthProvider): provider is EnabledOAuthProvider {
  return (ENABLED_OAUTH_PROVIDERS as readonly OAuthProvider[]).includes(provider);
}
