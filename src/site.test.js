import { describe, expect, it } from "vitest";
import { projectDescription, titleCase } from "./site";

describe("titleCase", () => {
  it("capitalises words and upper-cases vowel-less acronyms", () => {
    expect(titleCase("dtms branding")).toBe("DTMS Branding");
    expect(titleCase("the new golden era")).toBe("The New Golden Era");
    expect(titleCase("2014 world cup")).toBe("2014 World Cup");
  });
});

describe("projectDescription", () => {
  it("prefers the written description", () => {
    expect(projectDescription({ project: "x", description: "  Real copy.  " })).toBe("Real copy.");
  });

  it("builds a factual fallback from the sheet fields", () => {
    expect(
      projectDescription({ project: "surf overdose", client: "surf junkie club", category: "Design", discipline: "Fashion Design" })
    ).toBe("Surf Overdose for Surf Junkie Club — design, fashion design work by Creative Director Rodrigo Mendes.");
  });
});

describe("emailHref", () => {
  it("assembles the mailto link at click time", async () => {
    const { emailHref } = await import("./site");
    expect(emailHref()).toBe("mailto:rmnds1" + "@gmail.com");
  });
});

describe("summarize", () => {
  it("leaves short text alone and flattens line breaks", async () => {
    const { summarize } = await import("./site");
    expect(summarize("Isku brand.\nCaio - Owner")).toBe("Isku brand. Caio - Owner");
  });

  it("cuts long text at a word boundary within the limit", async () => {
    const { summarize } = await import("./site");
    const out = summarize("word ".repeat(60));
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("word…")).toBe(true);
  });
});
