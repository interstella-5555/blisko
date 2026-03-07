import { TRPCError } from "@trpc/server";

export async function moderateContent(text: string): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ input: text }),
  });

  if (!response.ok) {
    console.error("[moderation] API error:", response.status, await response.text());
    return; // graceful degradation
  }

  const data = (await response.json()) as {
    results: Array<{ flagged: boolean; categories: Record<string, boolean> }>;
  };

  const result = data.results[0];
  if (result?.flagged) {
    const flaggedCategories = Object.entries(result.categories)
      .filter(([, v]) => v)
      .map(([k]) => k);
    console.warn("[moderation] Content flagged:", flaggedCategories.join(", "));
    throw new TRPCError({ code: "BAD_REQUEST", message: "Treść narusza regulamin" });
  }
}
