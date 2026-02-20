const PORT = Number(process.env.PORT) || 3001;

const APP_SCHEME = 'blisko';
const IOS_BUNDLE_ID = 'com.blisko.app';
const ANDROID_PACKAGE = 'com.blisko.app';
const IOS_APP_STORE_URL = 'https://apps.apple.com/app/blisko/id0'; // TODO: update with real ID
const ANDROID_PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

// Apple App Site Association — enables universal links on iOS
const AASA = JSON.stringify({
  applinks: {
    apps: [],
    details: [
      {
        appIDs: [`TEAMID.${IOS_BUNDLE_ID}`], // TODO: replace TEAMID with real Apple Team ID
        paths: ['/join/*'],
      },
    ],
  },
});

// Android Asset Links — enables app links on Android
const ASSET_LINKS = JSON.stringify([
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
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

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // Well-known files for universal/app links
    if (url.pathname === '/.well-known/apple-app-site-association') {
      return new Response(AASA, {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/.well-known/assetlinks.json') {
      return new Response(ASSET_LINKS, {
        headers: { 'content-type': 'application/json' },
      });
    }

    // Join deep link handler
    const joinMatch = url.pathname.match(/^\/join\/([A-Za-z0-9]+)$/);
    if (joinMatch) {
      const code = joinMatch[1];
      return new Response(joinPage(code), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    // Home
    return new Response(homePage(), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
});

console.log(`Website running at http://localhost:${server.port}`);
