/**
 * USD per 1M tokens. Update when OpenAI pricing changes.
 * Source: https://openai.com/api/pricing/
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

export type ServiceTier = "standard" | "flex";

const FLEX_MULTIPLIER = 0.5;

export function estimateCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
  serviceTier: ServiceTier = "standard",
): number {
  const p = PRICING[model];
  if (!p) return 0;
  const base = (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output;
  return serviceTier === "flex" ? base * FLEX_MULTIPLIER : base;
}
