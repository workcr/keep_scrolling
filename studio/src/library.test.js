import { describe, expect, it } from "vitest";
import library from "./generated/library.json";

describe("generated library", () => {
  it("has one entry per piece, a project for the DTMS files, and every suggestion", () => {
    expect(new Set(library.map((p) => p.key)).size).toBe(library.length);
    expect(library.filter((p) => /^dtms_portfolio/i.test(p.key)).every((p) => p.project === "dtms branding")).toBe(true);
    expect(library.some((p) => p.project === "dtms portfolio")).toBe(false);
    // 30 picked by eye; a renamed or deleted file would silently drop one.
    expect(library.filter((p) => p.suggested).length).toBe(30);
    expect(library.filter((p) => p.suggested && p.alreadyOnSite)).toEqual([]);
  });
});
