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
- Jakie tematy i aktywności są dla tej osoby ważne
Nie oceniaj, nie wartościuj — opisuj. Pisz w 3. osobie, naturalnym językiem polskim. Nie używaj nagłówków ani list — pisz płynnym tekstem.`,
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
  snippetForA: z.string().max(90),
  snippetForB: z.string().max(90),
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
    system: `Analizujesz profile dwóch osób i identyfikujesz obiektywne punkty wspólne.

Zasady:
- matchScore: 0-100 — obiektywna miara wspólnych zainteresowań (50%), podobnych doświadczeń/tła (30%), zbieżnego stylu życia (20%). Punktujesz wyłącznie to, co jest WPROST wymienione w profilach.
- snippetForA/B: max 90 znaków, zwięzłe wyliczenie wspólnych zainteresowań. Najważniejsze na początku. Pisz bezosobowo. Przykłady:
  "Oboje: ultramaratony górskie, fotografia analogowa"
  "Wspólne: D&D, literatura fantasy, Kraków"
  "Zbieżne: jazz, winyl, Rust"
  Bez "warto poznać", "szuka partnera", "moglibyście". Bez 2. osoby ("Ty"). Bez sugestii relacji.
- descriptionForA/B: 2-3 zdania, faktyczny opis wspólnych i zbieżnych elementów profili. Bez oceniania dopasowania. Bez sugestii aktywności. Bez zwrotów relacyjnych. Wymień co się pokrywa i czym się różnią.
- Pisz po polsku, rzeczowym językiem. Ton: encyklopedyczny, nie entuzjastyczny.`,
    prompt: `Profil A (${profileA.displayName}):\n${profileA.socialProfile}\n\nProfil B (${profileB.displayName}):\n${profileB.socialProfile}`,
  });
  return object;
}
