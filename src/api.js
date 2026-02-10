const API_BASE = "https://api.sheety.co/55ad31708c31d543a624b88053f567d9/backend/";

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

export async function fetchItems() {
  try {
    const response = await fetch(`${API_BASE}sheet1`);
    const data = await response.json();
    return (data.sheet1 || [])
      .map(normalizeItem)
      .filter((item) => item.mediaType !== "text");
  } catch (error) {
    console.error("Error fetching items:", error);
    return [];
  }
}

export async function fetchProjects() {
  try {
    const response = await fetch(`${API_BASE}projects`);
    const data = await response.json();
    return data.projects || [];
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
}

export async function filtersLoader() {
  const items = await fetchItems();
  if (!items.length) {
    throw new Response("Not Found", { status: 404 });
  }
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

