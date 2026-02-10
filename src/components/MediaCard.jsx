import { useState } from "react";

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function encodeAssetPath(value) {
  if (!value) return "";
  const decoded = decodeURI(value);
  return encodeURI(decoded);
}

function normalizeAssetUrl(value) {
  if (!value) return "";
  if (isAbsoluteUrl(value)) return encodeAssetPath(value);
  if (value.startsWith("/")) return encodeAssetPath(value);
  if (value.startsWith("assets/")) return encodeAssetPath(`/src/${value}`);
  return encodeAssetPath(`/${value}`);
}

function normalizeSrcSet(value) {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => {
      const trimmed = item.trim();
      const parts = trimmed.split(/\s+/);
      const maybeDescriptor = parts.at(-1);
      const hasDescriptor = /^(?:\d+w|\d+(?:\.\d+)?x)$/.test(maybeDescriptor || "");
      const src = hasDescriptor ? parts.slice(0, -1).join(" ") : parts.join(" ");
      const descriptor = hasDescriptor ? maybeDescriptor : "";
      const normalized = src.startsWith("assets/") ? `/src/${src}` : src;
      const url = encodeAssetPath(
        normalized.startsWith("/") || isAbsoluteUrl(normalized) ? normalized : `/${normalized}`
      );
      return `${url}${descriptor ? ` ${descriptor}` : ""}`;
    })
    .join(", ");
}

function aspectRatioPadding(item) {
  const ratio = item["data-aspect-ratio"];
  if (ratio && typeof ratio === "string") {
    const match = ratio.match(/([0-9]+)\s*\/\s*([0-9]+)/);
    if (match) {
      const w = Number.parseFloat(match[1]);
      const h = Number.parseFloat(match[2]);
      if (w > 0 && h > 0) return (h / w) * 100;
    }
  }

  const width = Number.parseFloat(item["data-width"]);
  const height = Number.parseFloat(item["data-height"]);
  if (width > 0 && height > 0) return (height / width) * 100;

  if (item["data-orientation"] === "vertical") return 125;
  if (item["data-orientation"] === "horizontal") return 56.25;
  return 100;
}

export default function MediaCard(item) {
  const [errored, setErrored] = useState(false);
  const mediaType = String(item["data-media-type"] || item.mediaType || "").toLowerCase();
  const src = normalizeAssetUrl(item.src);
  const srcSet = normalizeSrcSet(item.srcset);
  const sharedStyle = { width: "100%", height: "auto", display: "block", objectFit: "contain" };

  if (!item.src || errored) return null;

  if (mediaType === "video") {
    const paddingBottom = aspectRatioPadding(item);
    const url = `${src}&badge=0&autopause=0&player_id=0&app_id=58479&loop=1&controls=0&autoplay=1&muted=1&quality=1080p`;
    return (
      <div style={{ position: "relative", width: "100%", height: 0, paddingBottom: `${paddingBottom}%` }}>
        <iframe
          src={url}
          title={item.alt || item.id}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }}
          allow="autoplay; fullscreen; picture-in-picture"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <img
        src={src}
        srcSet={srcSet}
        alt={item.alt || ""}
        loading="lazy"
        style={sharedStyle}
        onError={() => setErrored(true)}
      />
    </div>
  );
}
