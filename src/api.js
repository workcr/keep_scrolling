import localScrollItems from "./data/scroll-items.json";

const DEFAULT_API_BASE = "https://api.sheety.co/55ad31708c31d543a624b88053f567d9/backend/";
const configuredBase = String(import.meta.env.VITE_API_BASE || DEFAULT_API_BASE).trim();
const API_BASE = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;
const REQUEST_TIMEOUT_MS = 8000;

function normalizeItem(item) {
  return {
    ...item,
    "data-media-type": item.mediaType,
    "data-aspect-ratio": item.aspectRatio,
    "data-orientation": item.orientation,
    "data-width": item.width,
    "data-height": item.height,
    "data-maxWidth": item.maxWidth,
    "data-maxHeight": item.maxHeight
  };
}

function fallbackItems() {
  return (localScrollItems || [])
    .map(normalizeItem)
    .filter((item) => String(item.mediaType || item["data-media-type"] || "").toLowerCase() !== "text");
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

export async function fetchItems() {
  try {
    const data = await fetchJsonWithTimeout(`${API_BASE}sheet1`);
    return (data.sheet1 || [])
      .map(normalizeItem)
      .filter((item) => item.mediaType !== "text");
  } catch (error) {
    console.error("Error fetching items:", error);
    return fallbackItems();
  }
}

export async function fetchProjects() {
  try {
    const data = await fetchJsonWithTimeout(`${API_BASE}projects`);
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

export async function projectLoader({ params }) {
  const id = params.id;
  const [projects, items] = await Promise.all([fetchProjects(), fetchItems()]);
  const lookup = id.replace(/-/g, " ").toLowerCase();
  const project = projects.find((entry) => String(entry.project || "").toLowerCase() === lookup);

  const result = {
    ...(project || {}),
    gallery: items.filter(
      (item) =>
        String(item.project || "").toLowerCase() === String(project?.project || "").toLowerCase()
    )
  };

  if (!result.gallery.length) {
    throw new Response("Not Found", { status: 404 });
  }

  return { project: result };
}
