# Meet - Aplikacja do Łączenia Osób o Podobnych Zainteresowaniach

## Wizja Produktu

**Meet** to aplikacja mobilna (iOS/Android), która pozwala użytkownikom odkrywać i nawiązywać kontakt z osobami o podobnych zainteresowaniach znajdującymi się w ich okolicy. W przeciwieństwie do aplikacji randkowych, Meet skupia się na budowaniu relacji opartych na wspólnych pasjach - czy to spacerach z psami, grze w kręgle, jeździe na rowerze, czy czytaniu książek Stanisława Lema.

---

## Główne Funkcjonalności

### 1. Profil Użytkownika

#### 1.1 Podstawowe Informacje
- **Imię** (wymagane)
- **Zdjęcie profilowe** (opcjonalne, ale rekomendowane)
- **Galeria zdjęć** (do 5 zdjęć)
- **Płeć** (wymagana)
- **Wiek** (opcjonalny)

#### 1.2 Opis AI-Friendly
Zamiast długich formularzy, użytkownik wypełnia **dwa pola tekstowe**:

1. **"Kim jestem, co lubię robić"** - swobodny opis siebie
   > *Przykład: "Jestem Karol, 32 lata. Mam psa - golden retrievera Maxa. Lubię biegać po parku, gram w kręgle w weekendy, a wieczorami czytam sci-fi - głównie Lema i Asimova. W pracy jestem programistą, więc dużo siedzę - sport to mój sposób na balans."*

2. **"Czego szukam"** - oczekiwania wobec innych użytkowników
   > *Przykład: "Szukam osób do wspólnych spacerów z psami - Max uwielbia towarzystwo innych psów. Chętnie pogram też w kręgle z kimś kto traktuje to na luzie, bez presji na wynik. Fajnie byłoby też pogadać o książkach sci-fi."*

#### 1.3 AI-Powered Indeksowanie
System AI automatycznie analizuje teksty i tworzy:
- **Tagi zainteresowań**: `#pies`, `#bieganie`, `#kręgle`, `#sci-fi`, `#Lem`
- **Wektor embeddingów** do dopasowywania podobnych osób
- **Krótki summary** widoczny dla innych: *"Właściciel psa, biegacz, fan kręgli i sci-fi"*

### 2. Odkrywanie Osób w Okolicy

#### 2.1 Mapa/Lista Osób
- Widok mapy z pinezkami osób w okolicy (przybliżona lokalizacja)
- Widok listy posortowanej wg odległości lub dopasowania
- **Promień wyszukiwania**: 500m - 50km (konfigurowalny)

#### 2.2 Filtry
- Płeć
- Wiek (zakres)
- Zainteresowania (tagi AI)
- Tylko z psami
- Tylko weryfikowane profile

#### 2.3 Karty Osób
```
┌─────────────────────────────┐
│  [Zdjęcie]                  │
│                             │
│  Adam, 28                   │
│  ~800m od Ciebie            │
│                             │
│  🐕 Pies  🎳 Kręgle  📚 Lem │
│                             │
│  "Szukam osób do spacerów   │
│   z psami i kręgli"         │
│                             │
│  [ 👋 Zaczep ]              │
└─────────────────────────────┘
```

### 3. System "Zaczepiania"

#### 3.1 Flow Zaczepiania
1. **Karol** widzi **Adama** w okolicy
2. Karol klika **"Zaczep"** na profilu Adama
3. Adam otrzymuje **powiadomienie push**: *"Karol chce Cię poznać! Ma psa i lubi kręgle."*
4. Adam może:
   - **Pomachać** 👋 - otwiera możliwość rozmowy
   - **Zignorować** - brak akcji, Karol nie wie
   - **Zablokować** - Karol nigdy więcej nie zobaczy Adama

#### 3.2 Po Pomachaniu
- Otwiera się **czat 1:1**
- Obaj użytkownicy widzą pełne profile
- Mogą umówić się na spotkanie

### 4. Czat

#### 4.1 Czat 1:1
- Wiadomości tekstowe
- Wysyłanie zdjęć
- Udostępnianie lokalizacji (opcjonalne)
- Status: wysłane / dostarczone / przeczytane
- Wskaźnik "pisze..."

#### 4.2 Bezpieczeństwo Czatu
- **Nigdy nie udostępniamy numerów telefonów**
- Możliwość zgłoszenia nieodpowiednich treści
- AI moderacja wiadomości (wykrywanie spamu, obraźliwych treści)

### 5. Grupy (v2.0+)

#### 5.1 Tworzenie Grupy
- **Nazwa grupy**: np. "Sobotnie meczyki piłka nożna Mokotów"
- **Opis**: cel grupy, częstotliwość spotkań
- **Typ**:
  - **Publiczna** - widoczna dla wszystkich, można wysłać prośbę o dołączenie
  - **Prywatna** - niewidoczna, tylko zaproszenia
- **Tagi**: `#piłkanożna`, `#Mokotów`, `#sobota`

#### 5.2 Odkrywanie Grup
- Grupa jest widoczna jeśli **którykolwiek członek** jest w Twojej okolicy
- Karty grup podobne do kart osób:
```
┌─────────────────────────────┐
│  [Zdjęcie grupy]            │
│                             │
│  Sobotnie meczyki ⚽         │
│  12 członków                │
│  3 osoby w okolicy          │
│                             │
│  "Gramy co sobotę o 10:00   │
│   na Orliku przy Puławskiej"│
│                             │
│  [ Poproś o dołączenie ]    │
└─────────────────────────────┘
```

#### 5.3 Zarządzanie Grupą
- **Admin** - twórca grupy
- **Moderatorzy** - mogą akceptować/usuwać członków
- **Członkowie** - mogą zapraszać innych (konfigurowalne)

#### 5.4 Czat Grupowy
- Identyczny jak czaty w Messenger/WhatsApp
- Powiadomienia push o nowych wiadomościach
- Możliwość wyciszenia grupy

### 6. Inteligentne Powiadomienia

#### 6.1 Powiadomienia o Dopasowaniach w Okolicy
Gdy użytkownik zmienia lokalizację (np. idzie do galerii handlowej):

> 📍 *"Hej! W Twojej okolicy jest osoba, która też lubi książki Lema. Sprawdź!"*

Warunki wyzwolenia:
- Użytkownik przemieścił się o >500m od poprzedniej pozycji
- W nowej okolicy są osoby z wysokim score dopasowania
- Minęła min. 1 godzina od ostatniego powiadomienia tego typu

#### 6.2 Inne Powiadomienia
- Nowe zaczepiecie
- Ktoś pomachał
- Nowa wiadomość
- Zaproszenie do grupy
- Prośba o dołączenie do grupy (dla adminów)

### 7. Autentykacja

#### 7.1 MVP (v1.0)
- **Logowanie email/hasło** (uproszczone dla szybszego development)
- Weryfikacja email

#### 7.2 Docelowo (v1.1+)
- **Logowanie numerem telefonu**
  1. Użytkownik wpisuje numer telefonu
  2. Otrzymuje 6-cyfrowy kod SMS
  3. Wpisuje kod i jest zalogowany
- **BetterAuth** jako system autentykacji

#### 7.3 Tryb Anonimowy (v2.0+)
- Przeglądanie okolicy **bez logowania**
- Widoczne tylko **zagregowane dane**:
  > *"W Twojej okolicy: 4 osoby z psami, 1 osoba lubi kręgle, 2 grupy sportowe"*
- Zachęta do rejestracji, aby zobaczyć szczegóły

---

## Przypadki Użycia (Use Cases)

### UC1: Spacer z Psem
**Aktor**: Karol (właściciel golden retrievera)

1. Karol otwiera aplikację w parku
2. Widzi, że 300m od niego jest Anna z labradorem
3. Klika "Zaczep" na profilu Anny
4. Anna dostaje powiadomienie i macha
5. Umawiają się na wspólny spacer przez czat
6. Psy się bawią, właściciele rozmawiają

### UC2: Kręgle w Weekend
**Aktor**: Adam (fan kręgli)

1. Adam szuka osób do gry w kręgle
2. Ustawia filtr na zainteresowanie "kręgle"
3. Znajduje grupę "Kręgle Warszawa Wola"
4. Wysyła prośbę o dołączenie
5. Admin akceptuje
6. Adam dołącza do czatu grupowego i umawia się na najbliższą grę

### UC3: Nowe Miasto, Nowi Znajomi
**Aktor**: Maja (nowa w mieście)

1. Maja przeprowadziła się do Krakowa
2. Wypełnia profil: lubi bieganie, książki, kawę
3. Aplikacja pokazuje osoby i grupy w okolicy
4. Maja znajduje grupę biegową "Parkrun Kraków"
5. Dołącza i poznaje lokalnych biegaczy

### UC4: Przypadkowe Spotkanie w Galerii
**Aktor**: Tomek (fan sci-fi)

1. Tomek idzie do galerii handlowej
2. Dostaje powiadomienie: "W okolicy jest osoba, która też czyta Lema!"
3. Otwiera aplikację i widzi Kasię (~50m)
4. Zaczepnia Kasię, ona macha
5. Umawiają się na kawę w galerii

### UC5: Organizowanie Meczu Piłkarskiego
**Aktor**: Piotr (admin grupy piłkarskiej)

1. Piotr tworzy grupę "Niedzielne meczyki Ursynów"
2. Ustawia jako publiczną
3. Osoby w okolicy widzą grupę gdy są blisko Ursynowa
4. 15 osób dołącza w ciągu tygodnia
5. Piotr organizuje pierwszy mecz przez czat grupowy

---

## Bezpieczeństwo i Prywatność

### Ochrona Lokalizacji
- **Nigdy nie pokazujemy dokładnej lokalizacji** - tylko przybliżoną (±100-200m)
- Lokalizacja jest zaokrąglana i "rozmywana" (jitter)
- Użytkownik może **ukryć się** tymczasowo (tryb niewidoczny)

### Moderacja
- AI moderuje treści w czatach
- System zgłoszeń i blokowania
- Możliwość weryfikacji profilu (zdjęcie selfie)

### Dane Użytkownika
- Zgodność z RODO
- Możliwość eksportu danych
- Możliwość usunięcia konta i wszystkich danych

---

## Pomysły na Przyszłość 💡

### P1: Eventy i Spotkania
Możliwość tworzenia eventów z datą, godziną i miejscem:
> *"Mecz piłki nożnej, sobota 15:00, Orlik Mokotów"*

Uczestnicy mogą potwierdzić obecność, widzą kto idzie.

### P2: Osiągnięcia i Gamifikacja
- Odznaki za aktywność: "Pierwszy spacer", "10 spotkań", "Popularny profil"
- Poziomy użytkownika
- Zachęty do regularnego używania aplikacji

### P3: Integracja z Kalendarzem
- Synchronizacja spotkań z kalendarzem telefonu
- Przypomnienia o umówionych spotkaniach

### P4: Rekomendacje Miejsc
- AI sugeruje miejsca na spotkania w okolicy
- "Na spacer z psami polecamy Park Skaryszewski (2km od Was)"

### P5: Matching oparty na harmonogramie
- Użytkownicy mogą podać kiedy są zazwyczaj dostępni
- System łączy osoby o podobnych harmonogramach
- "Adam też biega rano przed pracą w tym parku!"

### P6: Weryfikacja Video
- Opcjonalna weryfikacja przez krótkie video
- Większe zaufanie do profilu

### P7: Stories / Aktualności
- Krótkie posty typu "Właśnie jestem w parku z psem, ktoś chętny?"
- Widoczne dla osób w okolicy przez 24h

### P8: System Reputacji
- Po spotkaniu użytkownicy mogą zostawić feedback
- "Świetne spotkanie! Psy się polubiły 🐕"
- Buduje zaufanie w społeczności

### P9: Integracja z Fitbit/Apple Health
- Automatyczne wykrywanie aktywności
- "Karol właśnie biega w parku - może dołączysz?"

### P10: Tryb "Jestem Tutaj"
- Broadcast do osób w okolicy: "Jestem w kawiarni X, chętnie porozmawiam"
- Dla osób otwartych na spontaniczne spotkania

---

## Metryki Sukcesu (KPIs)

### Engagement
- DAU/MAU ratio
- Średnia liczba zaczepiń na użytkownika/tydzień
- % zaczepiń → pomachań (conversion)
- Średnia liczba wiadomości na rozmowę

### Retention
- D1, D7, D30 retention
- % użytkowników z pełnym profilem
- % użytkowników w ≥1 grupie

### Growth
- Nowi użytkownicy/tydzień
- Wiralność (ile osób zaprosił średni użytkownik)

### Satisfaction
- App Store rating
- NPS score
- % użytkowników którzy umówili się na spotkanie

---

## Monetyzacja (Przyszłość)

### Model Freemium
**Darmowo**:
- Przeglądanie 10 osób/dzień
- 1 zaczepianie/dzień
- Członkostwo w 3 grupach

**Premium** (~29 PLN/miesiąc):
- Nielimitowane przeglądanie
- Nielimitowane zaczepianie
- Nielimitowane grupy
- Kto oglądał Twój profil
- Priorytet w wynikach
- Brak reklam

### Dodatkowe źródła
- Promowane profile
- Reklamy lokalne (kawiarnie, siłownie, etc.)
- Partnerstwa z organizatorami eventów

---

## Konkurencja

| Aplikacja | Focus | Różnica od Meet |
|-----------|-------|-----------------|
| Bumble BFF | Znajomi | Mniej lokalizacyjny, bardziej "swipe" |
| Meetup | Eventy | Większe grupy, mniej spontaniczne |
| Nextdoor | Sąsiedzi | Fokus na sąsiedztwo, nie zainteresowania |
| Tinder | Randki | Romantyczny focus |

**Unikalna wartość Meet**: Łączenie lokalizacji w czasie rzeczywistym z AI-powered matching zainteresowań dla spontanicznych, nieformalnych spotkań.
