import { generateText, generateObject, embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!isConfigured()) {
    console.warn('OPENAI_API_KEY not set, returning empty embedding');
    return [];
  }

  try {
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: text,
    });

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return [];
  }
}

export async function generateSocialProfile(
  bio: string,
  lookingFor: string
): Promise<string> {
  if (!isConfigured()) {
    console.warn('OPENAI_API_KEY not set, returning raw bio+lookingFor');
    return `${bio}\n\n${lookingFor}`;
  }

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      temperature: 0.7,
      maxOutputTokens: 500,
      system: `Na podstawie profilu użytkownika (bio: kim jestem, lookingFor: kogo szukam), wygeneruj bogaty profil społeczny (200-300 słów) opisujący:
- Kim jest ta osoba: zainteresowania, hobby, styl życia, osobowość
- Czego szuka u innych: ROZWIĄŻ ogólne sformułowania na konkretne cechy (np. "ludzi o podobnych zainteresowaniach" → wymień jakich zainteresowaniach na podstawie bio)
- Jaki typ osoby byłby dobrym matchem dla tego użytkownika
Pisz w 3. osobie, naturalnym językiem polskim. Nie używaj nagłówków ani list — pisz płynnym tekstem.`,
      prompt: `Bio: ${bio}\n\nLooking for: ${lookingFor}`,
    });

    return text || `${bio}\n\n${lookingFor}`;
  } catch (error) {
    console.error('Error generating social profile:', error);
    return `${bio}\n\n${lookingFor}`;
  }
}

export async function extractInterests(
  socialProfile: string
): Promise<string[]> {
  if (!isConfigured()) {
    console.warn('OPENAI_API_KEY not set, returning empty interests');
    return [];
  }

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      temperature: 0,
      maxOutputTokens: 200,
      schema: z.object({
        interests: z
          .array(z.string())
          .describe(
            'Lista 8-12 krótkich tagów zainteresowań, po polsku, małymi literami'
          ),
      }),
      prompt: `Wyciągnij 8-12 krótkich tagów zainteresowań z podanego profilu społecznego. Tagi powinny być krótkie (1-3 słowa), po polsku, małymi literami.\n\nProfil:\n${socialProfile}`,
    });

    return object.interests;
  } catch (error) {
    console.error('Error extracting interests:', error);
    return [];
  }
}

const connectionAnalysisSchema = z.object({
  matchScore: z.number().min(0).max(100),
  snippetForA: z.string().max(150),
  snippetForB: z.string().max(150),
  descriptionForA: z.string().max(500),
  descriptionForB: z.string().max(500),
});

export type ConnectionAnalysisResult = z.infer<
  typeof connectionAnalysisSchema
>;

export async function analyzeConnection(
  profileA: { socialProfile: string; displayName: string },
  profileB: { socialProfile: string; displayName: string }
): Promise<ConnectionAnalysisResult> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: connectionAnalysisSchema,
    temperature: 0.7,
    system: `Jesteś ekspertem od łączenia ludzi. Analizujesz dwa profile i oceniasz jakość dopasowania.

Zasady:
- matchScore: 0-100 uwzględniając: wspólne pasje (waga 40%), komplementarne umiejętności (30%), podobny styl życia (20%), potencjał wspólnych aktywności (10%)
- snippetForA/B: max 150 znaków, perspektywa DRUGIEJ osoby, 2. osoba ("Ty"/"Twoje"), konkretny hook — dlaczego warto poznać tę osobę. NIE generyczne "łączy was sport". Przykład: "Szuka partnera do ultramaratonów w górach — Ty biegniesz Tatry co miesiąc"
- descriptionForA/B: 2-3 zdania, pełna analiza połączenia z perspektywy viewera. Co moglibyście razem robić, co jest wyjątkowe w tym dopasowaniu.
- Pisz po polsku, naturalnym językiem`,
    prompt: `Profil A (${profileA.displayName}):\n${profileA.socialProfile}\n\nProfil B (${profileB.displayName}):\n${profileB.socialProfile}`,
  });
  return object;
}
