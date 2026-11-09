// Where new pieces go in the home page / gallery sequence.
//
// The site plays one long sequence (and loops back to the start), ordered by
// each row's sort key. The goal is that a visitor never sees several pieces of
// the same project together, and that new work shows up early.
//
// Rules, in priority order:
//   1. Existing pieces never move, with one exception: the opener.
//   2. The opener (the first piece, before "{ Keep scrolling }") is refreshed
//      on every publish: a chosen new piece takes its place, and the previous
//      opener is re-slotted into the sequence like any other piece.
//   3. The first piece of each other NEW project (not one already on the
//      site) goes into the first
//      FRONT_SLOTS positions after "{ Keep scrolling }", so new work is seen
//      early.
//   4. Every new piece is placed as far as possible from other pieces of the
//      same project, measured around the loop. MIN_GAP is the target; if the
//      catalogue is too small to reach it, the best possible spot is used and a
//      warning is returned.

export const MIN_GAP = 6;
export const FRONT_SLOTS = 10;

// Must match sortKey() in src/api.js (the website).
export function sortKey(item) {
  const order = Number.parseFloat(item.order);
  if (Number.isFinite(order)) return order;
  const match = String(item.id || "").match(/(?:^|-)item-(\d+)$/i);
  const seq = match ? Number.parseInt(match[1], 10) : Number.parseInt(item.id, 10);
  return (Number.isFinite(seq) ? seq : Number.MAX_SAFE_INTEGER / 10) * 10;
}

function projectKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isText(item) {
  return String(item.mediaType || "").toLowerCase() === "text";
}

function cyclicDistance(a, b, length) {
  const d = Math.abs(a - b);
  return Math.min(d, length - d);
}

// Smallest distance from a piece inserted at `index` to any same-project piece.
function gapIfInsertedAt(list, index, project) {
  const length = list.length + 1;
  let best = Infinity;
  list.forEach((entry, i) => {
    if (!project || entry.project !== project) return;
    const position = i < index ? i : i + 1;
    best = Math.min(best, cyclicDistance(index, position, length));
  });
  return best;
}

function chooseIndex(list, project, from, to, ideal) {
  let bestIndex = from;
  let bestGap = -1;
  let bestTie = Infinity;
  for (let index = from; index <= to; index += 1) {
    const gap = gapIfInsertedAt(list, index, project);
    const tie = Math.abs(index - ideal);
    if (gap > bestGap || (gap === bestGap && tie < bestTie)) {
      bestIndex = index;
      bestGap = gap;
      bestTie = tie;
    }
  }
  return { index: bestIndex, gap: bestGap };
}

/**
 * @param {Array<{id: string, project?: string, mediaType?: string, order?: string|number}>} existing
 * @param {Array<{id: string, project: string}>} incoming  new pieces, in upload order
 * @param {{ openerId?: string }} [options]  new piece to open the sequence with
 * @returns {{ orders: Record<string, number>, moved: {id: string, order: number} | null,
 *             sequence: string[], warnings: string[] }}
 *   orders: keys for the new pieces; moved: the previous opener's new key.
 */
export function planSequence(existing, incoming, { openerId } = {}) {
  const list = [...existing]
    .sort((a, b) => sortKey(a) - sortKey(b))
    .map((item) => ({ id: item.id, project: projectKey(item.project), key: sortKey(item), text: isText(item), isNew: false }));

  // Refresh the opener: the chosen new piece takes the first position (and its
  // key); the previous opener is re-slotted further down.
  let previousOpener = null;
  let openerProject = null;
  const opener = openerId ? incoming.find((item) => item.id === openerId) : null;
  if (opener) {
    openerProject = projectKey(opener.project);
    const entry = { id: opener.id, project: openerProject, key: null, text: false, isNew: false };
    if (list.length && !list[0].text) {
      previousOpener = list.shift();
      entry.key = previousOpener.key;
    } else {
      entry.key = list.length ? list[0].key - 10 : 0;
    }
    list.unshift(entry);
  }

  // New work starts right after the first text card ("{ Keep scrolling }").
  const firstText = list.findIndex((entry) => entry.text);
  const leading = firstText !== -1 && firstText < FRONT_SLOTS ? firstText + 1 : 0;

  // Group new pieces by project, biggest group first (hardest to spread).
  const groups = new Map();
  for (const item of incoming.filter((entry) => entry.id !== openerId)) {
    const key = projectKey(item.project);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const warnings = [];
  // Only NEW projects get a piece up front. More pieces for a project that's
  // already on the site are spread like everything else (otherwise they'd be
  // pulled next to that project's existing pieces, e.g. the opener).
  const existingProjects = new Set(list.filter((entry) => !entry.text && entry.project).map((entry) => entry.project));

  for (const [project, items] of ordered) {
    items.forEach((item, n) => {
      // The opener already puts this project up front.
      const isFirst = n === 0 && project !== openerProject && !existingProjects.has(project);
      const lastIndex = list.length;
      const from = leading;
      const to = isFirst ? Math.min(leading + FRONT_SLOTS - 1, lastIndex) : lastIndex;
      // Spread the rest evenly through the sequence; ties go to the even spot.
      const ideal = isFirst
        ? leading
        : leading + Math.round(((lastIndex - leading) * n) / items.length);
      const { index, gap } = chooseIndex(list, project, from, to, ideal);
      list.splice(index, 0, { id: item.id, project, key: null, text: false, isNew: true });
      if (project && gap < MIN_GAP && gap !== Infinity) {
        warnings.push(
          `"${item.id}" is only ${gap} position${gap === 1 ? "" : "s"} from another piece of "${project}" (target ${MIN_GAP}).`
        );
      }
    });
  }

  // The previous opener rejoins the sequence like any other piece.
  if (previousOpener) {
    const { index, gap } = chooseIndex(list, previousOpener.project, leading, list.length, Math.round((leading + list.length) / 2));
    list.splice(index, 0, { ...previousOpener, key: null, isNew: true });
    if (previousOpener.project && gap < MIN_GAP && gap !== Infinity) {
      warnings.push(`The previous opener "${previousOpener.id}" is only ${gap} positions from another piece of "${previousOpener.project}".`);
    }
  }

  const orders = assignKeys(list);

  let moved = null;
  if (previousOpener) {
    moved = { id: previousOpener.id, order: orders[previousOpener.id] };
    delete orders[previousOpener.id];
  }
  if (opener) orders[opener.id] = list[0].key;

  return { orders, moved, sequence: list.map((entry) => entry.id), warnings };
}

// Give every entry without a key (key === null) a key between its
// neighbours; entries that have a key keep it. Returns { id: key } for the
// entries that got one.
function assignKeys(list) {
  const orders = {};
  let i = 0;
  while (i < list.length) {
    if (list[i].key !== null) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < list.length && list[j].key === null) j += 1;
    const before = i > 0 ? list[i - 1].key : null;
    const after = j < list.length ? list[j].key : null;
    const count = j - i;
    const low = before ?? (after !== null ? after - 10 * (count + 1) : 0);
    const high = after ?? low + 10 * (count + 1);
    for (let k = 0; k < count; k += 1) {
      const key = Math.round((low + ((high - low) * (k + 1)) / (count + 1)) * 1000) / 1000;
      list[i + k].key = key;
      orders[list[i + k].id] = key;
    }
    i = j;
  }
  return orders;
}

/**
 * "Re-space": move only the pieces that sit too close to another piece of the
 * same project (closer than `threshold` positions, around the loop) to the
 * spot furthest from that project's other pieces. Everything else keeps its
 * place; the opening (up to and including "{ Keep scrolling }") never moves.
 * @returns {{ moves: Array<{id, project, from, to, order}>, sequence: string[], remaining: number }}
 *   from/to are 1-based positions in the whole sequence.
 */
export function planRespace(existing, { threshold = 3 } = {}) {
  const list = [...existing]
    .sort((a, b) => sortKey(a) - sortKey(b))
    .map((item) => ({ id: item.id, project: projectKey(item.project), key: sortKey(item), text: isText(item) }));
  const before = new Map(list.map((entry, index) => [entry.id, index + 1]));
  const firstText = list.findIndex((entry) => entry.text);
  const leading = firstText !== -1 && firstText < FRONT_SLOTS ? firstText + 1 : 0;

  // Distances count pieces only (not text cards), like spacingWarnings().
  const closePair = (skip) => {
    const pieces = list.map((entry, index) => ({ entry, index })).filter(({ entry }) => !entry.text);
    for (let i = 0; i < pieces.length; i += 1) {
      for (let j = i + 1; j < pieces.length; j += 1) {
        const a = pieces[i];
        const b = pieces[j];
        if (!a.entry.project || a.entry.project !== b.entry.project) continue;
        if (cyclicDistance(i, j, pieces.length) >= threshold) continue;
        // Move the later piece, unless it's part of the fixed opening.
        if (b.index >= leading && !skip.has(b.entry.id)) return b.index;
        if (a.index >= leading && !skip.has(a.entry.id)) return a.index;
      }
    }
    return -1;
  };

  const tried = new Set();
  for (let guard = 0; guard < list.length * 2; guard += 1) {
    const index = closePair(tried);
    if (index === -1) break;
    const [entry] = list.splice(index, 1);
    const { index: target } = chooseIndex(list, entry.project, leading, list.length, Math.round((leading + list.length) / 2));
    list.splice(target, 0, { ...entry, key: null, moved: true });
    tried.add(entry.id); // each piece moves at most once
  }

  const orders = assignKeys(list);
  const moves = list
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.moved)
    .map(({ entry, index }) => ({ id: entry.id, project: entry.project, from: before.get(entry.id), to: index + 1, order: orders[entry.id] }));
  const remaining = spacingWarnings(
    list.map((entry) => ({ id: entry.id, project: entry.project, mediaType: entry.text ? "text" : "", order: entry.key })),
    threshold
  ).length;
  return { moves, sequence: list.map((entry) => entry.id), remaining };
}

/** Check an existing sequence (e.g. after hand edits) for pieces that are too close. */
export function spacingWarnings(items, minGap = MIN_GAP) {
  const list = [...items]
    .filter((item) => !isText(item))
    .sort((a, b) => sortKey(a) - sortKey(b));
  const warnings = [];
  const seen = new Set();
  list.forEach((a, i) => {
    list.forEach((b, j) => {
      if (j <= i || !projectKey(a.project) || projectKey(a.project) !== projectKey(b.project)) return;
      const gap = cyclicDistance(i, j, list.length);
      const pair = `${a.id}|${b.id}`;
      if (gap < minGap && !seen.has(pair)) {
        seen.add(pair);
        warnings.push({ a: a.id, b: b.id, project: projectKey(a.project), gap });
      }
    });
  });
  return warnings;
}
