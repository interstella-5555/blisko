import { useMemo } from "react";

interface NavigationProps {
  current: number;
  total: number;
  goTo: (n: number) => void;
}

export function Navigation({ current, total, goTo }: NavigationProps) {
  const dots = useMemo(() => Array.from({ length: total }, (_, i) => ({ id: `slide-${i + 1}`, index: i })), [total]);

  return (
    <div
      id="pitch-nav"
      className="fixed bottom-[2vh] sm:bottom-[3vh] left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2 z-50"
    >
      <button
        type="button"
        onClick={() => goTo(current - 1)}
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center text-sm sm:text-base cursor-pointer shrink-0 mx-1 sm:mx-2 transition-all"
        style={{
          background: "rgba(250, 247, 242, 0.05)",
          borderColor: "rgba(250, 247, 242, 0.08)",
          color: "var(--color-pitch-dim)",
        }}
      >
        ‹
      </button>
      {dots.map((dot) => (
        <button
          type="button"
          key={dot.id}
          onClick={() => goTo(dot.index)}
          className="w-1.5 h-1.5 sm:w-[6px] sm:h-[6px] rounded-full cursor-pointer transition-all duration-300 border-none p-0"
          style={{
            background: dot.index === current ? "var(--color-pitch-accent)" : "var(--color-pitch-dim)",
            transform: dot.index === current ? "scale(1.4)" : "scale(1)",
            opacity: dot.index === current ? 1 : 0.3,
          }}
        />
      ))}
      <button
        type="button"
        onClick={() => goTo(current + 1)}
        className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center text-sm sm:text-base cursor-pointer shrink-0 mx-1 sm:mx-2 transition-all"
        style={{
          background: "rgba(250, 247, 242, 0.05)",
          borderColor: "rgba(250, 247, 242, 0.08)",
          color: "var(--color-pitch-dim)",
        }}
      >
        ›
      </button>
    </div>
  );
}
