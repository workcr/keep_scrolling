// Alt text written in src/data/scroll-items.json, looked up by media filename.
// When the live Google Sheet still says "This image needs a description.",
// the site uses this instead, so the sheet does not have to be edited by hand.
// Text typed into the sheet always wins.
export const PLACEHOLDER_ALT = /needs a description/i;

function fileKey(src) {
  const raw = String(src || "").split("?")[0].split("/").pop() || "";
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

// extraByFile: { "file.mp4": "alt text" } for media that is only in the live
// sheet (e.g. src/data/video-alt-text.json, written from the actual videos).
export function createAltLookup(localItems = [], extraByFile = {}) {
  const byFile = new Map(Object.entries(extraByFile).map(([file, alt]) => [fileKey(file), alt]));
  for (const item of localItems) {
    const alt = String(item.alt || "").trim();
    if (alt && !PLACEHOLDER_ALT.test(alt)) byFile.set(fileKey(item.src), alt);
  }
  return (alt, src) => {
    const text = String(alt || "").trim();
    if (text && !PLACEHOLDER_ALT.test(text)) return text;
    return byFile.get(fileKey(src)) || "";
  };
}
