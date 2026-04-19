const API_URL = process.env.API_URL || "http://localhost:3000";
const SECRET = process.env.INTERNAL_AI_LOG_SECRET;

export interface ChatbotAiLogEvent {
  jobName: "chatbot-message";
  model: string;
  promptTokens: number;
  completionTokens: number;
  userId?: string | null;
  targetUserId?: string | null;
  serviceTier?: "standard" | "flex";
  reasoningEffort?: "minimal" | "medium" | null;
  durationMs: number;
  status: "success" | "failed";
  errorMessage?: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
}

/**
 * Fire-and-forget POST to the API's `/internal/ai-log`. Mirrors what
 * `withAiLogging` does in the API — both sides feed the same buffer so the
 * admin "Koszty AI" dashboard sees chatbot calls alongside API calls.
 * Failures are logged but never block or surface to the caller.
 */
export function logAiCall(event: ChatbotAiLogEvent): void {
  if (!SECRET) return;
  fetch(`${API_URL}/internal/ai-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
    body: JSON.stringify(event),
  }).catch((err) => {
    console.error("[bot] ai-log POST failed:", err);
  });
}
