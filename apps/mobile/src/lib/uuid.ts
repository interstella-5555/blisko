// Lightweight UUID v4 generator using Math.random.
// Used for tRPC idempotency keys and optimistic message tempIds — both need
// uniqueness, not cryptographic randomness. `crypto.randomUUID` isn't on the
// React Native global. `expo-crypto` would work but adds a native module +
// rebuild cost for no real benefit at our scale (collision probability on
// 1M UUIDs from Math.random is ~10^-23).
//
// If we ever need crypto-grade randomness (session tokens, E2E keys), add
// expo-crypto then and keep this helper for the non-crypto use cases.
export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
