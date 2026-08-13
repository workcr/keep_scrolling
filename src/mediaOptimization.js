const BASE_URL = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
const OPTIMIZED_MEDIA_ROOT = `${BASE_URL}media/optimized`;

const RESPONSIVE_IMAGE_WIDTHS = [480, 960, 1600, 2560];

const RESPONSIVE_IMAGES = new Set([
  "SJC_ALOHA_JUNKIE_grained.png",
  "SJC_Land_Sick_003.png",
  "SJC_Surf_Overdose_001.png"
]);

const VIDEO_RENDITIONS = {
  "SJC_SURF_OVERDOSE_VHS_V2.mov": [
    { width: 640, src: `${OPTIMIZED_MEDIA_ROOT}/SJC_SURF_OVERDOSE_VHS_V2-640.mp4` },
    { width: 1280, src: `${OPTIMIZED_MEDIA_ROOT}/SJC_SURF_OVERDOSE_VHS_V2-1280.mp4` },
    { width: 1920, src: `${OPTIMIZED_MEDIA_ROOT}/SJC_SURF_OVERDOSE_VHS_V2-1920.mp4` }
  ]
};

function fileNameFromUrl(src) {
  if (!src) return "";
  try {
    const url = new URL(src, "https://keep-scrolling.local");
    return decodeURIComponent(url.pathname.split("/").pop() || "");
  } catch {
    return decodeURIComponent(String(src).split("?")[0].split("/").pop() || "");
  }
}

function stem(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function responsiveImageSrcSet(src) {
  const fileName = fileNameFromUrl(src);
  if (!RESPONSIVE_IMAGES.has(fileName)) return undefined;

  const baseName = stem(fileName);
  return RESPONSIVE_IMAGE_WIDTHS.map(
    (width) => `${OPTIMIZED_MEDIA_ROOT}/${baseName}-${width}.webp ${width}w`
  ).join(", ");
}

export function optimizedVideoSource(
  src,
  { displayWidth = 1280, effectiveType = "4g", saveData = false } = {}
) {
  const renditions = VIDEO_RENDITIONS[fileNameFromUrl(src)];
  if (!renditions?.length) return src;

  const connection = String(effectiveType || "").toLowerCase();
  if (saveData || connection.includes("2g") || connection === "slow-2g" || connection === "3g") {
    return renditions[0].src;
  }

  const targetWidth = Number.isFinite(displayWidth) ? displayWidth : 1280;
  return renditions.find((rendition) => rendition.width >= targetWidth)?.src || renditions.at(-1).src;
}

export function browserVideoConditions(projectMedia = false) {
  if (typeof window === "undefined") return {};

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const viewportWidth = window.innerWidth || 1280;
  const displayWidth = projectMedia && viewportWidth >= 1024 ? viewportWidth * 0.4 : viewportWidth;

  return {
    displayWidth,
    effectiveType: connection?.effectiveType,
    saveData: connection?.saveData === true
  };
}
