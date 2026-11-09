// "guaraná world cup cans" -> "guarana-world-cup-cans": plain ASCII, so the
// address, the prerendered file name and the sitemap entry all agree.
export function slugifyProjectName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Earlier names of a project (projects tab, "previous-names", comma-separated),
// written by the Studio's Rename so old links keep working.
export function previousNames(project = {}) {
  return String(project["previous-names"] || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

export function resolveMediaUrl(item) {
  const directCandidates = [
    item.url,
    item.src,
    item.image,
    item.imageUrl,
    item.file,
    item.asset,
    item.path
  ].filter(Boolean);

  if (directCandidates.length) {
    return directCandidates[0];
  }

  const namedCandidates = [item.name, item.title, item.id].filter(Boolean);
  if (!namedCandidates.length) {
    return "";
  }

  const baseName = String(namedCandidates[0]).trim();
  return `/assets/${baseName}`;
}

export function inferMediaType(item) {
  const type = String(item.mediaType || item["data-media-type"] || "").toLowerCase();
  if (type.includes("video") || type.includes("gif")) {
    return "video";
  }
  return "image";
}
