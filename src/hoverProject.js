// The project of the piece under the pointer in the home scroll, shared
// between the scroll (which sets it) and the nav bar (which shows it).
import { useEffect, useSyncExternalStore } from "react";

let current = null;
const listeners = new Set();

export function setHoverProject(name) {
  const next = name ? String(name) : null;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHoverProject() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/**
 * Keeps the hovered project up to date on a page: the element under the
 * mouse is checked when the mouse moves and when anything scrolls (pieces
 * slide under a still pointer). Pieces mark themselves with
 * data-project-name. Mouse only; touch screens have no hover.
 */
export function useHoverProjectTracking(enabled = true) {
  useEffect(() => {
    if (!enabled) {
      setHoverProject(null);
      return undefined;
    }
    let point = null;
    let raf = 0;
    const check = () => {
      raf = 0;
      if (!point) return setHoverProject(null);
      const piece = document.elementFromPoint(point.x, point.y)?.closest?.("[data-project-name]");
      setHoverProject(piece ? piece.dataset.projectName : null);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    const onMove = (event) => {
      if (event.pointerType !== "mouse") return;
      point = { x: event.clientX, y: event.clientY };
      schedule();
    };
    const onLeave = () => {
      point = null;
      schedule();
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("blur", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("scroll", schedule, { capture: true });
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("blur", onLeave);
      setHoverProject(null);
    };
  }, [enabled]);
}
