export function slugifyProjectName(name = "") {
  return String(name).trim().toLowerCase().replace(/\s+/g, "-");
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
