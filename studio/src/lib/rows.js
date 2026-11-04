// Turns a reviewed Studio draft into a Sheet1 row, in the exact format the
// website already reads (see src/api.js normalizeItem and the existing rows).
// Columns are matched by header name, so the sheet's column order and any
// extra columns don't matter.

const RESPONSIVE_WIDTHS = [320, 640, 960, 1600];

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

export function aspectRatio(width, height) {
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!(w > 0 && h > 0)) return "";
  const d = gcd(w, h);
  return `${w / d} / ${h / d}`;
}

export function orientation(width, height) {
  const ratio = Number(width) / Number(height);
  if (!Number.isFinite(ratio)) return "";
  if (Math.abs(ratio - 1) < 0.02) return "square";
  return ratio > 1 ? "horizontal" : "vertical";
}

export function srcset(variants = {}) {
  return RESPONSIVE_WIDTHS.filter((width) => variants[width])
    .map((width) => `${variants[width]} ${width}w`)
    .join(", ");
}

export function nextItemNumber(ids) {
  let max = 0;
  for (const id of ids) {
    const match = String(id || "").match(/(?:^|-)item-(\d+)$/i);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return max + 1;
}

/**
 * Pick roughly one in five new pieces to span two gallery columns, preferring
 * landscape videos, then landscape images (the most effective wide pieces).
 * @param {Array<{id: string, kind: string, width: number, height: number}>} drafts
 * @returns {Set<string>} ids of the pieces to make wide
 */
export function chooseWide(drafts) {
  const count = Math.round(drafts.length / 5);
  if (count === 0) return new Set();
  const score = (draft) => {
    const o = orientation(draft.width, draft.height);
    return (o === "horizontal" ? 2 : o === "square" ? 1 : 0) + (draft.kind === "video" ? 0.5 : 0);
  };
  const ranked = [...drafts].sort((a, b) => score(b) - score(a));
  // Take every other top candidate so wide pieces don't bunch together.
  const picked = [];
  for (let i = 0; i < ranked.length && picked.length < count; i += 2) picked.push(ranked[i].id);
  for (let i = 1; i < ranked.length && picked.length < count; i += 2) picked.push(ranked[i].id);
  return new Set(picked);
}

/**
 * @param {object} draft  reviewed draft (src, variants, width, height, alt, project, ...)
 * @param {{ id: string, order: number, wide: boolean }} placement
 * @returns {Record<string, string>} column name -> cell value
 */
export function rowValues(draft, { id, order, wide }) {
  const ratio = aspectRatio(draft.width, draft.height);
  const mediaType = draft.kind === "video" ? "video" : draft.kind === "gif" ? "gif" : "image";
  return {
    id,
    class: wide ? "scroll-item 2col" : "scroll-item",
    "data-media-type": mediaType,
    src: draft.src,
    srcset: mediaType === "image" ? srcset(draft.variants) : "",
    content: "",
    alt: draft.alt || "",
    style: ratio ? `style="max-width:100%; aspect-ratio: ${ratio};"` : "",
    "data-width": String(Math.round(draft.width) || ""),
    "data-height": String(Math.round(draft.height) || ""),
    "data-aspect-ratio": ratio ? `aspect-ratio: ${ratio};` : "",
    "data-orientation": orientation(draft.width, draft.height),
    "data-client": draft.client || "",
    "data-project": draft.project || "",
    "data-category": draft.category || "",
    "data-discipline": draft.discipline || "",
    order: String(order)
  };
}

/** Lay values out in the sheet's own column order. Unknown columns stay empty. */
export function toRow(values, headers) {
  return headers.map((header) => values[String(header).trim()] ?? "");
}

/** Columns the Studio must be able to write. */
export const REQUIRED_HEADERS = ["id", "class", "data-media-type", "src", "alt", "data-project", "order"];

export function missingHeaders(headers) {
  const present = new Set(headers.map((h) => String(h).trim()));
  return REQUIRED_HEADERS.filter((h) => !present.has(h));
}
