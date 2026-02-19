import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { GPT_MODEL } from '@repo/shared';

function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

const followUpQuestionsSchema = z.object({
  questions: z.array(z.string()).min(0).max(3),
});

export type FollowUpQuestionsResult = z.infer<typeof followUpQuestionsSchema>;

export async function generateFollowUpQuestions(
  displayName: string,
  answeredQA: { question: string; answer: string }[],
  skippedQuestionIds: string[]
): Promise<FollowUpQuestionsResult> {
  if (!isConfigured()) {
    return { questions: ['Opowiedz mi więcej o sobie.'] };
  }

  const qaBlock = answeredQA
    .map((qa) => `P: ${qa.question}\nO: ${qa.answer}`)
    .join('\n');

  const skippedBlock = skippedQuestionIds.length > 0
    ? `\n\nPominięte pytania (ID): ${skippedQuestionIds.join(', ')}`
    : '';

  const { object } = await generateObject({
    model: openai(GPT_MODEL),
    schema: followUpQuestionsSchema,
    temperature: 0.8,
    maxOutputTokens: 400,
    system: `Analizujesz odpowiedzi użytkownika z onboardingu aplikacji społecznościowej i generujesz pytania pogłębiające.

Zasady:
- Wygeneruj od 0 do 3 pytań pogłębiających
- Jeśli użytkownik odpowiedział na mniej niż 5 pytań, MUSISZ zadać 2-3 pytania — za mało danych na dobry profil
- Jeśli odpowiedział na 5-7 pytań ale odpowiedzi są krótkie/ogólnikowe, zadaj 1-2 pytania
- Jeśli odpowiedzi są bogate i pokrywają różne aspekty osobowości (zainteresowania, styl społeczny, motywacje), możesz zwrócić 0 pytań
- NIE powtarzaj pytań które już padły — zamiast tego podejdź do tematu z innej strony
- Jeśli użytkownik pominął ważne tematy (np. styl społeczny, co może zaoferować, zainteresowania), dopytaj o to naturalnie
- Pytania powinny być naturalne, ciepłe, po polsku
- Krótkie i konkretne (1-2 zdania)
- Preferuj scenariusze i pytania otwarte
- Skup się na lukach: czego brakuje do stworzenia bogatego profilu?`,
    prompt: `<user_name>${displayName}</user_name>

<answered_questions>
${qaBlock}
</answered_questions>${skippedBlock}

Wygeneruj pytania pogłębiające (0-3).`,
  });

  return object;
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
      question: 'Opowiedz mi o swoich zainteresowaniach.',
      suggestions: ['Sport i aktywność', 'Muzyka i sztuka', 'Technologia', 'Podróże'],
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
    extraInstructions += '\nUżytkownik poprosił o więcej pytań — wygeneruj pytanie pogłębione.';
    if (options?.directionHint) {
      extraInstructions += `\n<user_hint>${options.directionHint}</user_hint>`;
    }
  }

  const { object } = await generateObject({
    model: openai(GPT_MODEL),
    schema: nextQuestionSchema,
    temperature: 0.8,
    maxOutputTokens: 300,
    system: `Jesteś adaptacyjnym profilerem osobowości dla aplikacji społecznościowej. Tworzysz profil osobowości na podstawie rozmowy.

Zasady:
- Zadawaj pytania które pogłębią zrozumienie charakteru, osobowości, zainteresowań i oczekiwań tej osoby
- Używaj poprzednich odpowiedzi żeby iść głębiej — nie powtarzaj tematów
- Różnicuj tematy: wartości, styl społeczny, zainteresowania, motywacje, marzenia, codzienność
- Preferuj scenariusze i pytania otwarte zamiast bezpośrednich ("Opisz idealny dzień" > "Jaki jesteś?")
- Generuj 3-4 różnorodne sugerowane odpowiedzi (nie naprowadzające, naturalne)
- Po 5-7 dobrych odpowiedziach ustaw sufficient: true jeżeli masz wystarczająco materiału na bogaty profil
- Pisz naturalnym, ciepłym polskim językiem
- Pytania powinny być krótkie i konkretne (1-2 zdania)${extraInstructions}`,
    prompt: `<user_name>${displayName}</user_name>
Liczba dotychczasowych pytań: ${qaHistory.length}${contextBlock}${historyBlock}

Wygeneruj następne pytanie.`,
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
      bio: 'Jestem osobą otwartą na nowe znajomości.',
      lookingFor: 'Szukam ludzi o podobnych zainteresowaniach.',
      portrait: 'Osoba otwarta i ciekawa świata.',
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
    model: openai(GPT_MODEL),
    schema: profileFromQASchema,
    temperature: 0.7,
    maxOutputTokens: 1000,
    system: `Na podstawie rozmowy profilowej generujesz profil użytkownika dla aplikacji społecznościowej.

Generujesz trzy teksty:

1. bio (100-300 znaków, 1. osoba, po polsku) — kim jest ta osoba: zainteresowania, charakter, styl życia. Naturalny, ciepłym tonem, jak gdyby osoba sama o sobie pisała.

Przykłady dobrego bio:
- "Programuję, a po godzinach odkrywam kuchnię azjatycką. Piekę chleb na zakwasie — hodowla zakwasu to moja duma. Nocna marka, najlepsze pomysły mam po 23."
- "Jestem położną, prowadzę podcast o rodzicielstwie. Zbieram winyle z lat 70. Lubię ludzi, ale potrzebuję czasu dla siebie."

Zasady dla bio:
- Pisz konsekwentnie w 1. osobie ("Programuję", "Jestem położną"), nigdy nie mieszaj z 3. osobą ("Programistka, prowadzi…")
- Nie dodawaj defensywnych zastrzeżeń typu "ale nie oceniam", "bez ściemy", "nie narzucam"
- Unikaj dwuznaczności — jeśli coś brzmi niejasno (np. "mam swoją hodowlę" — hodowlę czego?), doprecyzuj

2. lookingFor (100-300 znaków, 1. osoba, po polsku) — kogo szuka: jakiego typu ludzi, jakich relacji, co ich mogłoby połączyć. Konkretnie, nie ogólnikowo.

Zasady dla lookingFor:
- Pilnuj poprawności gramatycznej po przyimkach: "na" + biernik ("na wspólne wypady"), "do" + dopełniacz ("do wspólnych wypadów")
- Nie mieszaj tych form — jeśli zaczynasz od "Szukam kogoś na", kontynuuj biernikiem
- Nie używaj wykrzykników ani podwójnej interpunkcji ("partnera!." jest błędne)

3. portrait (200-400 słów, 3. osoba, po polsku) — głęboki opis osobowości: jak myśli, co ceni, jak funkcjonuje społecznie, jakie ma motywacje i potrzeby. To jest prywatny dokument — pisz szczerze i wnikliwie, nie pochlebczo. Unikaj banalnych sformułowań.

Bazuj WYŁĄCZNIE na informacjach które wynikają z odpowiedzi. Nie wymyślaj.`,
    prompt: `<user_name>${displayName}</user_name>

<profiling_conversation>
${qaBlock}${contextBlock}
</profiling_conversation>`,
  });

  return object;
}
