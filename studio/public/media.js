// Prepares files in the browser before upload:
//   images -> WebP at quality 85: the main file (max 2560px on the long side)
//             plus 320/640/960/1600px-wide versions for the site's srcset
//   videos -> checked (MP4, size), measured, plus 6 still frames (for the AI)
//             and a cover image.
// Encoding WebP needs a Chromium browser (Chrome, Comet, Edge, Arc...).

export const LIMITS = {
  videoWarnBytes: 25 * 1024 * 1024,
  videoMaxBytes: 100 * 1024 * 1024,
  imageMaxBytes: 80 * 1024 * 1024
};

const QUALITY = 0.85;
const MAX_SIDE = 2560;
const VARIANT_WIDTHS = [320, 640, 960, 1600];
const FRAME_WIDTH = 960;
const POSTER_WIDTH = 1600;

export const VIDEO_EXPORT_HELP =
  "Export as MP4 (H.264), 1920px wide or less, around 8-10 Mbps, no audio unless it matters. " +
  "In Premiere/Media Encoder: Format H.264, preset “Match Source – High bitrate”, target 8 Mbps. " +
  "In QuickTime: File → Export As → 1080p.";

async function encode(source, width, height, quality = QUALITY) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality });
  if (blob.type !== "image/webp") {
    throw new Error("This browser can't create WebP images. Please use Chrome or Comet.");
  }
  return blob;
}

function fit(width, height, maxWidth, maxSide = Infinity) {
  const scale = Math.min(1, maxWidth / width, maxSide / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export function classify(file) {
  const type = file.type || "";
  if (type === "video/mp4") return "video";
  if (["image/jpeg", "image/png", "image/webp"].includes(type)) return "image";
  if (type === "video/quicktime" || /\.mov$/i.test(file.name)) {
    return { error: `${file.name} is a .mov file. ${VIDEO_EXPORT_HELP}` };
  }
  if (type === "image/gif") return { error: `${file.name} is a GIF. Export it as an MP4 video instead; it'll be a fraction of the size.` };
  if (/heic|heif/i.test(type) || /\.hei[cf]$/i.test(file.name)) {
    return { error: `${file.name} is a HEIC photo. Export it as JPG first (Photos → File → Export).` };
  }
  return { error: `${file.name}: only JPG, PNG, WebP images and MP4 videos can be uploaded.` };
}

/** @returns {Promise<{kind, width, height, files: Record<slot, Blob>, preview: Blob, warnings: string[]}>} */
export async function processImage(file, onStep = () => {}) {
  if (file.size > LIMITS.imageMaxBytes) throw new Error(`${file.name} is over 80 MB. Export a smaller version first.`);
  onStep("Reading image");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [width, height] = fit(bitmap.width, bitmap.height, Infinity, MAX_SIDE);
    onStep("Making web versions");
    const files = { original: await encode(bitmap, width, height) };
    for (const target of VARIANT_WIDTHS) {
      const [w, h] = fit(bitmap.width, bitmap.height, target, MAX_SIDE);
      files[`w${target}`] = await encode(bitmap, w, h);
    }
    const warnings = [];
    if (Math.max(bitmap.width, bitmap.height) < 1600) {
      warnings.push(`Small image (${bitmap.width}×${bitmap.height}px): it may look soft on large screens.`);
    }
    return { kind: "image", width, height, files, preview: files.w640, warnings };
  } finally {
    bitmap.close();
  }
}

function once(target, event) {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      target.removeEventListener(event, done);
      reject(new Error("This video can't be read by the browser. Re-export it as MP4 (H.264)."));
    };
    target.addEventListener(event, done, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

export async function processVideo(file, onStep = () => {}) {
  if (file.size > LIMITS.videoMaxBytes) {
    throw new Error(`${file.name} is ${Math.round(file.size / 1048576)} MB; the limit is 100 MB. ${VIDEO_EXPORT_HELP}`);
  }
  const warnings = [];
  if (file.size > LIMITS.videoWarnBytes) {
    warnings.push(`Large video (${Math.round(file.size / 1048576)} MB): it will load slowly on phones. ${VIDEO_EXPORT_HELP}`);
  }
  onStep("Reading video");
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.src = url;
  try {
    await once(video, "loadeddata");
    const width = video.videoWidth;
    const height = video.videoHeight;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!width || !height) throw new Error("This video has no picture the browser can read. Re-export it as MP4 (H.264).");

    onStep("Taking still frames");
    const files = { original: file };
    const grab = async (time, maxWidth, quality) => {
      video.currentTime = Math.min(Math.max(time, 0), Math.max(duration - 0.05, 0));
      await once(video, "seeked");
      const [w, h] = fit(width, height, maxWidth);
      return encode(video, w, h, quality);
    };
    for (let n = 0; n < 6; n += 1) files[`frame${n}`] = await grab((duration * (n + 0.5)) / 6, FRAME_WIDTH, 0.8);
    files.poster = await grab(duration * 0.1, POSTER_WIDTH, QUALITY);
    return { kind: "video", width, height, duration, files, preview: files.poster, warnings };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
