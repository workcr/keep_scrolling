import { useSyncExternalStore } from "react";

// Whether hovering a video may play its sound. Off until the visitor turns
// it on with the Sound button; that click is also what browsers require
// before a page may play sound. Kept for the visit only (not stored), because
// browsers require a fresh click after every page load anyway.
let enabled = false;
const listeners = new Set();

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSoundEnabled() {
  return useSyncExternalStore(subscribe, isSoundEnabled, () => false);
}
