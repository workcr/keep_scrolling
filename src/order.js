// Display order, shared by the browser (src/api.js) and the build-time SEO
// generator (seo/build-plugin.js). Keep it free of browser-only APIs.
//
// Two independent orders, both set by dragging in the Studio's Order tab:
//   order          the home scroll and the gallery (Sheet1 column "order")
//   project-order  each project's own page (Sheet1 column "project-order")

function itemSequence(item) {
  const match = String(item.id || "").match(/(?:^|-)item-(\d+)$/i);
  if (match) return Number.parseInt(match[1], 10);
  const numeric = Number.parseInt(item.id, 10);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

// Rows without an `order` keep their historical position, id number × 10.
// Must match studio/src/lib/sequence.js#sortKey.
export function sortKey(item) {
  const order = Number.parseFloat(item.order);
  if (Number.isFinite(order)) return order;
  return itemSequence(item) * 10;
}

function projectPosition(item) {
  const value = Number.parseFloat(item["project-order"]);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * Order for a project page: pieces placed in the Studio first, in that order;
 * the rest (e.g. just published) after them, in home-scroll order.
 */
export function compareForProject(a, b) {
  const pa = projectPosition(a);
  const pb = projectPosition(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  return sortKey(a) - sortKey(b);
}
