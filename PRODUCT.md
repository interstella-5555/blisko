# Blisko — Product Bible

> ***Właściwa osoba jest w pobliżu. Zawsze była.***

Ten dokument jest wykładnią produktu. Każda decyzja — techniczna, designerska, marketingowa — powinna dać się uzasadnić przez coś co tu jest napisane. Jeśli nie da się — albo decyzja jest zła, albo ten dokument wymaga aktualizacji.

---

## Blisko w 90 sekund

Blisko rozwiązuje paradoks naszych czasów: nigdy nie byliśmy tak połączeni i nigdy nie czuliśmy się tak samotni.

Tinder, LinkedIn, Bumble — wszystkie działają na tym samym modelu: stwórz profil, przeglądaj, wybierz. To model sklepowy. Blisko robi coś fundamentalnie innego.

Działamy w tle. Użytkownik ustawia status — czego szuka dziś: współpracownika, randki, kogoś do biegania, inwestora — i żyje swoim życiem. Gdy w promieniu 500 metrów pojawi się ktoś z komplementarną intencją, telefon delikatnie wibruje. Jedna bańka na mapie zaczyna pulsować. Nic więcej.

Nie ma scrollowania. Nie ma algorytmu rekomendacji. Jest tylko obecność — dwoje ludzi, 300 metrów od siebie, w tym samym momencie, z pasującą potrzebą. To 10-20 razy wyższy kontekst niż cold message na LinkedIn.

Prywatność jest wbudowana w architekturę — intencja pod kontrolą użytkownika dopóki sam nie zdecyduje się pingować. Nikt nie wie czego szukasz, dopóki nie wyślesz sygnału.

Startujemy w Polsce, z wersją ukraińską od dnia pierwszego — to świadoma decyzja rynkowa. Cel: Europa w ciągu 18 miesięcy.

---

## Wielka idea

Blisko to pierwsza platforma która zamienia przestrzeń fizyczną w warstwę intencji.

Nigdy w historii ludzkość nie była tak połączona — i nigdy nie czuła się tak samotna. Mamy tysiąc znajomych na LinkedIn i nie ma z kim pogadać o projekcie. Mamy Tindera i związki trwają krócej niż subskrypcja. Mamy Meetup i wracamy do domu z wizytówką której nigdy nie użyjemy.

Problem nie jest w ludziach. Problem jest w modelu. Wszystkie obecne platformy działają na tej samej architekturze: stwórz profil → przeglądaj → wybierz → połącz. To model sklepowy. Blisko robi coś fundamentalnie innego: **nie przeglądasz ludzi — jesteś w miejscu.**

Miejsce ma energię. Ludzie w tym miejscu mają potrzeby. Blisko sprawia że te potrzeby mogą się spotkać — bez performowania, bez scrollowania, bez cold outreachu. W kawiarni, na siłowni, na evencie, w samolocie. Wszędzie tam gdzie już jesteś.

---

## Dlaczego teraz

| Epidemia samotności | Zmęczenie cyfrowymi relacjami | Koniec modelu sklepowego |
|---|---|---|
| WHO uznało samotność za globalny kryzys zdrowotny. Gen Z i Millenialsi to najbardziej osamotnione pokolenie w historii — mimo bycia najbardziej online. | Po pandemii ludzie wracają do fizyczności. Kawiarnie pełne, siłownie rekordowe, eventy wyprzedane. Chcemy być razem — brakuje nam tylko pomostu. | Tinder, LinkedIn, Bumble BFF — tracą retencję. Użytkownicy nie chcą kolejnej apki do scrollowania. Chcą narzędzia które działa za nich. |

---

## Cztery filary

Każda funkcja w Blisko musi wzmacniać przynajmniej jeden z tych filarów. Jeśli nie wzmacnia żadnego — nie budujemy tego.

### Ambient
Działa w tle gdy użytkownik żyje swoim życiem. Nie wymaga uwagi — sam powiadamia gdy coś się dzieje. **Zero scrollowania.** Aplikacja szuka za użytkownika. Użytkownik żyje, Blisko pracuje.

### Meta
Jedno narzędzie, nieskończone konteksty: randka, projekt, inwestycja, znajomy do biegania, klient, współpracownik. Nie kategoryzuje cię — **ty sam decydujesz czego szukasz.** Status to twoja intencja — wieczny, aktywny dopóki sam go nie zmienisz lub nie usuniesz. Zmiana jednym tapem na mapie.

### Fizyczny
Łączy przez obecność, nie przez algorytm. Dwie osoby 300 metrów od siebie z pasującą intencją — to 10-20x wyższy kontekst niż cold message. **Bliskość fizyczna jest filtrem jakości.**

### Prywatny
Intencja pod kontrolą użytkownika. Przy każdym statusie sam decydujesz: publiczny (widoczny dla wszystkich) czy prywatny (ukryty, matching server-side). Nikt nie wie czego szukasz dopóki sam nie zdecydujesz — **a gdy matching znajdzie kogoś komplementarnego, telefon delikatnie wibruje i jedna bańka na mapie zaczyna pulsować. Nic więcej.**

---

## Nasz użytkownik (High-Expectation Customer)

20-35 lat. Mieszka w dużym mieście. Aktywny — siłownia, kawiarnie, eventy, coworkingi. Ma potrzeby społeczne i zawodowe ale nie chce spędzać czasu na scrollowaniu profili. Chce żeby „rzeczy się zdarzały" — naturalnie, w tle, przy okazji.

To nie jest osoba która szuka apki do poznawania ludzi. To osoba która chce **narzędzie które pracuje za nią** — jak GPS który prowadzi, nie jak katalog który trzeba przeglądać.

Konkretne persony:
- Freelancer w kawiarni, otwarty na rozmowę o projekcie
- Studentka SGH szukająca kogoś do projektu z Politechniki
- Inwestor na konferencji, szukający deep tech foundersów
- Nowa osoba w mieście, chcąca poznać kogoś do biegania
- Regularny bywalec siłowni — te same twarze, zero rozmów

---

## Zasady produktu

Zasady które tworzą **realne trade-offy** — gdyby nikt nie mógł się z nimi nie zgodzić, nie byłyby zasadami.

### 1. Kontrola intencji ponad wygodę odkrywania
> Użytkownik sam decyduje przy każdym statusie czy jest publiczny czy prywatny — brak wartości domyślnej, decyzja obowiązkowa. Prywatny status jest ukryty przed pingiem, matching działa server-side. Publiczny status widoczny w profilu po kliknięciu. W obu przypadkach — bańki na mapie pozostają neutralne.

### 2. Ambient ponad engagement
> Wolę użytkownika który otwiera apkę 2 razy dziennie po push notyfikacji niż takiego który scrolluje 40 minut. Nie projektujemy na time-on-app. Projektujemy na „czy spotkałeś kogoś ciekawego dziś". Brak aktywności to nie problem — to znak że apka działa w tle jak powinna.

### 3. Ludzie ponad miejsca
> Nie budujemy Yelpa, Foursquare'a ani discovery app dla restauracji. Miejsca to kontekst, nie produkt. Budujemy warstwę ludzkich potrzeb w przestrzeni fizycznej.

### 4. Stopniowe odsłanianie ponad natychmiastowy dostęp
> Im więcej zaufania, tym więcej informacji. Ping → status. Akceptacja → pełny profil i „Co nas łączy". Każdy krok odsłania więcej — i każdy krok wymaga zgody.

### 5. Ludzki ton ponad systemowy
> Nie „odrzucono", tylko „ta osoba jest teraz niedostępna". Nie „brak matchów", tylko „możesz być pierwszy". Każdy komunikat powinien brzmieć jak coś co powiedziałby przyjaciel, nie system.

### 6. Fizyczność ponad wirtualność
> Łączymy ludzi którzy są w tym samym miejscu, teraz. Nie budujemy czatu globalnego. Nie budujemy Discorda. Bliskość fizyczna jest warunkiem koniecznym pierwszego kontaktu.

### 7. Prostota ponad kompletność
> Każda decyzja techniczna powinna przechodzić test: czy to wzmacnia poczucie że tu chodzi o prawdziwych ludzi w prawdziwej przestrzeni — czy je osłabia? Jeśli feature komplikuje core loop — nie dodajemy go.

---

## Czego NIE robimy

- **Nie scrollujemy profili.** Żadnych list do przeglądania, żadnego swipe. Aplikacja szuka, użytkownik decyduje.
- **Nie narzucamy widoczności intencji.** Użytkownik sam wybiera czy status jest publiczny czy prywatny. Bańki na mapie zawsze neutralne — nawet przy publicznym statusie. Znajomi widzą statusy po kliknięciu w profil, ale ich bańki też pozostają neutralne.
- **Nie monetyzujemy danych.** Zero sprzedaży danych, zero reklam bannerowych. Jedyna forma obecności firm to organiczne statusy na mapie.
- **Nie budujemy wersji webowej.** Aplikacja oparta na GPS i fizyczności. Mobilna, ambient, w tle.
- **Nie robimy global chat.** Blisko łączy ludzi w przestrzeni fizycznej. Bez czatu ze znajomymi po drugiej stronie globu.
- **Nie wymuszamy zaangażowania.** Zero streaks, zero FOMO, zero „wróć bo stracisz". Użytkownik używa kiedy ma potrzebę.

---

## System interakcji

### Bańki na mapie
Każdy użytkownik widoczny jako bańka/avatar. Bańki są **neutralne** — żaden kolor, rozmiar ani ikona nie zdradza intencji. Wyjątek: ikona trybu Nie przeszkadzać (widoczna dla wszystkich).

Gdy serwer wykryje status match (komplementarne statusy w promieniu), bańka matched osoby zaczyna **subtelnie pulsować**. Pulsowanie sygnalizuje że istnieje komplementarność — ale nie zdradza kategorii ani treści statusu. Użytkownik widzi człowieka, nie jego potrzebę.

### Co widzisz ZANIM pingujesz

| Element | Widoczne? |
|---|---|
| Avatar / zdjęcie | Tak — na bańce |
| % dopasowania profilu | Tak — przy bańce |
| Odległość (~300m) | Tak — przybliżona |
| Krótkie bio | Tak — po kliknięciu |
| „Co nas łączy" | Tak — warunkowe (patrz niżej) |
| Status publiczny | Tak — widoczny w profilu po kliknięciu |
| Status prywatny | **NIE** — matching server-side, sygnał przez pulsowanie bańki |
| Pełny profil / linki | **NIE** — po akceptacji pinga |

### „Co nas łączy" — logika warunkowa

| Scenariusz | Co AI uwzględnia |
|---|---|
| Klikam losową bańkę (brak status match, status prywatny) | Tylko profil: hobby, styl życia, branża. *„Oboje lubicie muzykę na żywo i działacie w tech."* |
| Bańka pulsuje (status match wykryty, status prywatny) | Profil + status. *„Oboje szukacie dziś współpracownika do projektu."* |
| Status publiczny | Profil + status (zawsze). |

**Zasada:** AI generując „Co nas łączy" **nigdy** nie używa tagów prywatnego statusu jeśli nie ma potwierdzonego status matcha po stronie serwera. Zdradzenie statusu pośrednio przez opis jest równoznaczne z jego ujawnieniem.

### Widoczność statusu — decyzja per status

Przy tworzeniu każdego statusu użytkownik wybiera widoczność. Brak wartości domyślnej — decyzja obowiązkowa.

| Tryb | Zachowanie |
|---|---|
| **Publiczny** | Status widoczny dla wszystkich po kliknięciu w profil. „Co nas łączy" może uwzględniać treść statusu. |
| **Prywatny** | Status ukryty. Matching server-side — serwer porównuje tagi i generuje sygnał (push + pulsująca bańka) jeśli jest match, bez ujawniania treści. |

### Ping = wzajemna wymiana statusów za zgodą obu stron

1. **A pinguje B** — status A staje się widoczny dla B. B widzi: profil A + status A + „Co nas łączy" (pełna wersja ze statusem).
2. **B akceptuje** — status B staje się widoczny dla A. Chat otwiera się. Oboje widzą pełne profile i linki.
3. **B odrzuca** — statusy wracają ukryte. A dostaje: „Ta osoba jest teraz niedostępna — powodów może być wiele, nie przejmuj się." Cooldown 24h.

### Limity
- 1 ping do tej samej osoby na 24h (zawsze, niezależnie od planu)
- 5 pingów/dzień (Basic) / 20 pingów/dzień (Premium)
- Pingi do znajomych nie wchodzą w dzienny limit
- Oczekujące pingi posortowane FIFO (najwcześniejszy na górze)

### Implicit accept
Gdy A pinguje B, a B (jeszcze nie widząc pinga od A — np. nie ma jeszcze powiadomienia, lag sieci) pinguje A z powrotem, drugi ping nie jest tworzony jako osobny rekord. Zamiast tego serwer interpretuje go jako akceptację istniejącego pinga A i od razu otwiera chat. Z perspektywy B "kliknięcie ping" prowadzi prosto do rozmowy; z perspektywy A wygląda to jak normalna akceptacja pinga.

---

## Matching — dwa poziomy

### Poziom 1: Profile Match (głęboki, stały)
Widoczny jako **% na bańce zawsze** — przed i po pingu. Wagi składników:

| Składnik | Waga |
|---|---|
| Hobby i zainteresowania | Najwyższa — core matching |
| Styl życia | Wysoka |
| Branża i typ pracy | Niższa niż hobby |
| Tryb oferty (wolontariat / wymiana / zlecenie) | Uzupełniająca |

Nie blokuje pinga — użytkownik sam decyduje czy 10% match go interesuje.

### Poziom 2: Status Match (sytuacyjny, „na teraz")
Porównanie tagów statusu A z tagami statusu B ORAZ tagami „Co mogę dać" B. Matching odbywa się **wyłącznie server-side**. Gdy pojawi się match w pobliżu:
- Push notification (cichy sygnał / wibracja)
- **Bańka matched osoby zaczyna subtelnie pulsować** na mapie

Użytkownik wie **że** jest match i **kto** to jest (pulsująca bańka), ale nie wie **czego** ta osoba szuka (treść statusu pozostaje ukryta, chyba że publiczny).

---

## Profil użytkownika

### Onboarding (AI-driven, nie formularze)

**Krok 1 — Kim jesteś (The Persona)**
> *„Cześć! Wyobraź sobie, że siadamy przy jednym stoliku. Czym się zajmujesz i co sprawia że tracisz poczucie czasu?"*

AI wyciąga tagi: branża, rola, hobby, zainteresowania, styl życia. Max jedno pytanie doprecyzowujące. Bio generowane przez AI, edytowalne.

**Krok 2 — Co oferujesz (Superpower)**
> *„W czym możesz komuś pomóc od ręki — w zamian za kawę lub dobrą rozmowę?"*

Selektor formy: wolontariat / wymiana skilli / potencjalne zlecenie.

**Krok 3 — Czego szukasz dziś (Status)**
> *„Czego szukasz dziś — albo co możesz dziś dać? Możesz to zmienić jednym tapem na mapie."*

Kafle kategorii (max 2 jednocześnie):
- ⚡ Projekt / Współpraca
- 🤝 Networking / Sparring
- 🔥 Randka / Relacja
- ☕ Luźne wyjście / Hobby

Po wybraniu kategorii i opisie: obowiązkowy wybór widoczności statusu — **Publiczny** lub **Prywatny**. Brak wartości domyślnej.

**Krok 4 — Widoczność**

| Tryb | Opis |
|---|---|
| 🥷 Ninja | Widzisz innych, Ciebie nie widać. Nie możesz pingować (aplikacja pyta o przejście na Semi-Open). |
| 🔵 Semi-Open | Widoczny na mapie. Możesz pingować i być pingowany. |
| 🟢 Full Nomad | Widoczny, otwarty. AI zachęca do kontaktu bezpośredniego. |

**Potwierdzenie** — AI pokazuje 3-4 zdania podsumowania: *„Oto jak Cię widzę — powiedz czy trafiłem."*

### Elementy profilu
- Jedno zdjęcie profilowe (dowolne)
- Bio wygenerowane przez AI (edytowalne)
- „Co mogę dać" z tagami i typem oferty
- Opcjonalnie: link do LinkedIn/Instagram + strona www (widoczne po akceptacji pinga)
- Badge Verified (opcjonalna weryfikacja twarzy)

---

## Tryby widoczności — szczegóły

Trzy tryby niezależne od statusu. Zmiana jednym tapem na mapie.

| | Ninja 🥷 | Semi-Open 🔵 | Full Nomad 🟢 |
|---|---|---|---|
| Widoczny na mapie | Nie | Tak | Tak |
| Może pingować | Nie (prompt o zmianę) | Tak | Tak |
| Może być pingowany | Nie | Tak | Tak |
| AI zachęca do podejścia | — | — | Tak |

**Nie przeszkadzać** — osobna ikonka, niezależna od trybu. Pingi dochodzą ale bez powiadomienia. Po wyłączeniu — user widzi zaległe pingi.

---

## Chat

- Otwiera się automatycznie po akceptacji pinga
- Widoczne: imię, zdjęcie, % match, status z momentu akceptacji (snapshot, nie live)
- „Co nas łączy" — pełna wersja AI uwzględniająca statusy obu stron z momentu połączenia
- Bez limitu czasowego, powiadomienia push o nowych wiadomościach
- Archiwizacja/usunięcie przez użytkownika (obustronne)

### Karta pierwszego kontaktu (WOW moment)
Zamiast pustego ekranu — chat otwiera się z kartą:
> *📍 12 marca · Śródmieście · ~300m od siebie*

### Usuwanie chatu
Usunięcie = obustronne. Prompt z opcjonalną oceną (⭐1-5) lub „Pomiń i usuń".

---

## Grupy (Premium+)

- Tryb sesyjny: widzę grupę w pobliżu, pingę żeby dołączyć do sesji
- Tryb stały: dołączam jako członek, dostaję powiadomienie gdy ktoś z grupy jest w pobliżu
- Każda grupa ma czat grupowy
- Założenie grupy: tylko Premium+
- Wydarzenia: admin tworzy z datą, godziną, miejscem — widoczne na mapie

---

## Znajomi

- Skanowanie kontaktów z telefonu (widzę kto ma Blisko, oni nie wiedzą)
- Zaproszenie → akceptacja = połączeni jako znajomi
- Znajomi widzą wzajemnie statusy **po kliknięciu w profil na mapie** — bez pinga. Bańka znajomego na mapie pozostaje wizualnie neutralna jak wszystkie inne.
- Bezpośredni chat bez pinga, bez limitu
- Pingi do znajomych nie wchodzą w dzienny limit
- Powiadomienie gdy znajomy jest w pobliżu
- Bez limitu znajomych, dostępne dla wszystkich planów
- Usunięcie znajomego — bez powiadomienia dla usuwanej osoby

---

## Safety

### Ochrona lokalizacji
- Lokalizacja odświeżana co 3 minuty (nie real-time)
- Na mapie: bańka w promieniu 50-100m (nie precyzyjny GPS)
- Auto-wyłączenie GPS gdy nieruchomy 2h (wznawia po ruszeniu)

### Weryfikacja (Verified badge)
- Opcjonalna — brak weryfikacji nie blokuje dostępu
- Liveness check (krótki filmik selfie) + porównanie z zdjęciem profilowym
- Dane biometryczne zaszyfrowane, oddzielnie od profilu, osobna zgoda GDPR
- Przy permanentnej blokadzie — dane twarzy uniemożliwiają nowe konto

### Blokowanie i raportowanie
- Każdy może zablokować każdego (trwale, znika z mapy)
- Report: spam / nieodpowiednie zachowanie / nękanie
- Eskalacja automatyczna:
  - 2 zgłoszenia → blokada 1 dzień
  - 5 łącznie → blokada 7 dni + email
  - 10 łącznie → permanentna blokada
  - Nękanie: 2 zgłoszenia od różnych osób → 7 dni; 3 → permanentna

### Moderacja treści
- Automatyczny filtr (AI) przy każdym zapisie: status, bio, nazwa grupy, wiadomość
- 2 zgłoszenia treści → automatyczne ukrycie
- Zero ręcznej moderacji na starcie (automatyczna eskalacja)

### Usuwanie konta
- Dwufazowe: soft-delete (14 dni grace period) → anonimizacja (nadpisanie danych)
- Relacje zachowane (wiadomości, waves) — user widoczny jako „Usunięty użytkownik"
- GDPR data export na żądanie

---

## Monetyzacja

### Subskrypcje

| | Basic (free) | Premium (19 PLN/mies lub 159 PLN/rok) | Premium+ (cena TBD) |
|---|---|---|---|
| Pingi / dzień | 5 | 20 | 20 + Grupy |
| Trial | — | 3 dni gratis, bez karty | — |
| Grupy | Brak | Brak | Tworzenie i zarządzanie |

### Program poleceń
- Nowy użytkownik przez link: 50% rabatu na pierwszy miesiąc/rok
- Polecający: 50% wartości płatności jako kredyt
- Gdy kredyty > koszt abonamentu → następny rok gratis

### B2B (przyszłość)
- „Blisko dla [instytucja]" — zamknięta społeczność dla członków
- Lokale (kawiarnie, restauracje) rejestrują się jak userzy — status z ofertą dnia na mapie

### Czego NIE monetyzujemy
- Zero sprzedaży danych użytkowników
- Zero bannerów reklamowych
- Jedyna forma obecności firm: organiczne statusy na mapie

---

## Go-to-market — Warszawa

**Strategia: gęstość w konkretnych miejscach.** Jedna dzielnica z wysoką koncentracją jest cenniejsza niż 10x więcej rozsianych po mieście.

### Trzy filary launchu

**🎓 Uczelnie** — SGH + Politechnika. Jeden ambasador na roku (premium za onboarding 20 znajomych). Cel: 200 userów w jednym miejscu w 2 tygodnie. Viralność: *„kto to pingował?"*

**💪 Siłownie** — 3 niezależne w Śródmieściu. Pitch do właściciela: *„Dajesz swoim członkom narzędzie do poznawania się — za darmo."* Behawioralnie idealne: regularność + te same twarze + zero rozmów = skumulowana potrzeba.

**☕ Śródmieście** — Powiśle, freelancerzy, startupowcy. Kawiarnie rejestrują się jak userzy ze statusem-ofertą dnia.

### Ambasadorzy
Nie reklamują — używają. Autentyczność > marketing. Influencerzy: *„Właśnie dostałam pinga od kogoś 200m ode mnie"* (nie „pobierz"). Sportowcy: challenge (*„kto mnie znajdzie przez Blisko — trening razem"*).

---

## System komunikacji

| Kontekst | Komunikat |
|---|---|
| **Tagline główny** | *To nie przypadek. To Blisko.* |
| **Hero screen** | *Właściwa osoba jest w pobliżu. Zawsze była.* |
| **Social media** | *Przeznaczenie działa. My tylko skracamy drogę.* |
| **Filozofia** | *Przypadek to tylko bat którego przeznaczenie używa do popędzenia tego co i tak nieuchronne. Blisko to ten bat.* |

**Zasada:** Blisko nie brzmi jak apka. Brzmi jak coś między filozofią a technologią. Lekko mistyczne, bardzo ludzkie. Nie mówi co robi — mówi co czujesz.

---

## Jak mierzymy sukces

### Product-Market Fit (cel: ≥40% „very disappointed")
Pytanie: *„Jak byś się czuł gdybyś nie mógł więcej używać Blisko?"* Opcje: Bardzo rozczarowany / Trochę rozczarowany / Bez różnicy. Cel: ≥40% odpowiada „bardzo rozczarowany" (Sean Ellis benchmark).

### Engagement
- **Pingi wysłane / user / tydzień** — czy ludzie inicjują kontakt?
- **Ping → akceptacja conversion rate** — czy pingi mają wartość?
- **Wiadomości / konwersacja** — czy rozmowy się udają?
- **Spotkania umówione** — ultimate metric (self-reported)

### Retention (a16z social app benchmarks)
| Metryka | Cel „Good" | Cel „Great" |
|---|---|---|
| DAU/MAU | 40% | 50%+ |
| D1 retention | 60% | 70% |
| D7 retention | 40% | 50% |
| D30 retention | 25% | 30% |

### Growth
- Nowi userzy / tydzień (organiczny > 80%)
- Viralność: średnie zaproszenia / user
- Gęstość: userzy / km² w target areas (> 50 = „żywa mapa")

---

## Pozycjonowanie

| | Tinder / Bumble | LinkedIn | Blisko |
|---|---|---|---|
| **Cel** | Randka / romans | Kariera / biznes | **Wszystko — zależy od Ciebie** |
| **Model** | Scroll → Match | Profil → Outreach | **Obecność → Intencja → Ping** |
| **Wymagana uwaga** | Wysoka | Wysoka | **Minimalna — działa w tle** |
| **Kontekst spotkania** | Brak | Niski | **Wysoki — jesteście w tym samym miejscu, teraz** |
| **Prywatność intencji** | Niska | Niska | **Wysoka — status ukryty dopóki nie zdecydujesz** |

---

## Platforma i technologia

- **iOS i Android** — tylko mobilna, brak wersji webowej
- **Jedno konto na wielu urządzeniach** — dane w chmurze
- **Języki v1.0:** polski i ukraiński. v2.0: angielski
- **Docelowe rynki:** Polska (start) → Europa → globalnie

### Obecne możliwości techniczne
- AI profiling (Q&A sessions, bio generation, portrait, interests extraction)
- AI matching (bidirectional connection analysis, 0-100% score)
- Status matching (embedding + LLM evaluation)
- Real-time WebSocket (typing, new messages, analysis ready, nearby changes)
- Push notifications (smart batching, collapse ID)
- Background location tracking
- Grid-based location privacy
- Group chat with topics, reactions, replies
- OAuth (Apple, Google, Facebook, LinkedIn)
- GDPR compliance (data export, two-phase deletion)
- Content moderation (AI-powered)
- Performance monitoring (SLO, Prometheus metrics)

---

## Blisko w prawdziwym życiu

**☕ Kawiarnia — spontaniczny projekt.** Siedzisz, ktoś obok mówi o medtech. Wpisujesz status „inwestor, szukam labu do protez". Blisko sprawdza czy w pobliżu ktoś pasuje. Rozmowa już trwa — Blisko ją tylko domyka.

**💼 Konferencja — cold outreach bez chłodu.** Zamiast wizytówek w ciemno — ustawiasz status. Tylko pasujące osoby widzą sygnał. Ping zamiast niezręcznego podejścia.

**🏋️ Siłownia — wspólna pasja.** Te same twarze od miesięcy, zero rozmów. Blisko pokazuje że ktoś 10m od Ciebie szuka partnera do biegania i słucha tej samej muzyki.

**✈️ Hotel w podróży.** Status „otwarty na kolację, fintech". Ktoś w tym samym hotelu szuka rozmówcy.

**🎓 Uczelnia — projekt i znajomości.** Student SGH szuka kogoś z PW do projektu IoT. Nie maile na grupę — status. Dopasowanie przychodzi samo.

**📱 Zawsze — asystent w tle.** Inwestor: stały profil „szukam deep tech, medtech". Apka działa 24/7. Powiadomienie gdy ktoś pasujący jest w pobliżu.

---

*Blisko — Product Bible*
*Dokument wewnętrzny. Kompas przy każdej decyzji produktowej, technicznej i komunikacyjnej.*
