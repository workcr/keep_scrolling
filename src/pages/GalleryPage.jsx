import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData, useLocation } from "react-router-dom";
import MediaCard from "../components/MediaCard";

const TWO_COLUMN_ITEM_IDS = new Set([
  "scroll-item-6",
  "scroll-item-8",
  "scroll-item-10",
  "scroll-item-12",
  "scroll-item-14",
  "scroll-item-24",
  "scroll-item-29",
  "scroll-item-44"
]);

function readSearchFilters() {
  const params = new URLSearchParams(window.location.search);
  return {
    client: params.getAll("client"),
    project: params.getAll("project"),
    category: params.getAll("category"),
    discipline: params.getAll("discipline")
  };
}

function isTwoColItem(item) {
  if (TWO_COLUMN_ITEM_IDS.has(String(item?.id || ""))) return true;

  const explicitSpan = Number.parseInt(
    item?.colSpan ??
      item?.columnSpan ??
      item?.["data-col-span"] ??
      item?.["data-colspan"] ??
      "",
    10
  );
  if (Number.isFinite(explicitSpan) && explicitSpan >= 2) return true;

  const candidates = [
    item?.class,
    item?.className,
    item?.classes,
    item?.["data-cropped"],
    item?.cropped,
    item?.layout,
    item?.size,
    item?.colSpan,
    item?.columnSpan,
    item?.variant,
    item?.tag,
    item?.tags
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(^|\W)2\s*-?\s*col(\W|$)/.test(candidates)) return true;
  return /(2\s*-?\s*col|two\s*-?\s*col)/.test(JSON.stringify(item).toLowerCase());
}

function toSlug(value) {
  return String(value || "").trim().replace(/\s+/g, "-");
}

const INITIAL_BATCH = 36;
const BATCH_SIZE = 12;
const LOAD_AHEAD_PX = 1600;
const INITIAL_EAGER_VIDEO_LIMIT = 1;

function buildBatch(source, start, count) {
  if (!source.length || count <= 0) return [];
  const batch = [];
  for (let i = 0; i < count; i += 1) {
    const sequenceIndex = start + i;
    batch.push({ ...source[sequenceIndex % source.length], __sequenceIndex: sequenceIndex });
  }
  return batch;
}

function GalleryItem({ item, twoCol, eagerVideo }) {
  const linkRef = useRef(null);
  const mediaType = String(item["data-media-type"] || "").toLowerCase();
  const isVideo = mediaType === "video";
  const [videoReady, setVideoReady] = useState(!isVideo || eagerVideo);
  const slug = toSlug(item.project);

  useEffect(() => {
    if (!isVideo || eagerVideo) {
      setVideoReady(true);
      return undefined;
    }

    setVideoReady(false);
    const element = linkRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVideoReady(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVideoReady(Boolean(entry?.isIntersecting));
      },
      { root: null, threshold: 0, rootMargin: "300px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [eagerVideo, isVideo, item.src]);

  return (
    <Link
      ref={linkRef}
      to={`/project/${slug}`}
      className={twoCol ? "gallery-grid-item gallery-grid-item--2col" : "gallery-grid-item"}
    >
      <MediaCard
        {...item}
        sizes={
          twoCol
            ? "(max-width: 480px) 67vw, (max-width: 767px) 50vw, (max-width: 1199px) 40vw, 34vw"
            : "(max-width: 480px) 33vw, (max-width: 767px) 25vw, (max-width: 1199px) 20vw, 17vw"
        }
        videoInteraction={isVideo ? "hover" : undefined}
        deferVideo={isVideo && !videoReady}
        videoLoadStrategy="manual"
        loading={eagerVideo ? "eager" : "lazy"}
        quality={isVideo ? "auto" : undefined}
      />
    </Link>
  );
}

export default function GalleryPage() {
  const { items } = useLoaderData();
  const location = useLocation();
  const [filters, setFilters] = useState(readSearchFilters());
  const [visibleItems, setVisibleItems] = useState([]);
  const gridRef = useRef(null);
  const sentinelRef = useRef(null);
  const isAppendingRef = useRef(false);
  const loadCheckRafRef = useRef(0);
  const hasRestoredRef = useRef(false);
  const scrollKey = `gallery-scroll:${location.pathname}${location.search}`;
  const visibleCountKey = `${scrollKey}:count`;

  useEffect(() => {
    const onPop = () => setFilters(readSearchFilters());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const filtered = useMemo(() => {
    const match = (value, selected) => {
      if (!selected?.length) return true;
      if (Array.isArray(value)) return value.some((entry) => selected.includes(String(entry)));
      return selected.includes(String(value));
    };
    return items.filter(
      (item) =>
        match(item.client, filters.client) &&
        match(item.project, filters.project) &&
        match(item.category, filters.category) &&
        match(item.discipline, filters.discipline)
    );
  }, [items, filters]);

  useEffect(() => {
    hasRestoredRef.current = false;
  }, [scrollKey]);

  useEffect(() => {
    const key = scrollKey;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        window.sessionStorage.setItem(key, String(window.scrollY));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollKey]);

  useEffect(() => {
    isAppendingRef.current = false;
    if (loadCheckRafRef.current) {
      cancelAnimationFrame(loadCheckRafRef.current);
      loadCheckRafRef.current = 0;
    }
    const storedCount = Number.parseInt(window.sessionStorage.getItem(visibleCountKey) || "", 10);
    const count = Number.isFinite(storedCount) ? Math.max(INITIAL_BATCH, Math.min(storedCount, 500)) : INITIAL_BATCH;
    setVisibleItems(buildBatch(filtered, 0, count));
  }, [filtered, visibleCountKey]);

  useEffect(() => {
    if (!visibleItems.length) return;
    window.sessionStorage.setItem(visibleCountKey, String(visibleItems.length));
  }, [visibleItems.length, visibleCountKey]);

  useEffect(() => {
    if (hasRestoredRef.current || !visibleItems.length) return;
    const saved = window.sessionStorage.getItem(scrollKey);
    if (!saved) {
      hasRestoredRef.current = true;
      return;
    }
    const y = Number.parseFloat(saved);
    if (!Number.isFinite(y)) {
      hasRestoredRef.current = true;
      return;
    }
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
      hasRestoredRef.current = true;
    });
  }, [scrollKey, visibleItems.length]);

  const appendBatch = useCallback(() => {
    if (!filtered.length || isAppendingRef.current) return;
    isAppendingRef.current = true;
    setVisibleItems((prev) => [...prev, ...buildBatch(filtered, prev.length, BATCH_SIZE)]);
    requestAnimationFrame(() => {
      isAppendingRef.current = false;
    });
  }, [filtered]);

  const scheduleLoadCheck = useCallback(() => {
    if (!filtered.length || loadCheckRafRef.current) return;

    loadCheckRafRef.current = requestAnimationFrame(() => {
      loadCheckRafRef.current = 0;
      const doc = document.documentElement;
      const scrollBottom = window.scrollY + window.innerHeight;
      const remaining = doc.scrollHeight - scrollBottom;

      if (remaining < LOAD_AHEAD_PX) appendBatch();
    });
  }, [appendBatch, filtered.length]);

  useEffect(() => {
    scheduleLoadCheck();
    return () => {
      if (loadCheckRafRef.current) {
        cancelAnimationFrame(loadCheckRafRef.current);
        loadCheckRafRef.current = 0;
      }
    };
  }, [scheduleLoadCheck, visibleItems.length]);

  useEffect(() => {
    window.addEventListener("scroll", scheduleLoadCheck, { passive: true });
    window.addEventListener("resize", scheduleLoadCheck);
    return () => {
      window.removeEventListener("scroll", scheduleLoadCheck);
      window.removeEventListener("resize", scheduleLoadCheck);
    };
  }, [scheduleLoadCheck]);

  useEffect(() => {
    if (!sentinelRef.current || !filtered.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        scheduleLoadCheck();
      },
      { root: null, threshold: 0, rootMargin: "1400px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [filtered.length, scheduleLoadCheck]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const getGridMetrics = () => {
      const computed = window.getComputedStyle(grid);
      const rowHeight = Number.parseFloat(computed.getPropertyValue("grid-auto-rows")) || 8;
      const rowGap = Number.parseFloat(computed.getPropertyValue("row-gap")) || 16;
      return { rowHeight, rowGap };
    };

    const getContentHeight = (element) => {
      const media =
        element.querySelector("img") ||
        element.querySelector(".video-container") ||
        element.firstElementChild;
      if (!media) return 0;
      const rect = media.getBoundingClientRect();
      return rect.height || 0;
    };

    const resizeItem = (element) => {
      const { rowHeight, rowGap } = getGridMetrics();
      const itemHeight = getContentHeight(element);
      if (!itemHeight) return;
      const span = Math.max(1, Math.ceil((itemHeight + rowGap) / (rowHeight + rowGap)));
      element.style.gridRowEnd = `span ${span}`;
    };

    const elements = grid.querySelectorAll(".gallery-grid-item");
    if (!elements.length) return;

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const target = entry.target;
        if (target.classList.contains("gallery-grid-item")) {
          resizeItem(target);
          return;
        }
        const parent = target.closest(".gallery-grid-item");
        if (parent) resizeItem(parent);
      });
    });

    elements.forEach((element) => {
      const media =
        element.querySelector("img") ||
        element.querySelector(".video-container") ||
        element.firstElementChild;

      resizeItem(element);
      observer.observe(element);
      if (media) observer.observe(media);

      const image = element.querySelector("img");
      if (image && !image.complete) {
        image.addEventListener("load", () => resizeItem(element), { once: true });
      }
    });

    return () => observer.disconnect();
  }, [visibleItems]);

  let videoCount = 0;

  return (
    <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 0 }}>
      {filtered.length === 0 ? (
        <div className="my-4 rounded bg-red-50 p-3 text-sm text-red-700">
          No gallery items available right now. Please try again later.
        </div>
      ) : null}
      <div className="gallery-grid" ref={gridRef}>
        {visibleItems.map((item, index) => {
          const slug = toSlug(item.project);
          const key = `${item.id ?? slug}-${item.__sequenceIndex ?? index}`;
          const twoCol = isTwoColItem(item);
          const mediaType = String(item["data-media-type"] || "").toLowerCase();
          const videoIndex = mediaType === "video" ? videoCount : -1;
          if (mediaType === "video") videoCount += 1;
          const eagerVideo = videoIndex >= 0 && videoIndex < INITIAL_EAGER_VIDEO_LIMIT;
          return (
            <GalleryItem
              key={key}
              item={item}
              twoCol={twoCol}
              eagerVideo={eagerVideo}
            />
          );
        })}
      </div>
      {filtered.length ? <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" /> : null}
    </div>
  );
}
