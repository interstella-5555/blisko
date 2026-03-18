import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ANDROID_PLAY_URL, APP_SCHEME, IOS_APP_STORE_URL } from "@/config";

export const Route = createFileRoute("/join/$code")({
  beforeLoad: ({ params }) => {
    if (!/^[A-Za-z0-9]+$/.test(params.code)) {
      throw notFound();
    }
  },
  head: () => ({
    meta: [
      { title: "Dołącz do grupy — Blisko" },
      { property: "og:title", content: "Zaproszenie do grupy w Blisko" },
      {
        property: "og:description",
        content: "Kliknij, żeby dołączyć do grupy w aplikacji Blisko.",
      },
    ],
  }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const deepLink = `${APP_SCHEME}:///group/join/${code}`;

  useEffect(() => {
    window.location.href = deepLink;
  }, [deepLink]);

  return (
    <div className="flex items-center justify-center min-h-dvh px-6">
      <div className="text-center max-w-[360px]">
        <div className="text-[32px] font-light tracking-[4px] mb-2">BLISKO</div>
        <p className="text-[15px] text-muted mb-8">Zaproszenie do grupy</p>
        <a
          href={deepLink}
          className="inline-block bg-accent text-white no-underline text-[13px] font-semibold tracking-[1.5px] uppercase px-10 py-3.5 rounded-lg mb-6"
        >
          Otwórz w aplikacji
        </a>
        <p className="text-[13px] text-muted mb-5">Nie masz jeszcze Blisko?</p>
        <div className="flex items-center justify-center gap-3">
          <a href={IOS_APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            <img src="/badges/app-store-pl.svg" alt="Pobierz z App Store" className="h-[40px]" />
          </a>
          <a href={ANDROID_PLAY_URL} target="_blank" rel="noopener noreferrer">
            <img src="/badges/google-play-pl.svg" alt="Pobierz z Google Play" className="h-[40px]" />
          </a>
        </div>
      </div>
    </div>
  );
}
