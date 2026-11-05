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
  previews: new Map() // draft id -> object URL of the local preview
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
    if (button.dataset.tab === "live") renderLive();
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
  if (!state.opener && drafts.length) state.opener = drafts[0].id;
  renderDrafts();
}

function thumbFor(draft) {
  const local = state.previews.get(draft.id);
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
          el("button", { type: "button", class: "pill small", onclick: () => runAi(draft.id) }, draft.ai ? "Ask AI again" : "Draft with AI")
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
              onchange: () => (state.opener = draft.id)
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
  let done = 0;
  try {
    for (const draft of state.drafts) {
      button.textContent = `Drafting ${++done} of ${state.drafts.length}…`;
      await runAi(draft.id, { quiet: true });
    }
    notify("AI drafts are in. Check every card before publishing.", "ok");
  } catch {
    // runAi already showed the error
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

function renderLive() {
  const content = state.content;
  if (!content) {
    $("#live-items").replaceChildren(el("p", { class: "muted" }, "The Google Sheet isn't connected yet."));
    return;
  }
  const spacing = $("#spacing");
  spacing.hidden = content.spacing.length === 0;
  spacing.replaceChildren(
    `Pieces from the same project sitting close together: `,
    content.spacing.map((w) => `${w.a} & ${w.b} (${w.project}, ${w.gap} apart)`).join("; "),
    ". Change their order numbers in the sheet to spread them out."
  );

  $("#live-projects").replaceChildren(
    ...content.projects.map((project) => {
      const area = el("textarea", { rows: 4 }, project.description || "");
      return el(
        "div",
        { class: "project" },
        el("strong", {}, project.project),
        area,
        liveSaveButton(async () => {
          await api("PUT", `/api/projects/${encodeURIComponent(project.project)}`, { project: project.project, description: area.value.trim() });
          project.description = area.value.trim();
        })
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
        liveThumb(item) || el("div", { class: "vid" }, item["data-media-type"] || "media"),
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
        })
      );
    })
  );
}

$("#live-search").addEventListener("input", debounce(renderLive, 200));

$("#fill-alts").addEventListener("click", async () => {
  const button = $("#fill-alts");
  if (!confirm("Write the prepared descriptions into every row that still says “needs a description”? Text you typed yourself is kept.")) return;
  button.disabled = true;
  try {
    const result = await api("POST", "/api/items/fill-alts");
    notify(
      `Filled ${result.filled} description${result.filled === 1 ? "" : "s"} in the sheet.` +
        (result.remaining.length ? ` Still missing (write these by hand): ${result.remaining.join(", ")}.` : ""),
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
