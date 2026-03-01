# BLI-7: Pokazywanie bliskości członków grupy — Design

## Kontekst

Feedback Jarka: na ekranie "W okolicy", jeśli członek grupy jest w pobliżu — powinno to być widoczne. Obecnie grupy nie pojawiają się na mapie, a ekran grupy nie pokazuje kto jest w okolicy.

## Rozwiązanie

Nearby members widoczne w 3 miejscach: mapa, lista grup, ekran grupy.

### 1. Mapa — markery grup

- Grupy pojawiają się na mapie przy filtrze "Wszystko" i "Grupy"
- Marker: **zaokrąglony kwadrat** (rounded rect) z avatarem grupy — odróżnia od kół osób
- Zielona kropka/badge z liczbą nearby members (jak notification badge)
- Grupy bez nearby members: marker bez zielonej kropki
- Tap na marker → otwiera ekran grupy (push modal)

### 2. Lista grup (GroupRow)

- Zielony tekst "X członków w pobliżu" pod opisem grupy (jeśli > 0)

### 3. Ekran grupy — sekcja "W pobliżu"

#### Reguły wyświetlania

| Sytuacja | Zachowanie |
|----------|-----------|
| ≤5 członków | Jedna lista "Członkowie" z badge odległości przy nearby. Bez osobnej sekcji. |
| >5 członków, 0 nearby | Brak sekcji nearby. Wątki → Członkowie (5) → "Pokaż wszystkich →" |
| >5 członków, 1-5 nearby | Sekcja "W pobliżu (N)" z kartą. Pod spodem Członkowie (5). |
| >5 członków, >5 nearby | Sekcja nearby: 5 najbliższych + "Pokaż w pobliżu ▾" (rozwija do max 20). |
| Nie-członek, 0 nearby | Brak sekcji nearby. Avatar + opis + "Dołącz". |
| Nie-członek, ≥1 nearby | Sekcja nearby (max 5 + "Pokaż"). Brak listy członków. |

#### Ochrona UI przy dużych grupach

| Element | Reguła | Dlaczego |
|---------|--------|----------|
| Nearby (karta) | Domyślnie 5 rows. "Pokaż" → max 20 (API cap). Tytuł ma prawdziwą liczbę. | Przy 400 nearby na konferencji: max 20 rows. |
| Członkowie (ekran grupy) | Zawsze 5 rows + link "Pokaż wszystkich (N) →" | Ekran grupy lekki, nigdy setki inline. |
| Członkowie (osobny ekran) | Push na nowy ekran. FlatList (wirtualizowany) + paginacja po 50 z API. Search bar przy >50. | FlatList renderuje tylko widoczne rows. |

### 4. Prywatność — opt-out per grupa

- Nowa kolumna `location_visible` (default `true`) na `conversation_participants`
- Toggle "Pokaż moją lokalizację" w sekcji akcji na ekranie grupy
- Opis pod togglem: "Inni członkowie zobaczą, że jesteś w pobliżu"
- Osoby z `location_visible = false` nie liczone/wyświetlane w nearby

## Mockupy

- `docs/mockups/bli-7-marker-variants.html` — warianty markera (wybrany: zaokrąglony kwadrat)
- `docs/mockups/bli-7-scenarios.html` — wszystkie scenariusze edge case
- `docs/mockups/bli-7-final-approach.html` — finalne podejście z capami i osobnym ekranem
- `docs/mockups/bli-7-group-detail.html` — before/after ekranu grupy
