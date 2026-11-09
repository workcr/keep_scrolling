import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Opening of the home page: the introduction scrolls up on its own, the
// visitor's wheel, swipe or arrow keys take over at any moment (and it picks
// up again after a pause), and it ends with its "keep scRolling" exactly where
// the page's own wordmark sits, so the hand-over is invisible.
//
// Shown once per visit. With "reduce motion" on, it never moves by itself.

const SEEN_KEY = "ks-intro-seen";
const START_DELAY_MS = 600;
const RESUME_AFTER_MS = 1500;
const AUTO_SECONDS = 7; // whole intro, when left to play on its own
const SMOOTHING = 0.18;

export function introAlreadySeen() {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private windows may refuse storage; the intro then shows again next time.
  }
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param {{ text: string, wordmarkSrc: string, pageWordmarkRef: { current: HTMLElement | null }, onDone: () => void }} props
 */
export default function HomeIntro({ text, wordmarkSrc, pageWordmarkRef, onDone }) {
  const overlayRef = useRef(null);
  const textRef = useRef(null);
  const markRef = useRef(null);
  const [layout, setLayout] = useState(null); // { start, landAt, exitBy, markLeft, markWidth }
  const [position, setPosition] = useState(0);
  const finishedRef = useRef(false);

  // Measure where the page's wordmark is, so ours can land on it exactly.
  useLayoutEffect(() => {
    const measure = () => {
      const overlay = overlayRef.current;
      const page = pageWordmarkRef.current;
      const textNode = textRef.current;
      if (!overlay || !page || !textNode) return;
      const box = overlay.getBoundingClientRect();
      const mark = page.getBoundingClientRect();
      const start = Math.round(box.height * 0.06);
      // Sit right under the nav, whatever its height.
      const navBottom = document.querySelector("nav")?.getBoundingClientRect().bottom;
      if (Number.isFinite(navBottom) && Math.round(navBottom) !== Math.round(box.top)) {
        overlay.style.top = `${navBottom}px`;
        return measure();
      }
      const markTop = mark.top - box.top; // where our wordmark must end, inside the overlay
      const markOffset = markRef.current ? markRef.current.offsetTop : textNode.offsetHeight;
      setLayout({
        start,
        landAt: Math.max(0, start + markOffset - markTop), // whole block moves until the wordmark lands
        exitBy: markTop, // then the text alone keeps going until it's gone
        markLeft: mark.left - box.left,
        markWidth: mark.width
      });
    };
    measure();
    const again = () => measure();
    window.addEventListener("resize", again);
    document.fonts?.ready.then(again).catch(() => {});
    const img = pageWordmarkRef.current;
    img?.addEventListener?.("load", again);
    return () => {
      window.removeEventListener("resize", again);
      img?.removeEventListener?.("load", again);
    };
  }, [pageWordmarkRef]);

  useEffect(() => {
    if (!layout) return undefined;
    const total = layout.landAt + layout.exitBy;
    const reduced = prefersReducedMotion();
    const speed = total / AUTO_SECONDS; // px per second
    let target = 0;
    let current = 0;
    let autoFrom = performance.now() + START_DELAY_MS;
    let last = performance.now();
    let raf = 0;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      rememberSeen();
      onDone();
    };

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced && now >= autoFrom && target < total) {
        // Ease in when it (re)starts, slow down for the landing.
        const warm = Math.min(1, (now - autoFrom) / 600);
        const remaining = total - target;
        const settle = remaining < total * 0.15 ? Math.max(0.3, remaining / (total * 0.15)) : 1;
        target = Math.min(total, target + speed * warm * settle * dt);
      }
      current = reduced ? target : current + (target - current) * SMOOTHING;
      if (Math.abs(target - current) < 0.3) current = target;
      setPosition(current);
      if (current >= total - 0.5) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const nudge = (delta) => {
      target = Math.max(0, Math.min(total, target + delta));
      autoFrom = performance.now() + RESUME_AFTER_MS;
    };

    const onWheel = (event) => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      nudge(event.deltaY * unit);
    };
    let touchY = null;
    const onTouchStart = (event) => {
      touchY = event.touches[0]?.clientY ?? null;
      autoFrom = performance.now() + RESUME_AFTER_MS;
    };
    const onTouchMove = (event) => {
      if (touchY === null) return;
      event.preventDefault();
      const y = event.touches[0].clientY;
      nudge((touchY - y) * 1.4);
      touchY = y;
    };
    const onKey = (event) => {
      const page = window.innerHeight * 0.8;
      const keys = { ArrowDown: 80, ArrowUp: -80, PageDown: page, PageUp: -page, " ": event.shiftKey ? -page : page, End: total, Home: -total };
      if (event.key === "Escape") {
        target = total;
        current = total;
        return;
      }
      if (event.key in keys) {
        event.preventDefault();
        nudge(keys[event.key]);
      }
    };

    const overlay = overlayRef.current;
    overlay.addEventListener("wheel", onWheel, { passive: false });
    overlay.addEventListener("touchstart", onTouchStart, { passive: true });
    overlay.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      overlay.removeEventListener("wheel", onWheel);
      overlay.removeEventListener("touchstart", onTouchStart);
      overlay.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [layout, onDone]);

  const blockY = layout ? layout.start - Math.min(position, layout.landAt) : 0;
  const textExtra = layout ? Math.max(0, position - layout.landAt) : 0;

  return (
    <div ref={overlayRef} className="home-intro" aria-hidden="true" style={{ visibility: layout ? "visible" : "hidden" }}>
      <div className="home-intro-block" style={{ transform: `translate3d(0, ${blockY}px, 0)` }}>
        <p ref={textRef} className="home-intro-text" style={{ transform: `translate3d(0, ${-textExtra}px, 0)` }}>
          {text}
        </p>
        <img
          ref={markRef}
          src={wordmarkSrc}
          alt=""
          className="home-intro-mark"
          style={layout ? { width: `${layout.markWidth}px`, marginLeft: `${layout.markLeft}px` } : undefined}
        />
      </div>
    </div>
  );
}
