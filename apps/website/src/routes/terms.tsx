import { createFileRoute } from "@tanstack/react-router";
import { A, LegalPage, Li, List, P, Section, Strong } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Regulamin — Blisko" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Regulamin" updated="Ostatnia aktualizacja: 7 marca 2026">
      <Section title="1. Postanowienia ogólne">
        <P>
          Niniejszy regulamin określa zasady korzystania z aplikacji mobilnej Blisko (dalej: "Aplikacja"), prowadzonej
          przez Karola Wypchło (dalej: "Usługodawca").
        </P>
        <P>Rejestracja w Aplikacji oznacza akceptację niniejszego regulaminu.</P>
      </Section>

      <Section title="2. Warunki korzystania">
        <List>
          <Li>
            Z Aplikacji mogą korzystać osoby, które ukończyły <Strong>16 lat</Strong>. Rejestrując się, potwierdzasz
            ukończenie 16 lat.
          </Li>
          <Li>Każda osoba może posiadać jedno konto.</Li>
          <Li>Dane w profilu powinny być prawdziwe i aktualne.</Li>
        </List>
      </Section>

      <Section title="3. Opis usługi">
        <P>
          Blisko łączy osoby w pobliżu na podstawie lokalizacji, zainteresowań i analizy kompatybilności AI. Użytkownicy
          mogą:
        </P>
        <List>
          <Li>Wysyłać zaproszenia do kontaktu (wave'y)</Li>
          <Li>Prowadzić rozmowy po zaakceptowaniu zaproszenia</Li>
          <Li>Tworzyć i dołączać do grup</Li>
          <Li>Ustawiać status i odkrywać osoby o podobnych statusach</Li>
        </List>
      </Section>

      <Section title="4. Zasady korzystania">
        <P>Zabrania się:</P>
        <List>
          <Li>Wysyłania spamu, nękania lub zastraszania innych użytkowników</Li>
          <Li>Publikowania treści nielegalnych, obraźliwych lub pornograficznych</Li>
          <Li>Podszywania się pod inne osoby</Li>
          <Li>Zbierania danych innych użytkowników (scraping)</Li>
          <Li>Używania botów lub narzędzi automatyzujących</Li>
        </List>
      </Section>

      <Section title="5. Konto i bezpieczeństwo">
        <P>
          Użytkownik odpowiada za bezpieczeństwo swojego konta. Logowanie odbywa się przez OAuth (Apple, Google,
          Facebook, LinkedIn) lub email z kodem OTP. Aplikacja nie przechowuje haseł.
        </P>
      </Section>

      <Section title="6. Treści użytkownika">
        <List>
          <Li>Użytkownik zachowuje prawa do treści, które publikuje w Aplikacji.</Li>
          <Li>
            Użytkownik udziela Usługodawcy licencji na przetwarzanie treści w zakresie niezbędnym do świadczenia usługi.
          </Li>
          <Li>Usługodawca zastrzega sobie prawo do usunięcia treści naruszających regulamin.</Li>
        </List>
      </Section>

      <Section title="7. Usunięcie konta">
        <P>Użytkownik może usunąć konto w ustawieniach Aplikacji. Po potwierdzeniu kodem OTP następuje:</P>
        <List>
          <Li>Natychmiastowe wylogowanie i ukrycie profilu</Li>
          <Li>14-dniowy okres karencji (możliwość kontaktu z supportem w celu anulowania)</Li>
          <Li>Po 14 dniach — trwałe usunięcie wszystkich danych</Li>
        </List>
      </Section>

      <Section title="8. Ograniczenie odpowiedzialności">
        <List>
          <Li>Usługa świadczona jest w stanie "as is" — Usługodawca nie gwarantuje nieprzerwanego działania.</Li>
          <Li>Usługodawca nie odpowiada za zachowania innych użytkowników.</Li>
          <Li>Wyniki analizy AI mają charakter orientacyjny i nie stanowią gwarancji kompatybilności.</Li>
        </List>
      </Section>

      <Section title="9. Zmiany regulaminu">
        <P>
          O istotnych zmianach regulaminu poinformujemy z wyprzedzeniem w Aplikacji. Kontynuacja korzystania z Aplikacji
          po wprowadzeniu zmian oznacza ich akceptację.
        </P>
      </Section>

      <Section title="10. Prawo właściwe">
        <P>Regulamin podlega prawu polskiemu. Sądem właściwym jest sąd w Warszawie.</P>
      </Section>

      <Section title="Kontakt">
        <P>
          Pytania dotyczące regulaminu: <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>.
        </P>
      </Section>
    </LegalPage>
  );
}
