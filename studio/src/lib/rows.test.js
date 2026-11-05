import { describe, expect, it } from "vitest";
import { aspectRatio, chooseWide, missingHeaders, nextItemNumber, orientation, rowValues, toRow } from "./rows.js";

describe("rows", () => {
  it("reduces aspect ratios the way the sheet writes them", () => {
    expect(aspectRatio(1920, 1080)).toBe("16 / 9");
    expect(aspectRatio(1280, 854)).toBe("640 / 427");
    expect(aspectRatio(0, 10)).toBe("");
  });

  it("classifies orientation", () => {
    expect(orientation(1920, 1080)).toBe("horizontal");
    expect(orientation(1080, 1920)).toBe("vertical");
    expect(orientation(1080, 1080)).toBe("square");
  });

  it("numbers new items after the highest existing id", () => {
    expect(nextItemNumber(["scroll-item-2", "scroll-item-50", "x"])).toBe(51);
  });

  it("builds an image row the website can read", () => {
    const values = rowValues(
      {
        kind: "image",
        src: "https://media.example/studio/a/poster.webp",
        variants: { 320: "u320", 640: "u640", 960: "u960", 1600: "u1600" },
        width: 2560,
        height: 1440,
        alt: "A poster",
        project: "new campaign",
        client: "nike",
        category: "Branding",
        discipline: "Design"
      },
      { id: "scroll-item-52", order: 25, wide: true }
    );
    expect(values).toMatchObject({
      id: "scroll-item-52",
      class: "scroll-item 2col",
      "data-media-type": "image",
      srcset: "u320 320w, u640 640w, u960 960w, u1600 1600w",
      style: 'style="max-width:100%; aspect-ratio: 16 / 9;"',
      "data-aspect-ratio": "aspect-ratio: 16 / 9;",
      "data-orientation": "horizontal",
      "data-project": "new campaign",
      order: "25"
    });
  });

  it("lays values out in the sheet's column order and leaves unknown columns empty", () => {
    const headers = ["id", "notes", "src", "order"];
    expect(toRow({ id: "a", src: "b", order: "1" }, headers)).toEqual(["a", "", "b", "1"]);
  });

  it("reports the columns the sheet is missing", () => {
    expect(missingHeaders(["id", "class", "data-media-type", "src", "alt", "data-project"])).toEqual(["order"]);
  });

  it("makes about one in five pieces wide, preferring landscape videos", () => {
    const drafts = [
      { id: "v", kind: "video", width: 1920, height: 1080 },
      { id: "p1", kind: "image", width: 1000, height: 1500 },
      { id: "p2", kind: "image", width: 1000, height: 1500 },
      { id: "s", kind: "image", width: 1000, height: 1000 },
      { id: "l", kind: "image", width: 1500, height: 1000 }
    ];
    expect([...chooseWide(drafts)]).toEqual(["v"]);
    expect(chooseWide(drafts.slice(0, 2)).size).toBe(0);
  });
});
