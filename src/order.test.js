import { describe, expect, it } from "vitest";
import { compareForProject, sortKey } from "./order.js";

describe("display order", () => {
  it("uses the order column, else the id number", () => {
    expect(sortKey({ id: "scroll-item-7" })).toBe(70);
    expect(sortKey({ id: "scroll-item-7", order: "15" })).toBe(15);
  });

  it("puts placed pieces first on a project page, then the rest in scroll order", () => {
    const items = [
      { id: "scroll-item-96", order: "22" },
      { id: "scroll-item-6", order: "300", "project-order": "1" },
      { id: "scroll-item-40", order: "100" },
      { id: "scroll-item-12", order: "50", "project-order": "2" }
    ];
    expect([...items].sort(compareForProject).map((i) => i.id)).toEqual(["scroll-item-6", "scroll-item-12", "scroll-item-96", "scroll-item-40"]);
  });
});
