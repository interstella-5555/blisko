/** Cooldown after a ping is declined — sender cannot re-ping the same person for this duration. */
export const DECLINE_COOLDOWN_HOURS = 24;

/** Max pings per day (resets at midnight UTC). */
export const DAILY_PING_LIMIT_BASIC = 5;

/** Cannot ping the same person again within this window, regardless of outcome. */
export const PER_PERSON_COOLDOWN_HOURS = 24;
