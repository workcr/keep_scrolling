import { describe, expect, it } from "vitest";
import { sortKey } from "./api";

describe("sortKey", () => {
  it("keeps the historical id order when there is no order column", () => {
    const items = [{ id: "scroll-item-10" }, { id: "scroll-item-2" }, { id: "scroll-item-1" }];
    expect(items.sort((a, b) => sortKey(a) - sortKey(b)).map((i) => i.id)).toEqual([
      "scroll-item-1",
      "scroll-item-2",
      "scroll-item-10"
    ]);
  });

  it("slots a row with an order number between historical rows", () => {
    const items = [
      { id: "scroll-item-1" },
      { id: "scroll-item-2" },
      { id: "scroll-item-52", order: "15" }
    ];
    expect(items.sort((a, b) => sortKey(a) - sortKey(b)).map((i) => i.id)).toEqual([
      "scroll-item-1",
      "scroll-item-52",
      "scroll-item-2"
    ]);
  });
});
