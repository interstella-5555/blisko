/**
 * USD per 1M tokens. Update when OpenAI pricing changes.
 * Source: https://openai.com/api/pricing/
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (promptTokens / 1_000_000) * p.input + (completionTokens / 1_000_000) * p.output;
}
