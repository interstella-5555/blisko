import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-6">
      <div className="text-[40px] font-light tracking-[6px]">BLISKO</div>
      <div className="flex gap-4 text-[13px] text-muted">
        <a href="/privacy" className="hover:text-ink transition-colors">
          Polityka prywatności
        </a>
        <span className="text-muted/40">·</span>
        <a href="/terms" className="hover:text-ink transition-colors">
          Regulamin
        </a>
      </div>
    </div>
  );
}
