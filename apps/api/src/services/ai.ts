import { generateText, generateObject, embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { GPT_MODEL, EMBEDDING_MODEL } from '@repo/shared';

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
      model: openai.embedding(EMBEDDING_MODEL),
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
      model: openai(GPT_MODEL),
      temperature: 0.7,
      maxOutputTokens: 500,
      system: `Na podstawie profilu użytkownika (bio: kim jestem, lookingFor: kogo szukam), wygeneruj bogaty profil społeczny (200-300 słów) opisujący:
- Kim jest ta osoba: zainteresowania, hobby, styl życia, osobowość
- Czego szuka u innych: ROZWIĄŻ ogólne sformułowania na konkretne cechy (np. "ludzi o podobnych zainteresowaniach" → wymień jakich zainteresowaniach na podstawie bio)
- Jakie tematy i aktywności są dla tej osoby ważne
Nie oceniaj, nie wartościuj — opisuj. Pisz w 3. osobie, naturalnym językiem polskim. Nie używaj nagłówków ani list — pisz płynnym tekstem.`,
      prompt: `<user_bio>${bio}</user_bio>\n\n<user_looking_for>${lookingFor}</user_looking_for>`,
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
      model: openai(GPT_MODEL),
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
  matchScoreForA: z.number().min(0).max(100),
  matchScoreForB: z.number().min(0).max(100),
  snippetForA: z.string().max(90),
  snippetForB: z.string().max(90),
  descriptionForA: z.string().max(500),
  descriptionForB: z.string().max(500),
});

export type ConnectionAnalysisResult = z.infer<
  typeof connectionAnalysisSchema
>;

export async function analyzeConnection(
  profileA: { socialProfile: string; displayName: string; lookingFor: string },
  profileB: { socialProfile: string; displayName: string; lookingFor: string }
): Promise<ConnectionAnalysisResult> {
  try {
    const { object } = await generateObject({
      model: openai(GPT_MODEL),
      schema: connectionAnalysisSchema,
      temperature: 0.7,
      system: `Jesteś prowadzącym randkę w ciemno. Znasz obie osoby i prezentujesz każdą z perspektywy drugiej.

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
descriptionForB: "Gra w padla 3 razy w tygodniu — szuka kogoś na regularne mecze na podobnym poziomie. Programista, pracuje zdalnie. Gra też w squasha i ping-ponga. Ogląda F1."`,
      prompt: `<user_profile name="A">
${profileA.displayName}:
${profileA.socialProfile}

Szuka: ${profileA.lookingFor}
</user_profile>

<user_profile name="B">
${profileB.displayName}:
${profileB.socialProfile}

Szuka: ${profileB.lookingFor}
</user_profile>`,
    });
    return object;
  } catch (error) {
    console.error('Error analyzing connection:', error);
    throw error;
  }
}
