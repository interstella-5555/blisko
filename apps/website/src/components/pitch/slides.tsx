export function SlideTitle() {
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Ambient Discovery App
      </p>
      <h1 className="font-serif font-light text-3xl sm:text-5xl lg:text-6xl leading-[1.1] tracking-tight max-w-[900px]">
        Właściwa osoba jest w pobliżu.
        <br />
        <em className="text-pitch-accent">Zawsze była.</em>
      </h1>
      <p className="font-light text-sm sm:text-lg text-pitch-dim mt-6 sm:mt-8 max-w-[600px] mx-auto leading-relaxed">
        Pierwsza platforma która zamienia przestrzeń fizyczną w warstwę intencji. Bez scrollowania. Bez algorytmów.
        Tylko obecność.
      </p>
    </div>
  );
}

export function SlideProblem() {
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Problem
      </p>
      <h2 className="font-serif font-light text-2xl sm:text-4xl lg:text-5xl leading-[1.15] tracking-tight max-w-[850px]">
        Nigdy nie byliśmy tak połączeni.
        <br />
        Nigdy nie czuliśmy się <span className="text-pitch-warm">tak samotni.</span>
      </h2>
      <p className="font-light text-sm sm:text-base text-pitch-dim mt-4 sm:mt-6 max-w-[680px] mx-auto leading-relaxed">
        Tysiąc znajomych na LinkedIn i nie ma z kim pogadać o projekcie. Tinder gdzie związki trwają krócej niż
        subskrypcja. Meetup z wizytówką której nigdy nie użyjemy.
      </p>
      <p className="font-light text-sm sm:text-base text-pitch-dim mt-3 sm:mt-5 max-w-[680px] mx-auto leading-relaxed">
        Problem nie jest w ludziach. <strong className="text-pitch-ink">Problem jest w modelu.</strong> Stwórz profil →
        przeglądaj → wybierz → połącz. To model sklepowy. Ludzie to nie towar.
      </p>
    </div>
  );
}

export function SlideSolution() {
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Rozwiązanie
      </p>
      <h2 className="font-serif font-light text-2xl sm:text-4xl lg:text-5xl leading-[1.15] tracking-tight max-w-[850px]">
        Nie przeglądasz ludzi — <em className="text-pitch-accent">jesteś w miejscu.</em>
      </h2>
      <p className="font-light text-sm sm:text-base text-pitch-dim mt-4 sm:mt-6 max-w-[680px] mx-auto leading-relaxed">
        Ustawiasz status — czego szukasz dziś. I żyjesz swoim życiem. Gdy w promieniu 500 metrów pojawi się ktoś z
        komplementarną intencją, telefon delikatnie wibruje.
      </p>
      <div className="flex gap-3 sm:gap-8 items-center justify-center mt-6 sm:mt-10">
        {[74, 51, 89, 32, 67].map((score) => (
          <div
            key={score}
            className={`w-9 h-9 sm:w-14 sm:h-14 rounded-full bg-pitch-surface border flex items-center justify-center text-[0.5rem] sm:text-[0.7rem] text-pitch-dim relative ${score === 89 ? "bubble-pulse border-pitch-accent/30" : "border-pitch-ink/[0.08]"}`}
          >
            {score}%
          </div>
        ))}
      </div>
      <p className="font-light text-xs sm:text-sm text-pitch-dim mt-3 sm:mt-4 max-w-[680px] mx-auto">
        Jedna bańka na mapie zaczyna pulsować. <em className="text-pitch-accent font-serif">Nic więcej.</em>
      </p>
    </div>
  );
}

export function SlidePillars() {
  const pillars = [
    {
      icon: "◎",
      color: "text-pitch-accent",
      name: "Ambient",
      desc: "Działa w tle. Zero scrollowania. Aplikacja szuka za użytkownika.",
      descLong: "Działa w tle. Zero scrollowania. Aplikacja szuka za użytkownika. Użytkownik żyje, Blisko pracuje.",
    },
    {
      icon: "∞",
      color: "text-pitch-warm",
      name: "Meta",
      desc: "Jedno narzędzie, nieskończone konteksty. Ty decydujesz czego szukasz.",
      descLong: "Jedno narzędzie, nieskończone konteksty. Randka, projekt, inwestycja. Ty decydujesz.",
    },
    {
      icon: "◉",
      color: "text-pitch-sky",
      name: "Fizyczny",
      desc: "300 metrów, pasująca intencja — 10-20x wyższy kontekst.",
      descLong: "Łączy przez obecność. 300 metrów, pasująca intencja — 10-20x wyższy kontekst niż cold message.",
    },
    {
      icon: "◈",
      color: "text-pitch-accent/70",
      name: "Prywatny",
      desc: "Intencja pod twoją kontrolą. Publiczna lub prywatna — ty wybierasz.",
      descLong: "Intencja pod twoją kontrolą. Publiczna lub prywatna — ty wybierasz. Nikt nie wie czego szukasz.",
    },
  ];

  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.55rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-2 sm:mb-6">
        DNA produktu
      </p>
      <h2 className="font-serif font-light text-xl sm:text-4xl leading-[1.15] tracking-tight mb-6 sm:mb-8">
        Cztery filary
      </h2>
      {/* Mobile */}
      <div className="sm:hidden flex flex-col gap-5 max-w-[320px] text-left">
        {pillars.map((p, i) => (
          <div key={p.name}>
            {i > 0 && <div className="border-t border-pitch-rule/60 ml-10 mb-5" />}
            <div className="flex items-start gap-4">
              <span className={`${p.color} text-2xl leading-none mt-0.5 shrink-0`}>{p.icon}</span>
              <div>
                <h3 className="font-serif text-lg leading-tight">{p.name}</h3>
                <p className="text-[0.8rem] text-pitch-dim leading-relaxed mt-1">{p.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Desktop */}
      <div className="hidden sm:grid grid-cols-2 gap-5 max-w-[800px] text-left">
        {pillars.map((p) => (
          <div
            key={p.name}
            className="bg-pitch-card border border-pitch-rule/60 rounded-2xl p-7 hover:border-pitch-accent/30 transition-colors"
          >
            <div className={`text-2xl mb-2 ${p.color}`}>{p.icon}</div>
            <h3 className="font-serif text-xl mb-1">{p.name}</h3>
            <p className="text-sm text-pitch-dim leading-relaxed">{p.descLong}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SlideHowItWorks() {
  const steps = [
    { text: "Ustawiasz status", accent: false },
    { text: "Żyjesz życiem", accent: false },
    { text: "📳 Bańka pulsuje", accent: true },
    { text: "Pingujesz", accent: false },
    { text: "💬 Chat", accent: true },
    { text: "Spotkanie", accent: false },
  ];
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Jak to działa
      </p>
      <h2 className="font-serif font-light text-2xl sm:text-4xl leading-[1.15] tracking-tight">
        Od statusu do spotkania
      </h2>
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-3 mt-6 sm:mt-10">
        {steps.map((s, i) => (
          <div key={s.text} className="contents">
            <span
              className={`bg-pitch-card border rounded-xl px-3 py-2 sm:px-5 sm:py-3 text-[0.65rem] sm:text-sm ${s.accent ? "border-pitch-accent/20 text-pitch-accent" : "border-pitch-rule text-pitch-dim"}`}
            >
              {s.text}
            </span>
            {i < steps.length - 1 && <span className="text-pitch-muted text-sm sm:text-lg">→</span>}
          </div>
        ))}
      </div>
      <p className="font-light text-xs sm:text-base text-pitch-dim mt-5 sm:mt-8 max-w-[680px] mx-auto leading-relaxed">
        Ping = odsłaniasz swój status. Akceptacja = wzajemne odsłonięcie. Każdy krok wymaga zgody. Każdy krok buduje
        zaufanie.
      </p>
    </div>
  );
}

export function SlidePositioning() {
  const rows = [
    ["Cel", "Randka", "Kariera", "Wszystko — zależy od Ciebie"],
    ["Model", "Scroll → Match", "Profil → Outreach", "Obecność → Intencja → Ping"],
    ["Uwaga", "Wysoka", "Wysoka", "Minimalna — działa w tle"],
    ["Kontekst", "Brak", "Niski", "To samo miejsce, teraz"],
    ["Prywatność", "Niska", "Niska", "Wysoka — ty kontrolujesz"],
  ];
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Pozycjonowanie
      </p>
      <h2 className="font-serif font-light text-2xl sm:text-4xl leading-[1.15] tracking-tight mb-5 sm:mb-8">
        Dlaczego nie <span className="text-pitch-warm">kolejna apka</span>
      </h2>
      <table className="w-full max-w-[800px] text-left text-[0.65rem] sm:text-sm border-collapse">
        <thead>
          <tr className="border-b border-pitch-rule">
            <th className="font-medium text-[0.5rem] sm:text-[0.65rem] tracking-[0.15em] uppercase text-pitch-muted p-2 sm:p-3" />
            <th className="font-medium text-[0.5rem] sm:text-[0.65rem] tracking-[0.15em] uppercase text-pitch-muted p-2 sm:p-3">
              Tinder / Bumble
            </th>
            <th className="font-medium text-[0.5rem] sm:text-[0.65rem] tracking-[0.15em] uppercase text-pitch-muted p-2 sm:p-3">
              LinkedIn
            </th>
            <th className="font-medium text-[0.5rem] sm:text-[0.65rem] tracking-[0.15em] uppercase text-pitch-muted p-2 sm:p-3 text-pitch-accent">
              Blisko
            </th>
          </tr>
        </thead>
        <tbody className="text-pitch-dim">
          {rows.map((row, i) => (
            <tr key={row[0]} className={i < rows.length - 1 ? "border-b border-pitch-rule/40" : ""}>
              <td className="p-2 sm:p-3 text-pitch-muted">{row[0]}</td>
              <td className="p-2 sm:p-3">{row[1]}</td>
              <td className="p-2 sm:p-3">{row[2]}</td>
              <td className="p-2 sm:p-3 text-pitch-accent font-medium">{row[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SlideRealLife() {
  const contexts = [
    { emoji: "☕", name: "Kawiarnia", desc: "Ktoś obok pasuje. Rozmowa już trwa — Blisko ją domyka." },
    { emoji: "🏋️", name: "Siłownia", desc: "Te same twarze, zero rozmów. Ktoś szuka partnera do biegania." },
    { emoji: "💼", name: "Konferencja", desc: "Ping zamiast wizytówek w ciemno." },
    { emoji: "✈️", name: "Podróż", desc: "\u201EKolacja, fintech\u201D. Ktoś w hotelu szuka rozmówcy." },
    { emoji: "🎓", name: "Uczelnia", desc: "Status zamiast maili na grupę." },
    { emoji: "📱", name: "Zawsze", desc: "Apka 24/7 w tle. Push gdy ktoś pasujący w pobliżu." },
  ];
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.55rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-2 sm:mb-6">
        Blisko w prawdziwym życiu
      </p>
      <h2 className="font-serif font-light text-lg sm:text-4xl leading-[1.15] tracking-tight">
        Jeden produkt, <em className="text-pitch-accent">nieskończone konteksty</em>
      </h2>
      <div className="grid grid-cols-3 gap-1.5 sm:gap-4 max-w-[900px] mt-3 sm:mt-8 text-left">
        {contexts.map((c) => (
          <div key={c.name} className="bg-pitch-card rounded-lg sm:rounded-xl p-2 sm:p-5 border border-pitch-rule/60">
            <div className="text-sm sm:text-2xl mb-0.5 sm:mb-2">{c.emoji}</div>
            <h4 className="font-serif text-[0.65rem] sm:text-lg leading-tight">{c.name}</h4>
            <p className="text-[0.5rem] sm:text-xs text-pitch-dim leading-snug mt-0.5 hidden sm:block">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SlideWhyNow() {
  const waves = [
    {
      label: "WHO",
      color: "text-pitch-warm",
      title: "Epidemia samotności",
      desc: "Globalny kryzys zdrowotny. Gen Z i Millenialsi — najbardziej osamotnione pokolenie.",
    },
    {
      label: "Post-COVID",
      color: "text-pitch-sky",
      title: "Powrót do fizyczności",
      desc: "Kawiarnie pełne. Siłownie rekordowe. Chcemy być razem — brakuje pomostu.",
    },
    {
      label: "-38%",
      color: "text-pitch-mint",
      title: "Koniec scrollowania",
      desc: "Tinder, Bumble BFF tracą retencję. Użytkownicy chcą narzędzia które działa za nich.",
    },
  ];
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Dlaczego teraz
      </p>
      <h2 className="font-serif font-light text-2xl sm:text-4xl leading-[1.15] tracking-tight">
        Trzy fale <span className="text-pitch-sky">które się zbiegają</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 max-w-[850px] mt-5 sm:mt-8 text-left">
        {waves.map((w) => (
          <div key={w.label} className="bg-pitch-card rounded-xl p-4 sm:p-6 border border-pitch-rule/60">
            <div className={`font-serif text-2xl sm:text-3xl ${w.color} mb-1`}>{w.label}</div>
            <h4 className="font-serif text-sm sm:text-lg mb-1">{w.title}</h4>
            <p className="text-[0.7rem] sm:text-xs text-pitch-dim leading-relaxed">{w.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SlideGTM() {
  const channels = [
    { emoji: "🎓", name: "Uczelnie", desc: "SGH + PW. Ambasador na roku. Cel: 200 userów w 2 tygodnie." },
    {
      emoji: "💪",
      name: "Siłownie",
      desc: "3 niezależne w Śródmieściu. Regularność + te same twarze = potrzeba kontaktu.",
    },
    { emoji: "☕", name: "Śródmieście", desc: "Powiśle, freelancerzy. Kawiarnie jako userzy ze statusem-ofertą dnia." },
  ];
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Go-to-market
      </p>
      <h2 className="font-serif font-light text-2xl sm:text-4xl leading-[1.15] tracking-tight">
        Warszawa. <em className="text-pitch-accent">Gęstość ponad zasięg.</em>
      </h2>
      <p className="font-light text-xs sm:text-base text-pitch-dim mt-3 max-w-[680px] mx-auto leading-relaxed">
        Jedna dzielnica z wysoką koncentracją jest cenniejsza niż 10x więcej rozsianych po mieście.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 max-w-[850px] mt-4 sm:mt-6 text-left">
        {channels.map((c) => (
          <div key={c.name} className="bg-pitch-card rounded-xl p-4 sm:p-6 border border-pitch-rule/60">
            <div className="text-2xl mb-1">{c.emoji}</div>
            <h4 className="font-serif text-sm sm:text-lg mb-1">{c.name}</h4>
            <p className="text-[0.7rem] sm:text-xs text-pitch-dim leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SlideMonetization() {
  const tiers = [
    { price: "0 PLN", color: "text-pitch-accent", label: "Basic — 5 pingów/dzień" },
    { price: "19 PLN", color: "text-pitch-warm", label: "Premium /mies — 20 pingów" },
    { price: "159 PLN", color: "text-pitch-mint", label: "Premium /rok" },
  ];
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Model biznesowy
      </p>
      <h2 className="font-serif font-light text-2xl sm:text-4xl leading-[1.15] tracking-tight">
        Freemium + <span className="text-pitch-mint">zero reklam</span>
      </h2>
      <div className="flex flex-wrap justify-center gap-6 sm:gap-16 mt-6 sm:mt-10">
        {tiers.map((t) => (
          <div key={t.price}>
            <div className={`font-serif text-3xl sm:text-5xl font-light ${t.color}`}>{t.price}</div>
            <div className="text-[0.6rem] sm:text-xs text-pitch-muted mt-1">{t.label}</div>
          </div>
        ))}
      </div>
      <p className="font-light text-xs sm:text-base text-pitch-dim mt-6 sm:mt-10 max-w-[680px] mx-auto leading-relaxed">
        Zero monetyzacji danych. Zero bannerów. Jedyna forma obecności firm: organiczne statusy na mapie. Przyszłość:
        B2B white-label + program poleceń.
      </p>
    </div>
  );
}

export function SlideClosing() {
  return (
    <div className="stagger">
      <p className="font-sans font-medium text-[0.6rem] sm:text-[0.7rem] tracking-[0.2em] uppercase text-pitch-accent mb-4 sm:mb-6">
        Wizja
      </p>
      <div className="font-serif italic text-xl sm:text-3xl lg:text-4xl leading-snug max-w-[750px]">
        <span className="text-pitch-accent/30 not-italic">{"\u201E"}</span>To nie przypadek. To Blisko.
        <span className="text-pitch-accent/30 not-italic">{"\u201D"}</span>
      </div>
      <p className="font-light text-xs sm:text-base text-pitch-dim mt-6 sm:mt-10 max-w-[680px] mx-auto leading-relaxed">
        Startujemy w Polsce, z wersją ukraińską od dnia pierwszego. Cel: Europa w ciągu 18 miesięcy. Budujemy warstwę
        ludzkich potrzeb w przestrzeni fizycznej.
      </p>
      <p className="font-serif italic text-base sm:text-xl text-pitch-accent mt-5 sm:mt-8">
        Przeznaczenie działa. My tylko skracamy drogę.
      </p>
    </div>
  );
}
