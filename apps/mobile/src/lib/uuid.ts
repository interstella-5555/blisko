// Lightweight UUID v4 generator that doesn't require native modules.
// Used for tRPC idempotency keys where we only need uniqueness across
// client-side retries — NOT cryptographic randomness. `crypto.randomUUID`
// isn't on the React Native global, and `expo-crypto` pulls in native
// bindings that don't match our current SDK; this keeps it pure JS.
export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
