import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MediaCard from "../components/MediaCard";
import scrollItems from "../data/scroll-items.json";
import { slugifyProjectName } from "../utils";

const INITIAL_BATCH = 24;
const BATCH_SIZE = 8;
const MAX_BATCH = 600;
const ITEM_STEP_PX = 469;
const ITEM_GROW_PX = 719;
const ITEM_OVERLAP_OFFSET_PX = 0;
const SMOOTHING_FACTOR = 0.2;
const DEFAULT_MAX_WIDTH_RATIO = 0.84;
const DEFAULT_MAX_HEIGHT_RATIO = 0.84;
const BOTTOM_SAFE_MARGIN_PX = 16;
const EDGE_PADDING_RATIO = 0.05;
const PRELOAD_BEHIND_ITEMS = 8;
const PRELOAD_AHEAD_ITEMS = 6;
const VIDEO_PRELOAD_AHEAD_ITEMS = 6;
const ACTIVE_VIDEO_AHEAD_ITEMS = 1;
const ACTIVE_VIDEO_BEHIND_ITEMS = 1;

function parseInlineStyle(input) {
  if (!input) return {};
  const normalized = String(input).replace(/^style=\\"/, "").replace(/\\"$/, "");
  const out = {};
  normalized.split(";").forEach((entry) => {
    const [k, v] = entry.split(":").map((part) => part && part.trim());
    if (!k || !v) return;
    const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  });
  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(value) {
  const t = clamp(value, 0, 1);
  if (t < 0.5) return 4 * t * t * t;
  return 1 - ((-2 * t + 2) ** 3) / 2;
}

function parseAspectRatio(value) {
  if (!value) return undefined;
  const match = String(value).match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return undefined;
  const w = Number.parseFloat(match[1]);
  const h = Number.parseFloat(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return undefined;
  return w / h;
}

function parseMaxRatio(value, fallbackRatio) {
  if (value === undefined || value === null || value === "") return fallbackRatio;
  const raw = String(value).trim();
  if (!raw) return fallbackRatio;
  if (raw.endsWith("%")) {
    const percent = Number.parseFloat(raw.slice(0, -1));
    if (!Number.isFinite(percent)) return fallbackRatio;
    return clamp(percent / 100, 0, 2);
  }
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return fallbackRatio;
  if (numeric > 0 && numeric <= 2) return numeric;
  if (numeric > 2 && numeric <= 100) return numeric / 100;
  return fallbackRatio;
}

function jitterFactor(seedValue) {
  const seed = Math.sin(seedValue * 12.9898) * 43758.5453;
  const fract = seed - Math.floor(seed);
  return 0.92 + fract * 0.16;
}

function buildBatch(source, start, count) {
  if (!source.length || count <= 0) return [];
  const batch = [];
  for (let i = 0; i < count; i += 1) {
    const sequenceIndex = start + i;
    batch.push({ ...source[sequenceIndex % source.length], __sequenceIndex: sequenceIndex });
  }
  return batch;
}

function mediaContainerStyle(item) {
  const style = {};
  if (item["data-aspect-ratio"]) {
    const aspect = item["data-aspect-ratio"].split(":")[1]?.trim().replace(";", "");
    if (aspect) style.aspectRatio = aspect;
  } else if (item["data-media-type"] === "video") {
    style.aspectRatio = "16 / 9";
  }
  return { ...parseInlineStyle(item.style), ...style };
}

function projectNameForItem(item) {
  return String(item.project ?? item["data-project"] ?? "").trim();
}

export default function Home() {
  const sourceItems = useMemo(
    () => scrollItems.filter((item) => String(item.class || "").includes("scroll-item")),
    []
  );

  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH);
  const [smoothedScroll, setSmoothedScroll] = useState(0);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0
  }));
  const scrollerRef = useRef(null);
  const targetScrollRef = useRef(0);
  const currentScrollRef = useRef(0);
  const lastPaintedRef = useRef(0);

  const items = useMemo(() => buildBatch(sourceItems, 0, visibleCount), [sourceItems, visibleCount]);

  useEffect(() => {
    setVisibleCount(INITIAL_BATCH);
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [sourceItems]);

  useEffect(() => {
    const updateViewportSize = () => {
      const scroller = scrollerRef.current;
      if (scroller) {
        setViewportSize({ width: scroller.clientWidth, height: scroller.clientHeight });
        return;
      }
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    updateViewportSize();
    const onResize = () => updateViewportSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return undefined;

    targetScrollRef.current = scroller.scrollTop;
    currentScrollRef.current = scroller.scrollTop;
    lastPaintedRef.current = scroller.scrollTop;
    setSmoothedScroll(scroller.scrollTop);

    const appendIfNeeded = () => {
      const threshold = scroller.clientHeight * 3;
      const nearBottom = scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight) < threshold;
      if (!nearBottom) return;
      setVisibleCount((prev) => Math.min(MAX_BATCH, prev + BATCH_SIZE));
    };

    const onScroll = () => {
      targetScrollRef.current = scroller.scrollTop;
      appendIfNeeded();
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });

    let rafId = 0;
    const tick = () => {
      const current = currentScrollRef.current;
      const target = targetScrollRef.current;
      const next = current + (target - current) * SMOOTHING_FACTOR;
      currentScrollRef.current = next;

      if (Math.abs(next - lastPaintedRef.current) >= 0.2) {
        lastPaintedRef.current = next;
        setSmoothedScroll(next);
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const spacerHeight = Math.max(3200, items.length * ITEM_STEP_PX + 1000);
  const promptOpacity = clamp(1 - smoothedScroll / 220, 0, 1);
  const currentIndex = Math.max(0, Math.floor(smoothedScroll / ITEM_STEP_PX));

  return (
    <div className="carrousel-container home-scroll-container" ref={scrollerRef}>
      <div className="home-stage">
        <div className="home-scroll-prompt" style={{ opacity: promptOpacity }}>
          <div className="text-3xl flex flex-col gap-6">
            Scroll
            <div className="flex flex-col items-center">
              <span>↓</span>
              <span>↓</span>
              <span>↓</span>
            </div>
          </div>
        </div>

        <div className="home-wordmark">
          <img src="/assets/keep%20scRolling.svg" alt="Keep scrolling" className="w-11/12" />
        </div>

        {items.map((item) => {
          const index = item.__sequenceIndex ?? 0;
          if (index < currentIndex - PRELOAD_BEHIND_ITEMS || index > currentIndex + PRELOAD_AHEAD_ITEMS) {
            return null;
          }

          const revealStart = index * ITEM_STEP_PX + ITEM_OVERLAP_OFFSET_PX;
          const revealProgress = clamp((smoothedScroll - revealStart) / ITEM_GROW_PX, 0, 1);
          const scale = easeInOutCubic(revealProgress);

          const parsedStyle = mediaContainerStyle(item);
          const mediaType = String(item["data-media-type"] || "").toLowerCase();
          const widthFromData = Number.parseFloat(item["data-width"]);
          const heightFromData = Number.parseFloat(item["data-height"]);
          const numericAspect =
            Number.isFinite(widthFromData) &&
            Number.isFinite(heightFromData) &&
            widthFromData > 0 &&
            heightFromData > 0
              ? widthFromData / heightFromData
              : parseAspectRatio(item["data-aspect-ratio"]) ||
                parseAspectRatio(parsedStyle.aspectRatio) ||
                (mediaType === "video" ? 16 / 9 : undefined);

          const widthRatio = parseMaxRatio(
            item["data-maxWidth"] ?? parsedStyle.maxWidth,
            DEFAULT_MAX_WIDTH_RATIO
          );
          const heightRatio = parseMaxRatio(
            item["data-maxHeight"] ?? parsedStyle.maxHeight,
            DEFAULT_MAX_HEIGHT_RATIO
          );
          const rugged = jitterFactor(index + 1);
          const paddedMaxWidthPx = viewportSize.width * (1 - EDGE_PADDING_RATIO * 2);
          const paddedMaxHeightPx = viewportSize.height * (1 - EDGE_PADDING_RATIO * 2);
          const maxWidthPx = Math.min(viewportSize.width * widthRatio * rugged, paddedMaxWidthPx);
          const maxHeightPx = Math.min(
            Math.max(0, viewportSize.height * heightRatio * rugged - BOTTOM_SAFE_MARGIN_PX),
            paddedMaxHeightPx
          );
          let targetWidthPx = maxWidthPx;
          let targetHeightPx = maxHeightPx;

          if (numericAspect) {
            const widthLimitedByHeight = maxHeightPx * numericAspect;
            targetWidthPx = Math.min(maxWidthPx, widthLimitedByHeight);
            targetHeightPx = targetWidthPx / numericAspect;
          }

          const keyBase = item.id ?? item.src ?? index;
          const projectName = projectNameForItem(item);
          const projectSlug = slugifyProjectName(projectName);
          const mediaNode = (
            <MediaCard
              {...item}
              sizes="84vw"
              videoInteraction={mediaType === "video" ? "hover" : undefined}
              videoActive={
                mediaType !== "video" ||
                (index >= currentIndex - ACTIVE_VIDEO_BEHIND_ITEMS &&
                  index <= currentIndex + ACTIVE_VIDEO_AHEAD_ITEMS)
              }
              deferVideo={mediaType === "video" && index > currentIndex + VIDEO_PRELOAD_AHEAD_ITEMS}
              videoLoadStrategy="manual"
              loading={
                mediaType === "video" && index <= currentIndex + VIDEO_PRELOAD_AHEAD_ITEMS
                  ? "eager"
                  : "lazy"
              }
              quality={mediaType === "video" ? "auto" : undefined}
            />
          );

          return (
            <div key={`${keyBase}-${index}`} className="home-item-layer" style={{ zIndex: index + 1 }}>
              <div
                className="home-item-shell"
                style={{
                  width: `${targetWidthPx}px`,
                  height: `${targetHeightPx}px`,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                  aspectRatio: numericAspect ? `${numericAspect}` : parsedStyle.aspectRatio
                }}
              >
                {mediaType === "text" ? (
                  <div className="home-text-card text-3xl">{item.content}</div>
                ) : projectSlug ? (
                  <Link
                    to={`/project/${projectSlug}`}
                    className="home-item-link"
                    aria-label={`View ${projectName} project`}
                  >
                    {mediaNode}
                  </Link>
                ) : (
                  mediaNode
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: spacerHeight }} />
    </div>
  );
}
