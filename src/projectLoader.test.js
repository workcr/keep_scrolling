import { afterEach, describe, expect, it, vi } from "vitest";
import { renameRedirects } from "../seo/build-plugin.js";

const ITEMS = [
  "id,data-media-type,src,alt,data-project,order,project-order",
  "scroll-item-1,image,assets/a.webp,A can.,guaraná world cup cans,10,",
  "scroll-item-2,image,assets/b.webp,B can.,guaraná world cup cans,20,1"
].join("\n");
const PROJECTS = ['"project","description","previous-names"', '"guaraná world cup cans","Cans for the 2014 World Cup.","2014 world cup"'].join("\n");

afterEach(() => vi.unstubAllGlobals());

describe("project pages", () => {
  it("finds a project by its plain address, in its own order, and redirects old names", async () => {
    vi.stubGlobal("fetch", async (url) => new Response(String(url).includes("sheet=projects") ? PROJECTS : ITEMS));
    const { projectLoader } = await import("./api.js");
    const { project } = await projectLoader({ params: { id: "guarana-world-cup-cans" } });
    expect(project.project).toBe("guaraná world cup cans");
    expect(project.gallery.map((item) => item.id)).toEqual(["scroll-item-2", "scroll-item-1"]);

    const moved = await projectLoader({ params: { id: "2014-world-cup" } }).catch((response) => response);
    expect(moved.status).toBe(302);
    expect(moved.headers.get("Location")).toBe("/project/guarana-world-cup-cans");

    const missing = await projectLoader({ params: { id: "nope" } }).catch((response) => response);
    expect(missing.status).toBe(404);
  });

  it("writes permanent redirects for search engines", () => {
    const rules = renameRedirects([{ project: "guaraná world cup cans", "previous-names": "2014 world cup" }, { project: "surf overdose" }]);
    expect(rules).toContain("RewriteRule ^project/2014-world-cup/?$ /project/guarana-world-cup-cans [R=301,L]");
    expect(renameRedirects([{ project: "surf overdose" }])).toBe("");
  });
});
