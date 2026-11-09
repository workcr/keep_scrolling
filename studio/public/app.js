import { classify, processImage, processVideo } from "./media.js";

// ---------------------------------------------------------------- helpers

/** Build DOM safely: text is always inserted as text, never as HTML. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const $ = (selector) => document.querySelector(selector);

async function api(method, path, data) {
  const init = { method, headers: {} };
  if (data !== undefined) {
    init.body = JSON.stringify(data);
    init.headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function uploadBlob(path, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", path);
    request.setRequestHeader("Content-Type", blob.type);
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    request.onload = () => {
      const payload = JSON.parse(request.responseText || "{}");
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else reject(new Error(payload.error || `Upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error("Network error during upload."));
    request.send(blob);
  });
}

function notify(message, kind = "") {
  const box = $("#notice");
  box.textContent = message;
  box.className = `notice ${kind}`;
  box.hidden = !message;
  if (kind === "ok") setTimeout(() => (box.hidden = true), 6000);
}

function debounce(fn, ms = 600) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

// ---------------------------------------------------------------- state

const state = {
  drafts: [],
  projectDrafts: [],
  content: null, // { items, projects, spacing, missingColumns } or null if the sheet isn't connected
  opener: null, // draft id chosen to open the site
  questions: [], // the AI's questions for a project description
  missing: new Map(), // project key -> facts the AI said would strengthen the description
  previews: new Map(), // draft id -> object URL of the local preview
  library: null, // { pieces, total, onSite } from /api/library
  picked: new Set(), // library keys ticked to add
  order: { scope: "scroll", ids: [], dirty: false } // the Order tab's working copy
};

function liveProjects() {
  return state.content?.projects || [];
}

function knownValues(field) {
  const values = new Set();
  for (const item of state.content?.items || []) if (item[field]) values.add(item[field]);
  for (const draft of state.drafts) {
    const value = draft[field.replace(/^data-/, "")];
    if (value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function refreshDatalists() {
  for (const field of ["project", "client", "category", "discipline"]) {
    $(`#dl-${field}`).replaceChildren(...knownValues(`data-${field}`).map((value) => el("option", { value })));
  }
}

// ---------------------------------------------------------------- tabs

for (const button of document.querySelectorAll(".tabs button")) {
  button.addEventListener("click", () => {
    for (const other of document.querySelectorAll(".tabs button")) other.setAttribute("aria-selected", String(other === button));
    $("#tab-new").hidden = button.dataset.tab !== "new";
    $("#tab-live").hidden = button.dataset.tab !== "live";
    $("#tab-library").hidden = button.dataset.tab !== "library";
    $("#tab-order").hidden = button.dataset.tab !== "order";
    if (button.dataset.tab === "order") openOrder();
    if (button.dataset.tab === "live") renderLive();
    if (button.dataset.tab === "library") loadLibrary();
  });
}

// ---------------------------------------------------------------- uploading

const dropzone = $("#dropzone");
dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("over");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("over"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("over");
  addFiles([...event.dataTransfer.files]);
});
$("#file-input").addEventListener("change", (event) => {
  addFiles([...event.target.files]);
  event.target.value = "";
});

let queueRunning = Promise.resolve();

function addFiles(files) {
  for (const file of files) {
    const row = el("li", {}, el("span", {}, file.name, " · ", el("span", { class: "muted step" }, "Waiting")), el("div", { class: "bar" }, el("span")));
    $("#queue").append(row);
    // One file at a time keeps memory use low for big videos.
    queueRunning = queueRunning.then(() => processAndUpload(file, row));
  }
}

async function processAndUpload(file, row) {
  const step = row.querySelector(".step");
  const bar = row.querySelector(".bar span");
  const setStep = (text, progress) => {
    step.textContent = text;
    if (progress !== undefined) bar.style.width = `${Math.round(progress * 100)}%`;
  };
  try {
    const kind = classify(file);
    if (typeof kind !== "string") throw new Error(kind.error);
    const prepared = kind === "image" ? await processImage(file, (text) => setStep(text, 0.1)) : await processVideo(file, (text) => setStep(text, 0.1));

    const { draft } = await api("POST", "/api/drafts", {
      kind,
      fileName: file.name,
      bytes: file.size,
      width: prepared.width,
      height: prepared.height,
      duration: prepared.duration
    });
    state.previews.set(draft.id, URL.createObjectURL(prepared.preview));

    const slots = Object.entries(prepared.files);
    const total = slots.reduce((sum, [, blob]) => sum + blob.size, 0);
    let done = 0;
    for (const [slot, blob] of slots) {
      setStep(`Uploading ${slot === "original" ? "file" : slot}`);
      await uploadBlob(`/api/drafts/${draft.id}/files/${slot}`, blob, (fraction) => {
        bar.style.width = `${Math.round(((done + fraction * blob.size) / total) * 100)}%`;
      });
      done += blob.size;
    }
    setStep(prepared.warnings.length ? `Ready · ${prepared.warnings.join(" ")}` : "Ready", 1);
    await loadDrafts();
    setTimeout(() => row.remove(), prepared.warnings.length ? 15000 : 2500);
  } catch (error) {
    row.className = "error";
    row.replaceChildren(`${file.name}: ${error.message}`);
  }
}

// ---------------------------------------------------------------- drafts

async function loadDrafts() {
  const [{ drafts }, { projects, questions }] = await Promise.all([api("GET", "/api/drafts"), api("GET", "/api/project-drafts")]);
  state.drafts = drafts;
  state.projectDrafts = projects;
  state.questions = questions || [];
  if (state.opener && !drafts.some((d) => d.id === state.opener)) state.opener = null;
  // Uploads refresh the opening piece by default. Library pieces don't pick
  // one by themselves: their order is alphabetical, not a choice.
  if (!state.opener) state.opener = drafts.find((d) => !d.library_key)?.id || null;
  if (!state.opener && drafts.length) $("#keep-opener").checked = true;
  renderDrafts();
}

function thumbFor(draft) {
  const local = state.previews.get(draft.id);
  if (!local && draft.library_key) {
    // Library pieces live on the website (relative "assets/…" paths).
    if (draft.kind === "video") return liveVideoThumb({ "data-media-type": "video", src: draft.src });
    return el("img", { src: absoluteUrl(draft.variants?.["640"] || draft.src), alt: "", loading: "lazy" });
  }
  const src = local || (draft.kind === "video" ? draft.poster : draft.variants?.["640"] || draft.src);
  return src ? el("img", { src, alt: "" }) : el("span", { class: "muted" }, draft.kind);
}

function draftField(draft, field, label, { textarea = false, list } = {}) {
  const save = debounce(async (value) => {
    try {
      await api("PATCH", `/api/drafts/${draft.id}`, { [field]: value });
      draft[field] = value;
      card.querySelector(".saved").textContent = "Saved";
      if (field === "project") {
        refreshDatalists();
        renderProjectTexts();
      }
    } catch (error) {
      notify(error.message, "error");
    }
  });
  const card = document.querySelector(`[data-draft="${draft.id}"]`);
  const input = textarea
    ? el("textarea", { rows: 3 }, draft[field] || "")
    : el("input", { type: "text", value: draft[field] || "", list });
  input.addEventListener("input", () => {
    document.querySelector(`[data-draft="${draft.id}"] .saved`).textContent = "";
    save(input.value.trim());
  });
  return el("label", { class: "field" }, label, input);
}

function renderDrafts() {
  const box = $("#drafts");
  box.replaceChildren();
  $("#drafts-empty").hidden = state.drafts.length > 0;
  $("#ai-bar").hidden = state.drafts.length === 0;
  $("#publish-bar").hidden = state.drafts.length === 0;

  for (const draft of state.drafts) {
    const card = el("article", { class: "card", dataset: { draft: draft.id } });
    box.append(card);
    const size = `${draft.width}×${draft.height}${draft.kind === "video" && draft.duration ? ` · ${Math.round(draft.duration)}s` : ""}`;
    card.append(
      el("div", { class: "thumb" }, thumbFor(draft)),
      el(
        "div",
        { class: "body" },
        el("div", { class: "meta" }, el("span", { class: "name", title: draft.file_name }, draft.file_name), el("span", {}, size)),
        draftField(draft, "project", "Project", { list: "dl-project" }),
        el("div", { class: "row2" }, draftField(draft, "client", "Client", { list: "dl-client" }), draftField(draft, "category", "Category", { list: "dl-category" })),
        draftField(draft, "discipline", "Discipline", { list: "dl-discipline" }),
        draftField(draft, "alt", "Description of what it shows (alt text)", { textarea: true }),
        aiNote(draft),
        el(
          "div",
          { class: "tools" },
          draft.library_key && draft.kind === "video"
            ? el("span", { class: "muted" }, "The AI can't watch videos from the Library: fill this one in by hand.")
            : el("button", { type: "button", class: "pill small", onclick: () => runAi(draft.id).catch(() => {}) }, draft.ai ? "Ask AI again" : "Draft with AI")
        ),
        el(
          "div",
          { class: "foot" },
          el(
            "label",
            { class: "check", title: "The first piece visitors see, before “{ Keep scrolling }”" },
            el("input", {
              type: "radio",
              name: "opener",
              checked: state.opener === draft.id,
              onchange: () => {
                state.opener = draft.id;
                $("#keep-opener").checked = false;
              }
            }),
            "Opening piece"
          ),
          el("span", { class: "saved" }),
          el(
            "button",
            {
              type: "button",
              class: "link",
              onclick: async () => {
                if (!confirm(`Discard ${draft.file_name}? Its uploaded files are deleted.`)) return;
                await api("DELETE", `/api/drafts/${draft.id}`).catch((error) => notify(error.message, "error"));
                await loadDrafts();
              }
            },
            "Discard"
          )
        )
      )
    );
  }
  refreshDatalists();
  renderProjectTexts();
}

function aiNote(draft) {
  if (!draft.ai) return null;
  const { project, project_is_new: isNew, project_reason: reason, confidence } = draft.ai;
  return el(
    "div",
    { class: `ai-note${confidence === "low" ? " low" : ""}` },
    `AI: ${isNew ? "new project" : "fits"} “${project}” (${confidence} confidence). ${reason || ""}`
  );
}

async function runAi(id, { quiet = false } = {}) {
  const card = document.querySelector(`[data-draft="${id}"]`);
  card?.classList.add("busy");
  try {
    const { filled } = await api("POST", `/api/drafts/${id}/ai`);
    if (!quiet) notify(filled.length ? `AI filled: ${filled.join(", ")}. Check it before publishing.` : "AI had nothing to add: all fields were already filled.", "ok");
  } catch (error) {
    notify(error.message, "error");
    throw error;
  } finally {
    card?.classList.remove("busy");
  }
  await loadDrafts();
}

$("#ai-all").addEventListener("click", async () => {
  const button = $("#ai-all");
  button.disabled = true;
  // Only drafts the AI hasn't seen yet; "Ask AI again" on a card redoes one.
  const todo = state.drafts.filter((draft) => !draft.ai && !(draft.library_key && draft.kind === "video"));
  let done = 0;
  let failed = 0;
  try {
    for (const draft of todo) {
      button.textContent = `Drafting ${++done} of ${todo.length}…`;
      try {
        await runAi(draft.id, { quiet: true });
      } catch (error) {
        failed += 1;
        // A bad key or an outage won't fix itself on the next card.
        if (/key|set up|credit|busy/i.test(error.message)) break;
      }
    }
    if (!todo.length) notify("Every draft already has an AI suggestion. Use “Ask AI again” on a card to redo one.", "ok");
    else if (!failed) notify("AI drafts are in. Check every card before publishing.", "ok");
    else notify(`${failed} of ${todo.length} AI drafts didn't work (see the message above). The rest are in.`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Draft all with AI";
  }
});

function renderProjectTexts() {
  const names = [...new Map(state.drafts.filter((d) => d.project).map((d) => [lower(d.project), d.project])).entries()];
  $("#project-texts").hidden = names.length === 0;
  const list = $("#project-text-list");
  list.replaceChildren();
  for (const [key, name] of names) {
    const draftText = state.projectDrafts.find((p) => p.name === key)?.description;
    const liveText = liveProjects().find((p) => lower(p.project) === key)?.description;
    const status = el("span", { class: "saved" });
    const area = el("textarea", { rows: 4, placeholder: "What it is, your role, what it achieved." }, draftText ?? liveText ?? "");
    const answers = {};
    const answerValues = () => Object.fromEntries(Object.entries(answers).map(([k, input]) => [k, input.value.trim()]));
    // Description and answers save as you type, so nothing is lost on re-render.
    const save = debounce(async () => {
      try {
        const payload = { project: name, description: area.value.trim(), answers: answerValues() };
        await api("PUT", `/api/project-drafts/${encodeURIComponent(key)}`, payload);
        const existing = state.projectDrafts.find((p) => p.name === key);
        if (existing) Object.assign(existing, { description: payload.description, answers: payload.answers });
        else state.projectDrafts.push({ name: key, ...payload });
        status.textContent = "Saved";
      } catch (error) {
        notify(error.message, "error");
      }
    });
    area.addEventListener("input", () => {
      status.textContent = "";
      save();
    });
    const isNew = !liveProjects().some((p) => lower(p.project) === key);
    const saved = state.projectDrafts.find((p) => p.name === key)?.answers || {};
    const questions = el(
      "div",
      { class: "questions" },
      state.questions.map((q) => {
        const wide = q.key === "idea" || q.key === "result" || q.key === "credits";
        answers[q.key] = wide ? el("textarea", { rows: 2, placeholder: q.hint }, saved[q.key] || "") : el("input", { type: "text", placeholder: q.hint, value: saved[q.key] || "" });
        answers[q.key].addEventListener("input", () => {
          status.textContent = "";
          save();
        });
        return el("label", { class: `field${wide ? " wide" : ""}` }, q.label, answers[q.key]);
      })
    );
    const missingText = (list) => (list?.length ? `It would be stronger with: ${list.join("; ")}.` : "");
    const missing = el("div", { class: "missing" }, missingText(state.missing.get(key)));
    const write = el(
      "button",
      {
        type: "button",
        class: "pill small",
        onclick: async () => {
          if (area.value.trim() && !confirm("Replace the current description with a new AI draft?")) return;
          write.disabled = true;
          write.textContent = "Writing…";
          try {
            const result = await api("POST", `/api/project-drafts/${encodeURIComponent(key)}/write`, {
              project: name,
              answers: answerValues()
            });
            area.value = result.description;
            status.textContent = "Saved";
            state.missing.set(key, result.missing);
            missing.textContent = missingText(result.missing);
            await loadDrafts();
          } catch (error) {
            notify(error.message, "error");
          } finally {
            write.disabled = false;
            write.textContent = "Write with AI";
          }
        }
      },
      "Write with AI"
    );
    list.append(
      el(
        "div",
        { class: "project" },
        el("strong", {}, name, isNew ? el("span", { class: "muted" }, " · new project") : ""),
        el("span", { class: "muted" }, "Answer what you can; the AI uses only these facts and what the pieces show."),
        questions,
        el("div", { class: "tools" }, write),
        missing,
        area,
        status
      )
    );
  }
}

// ---------------------------------------------------------------- library

async function loadLibrary() {
  $("#library-count").textContent = "Loading…";
  try {
    state.library = await api("GET", "/api/library");
  } catch (error) {
    state.library = null;
    $("#library-count").textContent = "";
    $("#library").replaceChildren(el("p", { class: "muted" }, error.message));
    return;
  }
  const available = new Set(state.library.pieces.filter((p) => !p.inDrafts).map((p) => p.key));
  for (const key of state.picked) if (!available.has(key)) state.picked.delete(key);
  renderLibrary();
}

function selectable(piece) {
  return !piece.inDrafts;
}

function updateLibraryButton() {
  const button = $("#library-add");
  button.disabled = state.picked.size === 0;
  button.textContent = state.picked.size ? `Add ${state.picked.size} to drafts` : "Add to drafts";
  for (const box of document.querySelectorAll("#library input[data-key]")) box.checked = state.picked.has(box.dataset.key);
  for (const box of document.querySelectorAll("#library input[data-group]")) {
    const keys = JSON.parse(box.dataset.group);
    const ticked = keys.filter((key) => state.picked.has(key)).length;
    box.checked = keys.length > 0 && ticked === keys.length;
    box.indeterminate = ticked > 0 && ticked < keys.length;
  }
}

function libraryThumb(piece) {
  if (piece.kind === "video") return liveVideoThumb({ "data-media-type": "video", src: piece.src });
  return liveThumb({ "data-media-type": piece.kind, src: piece.src, srcset: piece.variants?.["320"] ? `${piece.variants["320"]} 320w` : "" });
}

function renderLibrary() {
  const { pieces, total, onSite } = state.library;
  $("#library-count").textContent = pieces.length
    ? `${pieces.length} of ${total} pieces in the assets folder aren't on the site (${onSite} are).`
    : `All ${total} pieces in the assets folder are on the site.`;
  const groups = new Map();
  // Suggested pieces first within each project.
  const ordered = [...pieces].sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
  for (const piece of ordered) {
    const name = piece.project || "No project yet";
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(piece);
  }
  const box = $("#library");
  box.replaceChildren();
  for (const [name, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // "Select the group" leaves out duplicates of videos already on the site.
    const groupKeys = list.filter((p) => selectable(p) && !p.alreadyOnSite).map((p) => p.key);
    box.append(
      el(
        "section",
        { class: "library-group" },
        el(
          "h2",
          {},
          el("label", { class: "check" }, el("input", {
            type: "checkbox",
            disabled: groupKeys.length === 0,
            dataset: { group: JSON.stringify(groupKeys) },
            onchange: (event) => {
              for (const key of groupKeys) event.target.checked ? state.picked.add(key) : state.picked.delete(key);
              updateLibraryButton();
            }
          }), name),
          el("span", { class: "muted" }, ` ${list.length}`)
        ),
        el(
          "div",
          { class: "library-grid" },
          list.map((piece) =>
            el(
              "label",
              { class: `library-piece${piece.inDrafts ? " done" : ""}`, title: piece.src.split("/").pop() },
              el("div", { class: "library-thumb" }, libraryThumb(piece)),
              el(
                "span",
                { class: "library-name" },
                el("input", {
                  type: "checkbox",
                  disabled: !selectable(piece),
                  dataset: { key: piece.key },
                  onchange: (event) => {
                    event.target.checked ? state.picked.add(piece.key) : state.picked.delete(piece.key);
                    updateLibraryButton();
                  }
                }),
                `${piece.suggested ? "★ " : ""}${piece.key}`
              ),
              el(
                "span",
                { class: "muted small" },
                `${piece.kind} · ${piece.width}×${piece.height}`,
                piece.inDrafts ? " · in drafts" : "",
                piece.alreadyOnSite ? ` · already on the site as ${piece.alreadyOnSite}` : ""
              )
            )
          )
        )
      )
    );
  }
  updateLibraryButton();
}

$("#library-suggested").addEventListener("click", () => {
  for (const piece of state.library?.pieces || []) if (selectable(piece) && piece.suggested) state.picked.add(piece.key);
  updateLibraryButton();
});

$("#library-none").addEventListener("click", () => {
  state.picked.clear();
  updateLibraryButton();
});

$("#library-add").addEventListener("click", async () => {
  const button = $("#library-add");
  button.disabled = true;
  try {
    const { added } = await api("POST", "/api/library/add", { keys: [...state.picked] });
    state.picked.clear();
    await loadDrafts();
    notify(`Added ${added} piece${added === 1 ? "" : "s"} to drafts. Next: “Draft all with AI”, check the cards, then Publish.`, "ok");
    document.querySelector('.tabs button[data-tab="new"]').click();
  } catch (error) {
    notify(error.message, "error");
    updateLibraryButton();
  }
});

// ---------------------------------------------------------------- order

// Same rules as the website (src/order.js): "order" for the home scroll and
// gallery, "project-order" for a project page.
function sortKey(item) {
  const order = Number.parseFloat(item.order);
  if (Number.isFinite(order)) return order;
  const match = String(item.id || "").match(/(?:^|-)item-(\d+)$/i);
  return (match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER / 10) * 10;
}

function compareForProject(a, b) {
  const position = (item) => {
    const value = Number.parseFloat(item["project-order"]);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  };
  const pa = position(a);
  const pb = position(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  return sortKey(a) - sortKey(b);
}

const isTextItem = (item) => String(item["data-media-type"]).toLowerCase() === "text";

function orderItems() {
  return new Map((state.content?.items || []).map((item) => [item.id, item]));
}

function orderProjects() {
  const names = new Map();
  for (const item of state.content?.items || []) {
    const name = String(item["data-project"] || "").trim();
    if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

function openOrder() {
  if (state.order.dirty) return renderOrder();
  if (!state.content) {
    $("#order-grid").replaceChildren(el("p", { class: "muted" }, "The Google Sheet isn't connected, so there's nothing to order yet."));
    return;
  }
  const select = $("#order-scope");
  const current = state.order.scope;
  select.replaceChildren(
    el("option", { value: "scroll" }, "Home & gallery"),
    el("optgroup", { label: "Project pages" }, orderProjects().map((name) => el("option", { value: `project:${name}` }, name)))
  );
  select.value = [...select.options].some((o) => o.value === current) ? current : "scroll";
  loadOrder(select.value);
}

function loadOrder(scope) {
  const items = state.content?.items || [];
  state.order.scope = scope;
  if (scope === "scroll") {
    state.order.ids = [...items].sort((a, b) => sortKey(a) - sortKey(b)).map((item) => item.id);
  } else {
    const key = scope.slice("project:".length).toLowerCase();
    state.order.ids = items
      .filter((item) => String(item["data-project"] || "").trim().toLowerCase() === key)
      .sort(compareForProject)
      .map((item) => item.id);
  }
  state.order.dirty = false;
  renderOrder();
}

function setOrderDirty(dirty) {
  state.order.dirty = dirty;
  $("#order-save").disabled = !dirty;
  $("#order-undo").disabled = !dirty;
  $("#order-status").textContent = dirty ? "Not saved yet." : "";
}

// Move one piece to a new index. The text card always stays second.
function moveOrder(id, toIndex) {
  const ids = state.order.ids.filter((other) => other !== id);
  ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, id);
  if (state.order.scope === "scroll") {
    const items = orderItems();
    const text = ids.find((other) => items.get(other) && isTextItem(items.get(other)));
    if (text && ids.indexOf(text) !== 1) {
      ids.splice(ids.indexOf(text), 1);
      ids.splice(1, 0, text);
    }
  }
  state.order.ids = ids;
  setOrderDirty(true);
  arrangeOrder();
}

// Move the existing cards instead of rebuilding them, so thumbnails and
// videos don't reload on every drag.
function arrangeOrder() {
  const grid = $("#order-grid");
  const cards = new Map([...grid.children].map((card) => [card.dataset.id, card]));
  state.order.ids.forEach((id, index) => {
    const card = cards.get(id);
    if (!card) return;
    grid.append(card);
    card.querySelector(".order-pos").textContent = String(index + 1);
    const tag = card.querySelector(".order-tag");
    if (tag) tag.hidden = index !== 0;
  });
}

let draggedId = null;

function orderCard(item, index) {
  const scroll = state.order.scope === "scroll";
  const locked = scroll && isTextItem(item);
  const card = el("div", {
    class: `order-card${locked ? " locked" : ""}${String(item.class || "").includes("2col") ? " wide" : ""}`,
    draggable: locked ? "false" : "true",
    dataset: { id: item.id },
    title: locked ? "“{ Keep scrolling }” always comes second." : "Drag to move"
  });
  const position = el(
    "button",
    {
      type: "button",
      class: "order-pos",
      title: "Move to a position",
      disabled: locked,
      onclick: () => {
        const answer = prompt(`Move ${item.id} to position (1–${state.order.ids.length}):`, String(state.order.ids.indexOf(item.id) + 1));
        const to = Number.parseInt(answer, 10);
        if (Number.isFinite(to)) moveOrder(item.id, to - 1);
      }
    },
    String(index + 1)
  );
  const thumb = locked
    ? el("div", { class: "vid" }, item.content || "{ Keep scrolling }")
    : liveVideoThumb(item) || liveThumb(item) || el("div", { class: "vid" }, item["data-media-type"] || "media");
  card.append(
    el("div", { class: "order-thumb" }, thumb, position),
    el("div", { class: "order-label" }, scroll ? item["data-project"] || "—" : "", el("span", { class: "muted" }, ` ${item.id}`))
  );
  if (scroll) card.append(el("div", { class: "order-tag", hidden: index !== 0 }, "Opening piece"));
  if (!locked) {
    card.addEventListener("dragstart", (event) => {
      draggedId = item.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
      requestAnimationFrame(() => card.classList.add("dragging"));
    });
    card.addEventListener("dragend", () => {
      draggedId = null;
      card.classList.remove("dragging");
      for (const other of document.querySelectorAll(".order-card.before, .order-card.after")) other.classList.remove("before", "after");
    });
  }
  card.addEventListener("dragover", (event) => {
    if (!draggedId || draggedId === item.id) return;
    event.preventDefault();
    const box = card.getBoundingClientRect();
    const after = event.clientX > box.left + box.width / 2;
    card.classList.toggle("after", after);
    card.classList.toggle("before", !after);
  });
  card.addEventListener("dragleave", () => card.classList.remove("before", "after"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    const after = card.classList.contains("after");
    card.classList.remove("before", "after");
    if (!draggedId || draggedId === item.id) return;
    const target = state.order.ids.filter((other) => other !== draggedId).indexOf(item.id);
    moveOrder(draggedId, target + (after ? 1 : 0));
  });
  return card;
}

function renderOrder() {
  const items = orderItems();
  const scroll = state.order.scope === "scroll";
  $("#order-help").textContent = scroll
    ? "The home page and the gallery, in this order. Drag a piece to move it, or click its number to type a position. Whatever is first is the opening piece; “{ Keep scrolling }” always stays second. Saving tells you if pieces of one project end up too close together."
    : "This project's own page, in this order (first piece first). It doesn't change the home page. Pieces you publish later appear at the end until you place them.";
  $("#order-grid").replaceChildren(...state.order.ids.map((id, index) => (items.get(id) ? orderCard(items.get(id), index) : null)));
  setOrderDirty(state.order.dirty);
}

$("#order-scope").addEventListener("change", (event) => {
  if (state.order.dirty && !confirm("Discard the order you haven't saved?")) {
    event.target.value = state.order.scope;
    return;
  }
  loadOrder(event.target.value);
});

$("#order-undo").addEventListener("click", () => loadOrder(state.order.scope));

$("#order-save").addEventListener("click", async () => {
  const button = $("#order-save");
  button.disabled = true;
  $("#order-status").textContent = "Saving…";
  const scope = state.order.scope;
  const payload = scope === "scroll"
    ? { scope: "scroll", ids: state.order.ids }
    : { scope: "project", project: scope.slice("project:".length), ids: state.order.ids };
  try {
    const result = await api("PUT", "/api/order", payload);
    state.order.dirty = false;
    const close = result.spacing?.length
      ? ` ${result.spacing.length} pair${result.spacing.length === 1 ? "" : "s"} of pieces from the same project are under 3 apart: ${result.spacing
          .slice(0, 6)
          .map((w) => `${w.a} & ${w.b} (${w.project})`)
          .join(", ")}${result.spacing.length > 6 ? "…" : ""}.`
      : "";
    notify(`Order saved; visitors see it on their next visit.${close} Click “Refresh site for search engines” under Live content when you're done.`, close ? "error" : "ok");
    await loadContent();
  } catch (error) {
    notify(error.message, "error");
    setOrderDirty(true);
  }
});

window.addEventListener("beforeunload", (event) => {
  if (state.order.dirty) event.preventDefault();
});

// ---------------------------------------------------------------- preview & publish

function absoluteUrl(src) {
  const absolute = /^https?:/i.test(src) ? src : `https://keep-scrolling.com/${String(src).replace(/^\/+/, "")}`;
  try {
    return encodeURI(decodeURI(absolute));
  } catch {
    return encodeURI(absolute);
  }
}

// Smallest listed version first; if a row points at a version that doesn't
// exist, fall back to the full image, and if that fails too, show a label.
function liveThumb(item) {
  const isImage = ["image", "gif"].includes(String(item["data-media-type"]).toLowerCase());
  const candidates = [String(item.srcset || "").split(",")[0]?.trim().split(/\s+/)[0], isImage ? item.src : ""]
    .filter(Boolean)
    .map(absoluteUrl);
  if (!candidates.length) return null;
  let index = 0;
  const img = el("img", { src: candidates[0], alt: "", loading: "lazy" });
  img.addEventListener("error", () => {
    index += 1;
    if (index < candidates.length) img.src = candidates[index];
    else img.replaceWith(el("div", { class: "vid" }, item["data-media-type"] || "media"));
  });
  return img;
}

// First frame of a video, loaded only once it scrolls into view.
const videoObserver =
  typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const video = entry.target;
            videoObserver.unobserve(video);
            video.preload = "metadata";
            video.src = `${video.dataset.src}#t=0.5`;
          }
        },
        { rootMargin: "300px" }
      );

function liveVideoThumb(item) {
  if (String(item["data-media-type"]).toLowerCase() !== "video" || !item.src) return null;
  const video = el("video", { muted: true, playsinline: true, preload: "none", dataset: { src: absoluteUrl(item.src) } });
  video.muted = true;
  video.addEventListener("error", () => video.replaceWith(el("div", { class: "vid" }, "video")), { once: true });
  if (videoObserver) videoObserver.observe(video);
  else video.src = video.dataset.src;
  return video;
}

function publishBody(dryRun) {
  return {
    draftIds: state.drafts.map((draft) => draft.id),
    openerDraftId: $("#keep-opener").checked ? null : state.opener,
    dryRun
  };
}

$("#preview-btn").addEventListener("click", async () => {
  const box = $("#preview");
  box.hidden = false;
  box.replaceChildren(el("p", { class: "muted" }, "Working out the order…"));
  try {
    const result = await api("POST", "/api/publish", publishBody(true));
    const live = new Map((state.content?.items || []).map((item) => [item.id, item]));
    const fresh = new Map(result.preview.map((p) => [p.id, state.drafts.find((d) => d.id === p.draftId)]));
    const tiles = result.sequence.map((id, index) => {
      const draft = fresh.get(id);
      if (draft) return el("div", { class: "tile new", title: draft.file_name }, thumbFor(draft), el("span", { class: "n" }, index + 1), el("span", { class: "label" }, draft.project));
      const item = live.get(id) || {};
      if (item["data-media-type"] === "text") return el("div", { class: "tile text" }, el("span", { class: "n" }, index + 1), item.content || id);
      return el("div", { class: "tile", title: `${id} · ${item["data-project"] || ""}` }, liveThumb(item), el("span", { class: "n" }, index + 1), el("span", { class: "label" }, item["data-project"] || id));
    });
    box.replaceChildren(
      el("p", {}, `New pieces are outlined in red. ${result.moved ? `The current opener (${result.moved.id}) moves to position ${result.sequence.indexOf(result.moved.id) + 1}.` : ""}`),
      el("div", { class: "strip" }, tiles),
      ...(result.warnings.length ? [el("ul", { class: "warnings" }, result.warnings.map((w) => el("li", {}, w)))] : [])
    );
  } catch (error) {
    box.replaceChildren(el("p", { class: "notice error" }, error.message));
  }
});

$("#publish-btn").addEventListener("click", async () => {
  const count = state.drafts.length;
  if (!confirm(`Publish ${count} piece${count === 1 ? "" : "s"} to keep-scrolling.com?`)) return;
  const button = $("#publish-btn");
  button.disabled = true;
  try {
    const result = await api("POST", "/api/publish", publishBody(false));
    notify(
      `Published ${result.published.length} piece${result.published.length === 1 ? "" : "s"}. ` +
        `Visitors see them now; search engines after the site finishes redeploying (a few minutes).` +
        (result.warnings.length ? ` Note: ${result.warnings.join(" ")}` : ""),
      result.deploy?.ok ? "ok" : ""
    );
    $("#preview").hidden = true;
    state.drafts = [];
    renderDrafts();
    for (const url of state.previews.values()) URL.revokeObjectURL(url);
    state.previews.clear();
    await Promise.all([loadDrafts(), loadContent()]);
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

// ---------------------------------------------------------------- live content

async function loadContent() {
  try {
    state.content = await api("GET", "/api/content");
    if (state.content.missingColumns.length) {
      notify(`Your sheet needs these column(s) in row 1 of Sheet1 before publishing: ${state.content.missingColumns.join(", ")}.`, "error");
    }
  } catch (error) {
    state.content = null;
    // While setup is incomplete, the checklist banner already explains this.
    if (!state.setupIncomplete) notify(`Can't read the Google Sheet yet: ${error.message}`, "error");
  }
  refreshDatalists();
  renderProjectTexts();
  if (!$("#tab-live").hidden) renderLive();
  if (!$("#tab-order").hidden && !state.order.dirty) openOrder();
}

function liveSaveButton(onSave) {
  const status = el("span", { class: "saved" });
  const button = el(
    "button",
    {
      type: "button",
      class: "pill",
      onclick: async () => {
        button.disabled = true;
        try {
          await onSave();
          status.textContent = "Saved";
        } catch (error) {
          notify(error.message, "error");
        } finally {
          button.disabled = false;
        }
      }
    },
    "Save"
  );
  return el("div", {}, button, el("div", {}, status));
}

async function runRespace(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const plan = await api("POST", "/api/respace", { dryRun: true });
    if (!plan.moves.length) {
      notify("Nothing to move: no pieces sit too close to their project.", "ok");
      return;
    }
    const list = plan.moves.map((m) => `• ${m.id} (${m.project}): position ${m.from} → ${m.to}`).join("\n");
    if (!confirm(`Re-space will move ${plan.moves.length} piece${plan.moves.length === 1 ? "" : "s"}:\n\n${list}\n\nNothing else changes. Continue?`)) return;
    const result = await api("POST", "/api/respace", {});
    notify(
      `Moved ${result.moves.length} piece${result.moves.length === 1 ? "" : "s"}. Visitors see the new order now.` +
        (result.deploy?.ok ? " Search engines follow in a few minutes." : ` The search-engine refresh didn't start: ${result.deploy?.reason}`),
      result.deploy?.ok ? "ok" : ""
    );
    await loadContent();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function deleteLive(kind, name, what) {
  if (!confirm(`Delete ${what}? This removes its row from the sheet. (Google Sheets keeps a version history if you need it back.)`)) return;
  try {
    await api("DELETE", `/api/${kind}/${encodeURIComponent(name)}`);
    notify(`Deleted ${name}. Visitors see the change now; click “Refresh site for search engines” when you're done editing.`, "ok");
    await loadContent();
  } catch (error) {
    notify(error.message, "error");
  }
}

async function renameProject(name) {
  const to = prompt(
    `Rename “${name}” to:\n\nEvery piece, its description and any drafts move to the new name. Its page gets a new address, and the old one keeps working by sending visitors and search engines to the new page.`,
    name
  );
  if (to === null || to.trim() === "" || to.trim() === name) return;
  try {
    const result = await api("POST", `/api/projects/${encodeURIComponent(name)}/rename`, { to: to.trim() });
    notify(
      `Renamed “${name}” to “${result.renamed.to}” on ${result.pieces} piece${result.pieces === 1 ? "" : "s"}. Visitors see it now; the search-engine pages and the redirect from the old address update in a few minutes.` +
        (result.warnings.length ? ` ${result.warnings.join(" ")}` : ""),
      result.warnings.length ? "error" : "ok"
    );
    await Promise.all([loadContent(), loadDrafts()]);
  } catch (error) {
    notify(error.message, "error");
  }
}

function renderLive() {
  const content = state.content;
  if (!content) {
    $("#live-items").replaceChildren(el("p", { class: "muted" }, "The Google Sheet isn't connected yet."));
    return;
  }
  const spacing = $("#spacing");
  spacing.hidden = content.spacing.length === 0;
  const pairs = content.spacing.length;
  spacing.replaceChildren(
    el(
      "details",
      {},
      el("summary", {}, `${pairs} pair${pairs === 1 ? "" : "s"} of pieces from the same project sit within 2 positions of each other. Show`),
      el("ul", {}, content.spacing.map((w) => el("li", {}, `${w.a} & ${w.b}: ${w.project}, ${w.gap} apart`))),
      el("p", {}, "Re-space moves only pieces that sit too close (you see the full list before anything changes) to the spot furthest from the rest of their project. Everything else, the opening piece and “{ Keep scrolling }” stay put. New work is spaced automatically when you publish.")
    ),
    el("button", { type: "button", class: "pill small", onclick: runRespace }, "Re-space")
  );

  const ignored = $("#ignored");
  const blank = content.ignoredRows || [];
  ignored.hidden = blank.length === 0;
  ignored.replaceChildren(
    `${blank.length} row${blank.length === 1 ? "" : "s"} in the sheet ${blank.length === 1 ? "has" : "have"} no id, so ${blank.length === 1 ? "it isn't" : "they aren't"} shown or used: row${blank.length === 1 ? "" : "s"} ` +
      blank.map((r) => r.row + (r.filled.length ? ` (has: ${r.filled.join(", ")})` : "")).join(", ") +
      ". You can delete them in the sheet."
  );

  $("#live-projects").replaceChildren(
    ...content.projects.map((project) => {
      const area = el("textarea", { rows: 4 }, project.description || "");
      return el(
        "div",
        { class: "project" },
        el("strong", {}, project.project, project.notInTab ? el("span", { class: "muted" }, " · no description yet") : null),
        area,
        el(
          "div",
          {},
          liveSaveButton(async () => {
            await api("PUT", `/api/projects/${encodeURIComponent(project.project)}`, { project: project.project, description: area.value.trim() });
            project.description = area.value.trim();
          }),
          el("button", { type: "button", class: "link", onclick: () => renameProject(project.project) }, "Rename"),
          el("button", { type: "button", class: "link", onclick: () => deleteLive("projects", project.project, `the project “${project.project}” and its description`) }, "Delete")
        )
      );
    })
  );

  const query = lower($("#live-search").value);
  const items = content.items.filter((item) => item["data-media-type"] !== "text" && (!query || lower(Object.values(item).join(" ")).includes(query)));
  $("#live-count").textContent = `${items.length} of ${content.items.filter((i) => i["data-media-type"] !== "text").length} pieces`;
  $("#live-items").replaceChildren(
    ...items.map((item) => {
      const inputs = {};
      const field = (name, label, attrs = {}) => {
        inputs[name] = attrs.textarea ? el("textarea", { rows: 2 }, item[name] || "") : el("input", { type: "text", value: item[name] || "", list: attrs.list });
        return el("label", { class: `field${attrs.textarea ? " wide" : ""}` }, label, inputs[name]);
      };
      return el(
        "div",
        { class: "item" },
        liveThumb(item) || liveVideoThumb(item) || el("div", { class: "vid" }, item["data-media-type"] || "media"),
        el(
          "div",
          {},
          el("div", { class: "id" }, `${item.id} · ${item["data-media-type"] || ""}`),
          el(
            "div",
            { class: "grid" },
            field("data-project", "Project", { list: "dl-project" }),
            field("data-client", "Client", { list: "dl-client" }),
            field("data-category", "Category", { list: "dl-category" }),
            field("data-discipline", "Discipline", { list: "dl-discipline" }),
            field("alt", "Alt text", { textarea: true })
          )
        ),
        liveSaveButton(async () => {
          const changes = {};
          for (const [name, input] of Object.entries(inputs)) {
            if (input.value.trim() !== (item[name] || "")) changes[name] = input.value.trim();
          }
          if (!Object.keys(changes).length) return;
          await api("PATCH", `/api/items/${encodeURIComponent(item.id)}`, changes);
          Object.assign(item, changes);
        }),
        el("button", { type: "button", class: "link", onclick: () => deleteLive("items", item.id, `${item.id} from the site (its file stays in storage)`) }, "Delete")
      );
    })
  );
}

$("#live-search").addEventListener("input", debounce(renderLive, 200));

$("#refresh-site").addEventListener("click", async () => {
  const button = $("#refresh-site");
  button.disabled = true;
  try {
    await api("POST", "/api/deploy");
    notify("Site refresh started. Search engines see your latest edits in a few minutes (GitHub → Actions shows progress).", "ok");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$("#fill-alts").addEventListener("click", async () => {
  const button = $("#fill-alts");
  if (!confirm("Write the prepared descriptions into every row that still says “needs a description”? Text you typed yourself is kept.")) return;
  button.disabled = true;
  try {
    const result = await api("POST", "/api/items/fill-alts");
    notify(
      `Filled ${result.filled} description${result.filled === 1 ? "" : "s"} in the sheet.` +
        (result.remaining.length ? ` Still missing (write these by hand): ${result.remaining.join(", ")}.` : "") +
        " Click “Refresh site for search engines” when you're done editing.",
      "ok"
    );
    await loadContent();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

// ---------------------------------------------------------------- start

(async () => {
  try {
    const me = await api("GET", "/api/me");
    $("#who").textContent = me.email;
    const status = await api("GET", "/api/status");
    state.setupIncomplete = !status.ready;
    if (!status.ready) {
      notify(
        `Setup isn't finished. Add these in Cloudflare → keep-scrolling-studio → Settings → Variables and Secrets (type: Secret): ` +
          status.missing.map((m) => `${m.secret} (for ${m.needed})`).join("; ") + ".",
        "error"
      );
    }
  } catch (error) {
    notify(error.message, "error");
    return;
  }
  await Promise.all([loadDrafts().catch((error) => notify(error.message, "error")), loadContent()]);
})();
