// The project of the piece under the pointer in the home scroll, shared
// between the scroll (which sets it) and the nav bar (which shows it).
import { useSyncExternalStore } from "react";

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
