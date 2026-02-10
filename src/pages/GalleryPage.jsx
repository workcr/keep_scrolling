import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLoaderData } from "react-router-dom";
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
  const [filters, setFilters] = useState(readSearchFilters());
  const [visibleItems, setVisibleItems] = useState([]);
  const gridRef = useRef(null);
  const sentinelRef = useRef(null);
  const isAppendingRef = useRef(false);

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
    setVisibleItems(buildBatch(filtered, 0, Math.min(INITIAL_BATCH, filtered.length)));
  }, [filtered]);

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
      { root: null, threshold: 0, rootMargin: "800px" }
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

  return (
    <div style={{ paddingLeft: 16, paddingRight: 16, paddingTop: 64 }}>
      <div className="gallery-grid" ref={gridRef}>
        {visibleItems.map((item, index) => {
          const slug = toSlug(item.project);
          const key = `${item.id ?? slug}-${item.__sequenceIndex ?? index}`;
          const twoCol = isTwoColItem(item);
          return (
            <Link
              key={key}
              to={`/project/${slug}`}
              className={twoCol ? "gallery-grid-item gallery-grid-item--2col" : "gallery-grid-item"}
            >
              <MediaCard {...item} />
            </Link>
          );
        })}
      </div>
      {filtered.length ? <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" /> : null}
    </div>
  );
}
