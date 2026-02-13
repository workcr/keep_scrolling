import { describe, expect, it } from "vitest";
import { inferMediaType, resolveMediaUrl, slugifyProjectName } from "./utils";

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
