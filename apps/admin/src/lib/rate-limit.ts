/** Simple in-memory sliding window rate limiter for admin (single instance). */

const counters = new Map<string, { count: number; windowStart: number }>();

const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

function cleanup(windowSeconds: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = Math.floor(now / 1000) - windowSeconds * 2;
  for (const [key, entry] of counters) {
    if (entry.windowStart < cutoff) counters.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): { limited: boolean; retryAfter: number } {
  cleanup(windowSeconds);

  const nowSec = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(nowSec / windowSeconds);
  const prevWindow = currentWindow - 1;
  const elapsed = nowSec - currentWindow * windowSeconds;
  const weight = elapsed / windowSeconds;

  const prevKey = `${key}:${prevWindow}`;
  const currKey = `${key}:${currentWindow}`;

  const prevCount = counters.get(prevKey)?.count ?? 0;
  const currEntry = counters.get(currKey);
  const currCount = currEntry?.count ?? 0;

  const estimated = prevCount * (1 - weight) + currCount;

  if (estimated >= limit) {
    const retryAfter = Math.ceil(windowSeconds - elapsed);
    return { limited: true, retryAfter };
  }

  counters.set(currKey, {
    count: currCount + 1,
    windowStart: currentWindow,
  });

  return { limited: false, retryAfter: 0 };
}
