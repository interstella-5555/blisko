import { openai } from "@ai-sdk/openai";
import { AI_MODELS } from "@repo/shared";
import { generateText } from "ai";
import { logAiCall } from "./ai-log";

interface SocialLinks {
  facebook?: string;
  linkedin?: string;
  website?: string;
}

interface BotProfile {
  userId: string;
  displayName: string;
  bio: string;
  lookingFor: string;
  socialLinks: SocialLinks | null;
}

interface OtherProfile {
  userId: string;
  displayName: string;
  bio: string;
  lookingFor: string;
  socialLinks: SocialLinks | null;
}

interface MessageEntry {
  senderId: string;
  content: string;
}

const FALLBACK_OPENING = "Hej! Milo mi :)";
const FALLBACK_REPLY = "Fajnie, opowiedz wiecej!";

export async function generateBotMessage(
  botProfile: BotProfile,
  otherProfile: OtherProfile,
  conversationHistory: MessageEntry[],
  isOpening: boolean,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return isOpening ? FALLBACK_OPENING : FALLBACK_REPLY;
  }

  const scenario = isOpening
    ? "Pierwsza wiadomosc po zaakceptowaniu wave. Przywitaj sie nawiazujac do tego co was laczy."
    : `Kontynuujesz rozmowe. Odpowiedz na ostatnia wiadomosc.\n\nOstatnie wiadomosci:\n${conversationHistory
        .slice(-50)
        .map((m) => `${m.senderId === "bot" ? botProfile.displayName : otherProfile.displayName}: ${m.content}`)
        .join("\n")}`;

  const model = AI_MODELS.sync;
  // Keep bio + lookingFor; skip portrait + interests — portrait is a 3rd-person
  // restatement of bio (AI-generated) and interests are derivable from bio.
  // Together they roughly tripled prompt tokens with no chat-quality gain.
  const system = `Jestes ${botProfile.displayName}, piszesz na czacie Blisko.

O TOBIE: ${botProfile.bio}
SZUKASZ: ${botProfile.lookingFor}

ROZMOWCA (${otherProfile.displayName}): ${otherProfile.bio}
SZUKA: ${otherProfile.lookingFor}

ZASADY:
- Po polsku, potocznie, 1-3 zdania, max 200 znakow
- Nie zaczynaj od imienia, tylko tresc
- Rzadko emoji
- Temat bliski Twoim zainteresowaniom albo temu czego szukasz → rozwijaj, pytaj; obcy → krotko, bez entuzjazmu`;
  const input = {
    kind: "generateText",
    model,
    system,
    prompt: scenario,
    temperature: 0.9,
    maxOutputTokens: 150,
    isOpening,
  };
  const start = Date.now();

  try {
    const { text, usage, finishReason } = await generateText({
      model: openai(model),
      temperature: 0.9,
      // gpt-5-mini is a reasoning model — without `reasoningEffort: "minimal"`
      // OpenAI defaults to medium, which ate the whole maxOutputTokens budget
      // on invisible reasoning and returned text: "" with finishReason: "length",
      // so every reply fell through to FALLBACK_REPLY. See BLI-240 / BLI-236.
      maxOutputTokens: 500,
      providerOptions: { openai: { reasoningEffort: "minimal" } },
      system,
      prompt: scenario,
    });

    logAiCall({
      jobName: "chatbot-message",
      model,
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
      userId: botProfile.userId,
      targetUserId: otherProfile.userId,
      durationMs: Date.now() - start,
      status: "success",
      input,
      output: { text, finishReason },
    });

    return text.slice(0, 200) || (isOpening ? FALLBACK_OPENING : FALLBACK_REPLY);
  } catch (error) {
    logAiCall({
      jobName: "chatbot-message",
      model,
      promptTokens: 0,
      completionTokens: 0,
      userId: botProfile.userId,
      targetUserId: otherProfile.userId,
      durationMs: Date.now() - start,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      input,
      output: null,
    });

    console.error("[bot] AI generation error:", error);
    return isOpening ? FALLBACK_OPENING : FALLBACK_REPLY;
  }
}
