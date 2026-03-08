# Rate Limiting & Abuse Protection — Design

## Problem

Zero rate limiting w API. Brak ochrony przed:
- Spam (mass-waving, message flooding)
- Notification bombing (wave/unwave toggle, group message flood)
- OTP abuse (koszt emaili Resend)
- Bot activity (mass account creation, scraping)
- API-level abuse (endpoint hammering)

Railway/Fastly chroni L3/L4 (volumetric DDoS). Potrzebujemy ochrony L7 (application).

## Decyzje

| Decyzja | Wybor | Uzasadnienie |
|---------|-------|-------------|
| UX | Ciche limity | Limity na tyle wysokie ze normalny user nigdy ich nie zobaczy. Tylko abuser dostaje 429. |
| Wave cancel | Usunac | Nieodwracalny wave eliminuje problem wave/unwave notification spam. Jak Tinder/Bumble. |
| Implementacja | Custom Redis Lua scripts | Zero zaleznosci, sliding window counter, pelna kontrola, Bun RedisClient. |
| Klucze | userId (post-auth), IP (pre-auth) | Brak IP-based na auth requests — shared IP (carrier NAT) moglby karac niewinnych. |
| Group push | Unread suppression + collapseId | 1 push na pierwsza nieprzeczytana, kolejne cicho aktualizuja notyfikacje (count). |
| DM push | Bez zmian | Push na kazda wiadomosc jak iMessage. |
| Global pre-auth limit | Brak | Specyficzne limity na OTP wystarczaja. Reszta pokryta przez Railway/Fastly. |

## Limity

### Pre-auth (klucz: IP)

| Endpoint | Limit | Okno | Uzasadnienie |
|----------|-------|------|-------------|
| OTP request | 5 | 15 min | Normalny user: 1-2 proby. Chroni koszty Resend. |
| OTP verify | 8 | 5 min | Kod 6-cyfrowy = 1M kombinacji. 8 prob nie pozwala brute-force. |

### Post-auth (klucz: userId)

| Endpoint | Limit | Okno | Uzasadnienie |
|----------|-------|------|-------------|
| Wave send | 30 | 4h | Bumble: 25/dzien. 30/4h hojne ale lapie mass-waving bota. |
| Wave respond | 60 | 1h | Moze miec duzo oczekujacych wave'ow po powrocie do apki. |
| Message send (per conversation) | 30 | 1 min | Normalna rozmowa: kilka msg/min. 30 = nie spam. |
| Message send (global) | 500 | 1h | Safety net na cross-conversation spam. |
| Profile update | 10 | 1h | Normalne: 1-3 razy. 10 = lapie skrypt. |
| File upload | 10 | 1h | Avatar + zdjecia. |
| Get nearby | 30 | 1 min | Pull-to-refresh happy user. Raz na 2 sekundy. |
| Data export | 1 | 24h | Heavy operation. |
| Global authenticated | 200 | 1 min | Catch-all. Normalne uzytkowanie: ~20-50 req/min max. |

### WebSocket (klucz: userId, in-memory)

| Event | Limit | Okno | Uzasadnienie |
|-------|-------|------|-------------|
| Typing indicator | 10 | 10 sec | Debounce na kliencie, to safety net. |
| WS messages total | 30 | 1 min | Catch-all na WS. |

## Architektura

### Algorytm: Sliding Window Counter

Hybryda fixed window — dwa okna, wazony overlap:

```
prev_count * (1 - elapsed/window) + curr_count
```

Zalety vs fixed window: brak boundary burst exploit.
Zalety vs sliding window log: niskie zuzycie pamieci (2 countery zamiast timestamp per request).

Implementacja: Redis Lua script (atomiczny EVAL).

### Struktura kodu

```
apps/api/src/config/rateLimits.ts        — centralna konfiguracja limitow (jeden plik, czytelna)
apps/api/src/services/rate-limiter.ts     — silnik (Redis Lua sliding window counter)
apps/api/src/middleware/rateLimit.ts       — Hono middleware (pre-auth, IP-based)
apps/api/src/trpc/middleware/rateLimit.ts  — tRPC middleware (post-auth, userId-based)
```

### Konfiguracja (rateLimits.ts)

Jeden obiekt z wszystkimi limitami. Kazdy wpis opisany komentarzem. Przyklad:

```ts
export const rateLimits = {
  // Pre-auth (key: IP)
  "auth.otpRequest": { limit: 5, window: 15 * 60 },
  "auth.otpVerify": { limit: 8, window: 5 * 60 },

  // Post-auth (key: userId)
  "waves.send": { limit: 30, window: 4 * 60 * 60 },
  "waves.respond": { limit: 60, window: 60 * 60 },
  "messages.send": { limit: 30, window: 60 },
  "messages.sendGlobal": { limit: 500, window: 60 * 60 },
  // ...
} as const;
```

### Response (429)

```json
{
  "error": "RATE_LIMITED",
  "message": "Zbyt wiele prob. Sprobuj ponownie za chwile.",
  "retryAfter": 45
}
```

Header: `Retry-After: 45` (sekundy).
Bez `RateLimit-Remaining` — ciche limity, nie ujawniamy ile zostalo.

### Client-side (mobile)

API zwraca `error: "RATE_LIMITED"` + `context` (np. `"waves.send"`).
Mobile mapuje context na ludzki komunikat. Czerwony toast, auto-dismiss 3s, zero auto-retry.

| Context | Komunikat |
|---------|-----------|
| `waves.send` | "Wyslales duzo zaczepek. Odpocznij chwile i sprobuj pozniej." |
| `messages.send` | "Za duzo wiadomosci naraz. Zwolnij troche." |
| `messages.sendGlobal` | "Za duzo wiadomosci. Sprobuj ponownie za chwile." |
| `profiles.update` | "Za duzo zmian w profilu. Sprobuj ponownie za chwile." |
| `uploads` | "Za duzo przeslanych plikow. Sprobuj ponownie za chwile." |
| `dataExport` | "Eksport danych jest dostepny raz na 24 godziny." |
| `auth.otpRequest` | "Za duzo prob logowania. Sprobuj ponownie za kilka minut." |
| `auth.otpVerify` | "Za duzo prob logowania. Sprobuj ponownie za kilka minut." |
| WebSocket | Cichy drop, brak UI. |
| (catch-all) | "Zbyt wiele prob. Sprobuj ponownie za chwile." |

Obsluga w dwoch miejscach:
- Pre-auth (OTP): auth/login flow lapie HTTP 429
- Post-auth (tRPC): global error handler lapie RATE_LIMITED

## Group push notification suppression

### Logika

Przy wyslaniu wiadomosci w grupie:
1. Sprawdz czy odbiorca ma nieprzeczytane w tej konwersacji (`lastReadAt < lastMessageAt`)
2. Jesli tak — wyslij push z `collapseId = conversation:{conversationId}` (cicha podmiana)
3. Jesli nie — wyslij normalny push (buzzy)

Efekt:
- Pierwsza wiadomosc w grupie: normalny push z dzwiekiem
- Kolejne (nieprzeczytane): cicha aktualizacja notyfikacji na "N nowych wiadomosci w {groupName}"
- Po przeczytaniu: nastepna wiadomosc znowu normalny push

### DM

Bez suppression. Push na kazda wiadomosc (jak iMessage).

## Wave — usuniecie cancel

Usuwamy `waves.cancel` procedure. Wave jest nieodwracalny — jak swipe w Tinder/Bumble.
Odbiorca moze: accept, decline, lub zignorować (pending).

Eliminuje caly problem wave/unwave notification spam bez potrzeby rate limitowania per-pair.

## Deduplication

### Wave send race condition (TOCTOU)

`waves.send` sprawdza SELECT czy istnieje pending wave, potem INSERT.
Miedzy nimi moze wejsc duplikat (race condition).

Fix: unique constraint w DB: `UNIQUE(fromUserId, toUserId) WHERE status='pending'`.
Drugi INSERT fail'uje na DB level — bezpieczne.

### Message send idempotency

Network retry = duplikat wiadomosci (rozne ID, ta sama tresc).

Fix: client-generated idempotency key (UUID) w request.
Backend sprawdza w Redis (TTL 5 min) czy klucz juz byl — jesli tak, zwraca poprzedni wynik.

## Poza scope

| Temat | Status | Ticket |
|-------|--------|--------|
| S3 cleanup starych plikow | Osobny ticket | BLI-68 |
| Instrumentation / metryki uzycia | Osobny ticket | BLI-69 |
| Per-conversation mute | Osobny ticket | BLI-70 |
| AI analysis triggers (debounce/throttle) | Osobny ticket | BLI-71 |
| GDPR: soft-deleted users w getById/export | Osobny ticket | BLI-72 |
| Cloudflare/WAF | Nie potrzebne | Railway/Fastly wystarczy na L3/L4 |
| CAPTCHA/device attestation | Nie potrzebne | Mobile-first + auth |

## Zrodla

- Bumble swipe limit: 25/dzien
- Tinder swipe limit: ~50-100/dzien (free)
- Expo Push API: darmowe, limit 600/sec
- Railway DDoS: Fastly WAF od Feb 2026
- Resend: darmowe do 3000 emaili/mies
