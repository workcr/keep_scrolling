// Builds studio/src/generated/library.json: every piece in src/assets (the
// files deployed to keep-scrolling.com/assets/), one entry per piece with its
// size variants, pixel dimensions, likely project, and a note when it's the
// local copy of a video that's already on the site from R2.
//
// The Studio's Library tab compares this with the live sheet to list what
// isn't on the site yet. Run with `npm run library` (the deploy does it).
//
// No dependencies: dimensions are read from the file headers.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, "../../src/assets");
const OUT = path.resolve(here, "../src/generated/library.json");

// Not portfolio pieces.
const SKIP = [/^about-ul-/i, /^thanks-footer/i];

// Filename family -> project name used in the sheet.
const PROJECTS = [
  [/^(SJC_|Scene-0)/i, "surf overdose"],
  [/^dtms_portfolio/i, "dtms portfolio"],
  [/^DTMS_/i, "dtms branding"],
  [/^Guarana/i, "2014 world cup"],
  [/^ATT Print/i, "cce"],
  [/^NIKE_MARATHON/i, "fastest ever"],
  [/^OW_/i, "ow posters"],
  [/^(Octagrid|Octa-grid|Characters_Grid)/i, "octagrid promo"],
  [/^(CR |Square|Still_Camera)/i, "cr branding"],
  [/^EQ_/i, "ocideia"],
  [/^HS_/i, "hs posters"],
  [/^WKSP/i, "wksp branding"],
  [/^Follow/i, "follow the new"]
];

// Local copies of videos that are already on the site from R2 (matched by
// length and shape, November 2026).
const ALREADY_ON_SITE = {
  "Guarana_1920x1080_Latas": "guarana-world-cup-cans.mp4",
  "CR Neue Grafik Hoodie": "cr-neue-grafik-hoodie.mp4",
  "CR Neue Grafik Hoodie 3x4": "cr-neue-grafik-hoodie.mp4 (3:4 crop)",
  "CR Magdalena Wosinska for AT&T": "att-magdalena-wosinska.mp4",
  "DTMS_Teaser_01_720p": "dtms-teaser-01.mp4",
  "DTMS_Teaser_02_1080p": "dtms-kinetic-type.mp4",
  "DTMS_post_03": "dtms-posters-animation.mp4",
  "Characters_Grid": "octagrid-characters.mp4",
  "Octagrid_3D_6_1080p": "octagrid-kinetic-cube.mp4",
  "CR Glass Logo 360 New": "cr-logo-animation.mp4"
};

// ---- dimensions from file headers -----------------------------------------

function webpSize(b) {
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (chunk === "VP8X") return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  return null;
}

function pngSize(b) {
  return b.toString("ascii", 1, 4) === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null;
}

function gifSize(b) {
  return b.toString("ascii", 0, 3) === "GIF" ? [b.readUInt16LE(6), b.readUInt16LE(8)] : null;
}

function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const length = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    }
    i += 2 + length;
  }
  return null;
}

// Largest track header ("tkhd") width/height in an MP4 (the video track).
function mp4Size(b) {
  let best = null;
  let at = b.indexOf("tkhd");
  while (at !== -1) {
    const start = at - 4;
    const size = b.readUInt32BE(start);
    if (size >= 92 && start + size <= b.length) {
      const width = b.readUInt32BE(start + size - 8) >>> 16;
      const height = b.readUInt32BE(start + size - 4) >>> 16;
      if (width && height && (!best || width * height > best[0] * best[1])) best = [width, height];
    }
    at = b.indexOf("tkhd", at + 4);
  }
  return best;
}

export function dimensions(file) {
  const buffer = fs.readFileSync(file);
  return webpSize(buffer) || pngSize(buffer) || gifSize(buffer) || jpegSize(buffer) || mp4Size(buffer);
}

// ---- grouping ---------------------------------------------------------------

const MEDIA = /\.(webp|png|jpe?g|gif|mp4)$/i;
const VARIANT = /-(320|640|960|1080|1600)p?$/;

export function buildLibrary(dir = ASSETS) {
  const pieces = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!MEDIA.test(file) || !fs.statSync(path.join(dir, file)).isFile()) continue;
    if (SKIP.some((pattern) => pattern.test(file))) continue;
    const ext = path.extname(file).toLowerCase();
    const stem = file.slice(0, -ext.length);
    const variant = stem.match(VARIANT);
    const key = variant ? stem.slice(0, -variant[0].length) : stem;
    if (!pieces.has(key)) pieces.set(key, { key, files: [] });
    pieces.get(key).files.push({ file, ext, width: variant ? Number(variant[1]) : null });
  }

  const entries = [];
  for (const { key, files } of [...pieces.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    const has = (ext) => files.filter((f) => f.ext === ext);
    let kind;
    let main;
    if (has(".mp4").length) {
      kind = "video";
      main = has(".mp4").find((f) => !f.width) || has(".mp4")[0];
    } else if (has(".gif").length) {
      kind = "gif";
      const gifs = has(".gif");
      main = gifs.find((f) => !f.width) || gifs.sort((a, b) => b.width - a.width)[0];
    } else {
      kind = "image";
      main =
        files.find((f) => !f.width && f.ext === ".webp") ||
        files.find((f) => !f.width) ||
        files.sort((a, b) => b.width - a.width)[0];
    }
    const size = dimensions(path.join(dir, main.file));
    if (!size) continue;
    const variants = {};
    if (kind === "image") {
      for (const f of files) if (f.width && f.ext === ".webp" && [320, 640, 960, 1600].includes(f.width)) variants[f.width] = `assets/${f.file}`;
    }
    entries.push({
      key,
      kind,
      src: `assets/${main.file}`,
      variants,
      width: size[0],
      height: size[1],
      project: PROJECTS.find(([pattern]) => pattern.test(key))?.[1] || "",
      ...(ALREADY_ON_SITE[key] ? { alreadyOnSite: ALREADY_ON_SITE[key] } : {})
    });
  }
  return entries;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const entries = buildLibrary();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(entries, null, 1)}\n`);
  console.log(`library: ${entries.length} pieces -> ${path.relative(process.cwd(), OUT)}`);
}
