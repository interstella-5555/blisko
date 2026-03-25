export const GPT_MODEL = "gpt-4.1-mini";
export const EMBEDDING_MODEL = "text-embedding-3-small";

export interface OnboardingQuestion {
  id: string;
  question: string;
  required: boolean;
  examples?: string[];
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: "intro",
    question:
      "Cześć! Wyobraź sobie, że siadamy przy jednym stoliku. Czym się zajmujesz i co sprawia że tracisz poczucie czasu?",
    required: true,
    examples: [
      "Gram w squasha i szukam zespołu do jam session",
      "Projektantka, po pracy biegam i oglądam dokumenty o oceanach",
      "Inżynier w korpo, weekendy na szlaku lub przy planszówkach",
    ],
  },
  {
    id: "recent_obsession",
    question: "Co ostatnio Cię pochłonęło? Miejsce, książka, serial, cokolwiek.",
    required: false,
  },
  { id: "looking_for", question: "Kogo szukasz? Znajomych, grupę, konkretną osobę?", required: true },
  { id: "activities", question: "Jakie aktywności chciałbyś robić z innymi?", required: false },
  { id: "offer", question: "Co możesz zaoferować innym?", required: false },
  { id: "conversation_trigger", question: "Co sprawiłoby, że chciałbyś z kimś pogadać?", required: false },
  { id: "public_self", question: "Co chciałbyś żeby inni o tobie wiedzieli?", required: false },
];
