import { describe, expect, it } from "vitest";
import { gifVideoSource, optimizedVideoSource, responsiveImageSrcSet } from "./mediaOptimization";

describe("media optimization", () => {
  it("builds width-based WebP candidates for optimized R2 images", () => {
    const srcSet = responsiveImageSrcSet(
      "https://example.r2.dev/SJC_ALOHA_JUNKIE_grained.png"
    );

    expect(srcSet).toContain("SJC_ALOHA_JUNKIE_grained-480.webp 480w");
    expect(srcSet).toContain("SJC_ALOHA_JUNKIE_grained-2560.webp 2560w");
  });

  it("leaves images without generated variants unchanged", () => {
    expect(responsiveImageSrcSet("https://example.com/other.png")).toBeUndefined();
  });

  it("selects a small video on constrained connections", () => {
    expect(
      optimizedVideoSource("https://example.r2.dev/SJC_SURF_OVERDOSE_VHS_V2.mov", {
        displayWidth: 1600,
        effectiveType: "3g"
      })
    ).toBe("/media/optimized/SJC_SURF_OVERDOSE_VHS_V2-640.mp4");
  });

  it("selects the smallest video rendition that covers the display width", () => {
    expect(
      optimizedVideoSource("https://example.r2.dev/SJC_SURF_OVERDOSE_VHS_V2.mov", {
        displayWidth: 900,
        effectiveType: "4g"
      })
    ).toBe("/media/optimized/SJC_SURF_OVERDOSE_VHS_V2-1280.mp4");
  });
});

describe("gifVideoSource", () => {
  it("maps converted GIFs to their MP4 and leaves others alone", () => {
    expect(gifVideoSource("/assets/dtms_portfolio_01.gif")).toBe("/media/gif/dtms_portfolio_01.mp4");
    expect(gifVideoSource("/assets/Octa-grid%20animation%202.gif")).toBe("/media/gif/Octa-grid%20animation%202.mp4");
    expect(gifVideoSource("/assets/Guarana_1920x1080_Latas.gif")).toBeUndefined();
    expect(gifVideoSource("/assets/photo.webp")).toBeUndefined();
  });
});
