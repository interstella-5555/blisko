interface LegalPageProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="min-h-dvh bg-[#FAF7F2] text-[#1A1A1A] font-sans antialiased">
      <div className="h-[3px] bg-gradient-to-r from-transparent via-[#C0392B]/40 to-transparent" />

      <div className="max-w-[640px] mx-auto px-6 pt-14 pb-24">
        <a
          href="/"
          className="group inline-flex items-center gap-2 text-[13px] text-[#8B8680] no-underline mb-12 hover:text-[#1A1A1A] transition-colors duration-200"
        >
          <span className="inline-block transition-transform duration-200 group-hover:-translate-x-[3px]">&larr;</span>
          <span>blisko.app</span>
        </a>

        <header className="mb-14">
          <h1 className="font-serif text-[36px] font-normal tracking-[-0.02em] leading-[1.1] mb-3">{title}</h1>
          <div className="flex items-center gap-3">
            <div className="w-8 h-px bg-[#C0392B]/60" />
            <p className="text-[13px] text-[#8B8680] tracking-[0.03em]">{updated}</p>
          </div>
        </header>

        <div>{children}</div>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-xl font-normal tracking-[-0.01em] mt-10 mb-3.5 pt-6 border-t border-[#1A1A1A]/[0.06] first:mt-0 first:pt-0 first:border-t-0">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-[1.75] text-[#3A3A3A] mb-2.5">{children}</p>;
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-none p-0 mb-4">{children}</ul>;
}

export function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-[15px] leading-[1.75] text-[#3A3A3A] pl-5 mb-2 relative before:content-[''] before:absolute before:left-0.5 before:top-[11px] before:w-[5px] before:h-[5px] before:rounded-full before:bg-[#C0392B]/35">
      {children}
    </li>
  );
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-[#C0392B] no-underline border-b border-[#C0392B]/40 hover:border-[#C0392B] transition-colors duration-200"
    >
      {children}
    </a>
  );
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[#1A1A1A]">{children}</strong>;
}
