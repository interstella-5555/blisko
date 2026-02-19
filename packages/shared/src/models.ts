export const GPT_MODEL = 'gpt-4.1';
export const EMBEDDING_MODEL = 'text-embedding-3-small';

export interface OnboardingQuestion {
  id: string;
  question: string;
  required: boolean;
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  { id: 'occupation', question: 'Czym się zajmujesz?', required: true },
  { id: 'hobbies', question: 'Co lubisz robić w wolnym czasie?', required: false },
  { id: 'current_interests', question: 'Czym się teraz interesujesz albo czego się uczysz?', required: false },
  { id: 'why_here', question: 'Dlaczego zainstalowałeś tę apkę?', required: true },
  { id: 'looking_for', question: 'Kogo szukasz? Znajomych, grupę, konkretną osobę?', required: true },
  { id: 'activities', question: 'Jakie aktywności chciałbyś robić z innymi?', required: false },
  { id: 'conversation_trigger', question: 'Co sprawiłoby, że chciałbyś z kimś pogadać?', required: false },
  { id: 'offer', question: 'Co możesz zaoferować innym?', required: false },
  { id: 'social_style', question: 'Jak zachowujesz się w towarzystwie nowych ludzi?', required: false },
  { id: 'public_self', question: 'Co chciałbyś żeby inni o tobie wiedzieli?', required: false },
];
