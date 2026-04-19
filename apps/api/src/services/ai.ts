import { openai } from "@ai-sdk/openai";
import { AI_MODELS, EMBEDDING_MODEL } from "@repo/shared";
import { embed, generateObject, generateText } from "ai";
import { z } from "zod";
import { type AiCallInput, type AiLogCtx, withAiLogging } from "./ai-log";

function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/**
 * Builds the OpenAI-scoped providerOptions from an AI log context.
 * Only non-default values are attached so gpt-4.1-mini callers (which do not support
 * `serviceTier`/`reasoningEffort`) stay on a plain request shape.
 */
function providerOptionsFromCtx(ctx: AiLogCtx) {
  const openaiOpts: Record<string, string> = {};
  if (ctx.serviceTier && ctx.serviceTier !== "standard") openaiOpts.serviceTier = ctx.serviceTier;
  if (ctx.reasoningEffort) openaiOpts.reasoningEffort = ctx.reasoningEffort;
  return Object.keys(openaiOpts).length > 0 ? { openai: openaiOpts } : undefined;
}

export async function generateEmbedding(text: string, ctx: AiLogCtx): Promise<number[]> {
  if (!isConfigured()) {
    console.warn("OPENAI_API_KEY not set, returning empty embedding");
    return [];
  }

  const input: AiCallInput = { kind: "embed", model: EMBEDDING_MODEL, value: text };

  try {
    return await withAiLogging(ctx, input, async () => {
      const { embedding, usage } = await embed({
        model: openai.embedding(EMBEDDING_MODEL),
        value: text,
      });
      return {
        result: embedding,
        model: EMBEDDING_MODEL,
        promptTokens: usage?.tokens ?? 0,
        completionTokens: 0,
        // Don't log the 1536-float vector — unreadable for debug, bloats the table
        output: { dimensions: embedding.length, tokens: usage?.tokens ?? 0 },
      };
    });
  } catch (error) {
    console.error("Error generating embedding:", error);
    return [];
  }
}

export async function generatePortrait(bio: string, lookingFor: string, ctx: AiLogCtx): Promise<string> {
  if (!isConfigured()) {
    console.warn("OPENAI_API_KEY not set, returning raw bio+lookingFor");
    return `${bio}\n\n${lookingFor}`;
  }

  const model = ctx.model ?? AI_MODELS.sync;
  const providerOptions = providerOptionsFromCtx(ctx);
  const system = `Na podstawie profilu użytkownika (bio: kim jestem, lookingFor: kogo szukam), wygeneruj bogaty profil społeczny (200-300 słów) opisujący:
- Kim jest ta osoba: zainteresowania, hobby, styl życia, osobowość
- Czego szuka u innych: ROZWIĄŻ ogólne sformułowania na konkretne cechy (np. "ludzi o podobnych zainteresowaniach" → wymień jakich zainteresowaniach na podstawie bio)
- Jakie tematy i aktywności są dla tej osoby ważne
Nie oceniaj, nie wartościuj — opisuj. Pisz w 3. osobie, naturalnym językiem polskim. Nie używaj nagłówków ani list — pisz płynnym tekstem.
NIE wspominaj o aktualnym statusie użytkownika ani bieżących intencjach "na teraz" — te informacje są prywatne.`;
  const prompt = `<user_bio>${bio}</user_bio>\n\n<user_looking_for>${lookingFor}</user_looking_for>`;
  const input: AiCallInput = {
    kind: "generateText",
    model,
    system,
    prompt,
    temperature: 0.7,
    maxOutputTokens: 500,
    providerOptions: providerOptions ?? null,
  };

  try {
    return await withAiLogging(ctx, input, async () => {
      const { text, usage, finishReason } = await generateText({
        model: openai(model),
        temperature: 0.7,
        maxOutputTokens: 500,
        ...(providerOptions && { providerOptions }),
        system,
        prompt,
      });
      return {
        result: text || `${bio}\n\n${lookingFor}`,
        model,
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
        output: { text, finishReason },
      };
    });
  } catch (error) {
    console.error("Error generating social profile:", error);
    return `${bio}\n\n${lookingFor}`;
  }
}

export async function extractInterests(portrait: string, ctx: AiLogCtx): Promise<string[]> {
  if (!isConfigured()) {
    console.warn("OPENAI_API_KEY not set, returning empty interests");
    return [];
  }

  const model = ctx.model ?? AI_MODELS.sync;
  const providerOptions = providerOptionsFromCtx(ctx);
  const schema = z.object({
    interests: z.array(z.string()).describe("Lista 8-12 krótkich tagów zainteresowań, po polsku, małymi literami"),
  });
  const prompt = `Wyciągnij 8-12 krótkich tagów zainteresowań z podanego profilu społecznego. Tagi powinny być krótkie (1-3 słowa), po polsku, małymi literami.\n\nProfil:\n${portrait}`;
  const input: AiCallInput = {
    kind: "generateObject",
    model,
    prompt,
    temperature: 0,
    maxOutputTokens: 200,
    providerOptions: providerOptions ?? null,
    schemaName: "extractInterestsSchema",
  };

  try {
    return await withAiLogging(ctx, input, async () => {
      const { object, usage } = await generateObject({
        model: openai(model),
        temperature: 0,
        maxOutputTokens: 200,
        ...(providerOptions && { providerOptions }),
        schema,
        prompt,
      });
      return {
        result: object.interests,
        model,
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
        output: { object },
      };
    });
  } catch (error) {
    console.error("Error extracting interests:", error);
    return [];
  }
}

export const quickScoreSchema = z.object({
  scoreForA: z.number().int().min(0).max(100),
  scoreForB: z.number().int().min(0).max(100),
});

export type QuickScoreResult = z.infer<typeof quickScoreSchema>;

export async function quickScore(
  profileA: { portrait: string; displayName: string; lookingFor: string; superpower?: string | null },
  profileB: { portrait: string; displayName: string; lookingFor: string; superpower?: string | null },
  ctx: AiLogCtx,
): Promise<QuickScoreResult> {
  const model = ctx.model ?? AI_MODELS.sync;
  const providerOptions = providerOptionsFromCtx(ctx);
  const system = `Oceń kompatybilność dwóch osób. Zwróć asymetryczne scores 0-100 dla każdej strony.

Formuła: spełnienie "czego szukam" drugiej osoby (70%) + wspólne zainteresowania (20%) + zbliżony styl życia (10%).

Score jest ASYMETRYCZNY — osobno dla A i osobno dla B. Jeśli A szuka kogoś na padla, a B nie gra → scoreForA niski, niezależnie od innych wspólnych cech.`;
  const prompt = `A: ${profileA.displayName}
${profileA.portrait}
Szuka: ${profileA.lookingFor}${profileA.superpower ? `\nMoże zaoferować: ${profileA.superpower}` : ""}

B: ${profileB.displayName}
${profileB.portrait}
Szuka: ${profileB.lookingFor}${profileB.superpower ? `\nMoże zaoferować: ${profileB.superpower}` : ""}`;
  const input: AiCallInput = {
    kind: "generateObject",
    model,
    system,
    prompt,
    temperature: 0.3,
    maxOutputTokens: 50,
    providerOptions: providerOptions ?? null,
    schemaName: "quickScoreSchema",
  };

  return withAiLogging(ctx, input, async () => {
    const { object, usage } = await generateObject({
      model: openai(model),
      schema: quickScoreSchema,
      temperature: 0.3,
      maxOutputTokens: 50,
      ...(providerOptions && { providerOptions }),
      system,
      prompt,
    });
    return {
      result: object,
      model,
      promptTokens: usage?.inputTokens ?? 0,
      completionTokens: usage?.outputTokens ?? 0,
      output: { object },
    };
  });
}

const connectionAnalysisSchema = z.object({
  matchScoreForA: z.number().min(0).max(100),
  matchScoreForB: z.number().min(0).max(100),
  snippetForA: z.string().max(90),
  snippetForB: z.string().max(90),
  descriptionForA: z.string().max(500),
  descriptionForB: z.string().max(500),
});

export type ConnectionAnalysisResult = z.infer<typeof connectionAnalysisSchema>;

export async function evaluateStatusMatch(
  statusText: string,
  otherContext: string,
  matchType: "status" | "profile",
  categoriesA: string[] | null | undefined,
  categoriesB: string[] | null | undefined,
  ctx: AiLogCtx,
): Promise<{ isMatch: boolean; reason: string }> {
  if (!isConfigured()) return { isMatch: false, reason: "" };

  const catA = categoriesA?.length ? ` [kontekst: ${categoriesA.join(", ")}]` : "";
  const catB = categoriesB?.length ? ` [kontekst: ${categoriesB.join(", ")}]` : "";

  const prompt =
    matchType === "status"
      ? `Osoba A szuka: "${statusText}"${catA}
Osoba B szuka: "${otherContext}"${catB}

Czy te dwie potrzeby/oferty się uzupełniają? Jedna osoba może pomóc drugiej lub mogą coś zrobić razem?
Weź pod uwagę kontekst kategorii — osoby szukające w różnych kontekstach (np. randka vs projekt) raczej się nie uzupełniają.
Odpowiedz JSON: {"isMatch": true/false, "reason": "krótkie uzasadnienie po polsku, max 60 znaków"}`
      : `Osoba A szuka teraz: "${statusText}"${catA}
Profil osoby B: "${otherContext}"

Czy profil osoby B pasuje do tego czego szuka osoba A?
Odpowiedz JSON: {"isMatch": true/false, "reason": "krótkie uzasadnienie po polsku, max 60 znaków"}`;

  const model = ctx.model ?? AI_MODELS.sync;
  const providerOptions = providerOptionsFromCtx(ctx);
  const input: AiCallInput = {
    kind: "generateText",
    model,
    prompt,
    matchType,
    maxOutputTokens: 100,
    providerOptions: providerOptions ?? null,
  };

  try {
    return await withAiLogging(ctx, input, async () => {
      const { text, usage, finishReason } = await generateText({
        model: openai(model),
        prompt,
        maxOutputTokens: 100,
        ...(providerOptions && { providerOptions }),
      });
      // Parse inside the wrapper so malformed LLM output is logged as a failed row
      let parsed: { isMatch?: unknown; reason?: unknown };
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new Error(`evaluateStatusMatch: invalid JSON from model: ${String(err).slice(0, 100)}`);
      }
      return {
        result: {
          isMatch: Boolean(parsed.isMatch),
          reason: String(parsed.reason || "").slice(0, 80),
        },
        model,
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
        output: { text, finishReason, parsed },
      };
    });
  } catch {
    return { isMatch: false, reason: "" };
  }
}

export async function analyzeConnection(
  profileA: { portrait: string; displayName: string; lookingFor: string; superpower?: string | null },
  profileB: { portrait: string; displayName: string; lookingFor: string; superpower?: string | null },
  ctx: AiLogCtx,
): Promise<ConnectionAnalysisResult> {
  const model = ctx.model ?? AI_MODELS.sync;
  const providerOptions = providerOptionsFromCtx(ctx);
  const system = `Jesteś prowadzącym randkę w ciemno. Znasz obie osoby i prezentujesz każdą z perspektywy drugiej.

KRYTYCZNA ZASADA: Opisujesz osoby WYŁĄCZNIE na podstawie ich profilu (bio, zainteresowania, styl życia) i pola "Szuka" (lookingFor).
NIGDY nie wspominaj o aktualnym statusie, bieżących intencjach "na teraz", ani czego ktoś szuka w danym momencie — te informacje są prywatne i mogą nie być widoczne dla drugiej strony. Zdradzenie statusu pośrednio przez opis jest równoznaczne z jego ujawnieniem.

Zasady:

matchScoreForA/B: 0-100, ASYMETRYCZNY — osobny score dla każdej strony.
  Formuła: spełnienie "czego szukam" (70%) + wspólne zainteresowania poza szukanym (20%) + zbliżone tło/styl życia (10%).
  Jeśli A szuka kogoś na padla, a B nie gra w padla → matchScoreForA niski, niezależnie od wspólnego IT czy hobby.

snippetForA: max 90 znaków — krótki pitch o B dla A.
  Zacznij od tego czego B szuka, jeśli rezonuje z A. Potem kluczowe cechy B.
  NIE wspominaj A ani nie pisz o A. Opisuj B.

descriptionForA: max 500 znaków — dłuższy pitch o B dla A.
  Pisz jak prowadzący, który zna obie osoby i opowiada A o B.
  - Zacznij od czego B szuka (jeśli rezonuje z A)
  - Potem opisz B: cechy, zainteresowania, styl — dobieraj co podkreślić wg tego co obchodzi A
  - Pomijaj rzeczy które nie mają nic wspólnego z A (chyba że na końcu jako bonus)
  - NIE wspominaj A, nie opisuj A, nie pisz w 2. osobie
  - Ton: naturalny, z ciepłem — nie encyklopedyczny, nie entuzjastyczny

Analogicznie snippetForB i descriptionForB — pitch o A dla B.

Przykłady:

--- PARA 1: sportowcy ---
A = Kasia: ultramaratonka, triatlon, programistka Python, szlaki górskie
  Szuka: aktywnych ludzi na wspólne treningi i górskie wypady
B = Marek: rowerzysta szosowy, biegacz-amator, frontend dev, Tatry, narty
  Szuka: kogoś na wspólne treningi i do gór

matchScoreForA: 82 (Marek biega i chodzi po Tatrach — spełnia "treningi + góry")
matchScoreForB: 88 (Kasia biega ultra + triatlon — spełnia "trening + góry" jeszcze lepiej)
snippetForA: "Szuka kogoś na wspólne treningi i do gór — biega, szosa, Tatry"
snippetForB: "Szuka kogoś na treningi i górskie wypady — ultra, triatlon, góry"
descriptionForA: "Szuka kogoś na wspólne treningi i do gór. Biega, jeździ szosą i regularnie chodzi po Tatrach — trenuje na poważnie. Frontend developer, podobna codzienność. Zimą na nartach."
descriptionForB: "Szuka kogoś aktywnego na wspólne treningi i górskie wypady. Biega ultra i robi triatlon — kolarstwo też jej bliskie. Programistka Python, podobna codzienność. Wieczorami planszówki."

--- PARA 2: kreatywni ---
A = Ola: graficzka, komiksy, ukulele, koty, kawiarnie
  Szuka: kreatywnych ludzi, którzy tworzą — rysują, piszą, grają
B = Tomek: programista gier indie, concept art, gitara, lo-fi
  Szuka: kogoś do wspólnych projektów kreatywnych, kto rysuje albo pisze

matchScoreForA: 85 (Tomek rysuje, gra, tworzy gry — spełnia "tworzą, rysują, grają")
matchScoreForB: 80 (Ola rysuje komiksy — spełnia "kto rysuje albo pisze")
snippetForA: "Szuka kogoś do kreatywnych projektów — concept art, gitara, gry indie"
snippetForB: "Szuka kreatywnych ludzi — graficzka, komiksy, ukulele"
descriptionForA: "Szuka kogoś do wspólnych projektów kreatywnych. Rysuje concept art i tworzy gry indie — łączy rysunek z opowiadaniem historii. Gra na gitarze, lubi lo-fi i tworzenie w skupieniu."
descriptionForB: "Szuka kreatywnych ludzi, którzy tworzą. Graficzka, rysuje własne komiksy — rysunek i narracja to jej codzienność. Gra na ukulele. Tworzy w kawiarniach, w ciszy."

--- PARA 3: mało wspólnego ---
A = Zuzia: psychologia, medytacja, joga, filozofia, spacery
  Szuka: ludzi do głębokich rozmów o książkach i życiu
B = Piotrek: inżynier mechanik, biega, sci-fi, gotuje azjatycko
  Szuka: kogoś do wspólnego biegania albo gotowania

matchScoreForA: 25 (Piotrek czyta inne gatunki, nie "głębokie rozmowy o życiu")
matchScoreForB: 8 (Zuzia nie biega, nie gotuje, spaceruje co najwyżej)
snippetForA: "Czyta sporo, choć sci-fi. Inżynier, inna perspektywa"
snippetForB: "Długie spacery, czyta filozofię. Studentka psychologii"
descriptionForA: "Czyta sporo — sci-fi i fantasy, inny kąt widzenia niż psychologia. Inżynier mechanik, zupełnie inna codzienność i perspektywa na życie."
descriptionForB: "Chodzi na długie spacery — lubi ruch na powietrzu. Czyta dużo, choć psychologię i filozofię."

--- PARA 4: biznes ---
A = Michał: founder SaaS 2 lata, ex-konsulting, product mgmt, growth
  Szuka: ludzi z doświadczeniem w startupach/korpo do wymiany myśli o budowaniu produktu
B = Agnieszka: marketing mgr B2B 8 lat, UX, strategia produktowa, planuje firmę
  Szuka: ludzi którzy budują firmy, chce uczyć się od founderów

matchScoreForA: 75 (ma korpo-perspektywę i produkt, ale nie jest founderem)
matchScoreForB: 90 (jest founderem — dokładnie czego szuka)
snippetForA: "Szuka founderów — 8 lat marketing B2B, strategia produktowa, planuje firmę"
snippetForB: "Founder SaaS, 2 lata — szuka kogoś do rozmów o produkcie i growth"
descriptionForA: "Szuka ludzi którzy budują firmy — chce uczyć się od founderów. 8 lat w marketingu B2B w dużej firmie IT. Interesuje się UX i strategią produktową. Planuje kiedyś odejść i założyć swoją."
descriptionForB: "Buduje startup SaaS od 2 lat, wcześniej 5 lat w konsultingu — ma i startupowe i korporacyjne doświadczenie. Szuka kogoś kto rozumie budowanie produktu. Czyta o PM i growth. Po pracy biega."

--- PARA 5: padel ---
A = Bartek: programista remote, padel 3x/tydz, squash, ping-pong, F1
  Szuka: kogoś na regularne mecze padla, podobny poziom
B = Kuba: analityk danych, padel od pół roku, siłownia, piwo kraftowe, planszówki
  Szuka: kogoś na padla — hobbystycznie ale chce się rozwijać

matchScoreForA: 55 (gra w padla, ale dopiero pół roku — inny poziom)
matchScoreForB: 85 (gra 3x/tydzień, doświadczony — idealny do rozwoju)
snippetForA: "Gra w padla od pół roku — szuka kogoś na regularne granie"
snippetForB: "Padel 3x/tydzień — szuka kogoś na regularne mecze. Programista"
descriptionForA: "Gra w padla od pół roku, szuka kogoś na regularne granie i chce się rozwijać. Chodzi na siłownię, więc ogólnie aktywny. W branży tech — analityk danych."
descriptionForB: "Gra w padla 3 razy w tygodniu — szuka kogoś na regularne mecze na podobnym poziomie. Programista, pracuje zdalnie. Gra też w squasha i ping-ponga. Ogląda F1."`;
  const prompt = `<user_profile name="A">
${profileA.displayName}:
${profileA.portrait}

Szuka: ${profileA.lookingFor}${profileA.superpower ? `\nMoże zaoferować: ${profileA.superpower}` : ""}
</user_profile>

<user_profile name="B">
${profileB.displayName}:
${profileB.portrait}

Szuka: ${profileB.lookingFor}${profileB.superpower ? `\nMoże zaoferować: ${profileB.superpower}` : ""}
</user_profile>`;
  const input: AiCallInput = {
    kind: "generateObject",
    model,
    system,
    prompt,
    temperature: 0.7,
    providerOptions: providerOptions ?? null,
    schemaName: "connectionAnalysisSchema",
  };

  try {
    return await withAiLogging(ctx, input, async () => {
      const { object, usage } = await generateObject({
        model: openai(model),
        schema: connectionAnalysisSchema,
        temperature: 0.7,
        ...(providerOptions && { providerOptions }),
        system,
        prompt,
      });
      return {
        result: object,
        model,
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
        output: { object },
      };
    });
  } catch (error) {
    console.error("Error analyzing connection:", error);
    throw error;
  }
}
