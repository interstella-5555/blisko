/**
 * Updates bio and lookingFor for existing seed users (user0–user249) in-place.
 * Does NOT re-seed — only regenerates text from updated templates.
 * Run: cd apps/api && bun run scripts/update-bios.ts
 */

const USER_COUNT = 250;

// --- Templates (copied from seed-users.ts) ---

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

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

const CONNECTORS = [' i ', ', a przy okazji ', ', albo '];

function generateBio(female: boolean): string {
  const occ = pick(female ? OCCUPATIONS_F : OCCUPATIONS_M);
  const hobby = pick(HOBBIES);
  const personality = pick(female ? PERSONALITY_BITS_F : PERSONALITY_BITS_M);
  return `${occ}. ${hobby}. ${personality}.`;
}

function generateLookingFor(): string {
  const opening = pick(LOOKING_FOR_OPENINGS);
  const connector = pick(CONNECTORS);
  const activities = pickN(LOOKING_FOR_ACTIVITIES, 2).join(connector);
  const vibe = pick(LOOKING_FOR_VIBES);
  return `${opening} ${activities}. ${vibe}`;
}

// --- Main ---

async function main() {
  const envPath = `${import.meta.dir}/../.env.local`;
  const envFile = await Bun.file(envPath).text().catch(() => '');
  const mainEnvPath = `${import.meta.dir}/../.env`;
  const mainEnvFile = await Bun.file(mainEnvPath).text().catch(() => '');
  const allEnv = mainEnvFile + '\n' + envFile;
  const dbUrlMatch = allEnv.match(/DATABASE_URL=(.+)/);

  if (!dbUrlMatch) {
    console.error('DATABASE_URL not found in .env or .env.local');
    process.exit(1);
  }

  const { default: postgres } = await import('postgres');
  const sql = postgres(dbUrlMatch[1].trim());

  console.log(`Updating bio & lookingFor for ${USER_COUNT} seed users...`);

  let updated = 0;
  for (let idx = 0; idx < USER_COUNT; idx++) {
    const female = idx % 2 === 0;
    const email = `user${idx}@example.com`;
    const bio = generateBio(female);
    const lookingFor = generateLookingFor();

    const result = await sql`
      UPDATE profiles
      SET bio = ${bio},
          looking_for = ${lookingFor},
          updated_at = now()
      WHERE user_id IN (
        SELECT id FROM "user" WHERE email = ${email}
      )
    `;

    if (result.count > 0) updated++;
  }

  await sql.end();
  console.log(`Done! Updated ${updated}/${USER_COUNT} profiles.`);
}

main().catch(console.error);
