import { describe, expect, it } from "vitest";
import { projectsFromCsv } from "./csv";

describe("projectsFromCsv", () => {
  it("reads the projects tab with case-insensitive headers", () => {
    const csv = '"Project","Description"\n"surf overdose","Posters, ""NFTs"" and apparel."\n"",""\n';
    expect(projectsFromCsv(csv)).toEqual([{ project: "surf overdose", description: 'Posters, "NFTs" and apparel.' }]);
  });

  it("rejects the items tab that Google returns when the projects tab is missing", () => {
    expect(() => projectsFromCsv("id,src,data-project\n1,a.webp,cce\n")).toThrow(/projects tab not found/);
  });
});
