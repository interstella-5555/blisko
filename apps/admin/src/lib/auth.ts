import { timingSafeEqual } from "node:crypto";

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();
const sessionStore = new Map<string, { email: string; expiresAt: number }>();

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (now > entry.expiresAt) otpStore.delete(key);
  }
  for (const [key, entry] of sessionStore) {
    if (now > entry.expiresAt) sessionStore.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

function getAllowedEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  return getAllowedEmails().includes(email.toLowerCase().trim());
}

export function generateOtp(email: string): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const otp = (100000 + (array[0] % 900000)).toString();
  otpStore.set(email.toLowerCase(), {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
  });
  return otp;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function verifyOtp(email: string, otp: string): boolean {
  const key = email.toLowerCase();
  const entry = otpStore.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt || entry.attempts >= MAX_OTP_ATTEMPTS) {
    otpStore.delete(key);
    return false;
  }
  entry.attempts++;
  if (!safeEqual(entry.otp, otp)) return false;
  otpStore.delete(key);
  return true;
}

export function createSession(email: string): string {
  const token = crypto.randomUUID();
  sessionStore.set(token, {
    email: email.toLowerCase(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function getSession(token: string): { email: string } | null {
  const entry = sessionStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessionStore.delete(token);
    return null;
  }
  return { email: entry.email };
}

export function deleteSession(token: string): void {
  sessionStore.delete(token);
}

export function parseSessionToken(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)admin-session=([^;]+)/);
  return match ? match[1] : null;
}
