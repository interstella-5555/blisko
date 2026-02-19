# Demo AI Upgrade Plan — 2026-02-19

> Upgrade modeli AI na demo dla kolegi. Zmiany kosmetyczne (swap model ID), łatwo odwracalne.

## Status quo

**Wszystko** używa `gpt-4o-mini` — najtańszy model OpenAI. Dobry na produkcję (koszt), ale dla jednorazowego demo warto przeskoczyć na `gpt-4o` tam gdzie jakość tekstu jest widoczna.

| Funkcja | Model teraz | Plik |
|---------|------------|------|
| analyzeConnection | gpt-4o-mini | `apps/api/src/services/ai.ts:106` |
| generateSocialProfile | gpt-4o-mini | `apps/api/src/services/ai.ts:39` |
| extractInterests | gpt-4o-mini | `apps/api/src/services/ai.ts:67` |
| generateEmbedding | text-embedding-3-small | `apps/api/src/services/ai.ts:17` |
| generateNextQuestion | gpt-4o-mini | `apps/api/src/services/profiling-ai.ts:56` |
| generateProfileFromQA | gpt-4o-mini | `apps/api/src/services/profiling-ai.ts:113` |
| generateBotMessage | gpt-4o-mini | `apps/chatbot/src/ai.ts:52` |
| moderation | OpenAI Moderations API | `apps/api/src/services/moderation.ts` |

## Plan zmian

### 1. analyzeConnection → `gpt-4o` — NAJWYŻSZY PRIORYTET

**Plik:** `apps/api/src/services/ai.ts:106`

To jest serce apki — opisy matchów, które user czyta na ekranie "W okolicy". Lepszy model = bardziej trafne, wnikliwe, naturalnie brzmiące opisy osób. Różnica między mini a 4o jest tu bardzo widoczna (dłuższy prompt z 5 przykładami, structured output, niuanse asymetrycznego scoringu).

### 2. generateProfileFromQA → `gpt-4o` — WYSOKI PRIORYTET

**Plik:** `apps/api/src/services/profiling-ai.ts:113`

Generuje bio, lookingFor i portrait z onboardingowego Q&A. Jeśli pokażesz flow profilowania — lepszy model da zauważalnie bogatszy, bardziej wnikliwy portret osobowości. Portrait to 200-400 słów — tu mini często produkuje sztampowe teksty.

### 3. generateNextQuestion → `gpt-4o` — ŚREDNI PRIORYTET

**Plik:** `apps/api/src/services/profiling-ai.ts:56`

Adaptacyjne pytania podczas onboardingu. Lepszy model = bardziej kontekstowe follow-upy, lepsze sugestie odpowiedzi. Widoczne jeśli demo obejmuje onboarding.

### 4. generateSocialProfile → `gpt-4o` — ŚREDNI PRIORYTET

**Plik:** `apps/api/src/services/ai.ts:39`

Wzbogaca surowe bio w 200-300 słów profilu. Ten tekst jest inputem do analyzeConnection — lepszy input = lepszy output na końcu. Efekt kaskadowy.

### 5. generateBotMessage → `gpt-4o` — WYSOKI jeśli demo obejmuje chatbota

**Plik:** `apps/chatbot/src/ai.ts:52`

Wiadomości od seed userów. Lepszy model = bardziej naturalne, in-character odpowiedzi zamiast generycznych. Widoczne natychmiast w czacie.

### 6. extractInterests — BEZ ZMIAN

Proste wyciąganie tagów, `gpt-4o-mini` wystarczy. Temperature 0, deterministyczne.

### 7. generateEmbedding — BEZ ZMIAN

Embeddingi nie są bezpośrednio widoczne. Zmiana na `text-embedding-3-large` wymagałaby re-generacji wszystkich embeddingów w bazie (inny wymiar wektora) — za dużo roboty na demo.

### 8. moderation — BEZ ZMIAN

API moderacji nie ma wariantów modeli.

## Implementacja

Zmiana w każdym pliku to zamiana jednego stringa:
```
openai('gpt-4o-mini')  →  openai('gpt-4o')
```

**Pliki do edycji:**
1. `apps/api/src/services/ai.ts` — 3 miejsca (linie 39, 67→skip, 106)
   - linia 39: generateSocialProfile ✅
   - linia 67: extractInterests ❌ (bez zmian)
   - linia 106: analyzeConnection ✅
2. `apps/api/src/services/profiling-ai.ts` — 2 miejsca (linie 56, 113)
   - linia 56: generateNextQuestion ✅
   - linia 113: generateProfileFromQA ✅
3. `apps/chatbot/src/ai.ts` — 1 miejsce (linia 52)
   - linia 52: generateBotMessage ✅

**Łącznie: 5 zmian w 3 plikach.**

## Po zmianie modeli

Żeby zobaczyć efekt na istniejących userach, trzeba przeliczyć analizy:
```bash
pnpm dev-cli -- reanalyze user42@example.com --clear-all
```

Dla nowych userów (onboarding) — efekt widoczny od razu.

## Po demo — rollback

Zamienić z powrotem `gpt-4o` → `gpt-4o-mini` w tych samych 5 miejscach (albo `git revert`).

## Koszt

`gpt-4o` jest ~15x droższy niż `gpt-4o-mini` per token. Dla jednorazowego demo to nieistotne — mowa o centach/dolarach. Na produkcji warto wrócić do mini.
