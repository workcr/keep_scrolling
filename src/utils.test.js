import { describe, expect, it } from "vitest";
import { inferMediaType, previousNames, resolveMediaUrl, slugifyProjectName } from "./utils";

describe("utils", () => {
  it("slugifies project names", () => {
    expect(slugifyProjectName("  Keep Scrolling  ")).toBe("keep-scrolling");
  });

  it("prefers direct media urls", () => {
    expect(resolveMediaUrl({ src: "/images/cover.jpg", name: "fallback" })).toBe("/images/cover.jpg");
  });

  it("falls back to source asset path when no explicit url exists", () => {
    expect(resolveMediaUrl({ title: "Poster-001.png" })).toBe("/assets/Poster-001.png");
  });

  it("infers video type from data-media-type", () => {
    expect(inferMediaType({ "data-media-type": "gif" })).toBe("video");
    expect(inferMediaType({ mediaType: "video/mp4" })).toBe("video");
  });

  it("defaults to image when type is missing", () => {
    expect(inferMediaType({})).toBe("image");
  });
});

describe("project addresses", () => {
  it("drops accents and punctuation, and leaves existing names as they were", () => {
    expect(slugifyProjectName("guaraná world cup cans")).toBe("guarana-world-cup-cans");
    expect(slugifyProjectName("Surf Overdose")).toBe("surf-overdose");
    expect(slugifyProjectName("2014 world cup")).toBe("2014-world-cup");
  });

  it("reads earlier names from the projects tab", () => {
    expect(previousNames({ "previous-names": "2014 world cup, guarana cans" })).toEqual(["2014 world cup", "guarana cans"]);
    expect(previousNames({})).toEqual([]);
  });
});
