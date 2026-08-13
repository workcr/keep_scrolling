import { useEffect, useRef, useState } from "react";
import { useLoaderData, useLocation } from "react-router-dom";
import MediaCard from "../components/MediaCard";

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

function useDesktopLayout() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_MEDIA_QUERY).matches : false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const updateLayout = (event) => setIsDesktop(event.matches);

    setIsDesktop(mediaQuery.matches);
    mediaQuery.addEventListener("change", updateLayout);
    return () => mediaQuery.removeEventListener("change", updateLayout);
  }, []);

  return isDesktop;
}

export default function ProjectPage() {
  const { project } = useLoaderData();
  const location = useLocation();
  const railRef = useRef(null);
  const isDesktop = useDesktopLayout();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    if (!isDesktop) return;
    const rail = railRef.current;
    if (!rail) return;

    const updateScrollState = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      setCanScrollLeft(rail.scrollLeft > 2);
      setCanScrollRight(max - rail.scrollLeft > 2);
    };

    const onScroll = () => updateScrollState();
    rail.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateScrollState);
    requestAnimationFrame(updateScrollState);

    return () => {
      rail.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [isDesktop, project?.gallery]);

  function scrollRail(delta) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: delta, behavior: "smooth" });
  }

  return (
    <div className="pt-16 project">
      {isDesktop ? (
        <div className="project-rail-shell">
          <div className="project-rail" ref={railRef}>
            {project.gallery &&
              project.gallery.map((item, index) => (
                <div className="project-rail-item" key={item.id}>
                  <MediaCard
                    {...item}
                    projectMedia
                    quality="auto"
                    deferVideo={String(item["data-media-type"] || item.mediaType).toLowerCase() === "video" && index > 0}
                    videoLoadMargin="120px"
                  />
                </div>
              ))}
          </div>
          <div className="project-rail-controls" aria-hidden={!canScrollLeft && !canScrollRight}>
            <button
              type="button"
              className="project-rail-arrow"
              onClick={() => scrollRail(-480)}
              disabled={!canScrollLeft}
              aria-label="Scroll media left"
            >
              ←
            </button>
            <button
              type="button"
              className="project-rail-arrow"
              onClick={() => scrollRail(480)}
              disabled={!canScrollRight}
              aria-label="Scroll media right"
            >
              →
            </button>
          </div>
        </div>
      ) : null}

      <div className="px-8 lg:px-4 grid grid-cols-3 lg:grid-cols-2 lg:w-1/2 project-info-block">
        <div>Project info</div>
        <div className="space-y-12 col-span-2 lg:col-span-1">
          <p>{project.description}</p>
          <div className="space-x-4">
            <button type="button">Link</button>
            <button type="button">Share</button>
          </div>
        </div>
      </div>

      {!isDesktop && project.gallery ? (
        <div className="px-8 space-y-4 project-mobile-stack">
          {project.gallery.map((item, index) => (
            <MediaCard
              key={item.id}
              {...item}
              projectMedia
              quality="auto"
              deferVideo={String(item["data-media-type"] || item.mediaType).toLowerCase() === "video" && index > 0}
              videoLoadMargin="120px"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
