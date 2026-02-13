import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData, useLocation } from "react-router-dom";
import MediaCard from "../components/MediaCard";

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
  const candidates = [
    item?.class,
    item?.classes,
    item?.layout,
    item?.size,
    item?.variant,
    item?.tag,
    item?.tags
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(^|\W)2\s*-?\s*col(\W|$)/.test(candidates);
}

function toSlug(value) {
  return String(value || "").trim().replace(/\s+/g, "-");
}

const INITIAL_BATCH = 30;
const BATCH_SIZE = 8;

function buildBatch(source, start, count) {
  if (!source.length || count <= 0) return [];
  const batch = [];
  for (let i = 0; i < count; i += 1) {
    const sequenceIndex = start + i;
    batch.push({ ...source[sequenceIndex % source.length], __sequenceIndex: sequenceIndex });
  }
  return batch;
}

export default function GalleryPage() {
  const { items } = useLoaderData();
  const location = useLocation();
  const [filters, setFilters] = useState(readSearchFilters());
  const [visibleItems, setVisibleItems] = useState([]);
  const [scrollY, setScrollY] = useState(0);
  const gridRef = useRef(null);
  const sentinelRef = useRef(null);
  const isAppendingRef = useRef(false);
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
        setScrollY(window.scrollY);
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
    const storedCount = Number.parseInt(window.sessionStorage.getItem(visibleCountKey) || "", 10);
    const count = Number.isFinite(storedCount) ? Math.max(INITIAL_BATCH, Math.min(storedCount, 500)) : INITIAL_BATCH;
    setVisibleItems(buildBatch(filtered, 0, Math.min(count, Math.max(count, filtered.length))));
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

  useEffect(() => {
    if (!sentinelRef.current || !filtered.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        appendBatch();
      },
      { root: null, threshold: 0, rootMargin: "1400px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [appendBatch, filtered.length]);

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

  const eagerVideoCount = useMemo(() => {
    const base = 36;
    const growth = Math.floor(scrollY / 700) * 8;
    return Math.min(visibleItems.length, base + growth);
  }, [scrollY, visibleItems.length]);

  return (
    <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 0 }}>
      <div className="gallery-grid" ref={gridRef}>
        {visibleItems.map((item, index) => {
          const slug = toSlug(item.project);
          const key = `${item.id ?? slug}-${item.__sequenceIndex ?? index}`;
          const twoCol = isTwoColItem(item);
          const mediaType = String(item["data-media-type"] || "").toLowerCase();
          const eagerVideo = mediaType === "video" && index < eagerVideoCount;
          return (
            <Link
              key={key}
              to={`/project/${slug}`}
              className={twoCol ? "gallery-grid-item gallery-grid-item--2col" : "gallery-grid-item"}
            >
              <MediaCard
                {...item}
                loading={eagerVideo ? "eager" : "lazy"}
                quality={mediaType === "video" ? "auto" : undefined}
              />
            </Link>
          );
        })}
      </div>
      {filtered.length ? <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" /> : null}
    </div>
  );
}
