import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Opening of the home page. The introduction scrolls up like a column of
// text; "keep scRolling" follows as its last line, then stops in its usual
// place (partly below the fold) while the text keeps going up and out. It
// plays on its own; the visitor's wheel, swipe or arrow keys take over at any
// moment, and it picks up again after a pause.
//
// Exact landing without measuring the page: the intro's wordmark is laid out
// by the same CSS as the page's (.home-stage > .home-wordmark > img), and only
// a vertical offset that shrinks to 0 is added, so it ends where the page's
// sits on every screen. The text is sized from that wordmark (same letter
// height, same left edge), as in the Figma design where both share one style.
//
// Shown once per visit. With "reduce motion" on, it never moves by itself.

const SEEN_KEY = "ks-intro-seen";
const START_DELAY_MS = 600;
const RESUME_AFTER_MS = 1500;
const AUTO_SECONDS = 7; // whole intro, when left to play on its own
const SMOOTHING = 0.18;

// The wordmark SVG (src/assets/keep scRolling.svg), in its own units: its
// width, the top of the "k" and the baseline.
const SVG_WIDTH = 1882;
const SVG_K_TOP = 3.709;
const SVG_BASELINE = 225;
const LINE_HEIGHT = 0.9; // Figma: 313 px type, 0.9 line height, -3% tracking

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

function siteFont() {
  return getComputedStyle(document.body).fontFamily;
}

// Height of the "k" ascender and the left bearing of the first letter, per
// 100 px of the site font.
function fontMetrics(firstLetter) {
  const canvas = document.createElement("canvas").getContext("2d");
  canvas.font = `100px ${siteFont()}`;
  const k = canvas.measureText("k");
  const first = canvas.measureText(firstLetter);
  return { kTop: k.actualBoundingBoxAscent, firstInk: -first.actualBoundingBoxLeft };
}

/**
 * @param {{ text: string, wordmarkSrc: string, frameRef: { current: HTMLElement | null }, onDone: () => void }} props
 */
export default function HomeIntro({ text, wordmarkSrc, frameRef, onDone }) {
  const overlayRef = useRef(null);
  const textRef = useRef(null);
  const endRef = useRef(null);
  const stageRef = useRef(null);
  const markWrapRef = useRef(null);
  const markRef = useRef(null);
  const [type, setType] = useState(null); // { fontSize, left, width, unit }
  const [layout, setLayout] = useState(null); // { start, total, markFromText, markTop }
  const [position, setPosition] = useState(0);
  const finishedRef = useRef(false);

  // 1. Cover the home scroll area and size the text from the wordmark.
  useLayoutEffect(() => {
    let cancelled = false;
    const size = () => {
      const overlay = overlayRef.current;
      const mark = markRef.current;
      const wrap = markWrapRef.current;
      if (!overlay || !mark || !wrap || cancelled) return;
      const frameNode = frameRef?.current;
      if (frameNode) {
        const frame = frameNode.getBoundingClientRect();
        Object.assign(overlay.style, { top: `${frame.top}px`, left: `${frame.left}px`, width: `${frame.width}px`, height: `${frame.height}px` });
        // The page's stage sits inside the scroll area's padding (phones have some).
        const padding = getComputedStyle(frameNode);
        Object.assign(stageRef.current.style, { left: padding.paddingLeft, right: padding.paddingRight, top: padding.paddingTop });
      }
      const markWidth = mark.offsetWidth;
      if (!markWidth || !mark.offsetHeight) return;
      const unit = markWidth / SVG_WIDTH;
      const metrics = fontMetrics(text.trim()[0] || "H");
      if (!metrics.kTop) return;
      const fontSize = (100 * (SVG_BASELINE - SVG_K_TOP) * unit) / metrics.kTop;
      const markLeft = stageRef.current.offsetLeft + wrap.offsetLeft + mark.offsetLeft;
      setType({ fontSize, left: markLeft - (metrics.firstInk * fontSize) / 100, width: markWidth, unit });
    };
    size();
    document.fonts?.ready.then(size).catch(() => {});
    document.fonts?.load?.(`100px ${siteFont()}`).then(size).catch(() => {});
    const mark = markRef.current;
    mark?.addEventListener("load", size);
    window.addEventListener("resize", size);
    return () => {
      cancelled = true;
      mark?.removeEventListener("load", size);
      window.removeEventListener("resize", size);
    };
  }, [frameRef, text]);

  // 2. With the text laid out, work out the path.
  useLayoutEffect(() => {
    if (!type) return;
    const overlay = overlayRef.current;
    const textNode = textRef.current;
    const end = endRef.current;
    const mark = markRef.current;
    const wrap = markWrapRef.current;
    if (!overlay || !textNode || !end || !mark || !wrap) return;
    // The header floats over the top of the home page; start the text below it.
    const navBottom = document.querySelector("nav")?.getBoundingClientRect().bottom || 0;
    const top = Math.max(0, Math.round(navBottom - overlay.getBoundingClientRect().top));
    const height = overlay.clientHeight - top;
    const textHeight = textNode.offsetHeight;
    // Text that fills the screen starts near the top; text that would fit at
    // once (phones) slides in from the bottom instead.
    const start = top + (textHeight > height * 0.9 ? Math.round(height * 0.06) : Math.round(height * 0.85));
    const lastBaseline = end.offsetTop; // baseline of the last line, inside the text
    // "keep scRolling" as the next line: one line lower, baseline on baseline.
    const markFromText = lastBaseline + LINE_HEIGHT * type.fontSize - SVG_BASELINE * type.unit;
    setLayout({
      start,
      total: start + textHeight, // until the last line has left the top
      markFromText,
      markTop: stageRef.current.offsetTop + wrap.offsetTop + mark.offsetTop // its resting place: same CSS as the page's
    });
  }, [type]);

  // 3. Play: on its own, or following the visitor.
  useEffect(() => {
    if (!layout) return undefined;
    const { total } = layout;
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

  const textY = layout ? layout.start - position : 0;
  // Rides along as the text's last line, then rests in its usual place.
  const markOffset = layout ? Math.max(0, textY + layout.markFromText - layout.markTop) : 0;

  return (
    <div ref={overlayRef} className="home-intro" aria-hidden="true" style={{ visibility: layout ? "visible" : "hidden" }}>
      {/* On phones the text is clipped under the header (see .home-intro-clip). */}
      <div className="home-intro-clip">
      <p
        ref={textRef}
        className="home-intro-text"
        style={
          type
            ? { fontSize: `${type.fontSize}px`, left: `${type.left}px`, width: `${type.width}px`, transform: `translate3d(0, ${textY}px, 0)` }
            : undefined
        }
      >
        {text}
        <span ref={endRef} className="home-intro-baseline" />
      </p>
      </div>
      {/* Same structure and classes as the page's wordmark (Home.jsx). */}
      <div ref={stageRef} className="home-intro-stage">
        <div ref={markWrapRef} className="home-wordmark" style={{ transform: `translate3d(0, ${markOffset}px, 0)` }}>
          <img ref={markRef} src={wordmarkSrc} alt="" className="w-11/12" width={SVG_WIDTH} height={245} />
        </div>
      </div>
    </div>
  );
}
