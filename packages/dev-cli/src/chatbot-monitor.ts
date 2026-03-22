/**
 * Live dashboard showing what the chatbot sees.
 *
 * Shows stats (bot vs human messages, accepted/declined waves in last
 * hour), pending waves waiting for seed user response, recent wave
 * decisions with match scores, and active conversations with last 3
 * messages.
 *
 * Reads DATABASE_URL from env or `apps/api/.env`. Refreshes every 3s.
 * Does NOT require the chatbot to be running — reads DB directly.
 *
 * Run: `bun run dev-cli:chatbot-monitor`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Config from apps/api/.env ---

function readEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const envPath = resolve(import.meta.dir, "../../../apps/api/.env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (match) return match[1].trim();
  } catch {}
  return undefined;
}

const REDIS_URL = readEnvVar("REDIS_URL");
if (!REDIS_URL) {
  console.error("REDIS_URL not found. Set it or ensure apps/api/.env exists.");
  process.exit(1);
}

// --- Formatting ---

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function timeStr(ts?: number): string {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// --- Event icons & formatting ---

const EVENT_STYLES: Record<string, { icon: string; color: string }> = {
  wave_received: { icon: "👋", color: "\x1b[36m" }, // cyan
  wave_accept: { icon: "✓ ", color: "\x1b[32m" }, // green
  wave_decline: { icon: "✗ ", color: "\x1b[31m" }, // red
  wave_skip: { icon: "⏭ ", color: "\x1b[33m" }, // yellow
  wave_expired: { icon: "⏰", color: "\x1b[33m" }, // yellow
  wave_error: { icon: "💥", color: "\x1b[31m" }, // red
  opening_scheduled: { icon: "⏳", color: "\x1b[36m" }, // cyan
  opening_sent: { icon: "💬", color: "\x1b[32m" }, // green
  opening_skip: { icon: "🤐", color: "\x1b[33m" }, // yellow
  opening_error: { icon: "💥", color: "\x1b[31m" }, // red
  message_received: { icon: "📩", color: "\x1b[36m" }, // cyan
  reply_sent: { icon: "💬", color: "\x1b[32m" }, // green
  reply_skip: { icon: "🤐", color: "\x1b[33m" }, // yellow
  reply_error: { icon: "💥", color: "\x1b[31m" }, // red
  wave_waiting: { icon: "⏳", color: "\x1b[33m" }, // yellow
  wave_match_ready: { icon: "🎯", color: "\x1b[32m" }, // green
  wave_match_timeout: { icon: "⏰", color: "\x1b[31m" }, // red
};

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

function formatEvent(event: Record<string, unknown>): string {
  const eventType = String(event.type ?? "");
  const style = EVENT_STYLES[eventType] ?? { icon: "? ", color: "" };
  const time = DIM + timeStr(event.ts as number | undefined) + RESET;
  const type = style.color + pad(eventType, 20) + RESET;

  const parts = [`  ${style.icon} ${time} ${type}`];

  if (event.bot) parts.push(`${event.bot}`);
  if (event.from) parts.push(`← ${event.from}`);
  if (event.matchScore) parts.push(`match:${event.matchScore}`);
  if (event.probability) parts.push(`prob:${event.probability}`);
  if (event.delay) parts.push(`scheduled response in ${event.delay}`);
  if (event.reason) parts.push(`(${event.reason})`);
  if (event.message) parts.push(`"${event.message}"`);
  if (event.error) parts.push(`ERROR: ${event.error}`);

  return parts.join("  ");
}

// --- Main ---

console.log("  Chatbot Monitor — subscribing to bot:events...\n");
console.log(`  ${DIM}Waiting for events from chatbot (make sure it has REDIS_URL set)${RESET}\n`);

const subscriber = new Bun.RedisClient(REDIS_URL);

subscriber.subscribe("bot:events", (message: string) => {
  try {
    const event = JSON.parse(message);
    console.log(formatEvent(event));
  } catch {
    console.log(`  ? ${message}`);
  }
});

process.on("SIGINT", () => {
  subscriber.close();
  process.exit(0);
});
