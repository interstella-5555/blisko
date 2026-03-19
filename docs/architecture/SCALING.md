# Blisko — Analiza skalowalności

Analiza kosztów AI, projekcje ruchu, architektura matchingu, limity infrastruktury i plan skalowania od POC w Warszawie do skali krajowej.

---

## Kontekst

Blisko to location-based social app łącząca ludzi na podstawie bliskości fizycznej, statusów i AI-driven compatibility analysis. Startujemy w Warszawie, potem największe polskie miasta (Kraków, Wrocław, Trójmiasto, Poznań), potem mniejsze.

**Core AI operations:**
- Profile Match (Level 1) — % kompatybilności na bańce, asymetryczny (A→B ≠ B→A)
- Status Match (Level 2) — wykrywanie komplementarnych statusów w pobliżu, push + pulsująca bańka
- "Co nas łączy" — tekst AI generowany warunkowa (3 scenariusze per PRODUCT.md)
- Onboarding — AI-driven Q&A profiling, generowanie bio/portrait
- Background proximity matching — ambient status matching gdy nowi userzy pojawiają się w okolicy

**Kluczowe zasady:**
- Jakość matchingu jest priorytetem — matching musi być "zajebisty", nie idziemy po taniosci
- Koszty muszą skalować się liniowo z ruchem — mały ruch = małe koszty, duży ruch = duże ale uzasadnione koszty
- Railway jako platforma docelowa tak długo jak to możliwe
- Inwestorzy mogą dołożyć w fazie wzrostu — rentowność od dnia 1 nie jest wymagana

---

## Projekcje ruchu

### Benchmarki z podobnych apek (2020-2026)

| App | Rok | Strategia | Wynik |
|---|---|---|---|
| Fizz (campus social) | 2022 | Campus po kampusie | 95% studentów Stanforda pobrało. 80+ kampusów w rok |
| Gas (anonymous compliments) | 2022 | Szkoła po szkole, zero ad spend | 40% szkoły w 48h. #1 App Store w 3 mies. 10M w 3 mies |
| BeReal | 2020-22 | 2 lata zero trakcji → ambasadorzy na kampusach | Z 20K do 73M w 2022 |
| Timeleft (dinner w/ strangers) | 2023 | Jeden event w Lizbonie, 24 osoby | 6K uczestników w 4 mies, 18M EUR ARR po 2 latach |
| Jagat (location social, SE Asia) | 2023 | Offline events | 1M DAU w pierwszym miesiącu |

### Polski rynek

| Miasto | Metro | Target 20-35 | 10% adopcji |
|---|---|---|---|
| Warszawa | 3.1M | ~400K | 40K |
| Kraków | 1.4M | ~180K | 18K |
| Wrocław | 1.1M | ~140K | 14K |
| Trójmiasto | 1.0M | ~130K | 13K |
| Poznań | 0.9M | ~115K | 11.5K |
| Łódź | 0.9M | ~115K | 11.5K |
| **Razem top 6** | **8.4M** | **~1.08M** | **108K** |

### Scenariusze wzrostu

| Scenariusz | MAU | DAU (20%) | Concurrent WS | Geografia | Timeline |
|---|---|---|---|---|---|
| **S1: Soft launch** | 1,000 | 200 | 50-80 | Warszawa (uczelnie) | Mies 1-2 |
| **S2: Wzrost** | 5,000 | 1,000 | 300-500 | Warszawa (organiczny) | Mies 2-4 |
| **S3: Traction** | 20,000 | 4,000 | 1,200-2,000 | Warszawa nasycona | Mies 4-8 |
| **S4: Multi-city** | 50,000 | 10,000 | 3,000-5,000 | +Kraków +Wrocław | Mies 8-12 |
| **S5: Skala krajowa** | 200,000 | 40,000 | 12,000-20,000 | Top 6 miast PL | Mies 12-24 |

**Minimum żeby mapa "żyła":** ~2,000-5,000 DAU skoncentrowane w centrum (~30 km²) = 60-150 DAU/km².

**S3 (20K MAU) = realistyczny cel na Warszawę** (5% target demo). S5 wymaga 4-6 miast.

### Retention benchmarks (a16z, social apps)

| Metryka | Target "Good" | Target "Great" |
|---|---|---|
| DAU/MAU | 40% | 50%+ |
| D1 retention | 60% | 70% |
| D7 retention | 40% | 50% |
| D30 retention | 25% | 30% |

Realistycznie pre-PMF: D1 25-40%, D7 15-30%, D30 5-15%.

### Monetyzacja

| Metryka | Pesymistyczny | Realistyczny | Optymistyczny |
|---|---|---|---|
| Premium conversion | 2-3% | 5-8% | 10%+ |
| ARPPU | 15 PLN/mies | 19 PLN/mies | 25 PLN/mies |

---

## Obecna architektura AI

### Modele

- **LLM:** gpt-4.1-mini ($0.40/M input, $0.10/M cached, $1.60/M output)
- **Embeddings:** text-embedding-3-small ($0.02/M tokens) — koszt zaniedbywalny

### Operacje AI i ich koszty

| Operacja | Tokeny (in/out) | Koszt/call | Trigger | Częstotliwość |
|---|---|---|---|---|
| `analyzeConnection` (full pair) | ~2500/1000 | $0.0026 | Location update → 100 par | Bardzo częste (PROBLEM) |
| `evaluateStatusMatch` | ~350/50 | $0.00022 | Status change → 20 evals | Umiarkowane |
| `generatePortrait` | ~300/500 | $0.0009 | Profile create/update | Rzadkie |
| `extractInterests` | ~400/200 | $0.0005 | Po portrait | Rzadkie |
| `generateProfileFromQA` | ~1000/900 | $0.0019 | Onboarding complete | Jednorazowe |
| `generateNextQuestion` | ~500/200 | $0.0005 | Per Q&A answer (max 12) | Jednorazowe |
| `generateEmbedding` | ~500 | ~$0 | Profile/status change | Rzadkie |

### Problem: O(N²) pair analysis

Obecny flow: `updateLocation` → `analyze-user-pairs` → kolejkuj do 100× `analyze-pair` (pełna analiza LLM).

95% tych analiz user nigdy nie zobaczy. Widzi ~30 bańek na ekranie, tapnie 3-5. Reszta to zmarnowane tokeny.

---

## Tiered matching — proponowana architektura

Rozwiązanie: trzy poziomy analizy, każdy uruchamiany w innym momencie. Jakość user-facing się nie zmienia — oszczędność wynika z nie generowania tekstu którego nikt nie czyta.

### Tier 1: Embedding cosine similarity (natychmiastowy, $0)

- Cosine similarity na wektorach profili (już computed)
- Symetryczny score (A↔B identyczny) — jedyny kompromis, placeholder na ~200-500ms
- Pokazywany na bańce zanim T2 się policzy
- Korelacja z pełnym LLM score: ~70%

### Tier 2: Quick LLM score (lazy, $0.0005/pair)

- Oba profile → asymetryczny score 0-100 w obu kierunkach, bez tekstu
- ~1200 input + ~30 output tokenów
- gpt-4.1-mini (ten sam model co full analysis — ta sama jakość scorowania)
- Cachowany z hash-based invalidation (identycznie jak obecny dedup)
- Korelacja z pełnym LLM score: ~90-95%
- Zastępuje T1 na bańce gdy gotowy
- Jedno wywołanie per para (zwraca scoreForA i scoreForB)

### Tier 3: Full analysis (on-demand, $0.0026/pair)

- Identyczny z obecnym `analyzeConnection` — snippety, opisy, pełne "Co nas łączy"
- Triggery: user tapnie bańkę, user wyśle wave
- Cachowany (7 dni TTL, invalidacja na zmianę profilu)
- SLA: < 3 sekundy

### UX flow z tiered matching

1. User otwiera mapę → bańki z **T1 score** (instant, free)
2. W tle, dla widocznych bańek → **T2 quick scores** (lazy, LLM-based)
3. T2 gotowy → % na bańce aktualizuje się via WebSocket (subtelna zmiana)
4. User tapnie bańkę → **T3 full analysis** generuje "Co nas łączy" (2-3s loading)
5. Wynik T3 cachowany — następne otwarcie jest instant

### Asymetryczne matching

Matching jest asymetryczny we wszystkich tierach LLM:
- T2 zwraca `{scoreForA: number, scoreForB: number}` — jedna call, dwa kierunki
- T3 zwraca pełne snippety per kierunek: `snippetForA`, `snippetForB`, `descriptionForA`, `descriptionForB`
- T1 (embedding cosine) jest symetryczny — to jedyny kompromis, trwa ~200-500ms

---

## Background operations — ambient matching

### Proximity-triggered status matching

**Problem w obecnej architekturze:** Status matching odpala się TYLKO gdy user zmieni status. Jeśli A ustawił status 2h temu i B pojawia się w okolicy — brak matcha.

**Nowy flow:**
1. User B wysyła location update (background, co 5-15 min)
2. Server sprawdza: kto w okolicy B ma aktywny status?
3. Dla każdego usera z aktywnym statusem → `evaluateStatusMatch(A.status, B.context)`
4. Jeśli match → push do obu (cichy sygnał), zapis do `statusMatches`, bańka pulsuje

**Koszt:** 2-5 nowych nearby userów z aktywnym statusem per dzień per user.

| Scenariusz | DAU | Proximity evals/dzień | Koszt/mies |
|---|---|---|---|
| S1 (1K) | 200 | ~250 | $1.65 |
| S3 (20K) | 4K | ~5,000 | $33 |
| S5 (200K) | 40K | ~50,000 | $330 |

### Inne background operacje

| Operacja | Opis | Koszt AI | Częstotliwość |
|---|---|---|---|
| Proximity status match | Nowy user w okolicy → sprawdź status match | $0.00022/eval | Ciągle, w tle |
| Daily digest push | "Widzieliśmy X ciekawych osób w okolicy" | $0 (query istniejących analiz) | 1x/dzień cron |
| TTL refresh | Stare analizy (>7 dni) → przelicz batchem | $0.0013/pair (batch API 50% off) | Nightly cron |
| Status expiry cleanup | Wygasłe statusy → wyczyść statusMatches | $0 | Cron |

---

## Koszty AI per scenariusz

### Z tiered matching (rekomendacja)

| Scenariusz | MAU | DAU | T2 scores | T3 on-demand | Status match | Background | Onboarding | **Total/mies** |
|---|---|---|---|---|---|---|---|---|
| **S1** | 1K | 200 | $23 | $23 | $4 | $5 | $12 | **~$67** |
| **S2** | 5K | 1K | $113 | $117 | $20 | $24 | $56 | **~$330** |
| **S3** | 20K | 4K | $450 | $468 | $158 | $130 | $340 | **~$1,550** |
| **S4** | 50K | 10K | $1,125 | $1,170 | $396 | $320 | $640 | **~$3,650** |
| **S5** | 200K | 40K | $4,500 | $4,680 | $1,584 | $1,300 | $2,040 | **~$14,100** |

### Porównanie: tiered vs obecna architektura

| Scenariusz | Obecna arch (100 analiz/location update) | Tiered matching | Oszczędność |
|---|---|---|---|
| S1 (1K) | ~$300 | ~$67 | 4.5x |
| S3 (20K) | ~$19,000 | ~$1,550 | 12x |
| S5 (200K) | ~$190,000 | ~$14,100 | 13x |

---

## AI API — throughput i rate limits

### Wymagania RPM (requests per minute)

| Scenariusz | Sustained RPM | Peak (4x) |
|---|---|---|
| S1 (1K) | ~10 | ~40 |
| S3 (20K) | ~200 | ~800 |
| S5 (200K) | ~2,000 | ~8,000 |

### OpenAI rate limits (gpt-4.1-mini i gpt-4.1-nano)

| Tier | Odblokowanie | RPM | TPM |
|---|---|---|---|
| Tier 1 | $5 | 500 | 200K |
| Tier 2 | $50 + 7 dni | 5,000 | 2M |
| Tier 3 | $100 + 7 dni | 5,000 | 4M |
| Tier 4 | $250 + 14 dni | 10,000 | 10M |
| Tier 5 | $1,000 + 30 dni | 30,000 | 150M |

**OpenAI Tier 5 (30K RPM) pokrywa S5 z 4x headroom.** Odblokowanie: łącznie $1,000 spend + 30 dni.

### Fallback strategy

LiteLLM proxy jako load-balancer:
- Primary: OpenAI gpt-4.1-mini (Tier 5, 30K RPM)
- Fallback: DeepSeek V3.2 (brak rate limitów, best-effort) lub Gemini Flash
- Automatic failover na 429/timeout

### BullMQ — NIE jest bottleneckiem

BullMQ obsługuje 250,000+ jobs/sec. Jedyny limit to rate limit API providera AI. BullMQ concurrency powinien być ustawiony na 50+ (obecne 5 było artefaktem OpenAI throttlingu).

---

## Infrastruktura — Railway

### Railway Pro plan

- Up to 1,000 vCPU / 1 TB RAM per service
- Up to 50 replicas × 32 vCPU / 32 GB RAM per replica
- 1 TB storage
- HA Postgres (streaming replicas + HAProxy + etcd)
- Concurrent global regions
- $20 minimum/mies (usage-based beyond credits)

### Plan skalowania na Railway

| Faza | MAU | Co zmienić | Koszt Railway |
|---|---|---|---|
| **S1 (teraz)** | 1K | BullMQ concurrency 50+. Redis pub/sub. Osobny worker service. HA Postgres. | ~$30-60/mies |
| **S2** | 5K | Tune Postgres (shared_buffers, work_mem). Monitoring. | ~$80-150/mies |
| **S3** | 20K | 2-3 API repliki. pgvector extension. | ~$200-400/mies |
| **S4** | 50K | 4-6 API replik. Read replica Postgres. | ~$500-1,000/mies |
| **S5** | 200K | 10+ replik. Multi-region. Enterprise tier rozmowa. | ~$1,500-3,000/mies |

### Architektoniczne zmiany wymagane do skalowania

#### Natychmiast (zero-cost, zero-risk):
1. BullMQ concurrency 5 → 50+
2. Redis pub/sub zamiast EventEmitter (cross-replica WebSocket events)
3. Osobny BullMQ worker service (nie na API)
4. HA Postgres (Railway built-in)
5. Debounce na profile updates (30s po ostatniej edycji)

#### Przy S3 (~20K MAU):
6. Multiple API repliki (2-3)
7. pgvector extension dla embedding similarity search w SQL

#### Przy S4+ (~50K MAU):
8. Osobna domena na WebSocket (`ws.blisko.app`) jeśli 10K concurrent limit per domain
9. PgBouncer lub connection pooling
10. Read replica dla Postgres

### Railway WebSocket limit

Railway proxy: ~10,000 concurrent WebSocket connections per domain. To pokrywa ~25-35K DAU. Workarounds:
- Osobna domena `ws.blisko.app` (podwaja limit)
- Multi-region (osobny proxy per region)
- Enterprise tier (wyższe limity)
- Cloudflare przed Railway

---

## Revenue vs koszt — skalowalna ekonomia

| Scenariusz | MAU | AI + Infra koszt | Revenue (5%, 19PLN) | Margin |
|---|---|---|---|---|
| S1 | 1K | ~400 PLN | 950 PLN | +550 PLN |
| S2 | 5K | ~1,900 PLN | 4,750 PLN | +2,850 PLN |
| S3 | 20K | ~7,800 PLN | 19,000 PLN | +11,200 PLN |
| S4 | 50K | ~18,600 PLN | 47,500 PLN | +28,900 PLN |
| S5 | 200K | ~68,400 PLN | 190,000 PLN | +121,600 PLN |

Przy 0 userów: ~200 PLN/mies (Railway idle). Koszty AI = $0.

---

## SLA targets

| Operacja | Target | Uzasadnienie |
|---|---|---|
| Map load (nearby users) | p95 < 500ms | First impression, musi być szybkie |
| T2 quick score | < 500ms | Lazy-loaded, user ledwo zauważy |
| T3 "Co nas łączy" | < 3 sec | On-demand po tapnięciu bańki |
| Status matching | < 30 sec | Po zmianie statusu |
| Proximity status match | < 60 sec | Background, user nie czeka |
| Message delivery (WS) | < 200ms | Real-time chat feel |
| Wave response | < 300ms | Szybka interakcja |
| Push notification | < 5 sec | Standard mobile |
| Queue job start | < 5 min | Żaden AI job nie czeka dłużej |
| Error rate | < 5% | Istniejący SLO |
| Uptime | 99.5% | ~3.5h downtime/mies dozwolone |

---

## Decyzje

| Temat | Decyzja | Uzasadnienie |
|---|---|---|
| Model AI | gpt-4.1-mini | Jakość matchingu jest priorytetem. Nie idziemy po taniosci |
| Matching architektura | Tiered (T1→T2→T3) | 12-15x tańszy bez utraty jakości user-facing |
| API provider | OpenAI primary (Tier 5) + LiteLLM fallback | 30K RPM pokrywa S5 z headroom |
| Infrastruktura | Railway Pro → Enterprise | Pokrywa Warszawę + 5 miast. Enterprise gdy rachunek >$3K/mies |
| BullMQ | Concurrency 50+, osobny worker service | Był ograniczony artefaktem OpenAI throttlingu |
| WebSocket | Redis pub/sub od dnia 1 | Zero-cost prep na multi-replica |
| Background matching | Proximity-triggered status matching | Core ambient feature, tani (~$33/mies przy S3) |
| Asymetryczny matching | Tak, w T2 i T3 | T1 (embedding) jest symetryczny — placeholder na ~200-500ms |

---

## Implementacja — co zrobić

### Natychmiast (infrastruktura, zero-cost):
1. BullMQ concurrency 5 → 50+ (usunąć artificial limit)
2. Redis pub/sub adapter zamiast EventEmitter
3. Osobny BullMQ worker service
4. HA Postgres
5. Debounce na profile updates

### Feature work (architektura matchingu):
6. Tiered matching (T1→T2→T3)
7. Proximity-triggered status matching
8. TTL + batch refresh na stale analyses
9. Daily digest push ("ciekawe osoby w okolicy")
10. pgvector extension (przygotowanie pod T1 at-scale)
