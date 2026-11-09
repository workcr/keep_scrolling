import localScrollItems from "./data/scroll-items.json";
import { compareForProject, sortKey } from "./order.js";
import videoAltText from "./data/video-alt-text.json";
import { createAltLookup } from "./altText";
import { csvToObjects, projectsFromCsv } from "./csv";
import { titleCase } from "./site";
import { previousNames, slugifyProjectName } from "./utils";
import { redirect } from "react-router-dom";

const DEFAULT_ITEMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1XQQqzopAlJpwbAhBulpXUH28aUlIqdj_yXO8YWn1S0E/export?format=csv&gid=0";
// Project descriptions live in the "projects" tab of the same Google Sheet,
// exported by tab name. (They used to come from Sheety, an account outside
// the site owner's control, so it is no longer used at all.)
const DEFAULT_PROJECTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1XQQqzopAlJpwbAhBulpXUH28aUlIqdj_yXO8YWn1S0E/gviz/tq?tqx=out:csv&sheet=projects";
const PROJECTS_CSV_URL = String(import.meta.env.VITE_PROJECTS_CSV_URL || DEFAULT_PROJECTS_CSV_URL).trim();
const ITEMS_CSV_URL = String(import.meta.env.VITE_ITEMS_CSV_URL || DEFAULT_ITEMS_CSV_URL).trim();
const REQUEST_TIMEOUT_MS = 8000;

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

const localAlt = createAltLookup(localScrollItems || [], videoAltText);

// Many sheet rows still carry "This image needs a description." as alt text.
// That is worse than nothing for screen readers and image search, so derive a
// short factual label from the row until a real description is written.
function describeMedia(alt, { src, mediaType, project, client }) {
  const text = localAlt(alt, src);
  if (text) return text;
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
    alt: describeMedia(item.alt, { src: item.src, mediaType, project, client }),
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

// Display order lives in src/order.js (shared with the SEO build).
export { sortKey };

function sortItemsBySequence(items) {
  return [...items].sort((a, b) => sortKey(a) - sortKey(b));
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
          .sort((a, b) => sortKey(a) - sortKey(b))
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
    projectsPromise ||= fetchTextWithTimeout(PROJECTS_CSV_URL)
      .then(projectsFromCsv)
      .catch((error) => {
        projectsPromise = undefined;
        throw error;
      });
    return await projectsPromise;
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
  const slug = slugifyProjectName(id);
  const project = projects.find((entry) => slugifyProjectName(entry.project) === slug);
  const projectName = project?.project || items.find((item) => slugifyProjectName(item.project) === slug)?.project;

  if (!projectName) {
    // A renamed project: send old links to its new address.
    const renamed = projects.find((entry) => previousNames(entry).some((name) => slugifyProjectName(name) === slug));
    if (renamed) throw redirect(`/project/${slugifyProjectName(renamed.project)}`);
    throw new Response("Not Found", { status: 404 });
  }

  const result = {
    ...(project || {}),
    gallery: items
      .filter((item) => String(item.project || "").toLowerCase() === String(projectName || "").toLowerCase())
      .sort(compareForProject)
  };

  if (!result.gallery.length) {
    throw new Response("Not Found", { status: 404 });
  }

  return { project: result };
}
