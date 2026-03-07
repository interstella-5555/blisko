const PORT = Number(process.env.PORT) || 3001;

const APP_SCHEME = "blisko";
const IOS_BUNDLE_ID = "com.blisko.app";
const ANDROID_PACKAGE = "com.blisko.app";
const IOS_APP_STORE_URL = "https://apps.apple.com/app/blisko/id0"; // TODO: update with real ID
const ANDROID_PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

// Apple App Site Association — enables universal links on iOS
const AASA = JSON.stringify({
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [`TEAMID.${IOS_BUNDLE_ID}`], // TODO: replace TEAMID with real Apple Team ID
        paths: ["/join/*"],
      },
    ],
  },
});

// Android Asset Links — enables app links on Android
const ASSET_LINKS = JSON.stringify([
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: ANDROID_PACKAGE,
      sha256_cert_fingerprints: [], // TODO: add real fingerprints
    },
  },
]);

function joinPage(code: string): string {
  const deepLink = `${APP_SCHEME}:///group/join/${code}`;
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dołącz do grupy — Blisko</title>
  <meta property="og:title" content="Zaproszenie do grupy w Blisko">
  <meta property="og:description" content="Kliknij, żeby dołączyć do grupy w aplikacji Blisko.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #FAF7F2;
      color: #1A1A1A;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: 24px;
    }
    .card {
      text-align: center;
      max-width: 360px;
    }
    .logo {
      font-size: 32px;
      font-weight: 300;
      letter-spacing: 4px;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 15px;
      color: #8B8680;
      margin-bottom: 32px;
    }
    .open-btn {
      display: inline-block;
      background: #C0392B;
      color: #fff;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 14px 40px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .fallback {
      font-size: 13px;
      color: #8B8680;
      line-height: 1.5;
    }
    .fallback a { color: #1A1A1A; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">BLISKO</div>
    <p class="subtitle">Zaproszenie do grupy</p>
    <a class="open-btn" id="open" href="${deepLink}">Otwórz w aplikacji</a>
    <p class="fallback">
      Nie masz jeszcze Blisko?<br>
      <a href="${IOS_APP_STORE_URL}">App Store</a> · <a href="${ANDROID_PLAY_URL}">Google Play</a>
    </p>
  </div>
  <script>
    // Try to open the app immediately
    window.location.href = '${deepLink}';
  </script>
</body>
</html>`;
}

function homePage(): string {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Blisko</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #FAF7F2;
      color: #1A1A1A;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
    }
    .logo {
      font-size: 40px;
      font-weight: 300;
      letter-spacing: 6px;
    }
  </style>
</head>
<body>
  <div class="logo">BLISKO</div>
</body>
</html>`;
}

function privacyPage(): string {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Polityka Prywatności — Blisko</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #FAF7F2;
      color: #1A1A1A;
      line-height: 1.7;
      padding: 40px 24px 80px;
    }
    .container { max-width: 640px; margin: 0 auto; }
    .back { font-size: 13px; color: #8B8680; text-decoration: none; display: inline-block; margin-bottom: 32px; }
    .back:hover { color: #1A1A1A; }
    h1 { font-size: 24px; font-weight: 400; letter-spacing: 1px; margin-bottom: 8px; }
    .updated { font-size: 13px; color: #8B8680; margin-bottom: 32px; }
    h2 { font-size: 16px; font-weight: 600; margin-top: 32px; margin-bottom: 12px; }
    p, li { font-size: 15px; color: #3A3A3A; margin-bottom: 8px; }
    ul { padding-left: 20px; margin-bottom: 16px; }
    a { color: #C0392B; }
  </style>
</head>
<body>
  <div class="container">
    <a class="back" href="/">← blisko.app</a>
    <h1>Polityka Prywatności</h1>
    <p class="updated">Ostatnia aktualizacja: 7 marca 2026</p>

    <h2>1. Administrator danych</h2>
    <p>Administratorem danych osobowych jest Karol Wypchło, prowadzący aplikację Blisko. Kontakt: <a href="mailto:kontakt@blisko.app">kontakt@blisko.app</a>.</p>

    <h2>2. Jakie dane zbieramy</h2>
    <ul>
      <li><strong>Dane konta:</strong> adres email, imię, bio, zainteresowania, linki społecznościowe, status, tryb widoczności</li>
      <li><strong>Lokalizacja:</strong> ostatnia znana pozycja (tylko podczas aktywnego korzystania z aplikacji)</li>
      <li><strong>Pliki:</strong> zdjęcie profilowe (avatar), portret (przechowywane w chmurze)</li>
      <li><strong>Wiadomości:</strong> treść wiadomości czatu, wave'y (zaproszenia do kontaktu)</li>
      <li><strong>Analiza AI:</strong> embeddingi profilu, wyniki kompatybilności między użytkownikami</li>
      <li><strong>Sesje profilowania:</strong> historia pytań i odpowiedzi z kwestionariusza</li>
      <li><strong>Konta OAuth:</strong> powiązania z dostawcami (Apple, Google, Facebook, LinkedIn) — nie przechowujemy haseł</li>
    </ul>

    <h2>3. Cel i podstawa przetwarzania</h2>
    <ul>
      <li><strong>Wykonanie umowy (Art. 6(1)(b) RODO)</strong> — świadczenie usługi, dopasowywanie użytkowników, obsługa czatu</li>
      <li><strong>Prawnie uzasadniony interes (Art. 6(1)(f))</strong> — bezpieczeństwo, zapobieganie nadużyciom</li>
      <li><strong>Zgoda (Art. 6(1)(a))</strong> — przetwarzanie lokalizacji, analiza AI kompatybilności</li>
    </ul>

    <h2>4. Podmioty przetwarzające</h2>
    <p>Twoje dane mogą być przetwarzane przez następujące podmioty:</p>
    <ul>
      <li><strong>OpenAI</strong> (USA) — analiza profili AI, scoring kompatybilności</li>
      <li><strong>Railway</strong> (hosting, region EU) — baza danych PostgreSQL, Redis</li>
      <li><strong>Resend</strong> (USA) — wysyłka emaili transakcyjnych (kody OTP)</li>
      <li><strong>Tigris/S3</strong> — przechowywanie plików (avatary, portrety)</li>
    </ul>

    <h2>5. Transfer danych poza EOG</h2>
    <p>OpenAI i Resend mają siedzibę w USA. Transfer odbywa się na podstawie standardowych klauzul umownych (SCC) zgodnie z Art. 46(2)(c) RODO.</p>

    <h2>6. Okres przechowywania</h2>
    <ul>
      <li>Dane konta — do momentu usunięcia konta przez użytkownika</li>
      <li>Po usunięciu konta — 14-dniowy okres karencji, potem trwałe usunięcie wszystkich danych</li>
      <li>Dane analityki AI — usuwane wraz z kontem</li>
    </ul>

    <h2>7. Twoje prawa</h2>
    <ul>
      <li><strong>Prawo dostępu (Art. 15)</strong> — możesz zażądać kopii swoich danych</li>
      <li><strong>Prawo do sprostowania (Art. 16)</strong> — możesz edytować swój profil w aplikacji</li>
      <li><strong>Prawo do usunięcia (Art. 17)</strong> — możesz usunąć konto w ustawieniach aplikacji (14-dniowy okres karencji)</li>
      <li><strong>Prawo do przenoszenia danych (Art. 20)</strong> — możesz pobrać swoje dane w formacie JSON</li>
      <li><strong>Prawo do sprzeciwu wobec profilowania (Art. 22)</strong> — AI generuje rekomendacje kompatybilności, ale to Ty podejmujesz decyzję o nawiązaniu kontaktu</li>
    </ul>

    <h2>8. Profilowanie AI</h2>
    <p>Blisko wykorzystuje sztuczną inteligencję do analizy kompatybilności między użytkownikami. AI generuje wyniki dopasowania (compatibility scores) na podstawie profili. Są to wyłącznie rekomendacje — ostateczną decyzję o wysłaniu zaproszenia (wave'a) podejmuje zawsze użytkownik. Nie stosujemy w pełni zautomatyzowanego podejmowania decyzji w rozumieniu Art. 22 RODO.</p>

    <h2>9. Pliki cookies</h2>
    <p>Aplikacja mobilna nie używa plików cookies. Strona internetowa blisko.app nie wykorzystuje cookies śledzących ani analitycznych.</p>

    <h2>10. Kontakt i skargi</h2>
    <p>W sprawie danych osobowych skontaktuj się: <a href="mailto:kontakt@blisko.app">kontakt@blisko.app</a>.</p>
    <p>Masz prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (UODO), ul. Stawki 2, 00-193 Warszawa.</p>

    <h2>11. Zmiany polityki prywatności</h2>
    <p>O istotnych zmianach poinformujemy w aplikacji. Data ostatniej aktualizacji jest widoczna na górze tego dokumentu.</p>
  </div>
</body>
</html>`;
}

function termsPage(): string {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Regulamin — Blisko</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #FAF7F2;
      color: #1A1A1A;
      line-height: 1.7;
      padding: 40px 24px 80px;
    }
    .container { max-width: 640px; margin: 0 auto; }
    .back { font-size: 13px; color: #8B8680; text-decoration: none; display: inline-block; margin-bottom: 32px; }
    .back:hover { color: #1A1A1A; }
    h1 { font-size: 24px; font-weight: 400; letter-spacing: 1px; margin-bottom: 8px; }
    .updated { font-size: 13px; color: #8B8680; margin-bottom: 32px; }
    h2 { font-size: 16px; font-weight: 600; margin-top: 32px; margin-bottom: 12px; }
    p, li { font-size: 15px; color: #3A3A3A; margin-bottom: 8px; }
    ul { padding-left: 20px; margin-bottom: 16px; }
    a { color: #C0392B; }
  </style>
</head>
<body>
  <div class="container">
    <a class="back" href="/">← blisko.app</a>
    <h1>Regulamin</h1>
    <p class="updated">Ostatnia aktualizacja: 7 marca 2026</p>

    <h2>1. Postanowienia ogólne</h2>
    <p>Niniejszy regulamin określa zasady korzystania z aplikacji mobilnej Blisko (dalej: "Aplikacja"), prowadzonej przez Karola Wypchło (dalej: "Usługodawca").</p>
    <p>Rejestracja w Aplikacji oznacza akceptację niniejszego regulaminu.</p>

    <h2>2. Warunki korzystania</h2>
    <ul>
      <li>Z Aplikacji mogą korzystać osoby, które ukończyły <strong>16 lat</strong>. Rejestrując się, potwierdzasz ukończenie 16 lat.</li>
      <li>Każda osoba może posiadać jedno konto.</li>
      <li>Dane w profilu powinny być prawdziwe i aktualne.</li>
    </ul>

    <h2>3. Opis usługi</h2>
    <p>Blisko łączy osoby w pobliżu na podstawie lokalizacji, zainteresowań i analizy kompatybilności AI. Użytkownicy mogą:</p>
    <ul>
      <li>Wysyłać zaproszenia do kontaktu (wave'y)</li>
      <li>Prowadzić rozmowy po zaakceptowaniu zaproszenia</li>
      <li>Tworzyć i dołączać do grup</li>
      <li>Ustawiać status i odkrywać osoby o podobnych statusach</li>
    </ul>

    <h2>4. Zasady korzystania</h2>
    <p>Zabrania się:</p>
    <ul>
      <li>Wysyłania spamu, nękania lub zastraszania innych użytkowników</li>
      <li>Publikowania treści nielegalnych, obraźliwych lub pornograficznych</li>
      <li>Podszywania się pod inne osoby</li>
      <li>Zbierania danych innych użytkowników (scraping)</li>
      <li>Używania botów lub narzędzi automatyzujących</li>
    </ul>

    <h2>5. Konto i bezpieczeństwo</h2>
    <p>Użytkownik odpowiada za bezpieczeństwo swojego konta. Logowanie odbywa się przez OAuth (Apple, Google, Facebook, LinkedIn) lub email z kodem OTP. Aplikacja nie przechowuje haseł.</p>

    <h2>6. Treści użytkownika</h2>
    <ul>
      <li>Użytkownik zachowuje prawa do treści, które publikuje w Aplikacji.</li>
      <li>Użytkownik udziela Usługodawcy licencji na przetwarzanie treści w zakresie niezbędnym do świadczenia usługi.</li>
      <li>Usługodawca zastrzega sobie prawo do usunięcia treści naruszających regulamin.</li>
    </ul>

    <h2>7. Usunięcie konta</h2>
    <p>Użytkownik może usunąć konto w ustawieniach Aplikacji. Po potwierdzeniu kodem OTP następuje:</p>
    <ul>
      <li>Natychmiastowe wylogowanie i ukrycie profilu</li>
      <li>14-dniowy okres karencji (możliwość kontaktu z supportem w celu anulowania)</li>
      <li>Po 14 dniach — trwałe usunięcie wszystkich danych</li>
    </ul>

    <h2>8. Ograniczenie odpowiedzialności</h2>
    <ul>
      <li>Usługa świadczona jest w stanie "as is" — Usługodawca nie gwarantuje nieprzerwanego działania.</li>
      <li>Usługodawca nie odpowiada za zachowania innych użytkowników.</li>
      <li>Wyniki analizy AI mają charakter orientacyjny i nie stanowią gwarancji kompatybilności.</li>
    </ul>

    <h2>9. Zmiany regulaminu</h2>
    <p>O istotnych zmianach regulaminu poinformujemy z wyprzedzeniem w Aplikacji. Kontynuacja korzystania z Aplikacji po wprowadzeniu zmian oznacza ich akceptację.</p>

    <h2>10. Prawo właściwe</h2>
    <p>Regulamin podlega prawu polskiemu. Sądem właściwym jest sąd w Warszawie.</p>

    <h2>Kontakt</h2>
    <p>Pytania dotyczące regulaminu: <a href="mailto:kontakt@blisko.app">kontakt@blisko.app</a>.</p>
  </div>
</body>
</html>`;
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // Well-known files for universal/app links
    if (url.pathname === "/.well-known/apple-app-site-association") {
      return new Response(AASA, {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/.well-known/assetlinks.json") {
      return new Response(ASSET_LINKS, {
        headers: { "content-type": "application/json" },
      });
    }

    // Join deep link handler
    const joinMatch = url.pathname.match(/^\/join\/([A-Za-z0-9]+)$/);
    if (joinMatch) {
      const code = joinMatch[1];
      return new Response(joinPage(code), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Privacy policy
    if (url.pathname === "/privacy") {
      return new Response(privacyPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Terms of service
    if (url.pathname === "/terms") {
      return new Response(termsPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Home
    return new Response(homePage(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`Website running at http://localhost:${server.port}`);
