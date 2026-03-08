# Privacy Policy & Terms of Service — Design Doc (BLI-67)

## Overview

Blisko needs a privacy policy (polityka prywatności) and terms of service (regulamin) to comply with RODO/GDPR before public release. Both documents will be in Polish only, served as static HTML pages from the website service, and linked from the mobile app's registration screen and settings.

## Implementation plan

1. Add `/privacy` and `/terms` routes to the website Bun server
2. Write privacy policy content (Polish)
3. Write terms of service content (Polish)
4. Add acceptance text with links on the mobile login screen
5. Update help screen links to point to correct URLs
6. Verify all links work end-to-end

## Website routes

**File:** `apps/website/src/index.ts`

Add two new routes (`/privacy`, `/terms`) following the existing pattern. Each returns a full HTML page with inline CSS for a clean reading experience. No external dependencies — just a `text/html` response with the document content.

Page style should match the existing website aesthetic: clean, minimal, mobile-friendly. Include a back link to `blisko.app` at the top.

Both pages need:
- `<html lang="pl">` attribute
- Proper `<meta>` tags (viewport, description, charset)
- `<title>` — "Polityka Prywatności — Blisko" / "Regulamin — Blisko"
- Last-updated date at the top of each document
- Responsive layout (readable on mobile and desktop)

## Privacy policy content outline

### 1. Administrator danych
- Operator: individual developer (Karol Wypchło), contact email: kontakt@blisko.app
- Data controller under Art. 4(7) RODO

### 2. Jakie dane zbieramy
- **Dane konta:** email, imię, bio, zainteresowania, linki społecznościowe, status, tryb widoczności
- **Lokalizacja:** ostatnia znana pozycja (tylko w trakcie używania aplikacji, foreground)
- **Pliki:** avatar, portret (przechowywane w chmurze)
- **Wiadomości i zaproszenia:** treść wiadomości, wave'y (zaproszenia do kontaktu)
- **Analiza AI:** embeddingi profilu, wyniki kompatybilności między użytkownikami
- **Sesje profilowania:** historia pytań i odpowiedzi
- **Konta OAuth:** powiązania z dostawcami (Apple, Google, Facebook, LinkedIn) — nie przechowujemy haseł

### 3. Cel i podstawa przetwarzania
- Wykonanie umowy (Art. 6(1)(b)) — świadczenie usługi, dopasowywanie użytkowników
- Prawnie uzasadniony interes (Art. 6(1)(f)) — bezpieczeństwo, zapobieganie nadużyciom
- Zgoda (Art. 6(1)(a)) — przetwarzanie lokalizacji, analiza AI

### 4. Podmioty przetwarzające (procesory danych)
- **OpenAI** (USA, DPA) — analiza profili AI, scoring kompatybilności
- **Railway** (hosting, region EU) — PostgreSQL, Redis
- **Resend** (USA, DPA) — emaile transakcyjne (kody OTP)
- **Tigris/S3** — przechowywanie plików (avatary, portrety)

### 5. Transfer danych poza EOG
- OpenAI i Resend — USA, na podstawie standardowych klauzul umownych (SCC)

### 6. Okres przechowywania
- Dane konta — do usunięcia konta
- Po usunięciu konta — 14-dniowy okres karencji (grace period), potem trwałe usunięcie
- Logi serwera — do 90 dni
- Dane analityki AI — usuwane wraz z kontem

### 7. Prawa użytkownika
- **Prawo dostępu (Art. 15)** — można zażądać eksportu danych
- **Prawo do sprostowania (Art. 16)** — edycja profilu w aplikacji
- **Prawo do usunięcia (Art. 17)** — usunięcie konta z 14-dniowym okresem karencji
- **Prawo do przenoszenia danych (Art. 20)** — eksport w formacie JSON
- **Prawo do sprzeciwu wobec profilowania (Art. 22)** — AI generuje rekomendacje, użytkownik podejmuje decyzje; brak w pełni zautomatyzowanego podejmowania decyzji

### 8. Kontakt
- Email: kontakt@blisko.app
- Prawo wniesienia skargi do UODO (Urząd Ochrony Danych Osobowych)

### 9. Pliki cookies i lokalne przechowywanie
- Aplikacja mobilna nie używa cookies
- Strona www — minimalne cookies techniczne (jeśli są)

### 10. Zmiany w polityce prywatności
- Powiadomienie w aplikacji o istotnych zmianach
- Data ostatniej aktualizacji na górze dokumentu

## Terms of service content outline

### 1. Postanowienia ogólne
- Definicje: Aplikacja, Użytkownik, Usługodawca, Wave, Profil
- Akceptacja regulaminu przez rejestrację

### 2. Warunki korzystania
- **Minimalny wiek: 16 lat** — deklaratywna klauzula, rejestracja oznacza potwierdzenie ukończenia 16 lat
- Jedno konto na osobę
- Prawdziwe dane w profilu

### 3. Opis usługi
- Łączenie osób w pobliżu na podstawie lokalizacji, zainteresowań i analizy AI
- Wave'y (zaproszenia do kontaktu), czat po zaakceptowaniu
- Analiza kompatybilności z wykorzystaniem AI

### 4. Zasady korzystania (akceptowalne użycie)
- Zakaz: spam, nękanie, treści nielegalne, podszywanie się
- Zakaz: zbieranie danych innych użytkowników, scraping
- Zakaz: używanie botów lub automatyzacji (poza oficjalnymi)

### 5. Konto i bezpieczeństwo
- Odpowiedzialność za bezpieczeństwo konta
- Logowanie przez OAuth lub email + OTP (bez haseł)

### 6. Treści użytkownika
- Użytkownik zachowuje prawa do swoich treści
- Licencja dla Blisko na przetwarzanie treści w ramach usługi
- Prawo do usunięcia treści naruszających regulamin

### 7. Usunięcie konta
- Możliwość usunięcia w ustawieniach aplikacji
- 14-dniowy okres karencji — można anulować
- Po 14 dniach — trwałe usunięcie danych (soft delete, potem hard delete)

### 8. Ograniczenie odpowiedzialności
- Usługa "as is" — brak gwarancji ciągłości
- Brak odpowiedzialności za zachowania innych użytkowników
- Brak odpowiedzialności za dokładność analizy AI

### 9. Zmiany regulaminu
- Powiadomienie z wyprzedzeniem o istotnych zmianach
- Kontynuacja korzystania = akceptacja zmian

### 10. Prawo właściwe
- Prawo polskie
- Sąd właściwy: Warszawa

## Mobile changes

### Login screen (`apps/mobile/app/(auth)/login.tsx`)

Add a small text block below all OAuth buttons and the email input:

> "Rejestrując się akceptujesz [Regulamin](https://blisko.app/terms) i [Politykę Prywatności](https://blisko.app/privacy)"

- Use `Text` with nested `Text` components for links (or `Linking.openURL`)
- Style: small font (12-13px), muted color (`colors.ink50` or similar), centered
- Links open in the system browser via `Linking.openURL`

### Help screen (`apps/mobile/app/settings/help.tsx`)

Lines 45-55 have TODO links pointing to `blisko.app/regulamin` and `blisko.app/prywatnosc`. Update:
- Regulamin link: `https://blisko.app/terms`
- Polityka prywatności link: `https://blisko.app/privacy`

## Files to modify/create

| File | Action | Description |
|------|--------|-------------|
| `apps/website/src/index.ts` | Modify | Add `/privacy` and `/terms` routes with HTML content |
| `apps/mobile/app/(auth)/login.tsx` | Modify | Add acceptance text with links below OAuth buttons |
| `apps/mobile/app/settings/help.tsx` | Modify | Update TODO links to correct URLs |
