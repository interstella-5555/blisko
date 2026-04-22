import { createFileRoute } from "@tanstack/react-router";
import { A, LegalPage, Li, List, P, Section, Strong } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Polityka Prywatności — Blisko" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Polityka Prywatności" updated="Ostatnia aktualizacja: 8 kwietnia 2026">
      <Section title="1. Administrator danych">
        <P>
          Administratorem danych osobowych jest Karol Wypchło, prowadzący aplikację Blisko. Kontakt:{" "}
          <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>.
        </P>
      </Section>

      <Section title="2. Jakie dane zbieramy">
        <List>
          <Li>
            <Strong>Dane konta:</Strong> adres email, imię, bio, zainteresowania, linki społecznościowe, status, tryb
            widoczności
          </Li>
          <Li>
            <Strong>Lokalizacja:</Strong> ostatnia znana pozycja (tylko podczas aktywnego korzystania z aplikacji)
          </Li>
          <Li>
            <Strong>Pliki:</Strong> zdjęcie profilowe (avatar) — przechowywane w chmurze
          </Li>
          <Li>
            <Strong>Dane generowane przez AI:</Strong> wewnętrzny opis osobowości (tekst generowany na podstawie Twoich
            odpowiedzi z kwestionariusza, używany wyłącznie do dopasowywania). Nie jest widoczny dla innych użytkowników
            ani dla Ciebie w aplikacji — możesz go zobaczyć pobierając eksport swoich danych.
          </Li>
          <Li>
            <Strong>Wiadomości:</Strong> treść wiadomości czatu, wave'y (zaproszenia do kontaktu)
          </Li>
          <Li>
            <Strong>Analiza AI:</Strong> embeddingi profilu, wyniki kompatybilności między użytkownikami
          </Li>
          <Li>
            <Strong>Sesje profilowania:</Strong> historia pytań i odpowiedzi z kwestionariusza
          </Li>
          <Li>
            <Strong>Konta OAuth:</Strong> powiązania z dostawcami (Apple, Google, Facebook, LinkedIn) — nie
            przechowujemy haseł
          </Li>
          <Li>
            <Strong>Blokady:</Strong> informacja o zablokowaniu innego użytkownika (w celu ukrycia go z Twojego widoku)
          </Li>
          <Li>
            <Strong>Dopasowania statusów:</Strong> wyniki automatycznego porównywania statusów między użytkownikami
            przez AI
          </Li>
          <Li>
            <Strong>Oceny rozmów:</Strong> opcjonalna ocena jakości konwersacji
          </Li>
          <Li>
            <Strong>Dane techniczne:</Strong> logi zapytań (endpoint, czas odpowiedzi, zanonimizowany adres IP) w celu
            monitorowania wydajności i bezpieczeństwa usługi
          </Li>
        </List>
      </Section>

      <Section title="3. Cel i podstawa przetwarzania">
        <List>
          <Li>
            <Strong>Wykonanie umowy (Art. 6(1)(b) RODO)</Strong> — świadczenie usługi, dopasowywanie użytkowników,
            obsługa czatu
          </Li>
          <Li>
            <Strong>Prawnie uzasadniony interes (Art. 6(1)(f))</Strong> — bezpieczeństwo, zapobieganie nadużyciom
          </Li>
          <Li>
            <Strong>Zgoda (Art. 6(1)(a))</Strong> — przetwarzanie lokalizacji, analiza AI kompatybilności
          </Li>
        </List>
      </Section>

      <Section title="4. Podmioty przetwarzające">
        <P>Twoje dane mogą być przetwarzane przez następujące podmioty:</P>
        <List>
          <Li>
            <Strong>OpenAI</Strong> (USA) — analiza profili AI, scoring kompatybilności
          </Li>
          <Li>
            <Strong>Railway</Strong> (hosting, region EU) — baza danych PostgreSQL, Redis
          </Li>
          <Li>
            <Strong>Resend</Strong> (USA) — wysyłka emaili transakcyjnych (kody OTP)
          </Li>
          <Li>
            <Strong>Tigris/S3</Strong> — przechowywanie plików (avatary)
          </Li>
        </List>
      </Section>

      <Section title="5. Transfer danych poza EOG">
        <P>
          OpenAI i Resend mają siedzibę w USA. Transfer odbywa się na podstawie standardowych klauzul umownych (SCC)
          zgodnie z Art. 46(2)(c) RODO.
        </P>
      </Section>

      <Section title="6. Okres przechowywania">
        <List>
          <Li>Dane konta — do momentu usunięcia konta przez użytkownika</Li>
          <Li>Po usunięciu konta — 14-dniowy okres karencji, potem trwałe usunięcie wszystkich danych</Li>
          <Li>Dane analityki AI — usuwane wraz z kontem</Li>
        </List>
      </Section>

      <Section title="7. Twoje prawa">
        <List>
          <Li>
            <Strong>Prawo dostępu (Art. 15)</Strong> — możesz zażądać kopii swoich danych
          </Li>
          <Li>
            <Strong>Prawo do sprostowania (Art. 16)</Strong> — możesz edytować swój profil w aplikacji
          </Li>
          <Li>
            <Strong>Prawo do usunięcia (Art. 17)</Strong> — możesz usunąć konto w ustawieniach aplikacji (14-dniowy
            okres karencji)
          </Li>
          <Li>
            <Strong>Prawo do przenoszenia danych (Art. 20)</Strong> — możesz pobrać swoje dane w formacie JSON
          </Li>
          <Li>
            <Strong>Prawo do sprzeciwu wobec profilowania (Art. 22)</Strong> — AI generuje rekomendacje kompatybilności,
            ale to Ty podejmujesz decyzję o nawiązaniu kontaktu
          </Li>
        </List>
      </Section>

      <Section title="8. Profilowanie AI">
        <P>
          Blisko wykorzystuje sztuczną inteligencję do analizy kompatybilności między użytkownikami. AI generuje wyniki
          dopasowania (compatibility scores) na podstawie profili. Są to wyłącznie rekomendacje — ostateczną decyzję o
          wysłaniu zaproszenia (wave'a) podejmuje zawsze użytkownik. Nie stosujemy w pełni zautomatyzowanego
          podejmowania decyzji w rozumieniu Art. 22 RODO.
        </P>
      </Section>

      <Section title="9. Pliki cookies">
        <P>
          Aplikacja mobilna nie używa plików cookies. Strona internetowa blisko.app nie wykorzystuje cookies śledzących
          ani analitycznych.
        </P>
      </Section>

      <Section title="10. Kontakt i skargi">
        <P>
          W sprawie danych osobowych skontaktuj się: <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>.
        </P>
        <P>
          Masz prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (UODO), ul. Stawki 2, 00-193 Warszawa.
        </P>
        <P>
          W przypadku wykrycia naruszenia ochrony danych osobowych stosujemy procedurę zgodną z Art. 33 i 34 RODO —
          szczegóły opisuje <A href="/breach-notification">Procedura powiadamiania o naruszeniu ochrony danych</A>.
        </P>
      </Section>

      <Section title="11. Zmiany polityki prywatności">
        <P>
          O istotnych zmianach poinformujemy w aplikacji. Data ostatniej aktualizacji jest widoczna na górze tego
          dokumentu.
        </P>
      </Section>
    </LegalPage>
  );
}
