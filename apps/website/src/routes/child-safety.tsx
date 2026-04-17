import { createFileRoute } from "@tanstack/react-router";
import { A, LegalPage, Li, List, P, Section, Strong } from "@/components/LegalPage";

export const Route = createFileRoute("/child-safety")({
  head: () => ({
    meta: [{ title: "Standardy Bezpieczeństwa Dzieci — Blisko" }],
  }),
  component: ChildSafetyPage,
});

function ChildSafetyPage() {
  return (
    <LegalPage title="Standardy Bezpieczeństwa Dzieci" updated="Ostatnia aktualizacja: 18 kwietnia 2026">
      <Section title="1. Zobowiązanie">
        <P>
          Blisko jest społecznościową aplikacją dla osób dorosłych. Nie tolerujemy żadnych treści ani zachowań
          związanych z wykorzystywaniem seksualnym dzieci (<Strong>CSAM</Strong> — Child Sexual Abuse Material) ani
          działań zagrażających bezpieczeństwu osób niepełnoletnich. Niniejszy dokument opisuje nasze standardy
          zapobiegania takim treściom, mechanizmy ich wykrywania oraz sposoby zgłaszania naruszeń.
        </P>
        <P>
          Publikacja tego dokumentu jest zgodna z wymogami Google Play dla aplikacji z kategorii Społeczności i Randki
          oraz z{" "}
          <A href="https://support.google.com/googleplay/android-developer/answer/13809140">
            zasadami dotyczącymi standardów bezpieczeństwa dzieci
          </A>
          .
        </P>
      </Section>

      <Section title="2. Ograniczenia wiekowe">
        <P>
          Z aplikacji Blisko mogą korzystać wyłącznie osoby, które ukończyły <Strong>16 rok życia</Strong>. Warunek ten
          wynika z Regulaminu (sekcja 2) i jest potwierdzany przez użytkownika w momencie rejestracji. Konta, co do
          których mamy uzasadnione podstawy sądzić, że należą do osób poniżej 16 roku życia, są natychmiastowo usuwane.
        </P>
      </Section>

      <Section title="3. Zakaz treści CSAM i CSEA">
        <P>
          W aplikacji Blisko zabronione są jakiekolwiek treści oraz zachowania stanowiące materiały przedstawiające
          seksualne wykorzystywanie dzieci (CSAM) lub seksualne wykorzystywanie i krzywdzenie dzieci (
          <Strong>CSEA</Strong> — Child Sexual Exploitation and Abuse), w szczególności:
        </P>
        <List>
          <Li>zdjęcia, filmy, ilustracje lub inne treści o charakterze seksualnym z udziałem osób niepełnoletnich;</Li>
          <Li>treści seksualizujące osoby niepełnoletnie, w tym generowane przez AI lub rysowane;</Li>
          <Li>próby nawiązania kontaktu o charakterze seksualnym z osobą niepełnoletnią (grooming);</Li>
          <Li>próby pozyskania intymnych materiałów od osób niepełnoletnich (sextortion);</Li>
          <Li>wszelkie treści promujące, gloryfikujące lub normalizujące wykorzystywanie seksualne dzieci.</Li>
        </List>
        <P>
          Naruszenie powyższych zasad skutkuje natychmiastowym i trwałym zablokowaniem konta oraz — w przypadkach
          wymaganych przez prawo — zgłoszeniem odpowiednim organom.
        </P>
      </Section>

      <Section title="4. Mechanizm zgłoszeń w aplikacji">
        <P>
          Każdy użytkownik Blisko ma możliwość zgłoszenia treści lub zachowania naruszającego standardy bezpieczeństwa
          dzieci bezpośrednio z poziomu aplikacji:
        </P>
        <List>
          <Li>
            <Strong>Zgłoszenie profilu</Strong> — w widoku profilu innego użytkownika dostępna jest akcja „Zgłoś",
            pozwalająca wskazać powód zgłoszenia (w tym kategorię „Bezpieczeństwo dzieci").
          </Li>
          <Li>
            <Strong>Zgłoszenie wiadomości</Strong> — w konwersacji użytkownik może zgłosić konkretną wiadomość oraz całą
            rozmowę.
          </Li>
          <Li>
            <Strong>Blokowanie</Strong> — użytkownik może w każdej chwili zablokować innego użytkownika, co natychmiast
            ukrywa go z widoku i uniemożliwia dalszy kontakt.
          </Li>
          <Li>
            <Strong>Zgłoszenie przez email</Strong> — w przypadku treści wymagających pilnej interwencji można
            skontaktować się z nami bezpośrednio: <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>.
          </Li>
        </List>
        <P>
          Każde zgłoszenie dotyczące bezpieczeństwa dzieci traktowane jest priorytetowo. Reagujemy w ciągu 24 godzin od
          otrzymania zgłoszenia, a w potwierdzonych przypadkach — natychmiast.
        </P>
      </Section>

      <Section title="5. Moderacja i wykrywanie">
        <P>
          Moderacja opiera się na kombinacji automatycznej analizy treści (w tym moderacji treści generowanych przez AI)
          oraz ręcznego przeglądu zgłoszeń przez zespół Blisko. Treści wizualne przesyłane do aplikacji (zdjęcia
          profilowe, portrety) przechodzą przez automatyczne mechanizmy moderacji, które wykrywają potencjalnie
          niebezpieczne treści i blokują ich publikację.
        </P>
        <P>
          W przypadku wykrycia treści CSAM natychmiast usuwamy treść, blokujemy konto sprawcy oraz zabezpieczamy dane
          niezbędne do przekazania organom ścigania.
        </P>
      </Section>

      <Section title="6. Zgłaszanie naruszeń organom">
        <P>
          Blisko współpracuje z właściwymi organami w zakresie zwalczania wykorzystywania seksualnego dzieci.
          Potwierdzone przypadki CSAM zgłaszamy:
        </P>
        <List>
          <Li>
            <Strong>Dyżurnet.pl</Strong> — polski zespół reagujący na nielegalne treści w internecie prowadzony przez
            NASK (<A href="https://dyzurnet.pl">dyzurnet.pl</A>).
          </Li>
          <Li>
            <Strong>Policja</Strong> — w przypadkach wymagających interwencji organów ścigania na terenie
            Rzeczypospolitej Polskiej.
          </Li>
          <Li>
            <Strong>NCMEC</Strong> (National Center for Missing &amp; Exploited Children) — w przypadku treści o zasięgu
            międzynarodowym lub gdy wymaga tego prawo jurysdykcji, w której zachodzi naruszenie.
          </Li>
        </List>
        <P>
          Zachęcamy również użytkowników do samodzielnego zgłaszania treści naruszających bezpieczeństwo dzieci
          bezpośrednio do Dyżurnet.pl lub policji (telefon alarmowy 112).
        </P>
      </Section>

      <Section title="7. Zgodność z prawem">
        <P>
          Blisko działa zgodnie ze wszystkimi obowiązującymi przepisami prawa dotyczącymi ochrony dzieci, w
          szczególności:
        </P>
        <List>
          <Li>Kodeksem karnym Rzeczypospolitej Polskiej (art. 200–202a);</Li>
          <Li>
            rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2022/2065 w sprawie jednolitego rynku usług cyfrowych
            (DSA);
          </Li>
          <Li>Konwencją Rady Europy z Lanzarote o ochronie dzieci przed seksualnym wykorzystywaniem;</Li>
          <Li>zasadami Google Play dotyczącymi standardów bezpieczeństwa dzieci.</Li>
        </List>
      </Section>

      <Section title="8. Punkt kontaktowy">
        <P>
          Osoba wyznaczona do omawiania zasad bezpieczeństwa dzieci w aplikacji Blisko oraz sposobu ich egzekwowania
          jest dostępna pod adresem: <A href="mailto:kontakt@blisko.app">kontakt@blisko.app</A>.
        </P>
        <P>
          Prośby dotyczące usunięcia treści, współpracy w dochodzeniach lub pytania o mechanizmy moderacji kierowane z
          tego adresu rozpatrywane są z priorytetem, w ciągu 24 godzin w dni robocze.
        </P>
      </Section>

      <Section title="9. Zmiany standardów">
        <P>
          O istotnych zmianach niniejszych standardów poinformujemy w aplikacji. Data ostatniej aktualizacji jest
          widoczna na górze tego dokumentu.
        </P>
      </Section>
    </LegalPage>
  );
}
