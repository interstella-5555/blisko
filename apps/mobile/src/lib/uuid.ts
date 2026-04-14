// Re-exports expo-crypto's native randomUUID. Crypto-grade v4 from the OS
// RNG, no polyfill dance, maintained with the rest of the Expo SDK.
export { randomUUID as uuidv4 } from "expo-crypto";
