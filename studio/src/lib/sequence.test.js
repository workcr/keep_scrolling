import { describe, expect, it } from "vitest";
import scrollItems from "../../../src/data/scroll-items.json";
import { FRONT_SLOTS, MIN_GAP, planSequence, sortKey, spacingWarnings } from "./sequence.js";

// The real catalogue, shaped like rows read from the sheet.
const existing = scrollItems.map((item) => ({
  id: item.id,
  project: item["data-project"],
  mediaType: item["data-media-type"]
}));

function positions(sequence, ids) {
  return ids.map((id) => sequence.indexOf(id));
}

function cyclic(a, b, n) {
  const d = Math.abs(a - b);
  return Math.min(d, n - d);
}

describe("planSequence on the real catalogue", () => {
  const incoming = Array.from({ length: 6 }, (_, n) => ({ id: `new-${n}`, project: "Brand New Campaign" }));
  const { orders, sequence, warnings } = planSequence(existing, incoming);

  it("keeps every existing piece in its current order", () => {
    const before = [...existing].sort((a, b) => sortKey(a) - sortKey(b)).map((i) => i.id);
    expect(sequence.filter((id) => !id.startsWith("new-"))).toEqual(before);
  });

  it("puts one piece of the new project in the first positions, after the intro text", () => {
    const first = Math.min(...positions(sequence, incoming.map((i) => i.id)));
    expect(first).toBeLessThan(FRONT_SLOTS + 1);
    // The opening (up to and including "{ Keep scrolling }") stays first.
    expect(sequence.slice(0, 2)).toEqual(["scroll-item-1", "scroll-item-2"]);
    expect(first).toBe(2);
  });

  it("spreads a 6-piece project across the loop, at least MIN_GAP apart", () => {
    const pos = positions(sequence, incoming.map((i) => i.id)).sort((a, b) => a - b);
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        expect(cyclic(pos[i], pos[j], sequence.length)).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
    expect(warnings).toEqual([]);
  });

  it("gives new pieces order keys that the website sorts into the planned sequence", () => {
    const merged = [
      ...existing,
      ...incoming.map((item) => ({ id: item.id, order: String(orders[item.id]) }))
    ].sort((a, b) => sortKey(a) - sortKey(b));
    expect(merged.map((i) => i.id)).toEqual(sequence);
  });

  it("keeps pieces of an existing project away from the new ones", () => {
    const more = [1, 2, 3].map((n) => ({ id: `sjc-${n}`, project: "surf overdose" }));
    const plan = planSequence(existing, more);
    const sjc = plan.sequence
      .map((id, index) => ({ id, index }))
      .filter(({ id }) => id.startsWith("sjc-") || existing.find((e) => e.id === id)?.project === "surf overdose");
    const newOnes = sjc.filter(({ id }) => id.startsWith("sjc-"));
    for (const a of newOnes) {
      for (const b of sjc) {
        if (a.id === b.id) continue;
        expect(cyclic(a.index, b.index, plan.sequence.length)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("planSequence edge cases", () => {
  it("warns when the catalogue is too small to keep MIN_GAP", () => {
    const tiny = [{ id: "scroll-item-1", project: "a" }, { id: "scroll-item-2", project: "b" }];
    const plan = planSequence(tiny, [1, 2, 3].map((n) => ({ id: `x${n}`, project: "c" })));
    expect(plan.sequence).toHaveLength(5);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it("works on an empty catalogue", () => {
    const plan = planSequence([], [{ id: "a", project: "p" }]);
    expect(plan.sequence).toEqual(["a"]);
    expect(Number.isFinite(plan.orders.a)).toBe(true);
  });
});

describe("spacingWarnings", () => {
  it("finds the one same-project pair that sits too close today", () => {
    const close = spacingWarnings(existing, 2).map((w) => [w.a, w.b]);
    expect(close).toContainEqual(["scroll-item-11", "scroll-item-12"]);
  });
});
