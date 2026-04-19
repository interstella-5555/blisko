/**
 * AI models keyed by role, not by provider/family.
 * `sync` — hot-path, user-facing, latency-sensitive (tRPC inline calls, on-demand T3).
 * `async` — background workers, flex-tier capable, optimizes $/token.
 * Swap the mapped value to change providers — call-sites reference the role, not the model id.
 */
export const AI_MODELS = {
  sync: "gpt-4.1-mini",
  async: "gpt-5-mini",
} as const;

export type AiModelRole = keyof typeof AI_MODELS;

export const EMBEDDING_MODEL = "text-embedding-3-small";

export interface OnboardingQuestion {
  id: string;
  question: string;
  required: boolean;
  examples?: string[];
}

/**
 * Przykładowe odpowiedzi (`examples`) są kalibrowane pod 3 maksymalnie różne persony
 * z listy High-Expectation Customer w PRODUCT.md §"Nasz użytkownik".
 * Każde pytanie ma dokładnie 3 examples w stałym porządku person.
 *
 * Profile są rozbudowane celowo — im bogatszy opis, tym łatwiej wygenerować
 * nowe spójne examples gdy dodajemy pytania albo zmieniamy istniejące.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *   1. Kacper — 23, student SGH (finanse), Mokotów
 * ═══════════════════════════════════════════════════════════════════════
 *   Kontekst: 3. rok SGH. Z kolegą z Politechniki buduje fintech-blockchain
 *     MVP (kolega dev, Kacper product + business). Koduje trochę Solidity,
 *     czyta Vitalika. Hackathony crypto/fintech w weekendy.
 *
 *   Rytm dnia: rano zajęcia → kod/pitch decki/research do 3 w nocy →
 *     piątek/sobota kluby (typu Jasna 1) i domówki na Mokotowie →
 *     planszówki, Go, sporadyczna noc z founderską bańką.
 *
 *   Wartości: work-hard-party-hard (nie widzi konfliktu). Wierzy w
 *     "connections > hustle" ale ceni technical depth. 10-year thinking
 *     (Naval, Thiel) plus instant gratification imprez.
 *
 *   Konsumuje: Zero to One, Naval, All-In, Paradigm thesis, crypto Twitter.
 *     Muzyka: b2b techno, house, dub. Czyta w tramwaju.
 *
 *   Cele / frustracje: zbudować coś dużego przed 30. Frustracja że
 *     studenci wokół "nie łapią skali". Szuka mentora po exicie i
 *     partnerów do hackathonów.
 *
 *   Zaoferuje: pitch decki, finanse startupowe, Solidity. Kontakty
 *     w warszawskim crypto/fintech. Wejścia na afterparty.
 *
 *   Ton: casual, mieszany pol-ang slang ("shipping", "MVP", "bańka").
 *
 * ═══════════════════════════════════════════════════════════════════════
 *   2. Maja — 28, fizjoterapeutka z własnym gabinetem, Mokotów
 * ═══════════════════════════════════════════════════════════════════════
 *   Kontekst: mgr fizjoterapii, 5 lat doświadczenia. Prywatny gabinet,
 *     8 pacjentów × 60–90 min dziennie (≈12h). Specjalizacja: sport
 *     + kręgosłup. Klienci: aktywni 25–45.
 *
 *   Rytm dnia: 5:30 pobudka → bieganie 5–10 km (Pole Mokotowskie,
 *     Kabacki) → 8:00–19:00 pacjenci bez przerwy na lunch →
 *     joga 3×/tydz, boulder (Bouldermania, Mur) → weekendy: długie
 *     wybiegania 15–25 km, sporadyczne wyjazdy w góry.
 *
 *   Wartości: sport to tożsamość pierwsza, fizjoterapia — konsekwencja.
 *     Widzi się jako "technik, nie przedsiębiorca" (po E-myth Revisited)
 *     i chce to zmienić. Ceni uważność — w prywatnym woli głębokie
 *     rozmowy zamiast small talku (po 12h słuchania cudzych bólów).
 *
 *   Konsumuje: Huberman Lab, Peter Attia Drive. Endure (Hutchinson),
 *     Body Keeps the Score (van der Kolk), E-myth Revisited. Garmin
 *     Connect logi. Instagram: biegowi influencerzy, wellness brandy.
 *
 *   Cele / frustracje: urosnąć z solo praktyki do zespołu (2–3 fizjo,
 *     większy lokal), ale brakuje biznesowego know-how. Boi się, że
 *     "spartoli" ekspansję. Szuka mentorów w wellness business
 *     (studio jogi, prywatna klinika, fizjo-franczyza).
 *
 *   Zaoferuje: fizjo know-how (bóle pleców, technika biegowa, regeneracja),
 *     kontakty do ortopedów/trenerów/masażystów. Uważne słuchanie.
 *
 *   Ton: rzeczowy, sport-precyzyjny (konkretne tempa 1:38 na półce,
 *     książki, miejsca w Warszawie).
 *
 * ═══════════════════════════════════════════════════════════════════════
 *   3. Paweł — 42, angel investor / operator-turned-mentor
 * ═══════════════════════════════════════════════════════════════════════
 *   Kontekst: założył i sprzedał markę kosmetyczną (D2C skincare) w 2019.
 *     Od tamtej pory angel w biotech (peptydy, mTOR, longevity) i wellness
 *     D2C (supplementy, regeneracja). ~8–12 biznesów w portfolio, zarządy,
 *     mentoring. Nie musi pracować, ale uwielbia "szukać potencjałów".
 *
 *   Rytm dnia: 6:30 pobudka (po 8h snu, non-negotiable) → Zone 2 cardio
 *     albo siłowa z trenerem + sauna + ice bath → 10:00–17:00 deal flow,
 *     calls, rada nadzorcza, pitche foundersów → 17:00 zamyka laptop,
 *     fizjo/trening → 19:00 kolacja (o 18:00 gdy sam) → 21:00 telefon off
 *     → czytanie papierem (Outlive, PubMed, research papers).
 *
 *   Wartości: "ciało jak świątynia" to operacyjna doktryna, nie slogan —
 *     jedzenie, sen, telefon wszystko kalibrowane. Filtruje bullshit
 *     (25 lat deal flow nauczyło odróżniać pitch theater od realu).
 *     Dobór ludzi to największa dźwignia. Dyscyplina + smak — obie
 *     strony tego samego.
 *
 *   Konsumuje: Outlive (Attia), Why We Sleep (Walker), Peter Attia Drive,
 *     Rhonda Patrick, Sinclair Lab, biotech Twitter, PubMed. Wina Burgundii
 *     (uczy się Piemontu). Miejsca: Szczupak (wine bar), Bulaj (sea food),
 *     Mielżyński (degustacje), enoteka pod Montalcino u znajomego.
 *     Wakacje: jachty w Chorwacji latem, Grenadyny/Seszele/Komodo zimą.
 *     Kolekcjonuje vintage zegarki (Grand Seiko, Vacheron).
 *
 *   Cele / frustracje: 2–3 realne deale biotech/longevity rocznie.
 *     Frustrują go founders przychodzący po money a nie po wiedzę.
 *     Szuka operatorek kosmetycznych brandów (jego domena) do advisory.
 *
 *   Zaoferuje: kapitał (angel checks $50–250k), network biotech/kosmetyki/
 *     fundusze, 4 lata operational experience + exit, uczciwy feedback,
 *     własny ekosystem (fizjoterapeuta, trener, dietetyk, sommelier).
 *
 *   Ton: rzeczowy, underyielded, spokojny, zero hype, precyzyjne branże.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *   Kontrast trzech osi:
 *     Wiek:    23 / 28 / 42
 *     Pozycja: builder-student / operator-solo / post-exit angel
 *     Chapter: rozbieg / gabinet rozbudowa / mentoring luxury
 *     Język:   casual pol-ang slang / sport-precyzyjny / operator quiet
 *   Zasada: gdy dodajesz nowe pytanie, napisz 3 examples tak jakby każdy
 *   odpowiadał z perspektywy swojego profilu powyżej — używając jego
 *   codziennych referencji, miejsc, książek, frustracji, języka.
 */
export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "intro",
    question:
      "Cześć! Wyobraź sobie, że siadamy przy jednym stoliku. Czym się zajmujesz i co sprawia że tracisz poczucie czasu?",
    required: true,
    examples: [
      "Studiuję SGH, ale po zajęciach koduję z ziomkiem z PW nasz fintechowy MVP — tracę czas grzebiąc w smart kontraktach do 3 w nocy.",
      "Fizjoterapeutka z Mokotowa, mam gabinet. Tracę czas czytając o budowaniu biznesu usługowego albo lecząc skomplikowane kręgosłupy.",
      "Po exicie w kosmetykach inwestuję w biotech i longevity — tracę czas, gdy analizuję deal przy lampce wina w Szczupaku.",
    ],
  },
  {
    id: "recent_obsession",
    question: "Co ostatnio Cię pochłonęło? Miejsce, książka, serial, cokolwiek.",
    required: false,
    examples: [
      "Zero to One Thiela i podcast All-In, plus wpadłem ostatnio do Jasnej 1 na b2b techno do piątej. Obie rzeczy do tej samej głowy.",
      "„E-myth Revisited” Gerbera — czytam w metrze między pacjentami. Otwiera oczy na to, że jestem technikiem, a nie przedsiębiorcą.",
      "„Outlive” Attii przeczytałem trzeci raz, teraz Sinclair's lab na YouTube. Tydzień temu Seszele, freediving o wschodzie.",
    ],
  },
  {
    id: "looking_for",
    question: "Kogo szukasz? Znajomych, grupę, konkretną osobę?",
    required: true,
    examples: [
      "Ludzi w podobnej bańce — founderów, devów, kogoś kto rozumie po co siedzę nad kodem w piątek i wychodzę imprezować o 23.",
      "Ludzi z biznesu wellness albo zdrowia. Kogoś kto przeszedł drogę od solo praktyki do zespołu i wie jak tego nie spartaczyć.",
      "Founderów z realnym IP, traction i wizją. Nie szukam network'u — szukam konkretnych ludzi, którym mogę pomóc zbudować.",
    ],
  },
  {
    id: "activities",
    question: "Jakie aktywności chciałbyś robić z innymi?",
    required: false,
    examples: [
      "Hackathony weekendowe, planszówki strategiczne, partia Go przy kawie, a potem wypad na Mokotów na solidną domówkę.",
      "Półmaratony, poranna joga na Polu Mokotowskim, boulder na Bloku albo Mur. Lubię też kawę i rozmowy o modelach biznesowych.",
      "Degustacja w Mielżyńskim, kolacja w Bulaju, regaty w Chorwacji latem. Czasem po prostu espresso na Mokotowskiej.",
    ],
  },
  {
    id: "offer",
    question: "Co możesz zaoferować innym?",
    required: false,
    examples: [
      "Ogarniam pitch decki, finanse startupowe i trochę Solidity — mogę skonsultować pomysł albo podrzucić kontakty z bańki.",
      "Konsultacje fizjo dla aktywnych — biegaczy, wspinaczy. Znam dobrych specjalistów w Warszawie. Umiem słuchać ciała i ludzi.",
      "Kapitał, siatkę aniołów z biotechu, realne due diligence. I adres malutkiej enoteki pod Montalcino u mojego znajomego.",
    ],
  },
  {
    id: "conversation_trigger",
    question: "Co sprawiłoby, że chciałbyś z kimś pogadać?",
    required: false,
    examples: [
      "Jak ktoś buduje własny projekt, siedzi w krypto albo gra w Go — od razu mam temat na dwie godziny bez zająknięcia.",
      "Ktoś kto zna swoje tempo na półce (moje 1:38), planuje sezon, rozumie że rest day to trening i ma własny projekt który go napędza.",
      "Konkret. Masz MVP, pierwszych klientów, ciekawą tezę na biotech albo longevity. Albo po prostu budujesz coś ambitnego.",
    ],
  },
  {
    id: "public_self",
    question: "Co chciałbyś żeby inni o tobie wiedzieli?",
    required: false,
    examples: [
      "Jaram się budowaniem rzeczy od zera, ale równie mocno umiem się wyluzować — balans między shippingiem a dobrą imprezą.",
      "Sport był pierwszy, fizjoterapia to konsekwencja — chcę rozbudować gabinet, zatrudnić ludzi, może wspólnika. Ciało to mój język.",
      "Dyscyplina to fundament — 8h snu, telefon off o 21. Reszta to smak: wina, zegarki vintage, Komodo zamiast Dubaju.",
    ],
  },
];
