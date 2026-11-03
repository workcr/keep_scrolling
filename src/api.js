import localScrollItems from "./data/scroll-items.json";
import { csvToObjects } from "./csv";
import { titleCase } from "./site";

const DEFAULT_API_BASE = "https://api.sheety.co/55ad31708c31d543a624b88053f567d9/backend/";
const DEFAULT_ITEMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1XQQqzopAlJpwbAhBulpXUH28aUlIqdj_yXO8YWn1S0E/export?format=csv&gid=0";
const configuredBase = String(import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).trim();
const API_BASE = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;
const ITEMS_CSV_URL = String(import.meta.env.VITE_ITEMS_CSV_URL || DEFAULT_ITEMS_CSV_URL).trim();
const REQUEST_TIMEOUT_MS = 8000;

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

const PLACEHOLDER_ALT = /needs a description/i;

// Many sheet rows still carry "This image needs a description." as alt text.
// That is worse than nothing for screen readers and image search, so derive a
// short factual label from the row until a real description is written.
function describeMedia(alt, { mediaType, project, client }) {
  const text = String(alt || "").trim();
  if (text && !PLACEHOLDER_ALT.test(text)) return text;
  if (!project) return "";
  const kind = String(mediaType || "").toLowerCase() === "video" ? "Video" : "Image";
  const byClient = client && String(client).toLowerCase() !== String(project).toLowerCase()
    ? ` for ${titleCase(client)}`
    : "";
  return `${kind} from the ${titleCase(project)} project${byClient}`;
}

function normalizeItem(item) {
  const mediaType = pick(item["data-media-type"], item.mediaType);
  const client = pick(item.client, item["data-client"]);
  const project = pick(item.project, item["data-project"]);
  const category = pick(item.category, item["data-category"]);
  const discipline = pick(item.discipline, item["data-discipline"]);

  return {
    ...item,
    alt: describeMedia(item.alt, { mediaType, project, client }),
    mediaType,
    client,
    project,
    category,
    discipline,
    "data-media-type": mediaType,
    "data-aspect-ratio": pick(item["data-aspect-ratio"], item.aspectRatio),
    "data-orientation": pick(item["data-orientation"], item.orientation),
    "data-width": pick(item["data-width"], item.width),
    "data-height": pick(item["data-height"], item.height),
    "data-maxWidth": pick(item["data-maxWidth"], item.maxWidth),
    "data-maxHeight": pick(item["data-maxHeight"], item.maxHeight)
  };
}

function itemSequence(item) {
  const match = String(item.id || "").match(/(?:^|-)item-(\d+)$/i);
  if (match) return Number.parseInt(match[1], 10);

  const numeric = Number.parseInt(item.id, 10);
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function sortItemsBySequence(items) {
  return [...items].sort((a, b) => itemSequence(a) - itemSequence(b));
}

function fallbackItems() {
  return sortItemsBySequence(localScrollItems || [])
    .map(normalizeItem)
    .filter((item) => String(item.mediaType || item["data-media-type"] || "").toLowerCase() !== "text");
}

function fallbackHomeItems() {
  return sortItemsBySequence(localScrollItems || []).map(normalizeItem);
}

function fallbackProjectsFromItems(items) {
  const map = new Map();
  for (const item of items) {
    const projectName = String(item.project || "").trim();
    if (!projectName) continue;
    if (!map.has(projectName.toLowerCase())) {
      map.set(projectName.toLowerCase(), { project: projectName, description: "" });
    }
  }
  return Array.from(map.values());
}

async function fetchJsonWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// Every route loader needs the same sheet. Without a cache, navigating
// Home -> Gallery -> Project re-downloaded the whole CSV each time and blocked
// the navigation on it. Keep one in-flight/settled promise per page session and
// drop it on failure so the next navigation retries.
let sheetItemsPromise;

function fetchSheetItems() {
  if (!sheetItemsPromise) {
    sheetItemsPromise = fetchTextWithTimeout(ITEMS_CSV_URL)
      .then((text) =>
        csvToObjects(text)
          .map(normalizeItem)
          .sort((a, b) => itemSequence(a) - itemSequence(b))
      )
      .catch((error) => {
        sheetItemsPromise = undefined;
        throw error;
      });
  }
  return sheetItemsPromise;
}

let projectsPromise;

export async function fetchItems() {
  try {
    return (await fetchSheetItems())
      .filter((item) => String(item.mediaType || item["data-media-type"] || "").toLowerCase() !== "text");
  } catch (error) {
    console.error("Error fetching items:", error);
    return fallbackItems();
  }
}

export async function fetchHomeItems() {
  try {
    return await fetchSheetItems();
  } catch (error) {
    console.error("Error fetching home items:", error);
    return fallbackHomeItems();
  }
}

export async function fetchProjects() {
  try {
    projectsPromise ||= fetchJsonWithTimeout(`${API_BASE}projects`).catch((error) => {
      projectsPromise = undefined;
      throw error;
    });
    const data = await projectsPromise;
    return data.projects || [];
  } catch (error) {
    console.error("Error fetching projects:", error);
    return fallbackProjectsFromItems(fallbackItems());
  }
}

export async function filtersLoader() {
  const items = await fetchItems();
  return { items };
}

export async function homeLoader() {
  const items = await fetchHomeItems();
  return { items };
}

export async function projectLoader({ params }) {
  const id = params.id;
  const [projects, items] = await Promise.all([fetchProjects(), fetchItems()]);
  const lookup = id.replace(/-/g, " ").toLowerCase();
  const project = projects.find((entry) => String(entry.project || "").toLowerCase() === lookup);
  const projectName =
    project?.project ||
    items.find((item) => String(item.project || "").toLowerCase() === lookup)?.project ||
    lookup;

  const result = {
    ...(project || {}),
    gallery: items.filter(
      (item) =>
        String(item.project || "").toLowerCase() === String(projectName || "").toLowerCase()
    )
  };

  if (!result.gallery.length) {
    throw new Response("Not Found", { status: 404 });
  }

  return { project: result };
}
