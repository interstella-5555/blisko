import { timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OTP_LENGTH } from "@repo/shared";
import ms from "ms";

const OTP_TTL_MS = ms("5 minutes");
const SESSION_TTL_MS = ms("24 hours");
const MAX_OTP_ATTEMPTS = 5;

// OTP store stays in-memory (short-lived, doesn't need persistence)
const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();

// DATA_DIR points to Railway's mounted volume (/data) in production.
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const SESSION_FILE = join(DATA_DIR, ".admin-sessions.json");

type SessionEntry = { email: string; expiresAt: number };
type SessionMap = Record<string, SessionEntry>;

function loadSessions(): SessionMap {
  try {
    const raw = readFileSync(SESSION_FILE, "utf-8");
    const data = JSON.parse(raw) as SessionMap;
    // Clean expired entries on load
    const now = Date.now();
    const clean: SessionMap = {};
    for (const [key, entry] of Object.entries(data)) {
      if (now < entry.expiresAt) clean[key] = entry;
    }
    return clean;
  } catch {
    return {};
  }
}

function saveSessions(sessions: SessionMap): void {
  try {
    writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
  } catch {
    // Silently fail — worst case user has to re-login
  }
}

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

const OTP_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 30 chars, no 0/O/1/I/l — 30^6 ≈ 729M combinations

export function generateOtp(email: string): string {
  const array = new Uint8Array(OTP_LENGTH);
  crypto.getRandomValues(array);
  const otp = Array.from(array, (b) => OTP_ALPHABET[b % OTP_ALPHABET.length]).join("");
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
  if (!safeEqual(entry.otp, otp.toUpperCase())) return false;
  otpStore.delete(key);
  return true;
}

export function createSession(email: string): string {
  const token = crypto.randomUUID();
  const sessions = loadSessions();
  sessions[token] = {
    email: email.toLowerCase(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  saveSessions(sessions);
  return token;
}

export function getSession(token: string): { email: string } | null {
  const sessions = loadSessions();
  const entry = sessions[token];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete sessions[token];
    saveSessions(sessions);
    return null;
  }
  return { email: entry.email };
}

export function deleteSession(token: string): void {
  const sessions = loadSessions();
  delete sessions[token];
  saveSessions(sessions);
}

export function parseSessionToken(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)admin-session=([^;]+)/);
  return match ? match[1] : null;
}
