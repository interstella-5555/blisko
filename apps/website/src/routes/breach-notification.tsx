import { createFileRoute } from "@tanstack/react-router";
import { A, LegalPage, Li, List, P, Section, Strong } from "@/components/LegalPage";

export const Route = createFileRoute("/breach-notification")({
  head: () => ({
    meta: [{ title: "Procedura powiadamiania o naruszeniu ochrony danych — Blisko" }],
  }),
  component: BreachNotificationPage,
});

function BreachNotificationPage() {
  return (
    <LegalPage
      title="Procedura powiadamiania o naruszeniu ochrony danych"
      updated="Ostatnia aktualizacja: 22 kwietnia 2026"
    >
      <Section title="1. O dokumencie">
        <P>
          Niniejsza procedura opisuje sposób reagowania Blisko na naruszenia ochrony danych osobowych w rozumieniu Art.
          33 i 34 RODO. Opisuje co liczy się jako naruszenie, w jakim czasie powiadamiamy Prezesa UODO, kiedy i jak
          powiadamiamy użytkowników, oraz kogo kontaktować w razie wykrycia incydentu.
        </P>
        <P>
          Administratorem danych jest Karol Wypchło, prowadzący aplikację Blisko. Kontakt w sprawie ochrony danych:{" "}
          <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>.
        </P>
      </Section>

      <Section title="2. Co liczy się jako naruszenie ochrony danych">
        <P>
          Zgodnie z Art. 4(12) RODO naruszeniem jest każde zdarzenie prowadzące do przypadkowego lub bezprawnego
          zniszczenia, utraty, modyfikacji, nieuprawnionego ujawnienia lub nieuprawnionego dostępu do danych osobowych.
          Konkretne scenariusze, które traktujemy jako naruszenie:
        </P>
        <List>
          <Li>
            Wyciek z bazy danych (np. SQL injection, publicznie dostępna kopia zapasowa, źle skonfigurowany bucket)
          </Li>
          <Li>Nieuprawniony dostęp do konta administratora lub panelu admin</Li>
          <Li>
            Przypadkowa ekspozycja danych (np. logi z danymi osobowymi udostępnione publicznie, przeciek pliku .env)
          </Li>
          <Li>Utrata lub kradzież urządzenia z dostępem do danych produkcyjnych (laptop, klucze dostępowe)</Li>
          <Li>Atak ransomware lub malware niszczący lub zmieniający dane</Li>
          <Li>Naruszenie po stronie procesora (OpenAI, Railway, Resend, Tigris), które dotyczy naszych użytkowników</Li>
          <Li>Wewnętrzne nadużycie — dostęp do danych bez uzasadnionej potrzeby biznesowej</Li>
        </List>
        <P>
          <Strong>Nie są naruszeniem</Strong>, w większości przypadków: pojedyncze nieudane próby logowania, osiągnięcia
          limitów ratelimitingu, ataki DDoS bez wycieku danych, akcje wykonywane przez samego użytkownika na swoich
          danych.
        </P>
      </Section>

      <Section title="3. 72-godzinny zegar">
        <P>
          Zegar startuje w momencie, w którym administrator danych <Strong>dowiedział się</Strong> o naruszeniu (nie w
          momencie wystąpienia incydentu). Art. 33(1) RODO wymaga powiadomienia Prezesa UODO bez zbędnej zwłoki, w miarę
          możliwości nie później niż w ciągu <Strong>72 godzin</Strong> od stwierdzenia naruszenia, chyba że jest mało
          prawdopodobne, by naruszenie skutkowało ryzykiem dla praw lub wolności osób fizycznych.
        </P>
      </Section>

      <Section title="4. Klasyfikacja ryzyka">
        <P>Zakres i rodzaj ujawnionych danych określa wymagane działania powiadamiające.</P>
        <List>
          <Li>
            <Strong>Wysokie ryzyko</Strong> — dane umożliwiające identyfikację, lokalizację lub kontakt z użytkownikiem
            (imię + email + lokalizacja + treści wiadomości), dane generowane przez AI dotyczące osobowości, dane
            umożliwiające nękanie lub stalking. Wymaga powiadomienia UODO (Art. 33) <Strong>oraz</Strong> użytkowników
            (Art. 34).
          </Li>
          <Li>
            <Strong>Średnie ryzyko</Strong> — ograniczona lista danych (np. sam email bez innych danych, shortlived
            tokeny, dane częściowo zanonimizowane). Wymaga powiadomienia UODO. Powiadomienie użytkowników nie jest
            obowiązkowe.
          </Li>
          <Li>
            <Strong>Niskie lub brak ryzyka</Strong> — dane były zaszyfrowane lub zabezpieczone, a klucze nie zostały
            ujawnione; logi z zanonimizowanymi adresami IP; scenariusz gdzie atakujący nie mógł odczytać danych. Brak
            obowiązku powiadomień, ale incydent musi być udokumentowany wewnętrznie.
          </Li>
        </List>
      </Section>

      <Section title="5. Checklist fazowy">
        <P>
          <Strong>Faza 0 — detekcja i natychmiastowa reakcja (godzina 0)</Strong>
        </P>
        <List>
          <Li>Zweryfikuj czy to rzeczywiście naruszenie — sprawdź logi, odtwórz jeśli to bezpieczne</Li>
          <Li>
            Contain — rotacja skompromitowanych poświadczeń w Railway (klucze API, sekrety OAuth, hasło bazy jeśli
            konieczne), unieważnienie aktywnych sesji, zablokowanie adresów IP atakującego
          </Li>
          <Li>Zabezpieczenie dowodów — zrzut bazy danych, logi Railway, logi metryk z odpowiedniego okna czasowego</Li>
          <Li>Uruchomienie timera 72h (notatka w prywatnym dokumencie Linear)</Li>
        </List>
        <P>
          <Strong>Faza 1 — triage (0–24h)</Strong>
        </P>
        <List>
          <Li>
            Zakres — których użytkowników dotyczy, jakie kategorie danych, ile rekordów, jak długo dane były wystawione
          </Li>
          <Li>Klasyfikacja ryzyka (sekcja 4) — wysokie / średnie / niskie</Li>
          <Li>
            Udokumentowanie faktów: co się stało, kiedy wykryte, zakres, hipoteza przyczyny źródłowej, podjęte działania
            containment
          </Li>
          <Li>Ocena czy Art. 34 (powiadomienie użytkowników) jest wymagane</Li>
        </List>
        <P>
          <Strong>Faza 2 — powiadomienie UODO (24–72h)</Strong>
        </P>
        <P>
          Zgłoszenie przez formularz online:{" "}
          <A href="https://uodo.gov.pl/pl/p/naruszenia">https://uodo.gov.pl/pl/p/naruszenia</A>. Wymagane elementy
          zgłoszenia (Art. 33(3) RODO):
        </P>
        <List>
          <Li>Charakter naruszenia — kategorie i przybliżona liczba osób i rekordów</Li>
          <Li>Dane kontaktowe punktu kontaktowego (Karol Wypchło, kontakt@blisko.app)</Li>
          <Li>Prawdopodobne konsekwencje naruszenia</Li>
          <Li>Zastosowane lub proponowane środki zaradcze</Li>
        </List>
        <P>Numer sprawy i potwierdzenie zgłoszenia zachowujemy w dokumentacji incydentu.</P>
        <P>
          <Strong>Faza 3 — powiadomienie użytkowników (Art. 34, jeśli wysokie ryzyko)</Strong>
        </P>
        <List>
          <Li>
            Wysyłka emaila przez Resend z adresu <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A> do osób,
            których dotyczy naruszenie
          </Li>
          <Li>
            Treść zgodna z Art. 34(2): opis charakteru naruszenia, prawdopodobne konsekwencje, zastosowane środki
            zaradcze, zalecenia dla użytkownika (np. zmiana hasła w innych serwisach jeśli reużywał, czujność na
            phishing)
          </Li>
          <Li>
            Gdy indywidualne powiadomienie jest niewspółmierne (duża liczba osób) — zamiast tego komunikat publiczny na
            blisko.app oraz w aplikacji, zgodnie z Art. 34(3)(c)
          </Li>
        </List>
        <P>
          <Strong>Faza 4 — post-incident</Strong>
        </P>
        <List>
          <Li>Pełen post-mortem: timeline, przyczyna źródłowa, remediacja, środki prewencyjne</Li>
          <Li>Aktualizacja niniejszej procedury jeśli incydent ujawnił luki</Li>
          <Li>Aktualizacja polityki prywatności, jeśli zaangażowany był nowy procesor lub nowa kategoria danych</Li>
        </List>
      </Section>

      <Section title="6. Dokumentacja incydentu">
        <P>
          Niezależnie od oceny ryzyka każdy incydent jest dokumentowany wewnętrznie: data i godzina wykrycia, opis
          zdarzenia, zakres, podjęte działania, klasyfikacja ryzyka, decyzja o powiadomieniach i uzasadnienie, numer
          sprawy UODO jeśli zgłoszono. Dokumentacja jest przechowywana na wypadek audytu zgodnie z zasadą rozliczalności
          (Art. 5(2) RODO).
        </P>
      </Section>

      <Section title="7. Kontakty">
        <P>
          <Strong>Administrator danych</Strong>
        </P>
        <List>
          <Li>
            Karol Wypchło — <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>
          </Li>
        </List>
        <P>
          <Strong>Organ nadzorczy</Strong>
        </P>
        <List>
          <Li>Prezes Urzędu Ochrony Danych Osobowych (UODO)</Li>
          <Li>ul. Stawki 2, 00-193 Warszawa</Li>
          <Li>
            Formularz zgłoszeniowy:{" "}
            <A href="https://uodo.gov.pl/pl/p/naruszenia">https://uodo.gov.pl/pl/p/naruszenia</A>
          </Li>
        </List>
        <P>
          <Strong>Procesorzy (eskalacja w razie incydentu po ich stronie)</Strong>
        </P>
        <List>
          <Li>
            OpenAI — <A href="mailto:security@openai.com">security@openai.com</A> (zgłaszanie incydentów bezpieczeństwa)
          </Li>
          <Li>
            Railway — <A href="mailto:security@railway.com">security@railway.com</A>
          </Li>
          <Li>
            Resend — <A href="mailto:security@resend.com">security@resend.com</A>
          </Li>
          <Li>
            Tigris — <A href="mailto:security@tigrisdata.com">security@tigrisdata.com</A>
          </Li>
        </List>
      </Section>

      <Section title="8. Zgłaszanie incydentu przez użytkownika lub badacza">
        <P>
          Jeśli zauważyłeś lukę bezpieczeństwa lub podejrzenie naruszenia danych, skontaktuj się z nami na{" "}
          <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>. Potwierdzimy otrzymanie zgłoszenia w ciągu 24
          godzin i rozpoczniemy weryfikację zgodnie z Fazą 0 powyżej.
        </P>
      </Section>

      <Section title="9. Przegląd procedury">
        <P>
          Procedura jest weryfikowana i aktualizowana przy każdej zmianie procesorów danych, dodaniu nowej kategorii
          wrażliwych danych, oraz przy corocznym przeglądzie polityki prywatności. Data ostatniej aktualizacji jest
          widoczna na górze dokumentu.
        </P>
      </Section>
    </LegalPage>
  );
}
