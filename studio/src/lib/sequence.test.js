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

describe("refreshing the opener", () => {
  const incoming = Array.from({ length: 4 }, (_, n) => ({ id: `new-${n}`, project: "Brand New" }));
  const plan = planSequence(existing, incoming, { openerId: "new-0" });

  it("puts the chosen new piece first, keeps '{ Keep scrolling }' second", () => {
    expect(plan.sequence.slice(0, 2)).toEqual(["new-0", "scroll-item-2"]);
  });

  it("re-slots the previous opener instead of dropping it, away from its own project", () => {
    expect(plan.moved.id).toBe("scroll-item-1");
    const at = plan.sequence.indexOf("scroll-item-1");
    expect(at).toBeGreaterThan(1);
    const sjc = existing.filter((e) => e.project === "surf overdose" && e.id !== "scroll-item-1").map((e) => plan.sequence.indexOf(e.id));
    for (const other of sjc) expect(cyclic(at, other, plan.sequence.length)).toBeGreaterThanOrEqual(3);
  });

  it("produces keys the website sorts into exactly this sequence", () => {
    const merged = [
      ...existing.map((e) => (e.id === plan.moved.id ? { ...e, order: String(plan.moved.order) } : e)),
      ...incoming.map((i) => ({ id: i.id, order: String(plan.orders[i.id]) }))
    ].sort((a, b) => sortKey(a) - sortKey(b));
    expect(merged.map((i) => i.id)).toEqual(plan.sequence);
  });

  it("spreads the rest of the opener's project through the sequence", () => {
    const pos = ["new-0", "new-1", "new-2", "new-3"].map((id) => plan.sequence.indexOf(id));
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        expect(cyclic(pos[i], pos[j], plan.sequence.length)).toBeGreaterThanOrEqual(MIN_GAP);
      }
    }
  });

  it("gives other new projects a piece right after '{ Keep scrolling }'", () => {
    const mixed = planSequence(existing, [...incoming, { id: "other-0", project: "Other" }], { openerId: "new-0" });
    expect(mixed.sequence[2]).toBe("other-0");
  });
});
