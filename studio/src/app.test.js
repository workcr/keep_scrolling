import { beforeEach, describe, expect, it } from "vitest";
import scrollItems from "../../src/data/scroll-items.json";
import { handle } from "./app.js";
import { fakeD1, fakeR2, fakeSheets } from "./test/fakes.js";

const BASE = "http://localhost:8787";
const HEADERS = [
  "id", "class", "data-media-type", "src", "srcset", "content", "alt", "style", "data-width", "data-height",
  "data-aspect-ratio", "data-orientation", "data-maxWidth", "width", "data-maxHeight",
  "data-client", "data-project", "data-category", "data-discipline", "order"
];

function liveSheet() {
  const rows = scrollItems.map((item) => HEADERS.map((h) => (h === "order" ? "" : String(item[h] ?? ""))));
  return {
    Sheet1: [HEADERS, ...rows],
    projects: [["project", "description"], ["surf overdose", "Surf Overdose was the first apparel collection…"]]
  };
}

let env;
let sheets;
let deployCalls;
const deps = () => ({
  sheets,
  fetch: async (url) => {
    deployCalls.push(String(url));
    return new Response(null, { status: 204 });
  }
});

async function api(method, path, { json, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers["Content-Type"] = "application/json";
  } else if (body !== undefined) {
    init.body = body;
    init.duplex = "half";
  }
  const response = await handle(new Request(`${BASE}${path}`, init), env, deps());
  return { status: response.status, data: await response.json() };
}

async function upload(id, slot, type, bytes = 1000) {
  return api("PUT", `/api/drafts/${id}/files/${slot}`, {
    body: new Uint8Array(bytes),
    headers: { "Content-Type": type, "Content-Length": String(bytes) }
  });
}

async function imageDraft(fileName, project, size = [2560, 1440]) {
  const created = await api("POST", "/api/drafts", { json: { kind: "image", fileName, width: size[0], height: size[1] } });
  const id = created.data.draft.id;
  for (const slot of ["original", "w320", "w640", "w960", "w1600"]) await upload(id, slot, "image/webp");
  await api("PATCH", `/api/drafts/${id}`, { json: { project, alt: `${fileName} alt`, client: "nike" } });
  return id;
}

beforeEach(() => {
  env = {
    DEV_BYPASS_AUTH: "true",
    DB: fakeD1(),
    MEDIA: fakeR2(),
    MEDIA_PUBLIC_BASE: "https://media.example",
    SHEET_ID: "sheet",
    GOOGLE_SERVICE_ACCOUNT_JSON: "{}",
    GITHUB_TOKEN: "gh"
  };
  sheets = fakeSheets(liveSheet());
  deployCalls = [];
});

describe("access", () => {
  it("refuses everyone when not signed in", async () => {
    const response = await handle(new Request("https://studio.example.workers.dev/api/me"), { DB: fakeD1() }, {});
    expect(response.status).toBe(401);
  });

  it("leaves non-API paths to the static page", async () => {
    expect(await handle(new Request(`${BASE}/index.html`), env, {})).toBeNull();
  });
});

describe("drafts", () => {
  it("creates a draft, streams files into R2 and records their public URLs", async () => {
    const created = await api("POST", "/api/drafts", { json: { kind: "image", fileName: "Nike Café Poster.PNG", width: 2560, height: 1440 } });
    expect(created.status).toBe(201);
    expect(created.data.slots).toEqual(["original", "w320", "w640", "w960", "w1600"]);
    const id = created.data.draft.id;

    const original = await upload(id, "original", "image/webp", 2048);
    expect(original.status).toBe(200);
    expect(original.data.url).toBe(`https://media.example/studio/${id}/nike-cafe-poster.webp`);
    await upload(id, "w640", "image/webp");
    const draft = (await api("GET", "/api/drafts")).data.drafts[0];
    expect(draft.src).toBe(original.data.url);
    expect(draft.variants["640"]).toBe(`https://media.example/studio/${id}/nike-cafe-poster-640.webp`);
    expect(env.MEDIA.objects.get(`studio/${id}/nike-cafe-poster.webp`).bytes.length).toBe(2048);
  });

  it("rejects wrong file types, oversize files and unknown slots", async () => {
    const id = (await api("POST", "/api/drafts", { json: { kind: "video", fileName: "a.mp4", width: 1920, height: 1080 } })).data.draft.id;
    expect((await upload(id, "original", "video/quicktime")).status).toBe(415);
    const big = await api("PUT", `/api/drafts/${id}/files/original`, {
      body: new Uint8Array(10),
      headers: { "Content-Type": "video/mp4", "Content-Length": String(101 * 1024 * 1024) }
    });
    expect(big.status).toBe(413);
    expect(big.data.error).toMatch(/limit is 100 MB/);
    expect((await upload(id, "w640", "image/webp")).status).toBe(400);
    expect((await upload(id, "frame3", "image/jpeg")).status).toBe(200);
  });

  it("edits only the allowed text fields and can discard a draft with its files", async () => {
    const id = await imageDraft("a.png", "brand new");
    expect((await api("PATCH", `/api/drafts/${id}`, { json: { src: "evil" } })).status).toBe(400);
    const deleted = await api("DELETE", `/api/drafts/${id}`);
    expect(deleted.data.files).toBe(5);
    expect(env.MEDIA.objects.size).toBe(0);
    expect((await api("GET", "/api/drafts")).data.drafts).toEqual([]);
  });
});

describe("publish", () => {
  it("previews without writing anything", async () => {
    const ids = [await imageDraft("a.png", "Brand New"), await imageDraft("b.png", "Brand New")];
    const preview = await api("POST", "/api/publish", { json: { draftIds: ids, dryRun: true } });
    expect(preview.status).toBe(200);
    expect(preview.data.preview.map((p) => p.id)).toEqual(["scroll-item-51", "scroll-item-52"]);
    expect(preview.data.preview[0].position).toBe(3); // right after "{ Keep scrolling }"
    expect(sheets.calls).toEqual([]);
    expect(deployCalls).toEqual([]);
  });

  it("refuses until the sheet has an order column", async () => {
    sheets = fakeSheets({ ...liveSheet(), Sheet1: liveSheet().Sheet1.map((row) => row.slice(0, -1)) });
    const id = await imageDraft("a.png", "Brand New");
    const result = await api("POST", "/api/publish", { json: { draftIds: [id] } });
    expect(result.status).toBe(409);
    expect(result.data.error).toMatch(/missing column\(s\): order/);
  });

  it("refuses incomplete drafts", async () => {
    const id = (await api("POST", "/api/drafts", { json: { kind: "image", fileName: "a.png", width: 10, height: 10 } })).data.draft.id;
    const result = await api("POST", "/api/publish", { json: { draftIds: [id] } });
    expect(result.status).toBe(422);
    expect(result.data.error).toMatch(/hasn't finished uploading.*choose a project/);
  });

  it("appends finished rows, saves the project description, and redeploys the site", async () => {
    const ids = [];
    for (const name of ["a", "b", "c", "d", "e"]) ids.push(await imageDraft(`${name}.png`, "Brand New"));
    await api("PUT", "/api/project-drafts/brand%20new", { json: { project: "Brand New", description: "A new campaign." } });

    const result = await api("POST", "/api/publish", { json: { draftIds: ids } });
    expect(result.status).toBe(200);
    expect(result.data.deploy).toEqual({ ok: true });
    expect(deployCalls).toEqual(["https://api.github.com/repos/workcr/keep_scrolling/actions/workflows/deploy.yml/dispatches"]);

    const rows = sheets.tabs.Sheet1.slice(-5).map((cells) => Object.fromEntries(HEADERS.map((h, i) => [h, cells[i]])));
    expect(rows.map((r) => r.id)).toEqual(["scroll-item-51", "scroll-item-52", "scroll-item-53", "scroll-item-54", "scroll-item-55"]);
    expect(rows[0]).toMatchObject({
      class: "scroll-item 2col", // one in five, landscape
      "data-media-type": "image",
      "data-project": "Brand New",
      "data-client": "nike",
      alt: "a.png alt",
      style: 'style="max-width:100%; aspect-ratio: 16 / 9;"'
    });
    expect(rows.every((r) => Number.isFinite(Number(r.order)))).toBe(true);
    expect(sheets.tabs.projects.at(-1)).toEqual(["Brand New", "A new campaign."]);
    expect((await api("GET", "/api/drafts")).data.drafts).toEqual([]);

    // Publishing the same drafts twice is refused.
    expect((await api("POST", "/api/publish", { json: { draftIds: ids } })).status).toBe(409);
  });

  it("updates an existing project's description instead of duplicating it", async () => {
    const id = await imageDraft("a.png", "surf overdose");
    await api("PUT", "/api/project-drafts/surf%20overdose", { json: { project: "surf overdose", description: "Updated." } });
    await api("POST", "/api/publish", { json: { draftIds: [id] } });
    expect(sheets.tabs.projects).toEqual([["project", "description"], ["surf overdose", "Updated."]]);
  });

  it("still publishes, with a warning, when the redeploy can't start", async () => {
    const id = await imageDraft("a.png", "Brand New");
    delete env.GITHUB_TOKEN;
    const result = await api("POST", "/api/publish", { json: { draftIds: [id] } });
    expect(result.status).toBe(200);
    expect(result.data.warnings.join(" ")).toMatch(/redeploy didn't start/);
  });
});

describe("live content", () => {
  it("lists live items and flags pieces of the same project that sit together", async () => {
    const content = await api("GET", "/api/content");
    expect(content.data.items).toHaveLength(scrollItems.length);
    expect(content.data.missingColumns).toEqual([]);
    expect(content.data.spacing.some((w) => w.a === "scroll-item-11" && w.b === "scroll-item-12")).toBe(true);
  });

  it("edits a live item's alt text in place", async () => {
    const result = await api("PATCH", "/api/items/scroll-item-7", { json: { alt: "New alt", src: "ignored" } });
    expect(result.data).toEqual({ updated: "scroll-item-7", fields: 1 });
    const row = sheets.tabs.Sheet1.find((cells) => cells[0] === "scroll-item-7");
    expect(row[HEADERS.indexOf("alt")]).toBe("New alt");
  });
});
