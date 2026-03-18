import { createFileRoute } from "@tanstack/react-router";
import { Navigation } from "@/components/pitch/Navigation";
import {
  SlideClosing,
  SlideGTM,
  SlideHowItWorks,
  SlideMonetization,
  SlidePillars,
  SlidePositioning,
  SlideProblem,
  SlideRealLife,
  SlideSolution,
  SlideTitle,
  SlideWhyNow,
} from "@/components/pitch/slides";
import { usePitchNavigation } from "@/components/pitch/usePitchNavigation";

const SLIDES = [
  SlideTitle,
  SlideProblem,
  SlideSolution,
  SlidePillars,
  SlideHowItWorks,
  SlidePositioning,
  SlideRealLife,
  SlideWhyNow,
  SlideGTM,
  SlideMonetization,
  SlideClosing,
] as const;

export const Route = createFileRoute("/pitch")({
  head: () => ({
    meta: [{ title: "Blisko — Pitch Deck" }],
  }),
  component: PitchDeck,
});

function PitchDeck() {
  const { current, goTo } = usePitchNavigation(SLIDES.length);

  return (
    <div className="pitch-deck" style={{ background: "var(--color-pitch-bg)", color: "var(--color-pitch-ink)" }}>
      {/* Ambient orbs */}
      <div
        className="orb fixed w-[600px] h-[600px] rounded-full blur-[120px] -top-[200px] -right-[100px] pointer-events-none"
        style={{ background: "rgba(192, 57, 43, 0.08)" }}
      />
      <div
        className="orb orb-delay-1 fixed w-[400px] h-[400px] rounded-full blur-[120px] -bottom-[100px] -left-[100px] pointer-events-none"
        style={{ background: "rgba(212, 160, 90, 0.10)" }}
      />
      <div
        className="orb orb-delay-2 fixed w-[300px] h-[300px] rounded-full blur-[120px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ background: "rgba(192, 57, 43, 0.05)" }}
      />

      {/* Chrome */}
      <div
        className="fixed top-[2vh] left-[4vw] sm:top-[3vh] font-serif text-sm sm:text-base z-50 tracking-[0.15em] uppercase"
        style={{ color: "rgba(250, 247, 242, 0.6)" }}
      >
        blisko
      </div>
      <div
        className="fixed top-[2vh] right-[4vw] sm:top-[3vh] text-[0.6rem] sm:text-[0.7rem] tracking-widest z-50"
        style={{ color: "var(--color-pitch-dim)" }}
      >
        {String(current + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
      </div>

      {/* Deck */}
      <div className="h-screen w-screen overflow-hidden relative">
        <div className="slide-track h-full" style={{ transform: `translateX(-${current * 100}%)` }}>
          {SLIDES.map((SlideComponent, i) => (
            <div
              key={SlideComponent.name}
              className={`slide flex flex-col justify-center items-center text-center px-4 sm:px-[8vw] pb-[7vh] pt-[5vh] sm:py-[6vh] ${i === current ? "active" : ""}`}
            >
              <SlideComponent />
            </div>
          ))}
        </div>
      </div>

      <Navigation current={current} total={SLIDES.length} goTo={goTo} />
    </div>
  );
}
