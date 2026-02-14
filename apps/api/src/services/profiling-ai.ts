import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

const nextQuestionSchema = z.object({
  question: z.string(),
  suggestions: z.array(z.string()).min(3).max(4),
  sufficient: z.boolean(),
});

export type NextQuestionResult = z.infer<typeof nextQuestionSchema>;

export async function generateNextQuestion(
  displayName: string,
  qaHistory: { question: string; answer: string }[],
  options?: {
    previousSessionQA?: { question: string; answer: string }[];
    userRequestedMore?: boolean;
    directionHint?: string;
  }
): Promise<NextQuestionResult> {
  if (!isConfigured()) {
    return {
      question: 'Opowiedz mi o swoich zainteresowaniach?',
      suggestions: ['Sport i aktywnosc', 'Muzyka i sztuka', 'Technologia', 'Podroze'],
      sufficient: qaHistory.length >= 5,
    };
  }

  let contextBlock = '';
  if (options?.previousSessionQA?.length) {
    contextBlock += `\n\nPoprzednia sesja profilowania (kontekst):\n${options.previousSessionQA
      .map((qa) => `P: ${qa.question}\nO: ${qa.answer}`)
      .join('\n')}`;
  }

  const historyBlock = qaHistory.length > 0
    ? `\n\nDotychczasowa rozmowa:\n${qaHistory
        .map((qa) => `P: ${qa.question}\nO: ${qa.answer}`)
        .join('\n')}`
    : '';

  let extraInstructions = '';
  if (options?.userRequestedMore) {
    extraInstructions += '\nUzytkownik poprosil o wiecej pytan — wygeneruj pytanie poglebione.';
    if (options?.directionHint) {
      extraInstructions += ` Uzytkownik chcialby porozmawiac o: ${options.directionHint}`;
    }
  }

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: nextQuestionSchema,
    temperature: 0.8,
    system: `Jestes adaptacyjnym profilerem osobowosci dla aplikacji spolecznosciowej. Tworzysz profil osobowosci ${displayName} na podstawie rozmowy.

Zasady:
- Zadawaj pytania ktore poglebisz zrozumienie charakteru, osobowosci, zainteresowan i oczekiwan tej osoby
- Uzywaj poprzednich odpowiedzi zeby isc glebiej — nie powtarzaj tematow
- Roznicuj tematy: wartosci, styl spoleczny, zainteresowania, motywacje, marzenia, codziennosc
- Preferuj scenariusze i pytania otwarte zamiast bezposrednich ("Opisz idealny dzien" > "Jaki jestes?")
- Generuj 3-4 roznorodne sugerowane odpowiedzi (nie naprowadzajace, naturalne)
- Po 5-7 dobrych odpowiedziach ustaw sufficient: true jezeli masz wystarczajaco materialu na bogaty profil
- Pisz naturalnym, cieplym polskim jezykiem
- Pytania powinny byc krotkie i konkretne (1-2 zdania)${extraInstructions}`,
    prompt: `Imie: ${displayName}
Liczba dotychczasowych pytan: ${qaHistory.length}${contextBlock}${historyBlock}

Wygeneruj nastepne pytanie.`,
  });

  return object;
}

const profileFromQASchema = z.object({
  bio: z.string(),
  lookingFor: z.string(),
  portrait: z.string(),
});

export type ProfileFromQAResult = z.infer<typeof profileFromQASchema>;

export async function generateProfileFromQA(
  displayName: string,
  qaHistory: { question: string; answer: string }[],
  previousSessionQA?: { question: string; answer: string }[]
): Promise<ProfileFromQAResult> {
  if (!isConfigured()) {
    return {
      bio: 'Jestem osoba otwarta na nowe znajomosci.',
      lookingFor: 'Szukam ludzi o podobnych zainteresowaniach.',
      portrait: 'Osoba otwarta i ciekawa swiata.',
    };
  }

  let contextBlock = '';
  if (previousSessionQA?.length) {
    contextBlock = `\n\nPoprzednia sesja (kontekst dodatkowy):\n${previousSessionQA
      .map((qa) => `P: ${qa.question}\nO: ${qa.answer}`)
      .join('\n')}`;
  }

  const qaBlock = qaHistory
    .map((qa) => `P: ${qa.question}\nO: ${qa.answer}`)
    .join('\n');

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: profileFromQASchema,
    temperature: 0.7,
    system: `Na podstawie rozmowy profilowej generujesz profil uzytkownika ${displayName} dla aplikacji spolecznosciowej.

Generujesz trzy teksty:

1. bio (100-300 znakow, 1. osoba, po polsku) — kim jest ta osoba: zainteresowania, charakter, styl zycia. Naturalny, cieplym tonem, jak gdyby osoba sama o sobie pisala.

2. lookingFor (100-300 znakow, 1. osoba, po polsku) — kogo szuka: jakiego typu ludzi, jakich relacji, co ich mogloby polaczyc. Konkretnie, nie ogolnikowo.

3. portrait (200-400 slow, 3. osoba, po polsku) — gleboki opis osobowosci: jak mysli, co ceni, jak funkcjonuje spolecznie, jakie ma motywacje i potrzeby. To jest prywatny dokument — pisz szczerze i wnikliwie, nie pochlebczo. Unikaj banalnych sformulowan.

Bazuj WYLACZNIE na informacjach ktore wynikaja z odpowiedzi. Nie wymyslaj.`,
    prompt: `Rozmowa profilowa z ${displayName}:\n${qaBlock}${contextBlock}`,
  });

  return object;
}
