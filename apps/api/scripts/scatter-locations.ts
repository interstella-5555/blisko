/**
 * One-off script: scatter all seed users across Warsaw's full administrative area.
 * Uses the API (profiles.updateLocation) so that side-effects fire:
 *   - enqueueUserPairAnalysis() (BullMQ AI re-analysis)
 *   - ee.emit('nearbyChanged') (WebSocket broadcast)
 *
 * Run: cd apps/api && bun run scripts/scatter-locations.ts
 */

const API = process.env.API_URL || 'http://localhost:3000';
const USER_COUNT = 250;
const BATCH_SIZE = 10;

// Ochota / Włochy / Wola / Śródmieście / Mokotów
const WARSAW_CENTER = { lat: 52.22, lng: 20.99 };
const SPREAD_LAT = 0.05;
const SPREAD_LNG = 0.07;

function randomInRange(center: number, spread: number) {
  return center + (Math.random() - 0.5) * 2 * spread;
}

async function autoLogin(email: string): Promise<string> {
  const res = await fetch(`${API}/dev/auto-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`auto-login failed: ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function updateLocation(token: string, latitude: number, longitude: number) {
  const res = await fetch(`${API}/trpc/profiles.updateLocation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ latitude, longitude, skipAnalysis: true }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`update location failed: ${res.status} ${text}`);
  }
}

async function main() {
  console.log(`Scattering ${USER_COUNT} users across Warsaw...`);
  console.log(`Bounds: lat ${WARSAW_CENTER.lat}±${SPREAD_LAT}, lng ${WARSAW_CENTER.lng}±${SPREAD_LNG}`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < USER_COUNT; i += BATCH_SIZE) {
    const batch = Array.from({ length: Math.min(BATCH_SIZE, USER_COUNT - i) }, (_, j) => i + j);

    await Promise.all(
      batch.map(async (idx) => {
        const email = `user${idx}@example.com`;
        try {
          const token = await autoLogin(email);
          const lat = randomInRange(WARSAW_CENTER.lat, SPREAD_LAT);
          const lng = randomInRange(WARSAW_CENTER.lng, SPREAD_LNG);
          await updateLocation(token, lat, lng);
          updated++;
          if (updated % 25 === 0) console.log(`  ${updated}/${USER_COUNT}`);
        } catch (err) {
          failed++;
          console.error(`Failed ${email}:`, err);
        }
      })
    );
  }

  console.log(`\nDone! Updated: ${updated}, Failed: ${failed}`);
}

main().catch(console.error);
