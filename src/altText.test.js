import { describe, expect, it } from "vitest";
import { createAltLookup } from "./altText";

describe("createAltLookup", () => {
  const lookup = createAltLookup([
    { src: "assets/ATT%20Print%2002.webp", alt: "AT&T print layout." },
    { src: "assets/other.webp", alt: "This image needs a description." }
  ]);

  it("keeps real alt text from the sheet", () => {
    expect(lookup("Written in the sheet.", "assets/ATT Print 02.webp")).toBe("Written in the sheet.");
  });

  it("replaces the placeholder with local alt text matched by filename", () => {
    expect(lookup("This image needs a description.", "/assets/ATT Print 02.webp")).toBe("AT&T print layout.");
  });

  it("returns empty when nothing better is known", () => {
    expect(lookup("This image needs a description.", "assets/other.webp")).toBe("");
  });
});
