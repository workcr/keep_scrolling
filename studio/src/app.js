// Studio API. Every route requires the signed-in owner (Cloudflare Access).
//
//   GET    /api/me                         who is signed in
//   GET    /api/drafts                     drafts not yet published
//   POST   /api/drafts                     start a draft for one file -> upload slots
//   PUT    /api/drafts/:id/files/:slot     stream one file (original, w320.., poster, frame0..5) into R2
//   PATCH  /api/drafts/:id                 edit text fields
//   POST   /api/drafts/:id/ai              AI suggestion (project, fields, alt text); fills empty fields only
//   DELETE /api/drafts/:id                 discard a draft and its files
//   GET    /api/project-drafts             project descriptions written in the Studio
//   PUT    /api/project-drafts/:name       save a project description
//   POST   /api/project-drafts/:name/write AI writes the description from your answers
//   GET    /api/content                    what's live: Sheet1 + projects tab + spacing warnings
//   PATCH  /api/items/:id                  edit a live item's text in Sheet1
//   PUT    /api/projects/:name             edit a live project's description (projects tab)
//   POST   /api/publish                    { draftIds, openerDraftId?, dryRun } -> preview or publish
//                                          openerDraftId: piece to open the site with
//                                          (default: the first draft; null keeps the current opener)

import { checkAccess, refusalMessage } from "./lib/access.js";
import { AiError, QUESTIONS, buildCatalog, createClient, draftMedia, writeDescription } from "./lib/ai.js";
import { triggerSiteDeploy } from "./lib/github.js";
import { chooseWide, missingHeaders, nextItemNumber, rowValues, toRow } from "./lib/rows.js";
import { planSequence, spacingWarnings } from "./lib/sequence.js";
import { createSheetsClient } from "./lib/sheets.js";

const MB = 1024 * 1024;

// What may be uploaded into each slot.
const SLOTS = {
  image: {
    original: { types: ["image/webp"], max: 30 * MB, suffix: "" },
    w320: { types: ["image/webp"], max: 5 * MB, suffix: "-320" },
    w640: { types: ["image/webp"], max: 5 * MB, suffix: "-640" },
    w960: { types: ["image/webp"], max: 10 * MB, suffix: "-960" },
    w1600: { types: ["image/webp"], max: 15 * MB, suffix: "-1600" }
  },
  video: {
    original: { types: ["video/mp4"], max: 100 * MB, suffix: "" },
    poster: { types: ["image/webp", "image/jpeg"], max: 5 * MB, suffix: "-poster" },
    ...Object.fromEntries(
      [0, 1, 2, 3, 4, 5].map((n) => [`frame${n}`, { types: ["image/webp", "image/jpeg"], max: 2 * MB, suffix: `-frame${n}` }])
    )
  }
};

const EXTENSIONS = { "image/webp": "webp", "image/jpeg": "jpg", "video/mp4": "mp4" };
const DRAFT_TEXT_FIELDS = ["project", "client", "category", "discipline", "alt"];
// Live-item fields the Studio may edit (sheet column names).
const ITEM_TEXT_FIELDS = ["alt", "data-project", "data-client", "data-category", "data-discipline"];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
}

function slug(fileName) {
  return (
    String(fileName)
      .replace(/\.[^.]+$/, "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "file"
  );
}

function nowIso() {
  return new Date().toISOString();
}

function parseDraft(row) {
  if (!row) return null;
  return {
    ...row,
    variants: row.variants ? JSON.parse(row.variants) : {},
    frames: row.frames ? JSON.parse(row.frames) : [],
    ai: row.ai ? JSON.parse(row.ai) : null
  };
}

async function getDraft(env, id) {
  const draft = parseDraft(await env.DB.prepare("SELECT * FROM drafts WHERE id = ?").bind(id).first());
  if (!draft) throw new HttpError(404, "No such draft.");
  return draft;
}

function config(env) {
  return {
    itemsTab: env.SHEET_ITEMS_TAB || "Sheet1",
    projectsTab: env.SHEET_PROJECTS_TAB || "projects",
    mediaBase: String(env.MEDIA_PUBLIC_BASE || "").replace(/\/$/, "")
  };
}

function sheetsFor(env, deps) {
  if (deps.sheets) return deps.sheets;
  if (!env.SHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new HttpError(503, "The Google Sheet connection isn't set up yet (SHEET_ID / GOOGLE_SERVICE_ACCOUNT_JSON).");
  }
  return createSheetsClient({ spreadsheetId: env.SHEET_ID, serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON, fetchImpl: deps.fetch });
}

// ---- drafts ---------------------------------------------------------------

async function createDraft(request, env) {
  const input = await body(request);
  const kind = input.kind;
  if (!SLOTS[kind]) throw new HttpError(400, 'kind must be "image" or "video".');
  const width = Math.round(Number(input.width));
  const height = Math.round(Number(input.height));
  if (!(width > 0 && height > 0)) throw new HttpError(400, "width and height are required.");
  const id = crypto.randomUUID();
  const time = nowIso();
  await env.DB.prepare(
    `INSERT INTO drafts (id, created_at, updated_at, status, kind, file_name, bytes, width, height, duration, variants, frames)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, '{}', '[]')`
  )
    .bind(id, time, time, kind, String(input.fileName || "untitled"), Number(input.bytes) || null, width, height, Number(input.duration) || null)
    .run();
  return json({ draft: await getDraft(env, id), slots: Object.keys(SLOTS[kind]) }, 201);
}

async function uploadFile(request, env, id, slot) {
  const draft = await getDraft(env, id);
  if (draft.status !== "draft") throw new HttpError(409, "This draft is already published.");
  const rule = SLOTS[draft.kind][slot];
  if (!rule) throw new HttpError(400, `Unknown file slot "${slot}" for a ${draft.kind}.`);

  const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim();
  if (!rule.types.includes(type)) throw new HttpError(415, `"${slot}" must be ${rule.types.join(" or ")}.`);
  const length = Number(request.headers.get("Content-Length"));
  if (!(length > 0)) throw new HttpError(411, "Content-Length is required.");
  if (length > rule.max) throw new HttpError(413, `"${slot}" is ${Math.round(length / MB)} MB; the limit is ${rule.max / MB} MB.`);
  if (!request.body) throw new HttpError(400, "Empty upload.");

  const { mediaBase } = config(env);
  const key = `studio/${id}/${slug(draft.file_name)}${rule.suffix}.${EXTENSIONS[type]}`;
  await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  const url = `${mediaBase}/${key}`;

  if (slot === "original") {
    await env.DB.prepare("UPDATE drafts SET src = ?, updated_at = ? WHERE id = ?").bind(url, nowIso(), id).run();
  } else if (slot === "poster") {
    await env.DB.prepare("UPDATE drafts SET poster = ?, updated_at = ? WHERE id = ?").bind(url, nowIso(), id).run();
  } else if (slot.startsWith("w")) {
    const variants = { ...draft.variants, [slot.slice(1)]: url };
    await env.DB.prepare("UPDATE drafts SET variants = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(variants), nowIso(), id).run();
  } else {
    const frames = [...draft.frames];
    frames[Number(slot.slice(5))] = url;
    await env.DB.prepare("UPDATE drafts SET frames = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(frames), nowIso(), id).run();
  }
  return json({ slot, url, draft: await getDraft(env, id) });
}

async function editDraft(request, env, id) {
  const draft = await getDraft(env, id);
  if (draft.status !== "draft") throw new HttpError(409, "This draft is already published; edit it under live content.");
  const input = await body(request);
  const fields = DRAFT_TEXT_FIELDS.filter((field) => field in input);
  if (!fields.length) throw new HttpError(400, `Nothing to change. Editable: ${DRAFT_TEXT_FIELDS.join(", ")}.`);
  const sets = fields.map((field) => `${field} = ?`).join(", ");
  await env.DB.prepare(`UPDATE drafts SET ${sets}, updated_at = ? WHERE id = ?`)
    .bind(...fields.map((field) => String(input[field] ?? "").trim()), nowIso(), id)
    .run();
  return json({ draft: await getDraft(env, id) });
}

async function deleteDraft(env, id) {
  const draft = await getDraft(env, id);
  if (draft.status !== "draft") throw new HttpError(409, "Published items can't be discarded here.");
  const listed = await env.MEDIA.list({ prefix: `studio/${id}/` });
  const keys = listed.objects.map((object) => object.key);
  if (keys.length) await env.MEDIA.delete(keys);
  await env.DB.prepare("DELETE FROM drafts WHERE id = ?").bind(id).run();
  return json({ deleted: id, files: keys.length });
}

async function listDrafts(env) {
  const { results } = await env.DB.prepare("SELECT * FROM drafts WHERE status = 'draft' ORDER BY created_at").all();
  return json({ drafts: results.map(parseDraft) });
}

// ---- project descriptions -------------------------------------------------

async function listProjectDrafts(env) {
  const { results } = await env.DB.prepare("SELECT * FROM project_drafts ORDER BY project").all();
  return json({
    projects: results.map((row) => ({ ...row, answers: row.answers ? JSON.parse(row.answers) : null })),
    questions: QUESTIONS
  });
}

// ---- AI ---------------------------------------------------------------------

function aiFor(env, deps) {
  const client = deps.ai || createClient(env);
  if (!client) throw new HttpError(503, "AI drafts aren't set up yet (ANTHROPIC_API_KEY).");
  return client;
}

async function liveCatalog(env, deps) {
  try {
    const sheets = sheetsFor(env, deps);
    const { itemsTab, projectsTab } = config(env);
    const [items, projects] = await Promise.all([sheets.readTab(itemsTab), sheets.readTab(projectsTab).catch(() => ({ rows: [] }))]);
    return buildCatalog(items.rows, projects.rows);
  } catch {
    return buildCatalog([], []);
  }
}

async function aiDraft(env, deps, id) {
  const draft = await getDraft(env, id);
  if (draft.status !== "draft") throw new HttpError(409, "This draft is already published.");
  const client = aiFor(env, deps);
  const catalog = await liveCatalog(env, deps);
  let suggestion;
  try {
    ({ suggestion } = await draftMedia(client, draft, catalog));
  } catch (error) {
    if (error instanceof AiError) throw new HttpError(502, error.message);
    throw error;
  }
  // Fill only what you haven't typed yourself.
  const fill = {};
  for (const field of ["project", "client", "category", "discipline", "alt"]) {
    const value = String(suggestion[field] || "").trim();
    if (value && !String(draft[field] || "").trim()) fill[field] = value;
  }
  const sets = [...Object.keys(fill).map((field) => `${field} = ?`), "ai = ?", "updated_at = ?"].join(", ");
  await env.DB.prepare(`UPDATE drafts SET ${sets} WHERE id = ?`)
    .bind(...Object.values(fill), JSON.stringify(suggestion), nowIso(), id)
    .run();
  return json({ draft: await getDraft(env, id), suggestion, filled: Object.keys(fill) });
}

async function aiWriteDescription(request, env, deps, name) {
  const input = await body(request);
  const project = String(input.project || decodeURIComponent(name)).trim();
  if (!project) throw new HttpError(400, "project is required.");
  const key = project.toLowerCase();
  const answers = Object.fromEntries(QUESTIONS.map(({ key: q }) => [q, String(input.answers?.[q] || "").trim()]));
  const client = aiFor(env, deps);

  const { results } = await env.DB.prepare("SELECT alt FROM drafts WHERE status = 'draft' AND lower(project) = ?").bind(key).all();
  const catalog = await liveCatalog(env, deps);
  const live = catalog.projects.find((p) => p.project.toLowerCase() === key);
  const alts = [...results.map((row) => row.alt).filter(Boolean), ...(live?.alts || [])];
  // Your own best description is the style reference (Surf Overdose by default).
  const styleExample = catalog.descriptions.get("surf overdose") || undefined;

  let written;
  try {
    written = await writeDescription(client, { project, answers, alts, styleExample });
  } catch (error) {
    if (error instanceof AiError) throw new HttpError(502, error.message);
    throw error;
  }
  await env.DB.prepare(
    `INSERT INTO project_drafts (name, project, description, answers, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET project = excluded.project, description = excluded.description,
       answers = excluded.answers, updated_at = excluded.updated_at`
  )
    .bind(key, project, written.description, JSON.stringify(answers), nowIso())
    .run();
  return json({ project, description: written.description, missing: written.missing });
}

async function saveProjectDraft(request, env, name) {
  const input = await body(request);
  const project = String(input.project || decodeURIComponent(name)).trim();
  if (!project) throw new HttpError(400, "project is required.");
  await env.DB.prepare(
    `INSERT INTO project_drafts (name, project, description, answers, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET project = excluded.project, description = excluded.description,
       answers = excluded.answers, updated_at = excluded.updated_at`
  )
    .bind(project.toLowerCase(), project, String(input.description || "").trim(), input.answers ? JSON.stringify(input.answers) : null, nowIso())
    .run();
  return json({ saved: project });
}

// ---- live content ---------------------------------------------------------

function existingItems(tab) {
  return tab.rows.map((row) => ({
    id: row.id,
    project: row["data-project"] || row.project,
    mediaType: row["data-media-type"] || row.mediaType,
    order: row.order
  }));
}

async function readContent(env, deps) {
  const sheets = sheetsFor(env, deps);
  const { itemsTab, projectsTab } = config(env);
  const [items, projects] = await Promise.all([sheets.readTab(itemsTab), sheets.readTab(projectsTab).catch(() => null)]);
  return json({
    items: items.rows,
    headers: items.headers,
    missingColumns: missingHeaders(items.headers),
    projects: projects ? projects.rows : [],
    spacing: spacingWarnings(existingItems(items))
  });
}

async function editItem(request, env, deps, id) {
  const input = await body(request);
  const sheets = sheetsFor(env, deps);
  const { itemsTab } = config(env);
  const tab = await sheets.readTab(itemsTab);
  const row = tab.rows.find((entry) => entry.id === id);
  if (!row) throw new HttpError(404, `No item "${id}" in ${itemsTab}.`);
  const cells = ITEM_TEXT_FIELDS.filter((field) => field in input).map((field) => {
    const column = tab.headers.indexOf(field);
    if (column === -1) throw new HttpError(409, `${itemsTab} has no "${field}" column.`);
    return { row: row._row, column, value: String(input[field] ?? "").trim() };
  });
  if (!cells.length) throw new HttpError(400, `Nothing to change. Editable: ${ITEM_TEXT_FIELDS.join(", ")}.`);
  await sheets.updateCells(itemsTab, cells);
  return json({ updated: id, fields: cells.length });
}

// Write (or update) project descriptions in the "projects" tab.
async function writeProjectDescriptions(sheets, projectsTab, descriptions) {
  if (!descriptions.length) return [];
  const warnings = [];
  const tab = await sheets.readTab(projectsTab).catch(() => null);
  if (!tab || !tab.headers.includes("project") || !tab.headers.includes("description")) {
    return [`The "${projectsTab}" tab needs "project" and "description" columns; descriptions were not saved there.`];
  }
  const descriptionColumn = tab.headers.indexOf("description");
  const updates = [];
  const appends = [];
  for (const { project, description } of descriptions) {
    if (!description) continue;
    const existing = tab.rows.find((row) => String(row.project).trim().toLowerCase() === project.toLowerCase());
    if (existing) updates.push({ row: existing._row, column: descriptionColumn, value: description });
    else appends.push(toRow({ project, description }, tab.headers));
  }
  await sheets.updateCells(projectsTab, updates);
  await sheets.appendRows(projectsTab, appends);
  return warnings;
}

async function publish(request, env, deps) {
  const input = await body(request);
  const ids = Array.isArray(input.draftIds) ? input.draftIds : [];
  if (!ids.length) throw new HttpError(400, "Choose at least one draft to publish.");

  const placeholders = ids.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT * FROM drafts WHERE status = 'draft' AND id IN (${placeholders}) ORDER BY created_at`
  )
    .bind(...ids)
    .all();
  const drafts = results.map(parseDraft);
  if (drafts.length !== ids.length) throw new HttpError(409, "Some drafts were not found or are already published.");

  const problems = [];
  for (const draft of drafts) {
    if (!draft.src) problems.push(`${draft.file_name}: the file hasn't finished uploading.`);
    if (draft.kind === "image" && Object.keys(draft.variants).length < 4) problems.push(`${draft.file_name}: smaller sizes are missing.`);
    if (!draft.project) problems.push(`${draft.file_name}: choose a project.`);
  }
  if (problems.length) throw new HttpError(422, problems.join(" "));

  const sheets = sheetsFor(env, deps);
  const { itemsTab, projectsTab } = config(env);
  const tab = await sheets.readTab(itemsTab);
  const missing = missingHeaders(tab.headers);
  if (missing.length) {
    throw new HttpError(409, `${itemsTab} is missing column(s): ${missing.join(", ")}. Add them to row 1, then try again.`);
  }

  const first = nextItemNumber(tab.rows.map((row) => row.id));
  const placed = drafts.map((draft, n) => ({ draft, id: `scroll-item-${first + n}` }));
  // Every publish refreshes the opener unless openerDraftId is explicitly null.
  const openerDraftId = input.openerDraftId === undefined ? drafts[0].id : input.openerDraftId;
  const opener = openerDraftId === null ? null : placed.find(({ draft }) => draft.id === openerDraftId);
  if (openerDraftId !== null && !opener) throw new HttpError(400, "The opening piece must be one of the drafts being published.");
  const plan = planSequence(
    existingItems(tab),
    placed.map(({ draft, id }) => ({ id, project: draft.project })),
    { openerId: opener?.id }
  );
  const wide = chooseWide(placed.map(({ draft, id }) => ({ id, kind: draft.kind, width: draft.width, height: draft.height })));
  const warnings = [...plan.warnings];
  for (const { draft } of placed) if (!draft.alt) warnings.push(`${draft.file_name} has no alt text.`);

  const preview = placed.map(({ draft, id }) => ({
    draftId: draft.id,
    id,
    position: plan.sequence.indexOf(id) + 1,
    order: plan.orders[id],
    wide: wide.has(id),
    opener: opener?.id === id
  }));
  if (input.dryRun) return json({ dryRun: true, preview, moved: plan.moved, sequence: plan.sequence, warnings });

  await sheets.appendRows(
    itemsTab,
    placed.map(({ draft, id }) => toRow(rowValues(draft, { id, order: plan.orders[id], wide: wide.has(id) }), tab.headers))
  );
  // The previous opener keeps its row; only its position (order) changes.
  if (plan.moved) {
    const row = tab.rows.find((entry) => entry.id === plan.moved.id);
    if (row) {
      await sheets.updateCells(itemsTab, [{ row: row._row, column: tab.headers.indexOf("order"), value: String(plan.moved.order) }]);
    }
  }

  const time = nowIso();
  for (const { draft, id } of placed) {
    await env.DB.prepare("UPDATE drafts SET status = 'published', sheet_id = ?, published_at = ?, updated_at = ? WHERE id = ?")
      .bind(id, time, time, draft.id)
      .run();
  }

  const projectNames = [...new Set(drafts.map((draft) => draft.project.toLowerCase()))];
  const { results: projectRows } = await env.DB.prepare(
    `SELECT * FROM project_drafts WHERE name IN (${projectNames.map(() => "?").join(", ")})`
  )
    .bind(...projectNames)
    .all();
  warnings.push(...(await writeProjectDescriptions(sheets, projectsTab, projectRows)));

  const deploy = await triggerSiteDeploy(env, deps.fetch);
  if (!deploy.ok) warnings.push(`Published to the sheet, but the site redeploy didn't start: ${deploy.reason}`);
  return json({ published: preview, moved: plan.moved, warnings, deploy });
}

async function editProjectDescription(request, env, deps, name) {
  const input = await body(request);
  const project = String(input.project || name).trim();
  if (!project) throw new HttpError(400, "project is required.");
  const sheets = sheetsFor(env, deps);
  const { projectsTab } = config(env);
  const warnings = await writeProjectDescriptions(sheets, projectsTab, [{ project, description: String(input.description || "").trim() }]);
  if (warnings.length) throw new HttpError(409, warnings.join(" "));
  return json({ updated: project });
}

// ---- router ---------------------------------------------------------------

export async function handle(request, env, deps = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null; // static UI

  const access = await checkAccess(request, env, deps.fetch);
  const user = access.user;
  if (!user) return json({ error: refusalMessage(access), reason: access.reason }, 401);

  const parts = url.pathname.split("/").filter(Boolean).slice(1); // drop "api"
  const method = request.method;
  try {
    if (parts[0] === "me" && method === "GET") return json(user);
    if (parts[0] === "drafts") {
      if (parts.length === 1 && method === "GET") return await listDrafts(env);
      if (parts.length === 1 && method === "POST") return await createDraft(request, env);
      if (parts.length === 2 && method === "PATCH") return await editDraft(request, env, parts[1]);
      if (parts.length === 2 && method === "DELETE") return await deleteDraft(env, parts[1]);
      if (parts.length === 3 && parts[2] === "ai" && method === "POST") return await aiDraft(env, deps, parts[1]);
      if (parts.length === 4 && parts[2] === "files" && method === "PUT") return await uploadFile(request, env, parts[1], parts[3]);
    }
    if (parts[0] === "project-drafts") {
      if (parts.length === 1 && method === "GET") return await listProjectDrafts(env);
      if (parts.length === 2 && method === "PUT") return await saveProjectDraft(request, env, parts[1]);
      if (parts.length === 3 && parts[2] === "write" && method === "POST") return await aiWriteDescription(request, env, deps, parts[1]);
    }
    if (parts[0] === "content" && method === "GET") return await readContent(env, deps);
    if (parts[0] === "items" && parts.length === 2 && method === "PATCH") return await editItem(request, env, deps, decodeURIComponent(parts[1]));
    if (parts[0] === "projects" && parts.length === 2 && method === "PUT") return await editProjectDescription(request, env, deps, decodeURIComponent(parts[1]));
    if (parts[0] === "publish" && method === "POST") return await publish(request, env, deps);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Something went wrong on the Studio server.", detail: String(error.message || error) }, 500);
  }
}
