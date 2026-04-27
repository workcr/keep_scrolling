import { useEffect, useRef, useState } from "react";
import { useLoaderData, useLocation } from "react-router-dom";
import MediaCard from "../components/MediaCard";

export default function ProjectPage() {
  const { project } = useLoaderData();
  const location = useLocation();
  const railRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
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
  }, [project?.gallery]);

  function scrollRail(delta) {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: delta, behavior: "smooth" });
  }

  return (
    <div className="pt-16 project">
      <div className="hidden lg:block project-rail-shell">
        <div className="project-rail" ref={railRef}>
          {project.gallery &&
            project.gallery.map((item) => (
              <div className="project-rail-item" key={item.id}>
                <MediaCard {...item} projectMedia quality="auto" />
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

      {project.gallery && (
        <div className="block lg:hidden px-8 space-y-4 project-mobile-stack">
          {project.gallery.map((item) => (
            <MediaCard key={item.id} {...item} projectMedia quality="auto" />
          ))}
        </div>
      )}
    </div>
  );
}
