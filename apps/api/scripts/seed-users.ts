/**
 * Seed script: creates 250 users with diverse profiles scattered around central Warsaw.
 * Uses .seed-cache.json to avoid regenerating profiles on subsequent runs.
 * Run: bun run scripts/seed-users.ts
 * Force regenerate: rm scripts/.seed-cache.json && bun run scripts/seed-users.ts
 */

const API = process.env.API_URL || 'http://localhost:3000';
const USER_COUNT = 250;
const CACHE_PATH = `${import.meta.dir}/.seed-cache.json`;

// Ochota / Włochy / Wola / Śródmieście / Mokotów
const WARSAW_CENTER = { lat: 52.22, lng: 20.99 };
const SPREAD_LAT = 0.05;
const SPREAD_LNG = 0.07;

function randomInRange(center: number, spread: number) {
  return center + (Math.random() - 0.5) * 2 * spread;
}

// --- Diverse Polish first names ---
const FEMALE_NAMES = [
  'Ania', 'Kasia', 'Magda', 'Ola', 'Zuzia', 'Basia', 'Ewa', 'Marta', 'Joanna', 'Agnieszka',
  'Natalia', 'Weronika', 'Paulina', 'Karolina', 'Dominika', 'Sylwia', 'Monika', 'Izabela', 'Patrycja', 'Aleksandra',
  'Kamila', 'Justyna', 'Beata', 'Dorota', 'Renata', 'Hanna', 'Lena', 'Maja', 'Zofia', 'Alicja',
  'Julia', 'Emilia', 'Gabriela', 'Sandra', 'Klaudia', 'Dagmara', 'Marzena', 'Iwona', 'Teresa', 'Celina',
];

const MALE_NAMES = [
  'Tomek', 'Bartek', 'Michał', 'Kuba', 'Paweł', 'Piotr', 'Maciek', 'Kamil', 'Dawid', 'Łukasz',
  'Adam', 'Marcin', 'Jakub', 'Szymon', 'Krzysztof', 'Grzegorz', 'Wojtek', 'Mateusz', 'Filip', 'Rafał',
  'Damian', 'Adrian', 'Hubert', 'Igor', 'Oskar', 'Wiktor', 'Artur', 'Robert', 'Jan', 'Andrzej',
  'Sebastian', 'Daniel', 'Marek', 'Norbert', 'Patryk', 'Konrad', 'Radek', 'Olek', 'Leon', 'Tadeusz',
];

// --- Bio building blocks (gendered for natural Polish) ---
const OCCUPATIONS_F = [
  'Programuję, a po godzinach odkrywam kuchnię azjatycką',
  'Projektuję wnętrza, mam słabość do vintage',
  'Uczę angielskiego i przy każdej okazji podróżuję',
  'Jestem fizjoterapeutką i trenuję triatlon',
  'Pracuję jako graficzka freelancerka, rysuję komiksy',
  'Jestem baristką i sommelierką kawy speciality',
  'Z wykształcenia prawniczka, z duszy artystka',
  'Gram na saksofonie w jazzowym trio',
  'Pracuję w radiu i zbieram winyle',
  'Fotografuję ulice Warszawy',
  'Studiuję psychologię i wolontariuję w schronisku',
  'Zajmuję się inżynierią dźwięku, produkuję muzykę elektroniczną',
  'Gotuję w restauracji fusion',
  'Tłumaczę z japońskiego, kocham anime i mangę',
  'Jestem lekarką i biegam ultramaratony',
  'Projektuję UX, mam obsesję na punkcie typografii',
  'Prowadzę działkę na Saskiej Kępie, ogrodnictwo miejskie to moje wszystko',
  'Trenuję ludzi personalnie i prowadzę zajęcia z jogi',
  'Robię ceramikę i prowadzę warsztaty garncarskie',
  'Analizuję dane na co dzień, a wieczorami gram w planszówki',
  'Piszę swoją pierwszą powieść',
  'Gram w offowym teatrze',
  'Jestem weterynarką, mam trzy koty i psa',
  'Robię meble z odzysku',
  'Uczę ekologicznego życia, zero waste to mój styl',
  'Pracuję jako chemiczka w laboratorium kosmetycznym',
  'Latam szybowcem w weekendy',
  'Robię tatuaże, specjalizuję się w dotworkach',
  'Pracuję w bibliotece i prowadzę bookstagram',
  'Tworzę gry indie i pixel art',
  'Jestem psycholożką dziecięcą, maluję akwarele',
  'Prowadzę kuchnię wegetariańską',
  'Uczę wspinaczki i jeżdżę w góry',
  'Pracuję na giełdzie i medytuję codziennie',
  'Projektuję modę streetwearową',
  'Robię doktorat z fizyki kwantowej',
  'Jestem położną, prowadzę podcast o rodzicielstwie',
  'Jestem strażaczką ochotniczką, jeżdżę na szosówce',
  'Ilustruję książki dla dzieci',
  'Reżyseruję filmy dokumentalne',
];

const OCCUPATIONS_M = [
  'Programuję, a po godzinach odkrywam kuchnię azjatycką',
  'Projektuję wnętrza, mam słabość do vintage',
  'Uczę angielskiego i przy każdej okazji podróżuję',
  'Jestem fizjoterapeutą i trenuję triatlon',
  'Pracuję jako grafik freelancer, rysuję komiksy',
  'Jestem baristą i sommelierem kawy speciality',
  'Z wykształcenia prawnik, z duszy artysta',
  'Gram na saksofonie w jazzowym trio',
  'Pracuję w radiu i zbieram winyle',
  'Fotografuję ulice Warszawy',
  'Studiuję psychologię i wolontariuję w schronisku',
  'Zajmuję się inżynierią dźwięku, produkuję muzykę elektroniczną',
  'Gotuję w restauracji fusion',
  'Tłumaczę z japońskiego, kocham anime i mangę',
  'Jestem lekarzem i biegam ultramaratony',
  'Projektuję UX, mam obsesję na punkcie typografii',
  'Prowadzę działkę na Saskiej Kępie, ogrodnictwo miejskie to moje wszystko',
  'Trenuję ludzi personalnie i prowadzę zajęcia z jogi',
  'Robię ceramikę i prowadzę warsztaty garncarskie',
  'Analizuję dane na co dzień, a wieczorami gram w planszówki',
  'Piszę swoją pierwszą powieść',
  'Gram w offowym teatrze',
  'Jestem weterynarzem, mam trzy koty i psa',
  'Robię meble z odzysku',
  'Uczę ekologicznego życia, zero waste to mój styl',
  'Pracuję jako chemik w laboratorium kosmetycznym',
  'Latam szybowcem w weekendy',
  'Robię tatuaże, specjalizuję się w dotworkach',
  'Pracuję w bibliotece i prowadzę bookstagram',
  'Tworzę gry indie i pixel art',
  'Jestem psychologiem dziecięcym, maluję akwarele',
  'Prowadzę kuchnię wegetariańską',
  'Uczę wspinaczki i jeżdżę w góry',
  'Pracuję na giełdzie i medytuję codziennie',
  'Projektuję modę streetwearową',
  'Robię doktorat z fizyki kwantowej',
  'Jestem ratownikiem medycznym, prowadzę podcast o pierwszej pomocy',
  'Jestem strażakiem ochotnikiem, jeżdżę na szosówce',
  'Ilustruję książki dla dzieci',
  'Reżyseruję filmy dokumentalne',
];

const HOBBIES = [
  'Gram w szachy turniejowo i chodzę na wieczory impro',
  'W weekendy szukam dzikich kąpielisk pod Warszawą',
  'Zbieram płyty winylowe z lat 70. i 80.',
  'Trenuję brazylijskie jiu-jitsu trzy razy w tygodniu',
  'Prowadzę podcast o architekturze modernistycznej',
  'Piekę chleb na zakwasie — hodowla zakwasu to moja duma',
  'Jeżdżę na rolkach po bulwarach wiślanych',
  'Chodzę na stand-up comedy i próbuję swoich sił na open micach',
  'Uczę się języka koreańskiego i gotuję kimchi',
  'Gram na ukulele i śpiewam w chórze gospel',
  'Uprawiam urban sketching, rysuję kawiarnie i podwórka',
  'Biegam parkruny co sobotę i trenuję do maratonu',
  'Uczę się szydełkowania i robię amigurumi',
  'Oglądam każdy film A24 w dniu premiery',
  'Zbieram kamienie mineralne i chodzę na giełdy',
  'Tańczę salsę i bachatę w klubie Bailando',
  'Nurkuję rekreacyjnie, mam certyfikat PADI',
  'Gotuję dania z różnych krajów — co tydzień inna kuchnia',
  'Łowię ryby na spławik na Zalewie Zegrzyńskim',
  'Uczę się kaligrafii japońskiej i parzę herbatę gongfu',
  'Jeżdżę na deskorolce i buduję DIY spoty',
  'Zbieram retro gry na NES-a i SNES-a',
  'Chodzę na warsztaty improwizacji teatralnej',
  'Prowadzę kanał o roślinach doniczkowych',
  'Gram w Dungeons & Dragons co piątek',
  'Ćwiczę jogę o świcie na dachu bloku',
  'Zbieram polskie plakaty filmowe z PRL-u',
  'Robię domowe wino i nalewki z sezonowych owoców',
  'Uczę się lutowania i buduję syntezatory modularne',
  'Oglądam ptaki z lornetką w Lesie Kabackim',
  'Gram w padla i squasha kilka razy w tygodniu',
  'Jeżdżę na rowerze gravelowym po Mazowszu',
  'Chodzę na spacery fotograficzne po Pradze',
  'Maluję miniaturki do gier bitewnych',
  'Słucham true crime podcastów obsesyjnie',
  'Uczę się permakultury i kompostuję na balkonie',
  'Jeżdżę na longboardzie po Łazienkach',
  'Ćwiczę capoeirę i chodzę na rodę w parku',
  'Szyję własne ubrania z tkanin vintage',
  'Gram w tenisa stołowego w lidze amatorskiej',
];

const PERSONALITY_BITS_F = [
  'Introvertyczka z nutą szaleństwa',
  'Lubię ludzi, ale potrzebuję czasu dla siebie',
  'Wieczna optymistka, nawet w poniedziałki',
  'Spontaniczna planistka — paradoks, ale działa',
  'Nocna marka, najlepsze pomysły mam po 23',
  'Ranny ptaszek, o 6 już po kawie i na macie',
  'Melancholijna romantyczka z poczuciem humoru',
  'Głośny śmiech i cicha empatia',
  'Mól książkowy z dużą dawką ciekawości świata',
  'Wegetarianka od 5 lat',
  'Jestem nieuleczalnie ciekawska — zaczynam rozmowę z każdym',
  'Wybieram slow life w szybkim mieście',
  'Uwielbiam ciszę, ale też głośne koncerty',
  'Kawa oat milk latte, bez kompromisów',
  'Herbata, koc, książka — moja definicja luksusu',
];

const PERSONALITY_BITS_M = [
  'Introvertyk z nutą szaleństwa',
  'Lubię ludzi, ale potrzebuję czasu dla siebie',
  'Wieczny optymista, nawet w poniedziałki',
  'Spontaniczny planista — paradoks, ale działa',
  'Nocny marek, najlepsze pomysły mam po 23',
  'Ranny ptaszek, o 6 już po kawie i na macie',
  'Melancholijny romantyk z poczuciem humoru',
  'Głośny śmiech i cicha empatia',
  'Mól książkowy z dużą dawką ciekawości świata',
  'Wegetarianin od 5 lat',
  'Jestem nieuleczalnie ciekawski — zaczynam rozmowę z każdym',
  'Wybieram slow life w szybkim mieście',
  'Uwielbiam ciszę, ale też głośne koncerty',
  'Kawa oat milk latte, bez kompromisów',
  'Herbata, koc, książka — moja definicja luksusu',
];

// --- Looking for building blocks ---
const LOOKING_FOR_OPENINGS = [
  'Szukam kogoś na',
  'Chętnie poznam kogoś na',
  'Fajnie byłoby znaleźć kogoś na',
  'Szukam ludzi na',
  'Chcę poznać kogoś na',
  'Chętnie znajdę kogoś na',
];

const LOOKING_FOR_ACTIVITIES = [
  'wspólne wypady na kajaki i weekendowe eskapady za miasto',
  'wieczory z grami planszowymi, herbatą i dobrą rozmową',
  'odkrywanie nowych restauracji i gotowanie razem w domu',
  'bieganie po parku i motywowanie się nawzajem do treningów',
  'chodzenie na wystawy, do galerii i na spacery po mieście',
  'wspólne czytanie w kawiarniach i dyskutowanie o książkach',
  'jam sessions, koncerty i dzielenie się playlistami',
  'wyprawy rowerowe po okolicach Warszawy',
  'wspinaczkę na ściance i górskie weekendy',
  'razem oglądanie filmów i seriali z komentarzem',
  'gotowanie potraw z całego świata i degustacje wina',
  'warsztaty ceramiczne, malarskie albo jakiekolwiek kreatywne',
  'spacery z psem i kawy na wynos w nowych miejscach',
  'granie w squasha albo padla — potrzebuję partnera',
  'naukę nowego języka — tandem albo po prostu rozmowy',
  'improwizację teatralną i wygłupy bez powodu',
  'tańce — salsa, bachata, albo po prostu swingowe potańcówki',
  'wspólne podróże — weekend city breaks i dłuższe wyprawy',
  'medytację, jogę i rozwój osobisty',
  'wymianę vinylowych perełek i chodzenie po pchlich targach',
];

const LOOKING_FOR_VIBES = [
  'Cenię szczerość i poczucie humoru ponad wszystko.',
  'Ważna jest dla mnie otwartość na nowe doświadczenia.',
  'Szukam kogoś, kto nie boi się ciszy w rozmowie.',
  'Chcę poznać ludzi z pasją — obojętnie jaką.',
  'Lubię ludzi, którzy mają swoje zdanie i potrafią słuchać.',
  'Nie musi być idealnie — wystarczy autentycznie.',
  'Zależy mi na kimś, kto rozumie work-life balance.',
  'Doceniam ludzi, którzy potrafią się śmiać z siebie.',
  'Ważniejsze od wspólnych hobby jest wspólne poczucie humoru.',
  'Szukam prawdziwych relacji, nie kolekcjonowania znajomych.',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function generateBio(female: boolean): string {
  const occ = pick(female ? OCCUPATIONS_F : OCCUPATIONS_M);
  const hobby = pick(HOBBIES);
  const personality = pick(female ? PERSONALITY_BITS_F : PERSONALITY_BITS_M);
  return `${occ}. ${hobby}. ${personality}.`;
}

const CONNECTORS = [' i ', ', a przy okazji ', ', albo '];

function generateLookingFor(): string {
  const opening = pick(LOOKING_FOR_OPENINGS);
  const connector = pick(CONNECTORS);
  const activities = pickN(LOOKING_FOR_ACTIVITIES, 2).join(connector);
  const vibe = pick(LOOKING_FOR_VIBES);
  return `${opening} ${activities}. ${vibe}`;
}

// --- Avatar generation ---

const FEMALE_NAME_SET = new Set(FEMALE_NAMES);

function detectPetType(bio: string, interests: string[]): 'cat' | 'dog' | null {
  const text = `${bio} ${interests.join(' ')}`.toLowerCase();
  const hasCat = text.includes('kot') || text.includes('koty');
  const hasDog = text.includes('pies') || text.includes('psy') || text.includes('schronisk');
  const hasGenericPet = text.includes('zwierz') || text.includes('weteryn');

  if (hasCat && !hasDog) return 'cat';
  if (hasDog) return 'dog';
  if (hasGenericPet) return 'cat';
  return null;
}

function generateAvatarUrl(user: SeedUserData, index: number): string {
  const pet = detectPetType(user.bio, user.interests);
  if (pet === 'cat') return `https://placekitten.com/${400 + (index % 20)}/${400 + (index % 15)}`;
  if (pet === 'dog') return `https://placedog.net/400/400?id=${index + 1}`;

  const isFemale = FEMALE_NAME_SET.has(user.name);
  const gender = isFemale ? 'women' : 'men';
  return `https://randomuser.me/api/portraits/${gender}/${index % 100}.jpg`;
}

// --- Seed cache ---

interface SeedUserData {
  name: string;
  email: string;
  bio: string;
  lookingFor: string;
  lat: number;
  lng: number;
  interests: string[];
}

async function loadCache(): Promise<SeedUserData[] | null> {
  try {
    const file = Bun.file(CACHE_PATH);
    if (!(await file.exists())) return null;
    const data: SeedUserData[] = await file.json();
    if (data.length === USER_COUNT) {
      console.log(`Loaded ${data.length} users from cache.`);
      return data;
    }
    console.log(`Cache has ${data.length} entries, need ${USER_COUNT}. Regenerating.`);
    return null;
  } catch {
    return null;
  }
}

async function saveCache(users: SeedUserData[]) {
  await Bun.write(CACHE_PATH, JSON.stringify(users, null, 2));
  console.log(`Saved ${users.length} users to cache.`);
}

async function generateInterestsFromBio(bio: string, lookingFor: string): Promise<string[]> {
  // Extract interests by calling the API's AI service via a simple heuristic
  // For seed, we extract keywords directly to avoid needing OpenAI for every user
  const text = `${bio} ${lookingFor}`.toLowerCase();
  const allTags = [
    'programowanie', 'kuchnia azjatycka', 'gotowanie', 'vintage', 'podróże', 'angielski',
    'triatlon', 'bieganie', 'sport', 'grafika', 'komiksy', 'kawa', 'prawo', 'sztuka',
    'jazz', 'saksofon', 'muzyka', 'radio', 'winyle', 'fotografia', 'psychologia',
    'wolontariat', 'zwierzęta', 'elektronika', 'fusion', 'japonia', 'anime', 'manga',
    'medycyna', 'ultramaraton', 'ux design', 'typografia', 'ogrodnictwo', 'joga',
    'ceramika', 'gry planszowe', 'pisarstwo', 'teatr', 'weterynaria', 'koty', 'psy',
    'stolarstwo', 'ekologia', 'zero waste', 'chemia', 'kosmetyki', 'szybowce', 'latanie',
    'tatuaże', 'książki', 'gry indie', 'pixel art', 'akwarele', 'kuchnia wegetariańska',
    'wspinaczka', 'alpinizm', 'giełda', 'medytacja', 'moda', 'streetwear', 'fizyka',
    'rodzicielstwo', 'rower', 'ilustracja', 'film dokumentalny', 'szachy', 'improwizacja',
    'kąpieliska', 'jiu-jitsu', 'sztuki walki', 'architektura', 'chleb', 'zakwas',
    'rolki', 'stand-up', 'komedia', 'koreański', 'kimchi', 'ukulele', 'gospel',
    'urban sketching', 'rysowanie', 'maraton', 'szydełkowanie', 'film', 'kino',
    'minerały', 'salsa', 'bachata', 'taniec', 'nurkowanie', 'kaligrafia', 'herbata',
    'deskorolka', 'retro gry', 'rośliny', 'dungeons & dragons', 'rpg', 'plakaty',
    'wino', 'nalewki', 'lutowanie', 'syntezatory', 'ptaki', 'ornitologia',
    'squash', 'padel', 'gravel', 'spacery', 'miniaturki', 'true crime', 'podcasty',
    'permakultura', 'kompostowanie', 'longboard', 'capoeira', 'szycie',
    'tenis stołowy', 'kajaki', 'wystawy', 'galerie', 'koncerty',
    'restauracje', 'warsztaty', 'języki', 'podróże',
  ];

  const matched: string[] = [];
  for (const tag of allTags) {
    if (text.includes(tag) && !matched.includes(tag)) {
      matched.push(tag);
    }
  }

  // Also extract from keyword fragments
  const fragments: [string, string][] = [
    ['rower', 'rower'], ['bieg', 'bieganie'], ['książ', 'książki'], ['czyta', 'czytanie'],
    ['gotow', 'gotowanie'], ['jog', 'joga'], ['wspinacz', 'wspinaczka'],
    ['planszow', 'gry planszowe'], ['podróż', 'podróże'], ['film', 'kino'],
    ['koncert', 'koncerty'], ['teatr', 'teatr'], ['tańc', 'taniec'],
    ['squash', 'squash'], ['padl', 'padel'], ['restaurac', 'restauracje'],
  ];
  for (const [fragment, tag] of fragments) {
    if (text.includes(fragment) && !matched.includes(tag)) {
      matched.push(tag);
    }
  }

  return matched.slice(0, 12);
}

// --- API calls ---

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

async function createProfile(token: string, displayName: string, bio: string, lookingFor: string) {
  const res = await fetch(`${API}/trpc/profiles.create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ displayName, bio, lookingFor }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`create profile failed: ${res.status} ${text}`);
  }
}

async function updateLocation(token: string, latitude: number, longitude: number) {
  const res = await fetch(`${API}/trpc/profiles.updateLocation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ latitude, longitude }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`update location failed: ${res.status} ${text}`);
  }
}

async function clearDatabase() {
  console.log('Clearing database...');

  const envPath = `${import.meta.dir}/../.env.local`;
  const envFile = await Bun.file(envPath).text().catch(() => '');
  const mainEnvPath = `${import.meta.dir}/../.env`;
  const mainEnvFile = await Bun.file(mainEnvPath).text().catch(() => '');

  const allEnv = mainEnvFile + '\n' + envFile;
  const dbUrlMatch = allEnv.match(/DATABASE_URL=(.+)/);
  if (!dbUrlMatch) throw new Error('DATABASE_URL not found in apps/api/.env or .env.local');

  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrlMatch[1].trim());

  await sql`DELETE FROM connection_analyses`;
  await sql`DELETE FROM message_reactions`;
  await sql`DELETE FROM messages`;
  await sql`DELETE FROM conversation_participants`;
  await sql`DELETE FROM conversations`;
  await sql`DELETE FROM waves`;
  await sql`DELETE FROM push_tokens`;
  await sql`DELETE FROM profiles`;
  await sql`DELETE FROM session`;
  await sql`DELETE FROM account`;
  await sql`DELETE FROM verification`;
  await sql`DELETE FROM "user"`;

  await sql.end();
  console.log('Database cleared.');

  // Obliterate BullMQ queue so completed jobs don't block re-enqueue
  const redisUrlMatch = allEnv.match(/REDIS_URL=(.+)/);
  if (redisUrlMatch) {
    const { Queue } = await import('bullmq');
    const url = new URL(redisUrlMatch[1].trim());
    const queue = new Queue('connection-analysis', {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
      },
    });
    await queue.obliterate({ force: true });
    await queue.close();
    console.log('BullMQ queue obliterated.');
  }
}

async function main() {
  await clearDatabase();

  // Try loading from cache
  let seedData = await loadCache();

  if (!seedData) {
    console.log(`Generating ${USER_COUNT} user profiles...`);
    seedData = [];
    for (let idx = 0; idx < USER_COUNT; idx++) {
      const female = idx % 2 === 0;
      const name = pick(female ? FEMALE_NAMES : MALE_NAMES);
      const email = `user${idx}@example.com`;
      const bio = generateBio(female);
      const lookingFor = generateLookingFor();
      const lat = randomInRange(WARSAW_CENTER.lat, SPREAD_LAT);
      const lng = randomInRange(WARSAW_CENTER.lng, SPREAD_LNG);
      const interests = await generateInterestsFromBio(bio, lookingFor);

      seedData.push({ name, email, bio, lookingFor, lat, lng, interests });
    }
    await saveCache(seedData);
  }

  console.log(`Creating ${USER_COUNT} users...`);

  // Process in batches of 10 for reasonable parallelism
  const BATCH_SIZE = 10;
  let created = 0;

  for (let i = 0; i < seedData.length; i += BATCH_SIZE) {
    const batch = seedData.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (userData) => {
        try {
          const token = await autoLogin(userData.email);
          await createProfile(token, userData.name, userData.bio, userData.lookingFor);
          await updateLocation(token, userData.lat, userData.lng);
          created++;
          if (created % 25 === 0) console.log(`  ${created}/${USER_COUNT}`);
        } catch (err) {
          console.error(`Failed user ${userData.email} (${userData.name}):`, err);
        }
      })
    );
  }

  // Backfill interests and avatars directly into DB
  console.log('Backfilling interests and avatars...');
  const envPath = `${import.meta.dir}/../.env.local`;
  const envFile = await Bun.file(envPath).text().catch(() => '');
  const mainEnvPath = `${import.meta.dir}/../.env`;
  const mainEnvFile = await Bun.file(mainEnvPath).text().catch(() => '');
  const allEnv = mainEnvFile + '\n' + envFile;
  const dbUrlMatch = allEnv.match(/DATABASE_URL=(.+)/);
  if (dbUrlMatch) {
    const { default: postgres } = await import('postgres');
    const sql = postgres(dbUrlMatch[1].trim());

    for (let i = 0; i < seedData.length; i++) {
      const userData = seedData[i];
      const avatarUrl = generateAvatarUrl(userData, i);
      await sql`
        UPDATE profiles
        SET interests = ${userData.interests.length > 0 ? userData.interests : sql`interests`},
            avatar_url = ${avatarUrl}
        WHERE user_id IN (
          SELECT id FROM "user" WHERE email = ${userData.email}
        )
      `;
    }

    await sql.end();
    console.log('Interests and avatars backfilled.');
  }

  // Show a random test user email for quick login
  const randomIdx = Math.floor(Math.random() * USER_COUNT);
  console.log(`\nDone! Created ${created} users.`);
  console.log(`Quick login: user${randomIdx}@example.com`);
}

main().catch(console.error);
