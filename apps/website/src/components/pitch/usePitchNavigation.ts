import { useCallback, useEffect, useRef, useState } from "react";

export function usePitchNavigation(totalSlides: number) {
  const [current, setCurrent] = useState(() => {
    if (typeof window === "undefined") return 0;
    const param = new URLSearchParams(window.location.search).get("slide");
    const n = param ? parseInt(param, 10) : 0;
    return Number.isNaN(n) ? 0 : Math.max(0, Math.min(n, totalSlides - 1));
  });
  const transitioning = useRef(false);

  const goTo = useCallback(
    (n: number) => {
      if (transitioning.current || n === current || n < 0 || n >= totalSlides) return;
      transitioning.current = true;
      setCurrent(n);
      setTimeout(() => {
        transitioning.current = false;
      }, 500);
    },
    [current, totalSlides],
  );

  // Sync URL
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("slide", String(current));
    history.replaceState(null, "", url.toString());
  }, [current]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", " "].includes(e.key)) {
        e.preventDefault();
        goTo(current + 1);
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        goTo(current - 1);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [current, goTo]);

  // Touch swipe
  const touchStart = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    };
    const onEnd = (e: TouchEvent) => {
      const dx = touchStart.current.x - e.changedTouches[0].clientX;
      const dy = touchStart.current.y - e.changedTouches[0].clientY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        goTo(current + (dx > 0 ? 1 : -1));
      }
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [current, goTo]);

  // Pointer drag
  const pointer = useRef({ down: false, x: 0 });
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("#pitch-nav")) {
        pointer.current = { down: true, x: e.clientX };
      }
    };
    const onUp = (e: PointerEvent) => {
      if (pointer.current.down) {
        pointer.current.down = false;
        const dx = pointer.current.x - e.clientX;
        if (Math.abs(dx) > 40) goTo(current + (dx > 0 ? 1 : -1));
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pointer.current.down) e.preventDefault();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointermove", onMove, { passive: false });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointermove", onMove);
    };
  }, [current, goTo]);

  return { current, goTo, totalSlides };
}
