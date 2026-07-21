import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const KNOWN_VIMEO_HASHES = {
  "1055304584": "c4a306474a"
};

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function encodeAssetPath(value) {
  if (!value) return "";
  const decoded = decodeURI(value);
  return encodeURI(decoded);
}

function rewriteToRootAssets(value) {
  if (!value) return "";
  const normalized = String(value).replace(/\\/g, "/");

  if (isAbsoluteUrl(normalized)) return normalized;
  if (normalized.startsWith("/staging/assets/")) return normalized.replace(/^\/staging\/assets\//, "/assets/");
  if (normalized.startsWith("staging/assets/")) return `/${normalized.replace(/^staging\/assets\//, "assets/")}`;
  if (normalized.startsWith("./assets/")) return `/${normalized.replace(/^\.\//, "")}`;
  if (normalized.startsWith("assets/")) return `/${normalized}`;
  return normalized;
}

function normalizeAssetUrl(value) {
  if (!value) return "";
  const rewritten = rewriteToRootAssets(value);
  if (isAbsoluteUrl(rewritten)) return encodeAssetPath(rewritten);
  if (rewritten.startsWith("/")) return encodeAssetPath(rewritten);
  return encodeAssetPath(`/${rewritten}`);
}

function normalizeSrcSet(value, fallbackSrc, intrinsicWidth) {
  if (!value) return undefined;
  const candidates = value
    .split(",")
    .map((item) => {
      const trimmed = item.trim();
      const parts = trimmed.split(/\s+/);
      const maybeDescriptor = parts.at(-1);
      const hasDescriptor = /^(?:\d+w|\d+(?:\.\d+)?x)$/.test(maybeDescriptor || "");
      const src = hasDescriptor ? parts.slice(0, -1).join(" ") : parts.join(" ");
      const descriptor = hasDescriptor ? maybeDescriptor : "";
      const normalized = rewriteToRootAssets(src);
      const url = encodeAssetPath(
        normalized.startsWith("/") || isAbsoluteUrl(normalized) ? normalized : `/${normalized}`
      );
      return { url, descriptor };
    })
    .filter((candidate) => candidate.url);

  const largestWidth = candidates.reduce((largest, candidate) => {
    const match = candidate.descriptor.match(/^(\d+)w$/);
    return match ? Math.max(largest, Number.parseInt(match[1], 10)) : largest;
  }, 0);
  const sourceWidth = Number.parseInt(intrinsicWidth, 10);

  if (fallbackSrc && sourceWidth > largestWidth && !candidates.some((candidate) => candidate.url === fallbackSrc)) {
    candidates.push({ url: fallbackSrc, descriptor: `${sourceWidth}w` });
  }

  return candidates.map(({ url, descriptor }) => `${url}${descriptor ? ` ${descriptor}` : ""}`).join(", ");
}

function imageSizesForItem(item) {
  if (item.sizes) return item.sizes;
  if (item["data-media-context"] === "home") return "84vw";
  return "(max-width: 480px) 33vw, (max-width: 767px) 25vw, (max-width: 1199px) 20vw, 17vw";
}

function projectImageSizes(expanded) {
  return expanded ? "(max-width: 1023px) 100vw, 90vw" : "(max-width: 1023px) 100vw, 40vw";
}

function largestSrcSetCandidate(srcSet) {
  if (!srcSet) return "";
  return srcSet.split(",").reduce(
    (largest, item) => {
      const trimmed = item.trim();
      const parts = trimmed.split(/\s+/);
      const descriptor = parts.at(-1) || "";
      const match = descriptor.match(/^(\d+)w$/);
      const width = match ? Number.parseInt(match[1], 10) : 0;
      const url = match ? parts.slice(0, -1).join(" ") : trimmed;
      return width > largest.width ? { url, width } : largest;
    },
    { url: "", width: 0 }
  ).url;
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

function aspectRatioValue(item) {
  const ratio = item["data-aspect-ratio"];
  if (ratio && typeof ratio === "string") {
    const match = ratio.match(/([0-9]+)\s*\/\s*([0-9]+)/);
    if (match) {
      const w = Number.parseFloat(match[1]);
      const h = Number.parseFloat(match[2]);
      if (w > 0 && h > 0) return w / h;
    }
  }

  const width = Number.parseFloat(item["data-width"]);
  const height = Number.parseFloat(item["data-height"]);
  if (width > 0 && height > 0) return width / height;

  if (item["data-orientation"] === "vertical") return 0.5625;
  if (item["data-orientation"] === "horizontal") return 16 / 9;
  return 1;
}

function buildVideoEmbedUrl(src, requestedQuality, interactionMode, initialMuted = true) {
  const url = new URL(src, window.location.origin);
  const id = url.pathname.match(/\/video\/(\d+)/)?.[1];
  const knownHash = id ? KNOWN_VIMEO_HASHES[id] : undefined;
  if (knownHash && !url.searchParams.has("h")) {
    url.searchParams.set("h", knownHash);
  }

  const params = {
    badge: "0",
    autopause: "0",
    player_id: "0",
    app_id: "58479",
    loop: "1",
    controls: "0",
    autoplay: interactionMode === "click" ? "0" : "1",
    muted: initialMuted ? "1" : "0",
    api: "1",
    quality: requestedQuality
  };

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

function vimeoOrigin(src) {
  try {
    return new URL(src, window.location.origin).origin;
  } catch {
    return "*";
  }
}

export default function MediaCard(item) {
  const [errored, setErrored] = useState(false);
  const [clickPlaying, setClickPlaying] = useState(false);
  const [deferredVideoReady, setDeferredVideoReady] = useState(!item.deferVideo);
  const [projectExpanded, setProjectExpanded] = useState(false);
  const [projectImageHighQuality, setProjectImageHighQuality] = useState(false);
  const [projectImageHighQualityReady, setProjectImageHighQualityReady] = useState(false);
  const [projectPlaying, setProjectPlaying] = useState(true);
  const [projectMuted, setProjectMuted] = useState(false);
  const [projectSeconds, setProjectSeconds] = useState(0);
  const [projectDuration, setProjectDuration] = useState(0);
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const mediaType = String(item["data-media-type"] || item.mediaType || "").toLowerCase();
  const src = normalizeAssetUrl(item.src);
  const isVimeoVideo = mediaType === "video" && /(?:player\.)?vimeo\.com/i.test(src);
  const srcSet = normalizeSrcSet(item.srcset, src, item["data-width"]);
  const loadingMode = item.loading === "eager" ? "eager" : "lazy";
  const fetchPriority = loadingMode === "eager" ? "high" : "auto";
  const interactionMode = item.videoInteraction === "click" ? "click" : item.videoInteraction === "hover" ? "hover" : "none";
  const projectMedia = item.projectMedia === true;
  const iframeOrigin = useMemo(() => vimeoOrigin(src), [src]);
  const highQualityImageSrc = useMemo(() => largestSrcSetCandidate(srcSet) || src, [src, srcSet]);
  const sharedStyle = { width: "100%", height: "auto", display: "block", objectFit: "contain" };

  useEffect(() => {
    if (mediaType !== "video" || !item.deferVideo) {
      setDeferredVideoReady(true);
      return undefined;
    }

    setDeferredVideoReady(false);
    if (item.videoLoadStrategy === "manual") return undefined;
    const element = containerRef.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setDeferredVideoReady(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setDeferredVideoReady(true);
        observer.disconnect();
      },
      { root: null, rootMargin: item.videoLoadMargin || "900px", threshold: 0 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [item.deferVideo, item.videoLoadMargin, item.videoLoadStrategy, mediaType, src]);

  useEffect(() => {
    if (!projectMedia || mediaType === "video") return undefined;
    if (!highQualityImageSrc || typeof Image === "undefined") {
      setProjectImageHighQualityReady(true);
      return undefined;
    }

    let cancelled = false;
    setProjectImageHighQualityReady(false);
    const image = new Image();
    image.src = highQualityImageSrc;

    const markReady = () => {
      if (!cancelled) setProjectImageHighQualityReady(true);
    };

    if (image.complete && image.naturalWidth > 0) {
      markReady();
      return () => {
        cancelled = true;
      };
    }

    if (typeof image.decode === "function") {
      image.decode().then(markReady).catch(markReady);
    } else {
      image.onload = markReady;
      image.onerror = markReady;
    }

    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [highQualityImageSrc, mediaType, projectMedia]);

  useEffect(() => {
    if (!projectMedia || mediaType === "video") return undefined;
    if (projectExpanded) {
      if (projectImageHighQualityReady) setProjectImageHighQuality(true);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setProjectImageHighQuality(false);
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [mediaType, projectExpanded, projectImageHighQualityReady, projectMedia]);

  const sendVideoCommand = useCallback(
    (method, value) => {
      if (!isVimeoVideo) {
        const video = videoRef.current;
        if (!video) return;
        if (method === "play") void video.play().catch(() => {});
        if (method === "pause") video.pause();
        if (method === "setMuted") video.muted = Boolean(value);
        if (method === "setVolume") video.volume = Number(value);
        if (method === "setCurrentTime") video.currentTime = Number(value);
        return;
      }

      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      const message = value === undefined ? { method } : { method, value };
      target.postMessage(JSON.stringify(message), iframeOrigin);
    },
    [iframeOrigin, isVimeoVideo]
  );

  useEffect(() => {
    if (
      mediaType !== "video" ||
      projectMedia ||
      !deferredVideoReady ||
      item.videoActive === undefined
    ) {
      return;
    }

    if (item.videoActive) {
      sendVideoCommand("play");
      return;
    }

    sendVideoCommand("pause");
  }, [deferredVideoReady, item.videoActive, mediaType, projectMedia, sendVideoCommand]);

  const enableAudio = useCallback(() => {
    sendVideoCommand("setVolume", 1);
    sendVideoCommand("setMuted", false);
    sendVideoCommand("play");
  }, [sendVideoCommand]);

  const disableAudio = useCallback(() => {
    sendVideoCommand("setVolume", 0);
    sendVideoCommand("setMuted", true);
  }, [sendVideoCommand]);

  const toggleProjectVideo = useCallback(() => {
    if (clickPlaying) {
      sendVideoCommand("pause");
      setClickPlaying(false);
      return;
    }

    enableAudio();
    setClickPlaying(true);
  }, [clickPlaying, enableAudio, sendVideoCommand]);

  const toggleProjectMedia = useCallback(() => {
    if (!projectMedia) return;
    setProjectExpanded((value) => !value);
  }, [projectMedia]);

  const handleProjectMediaKeyDown = useCallback((event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleProjectMedia();
  }, [toggleProjectMedia]);

  const toggleProjectPlayback = useCallback((event) => {
    event.stopPropagation();
    if (projectPlaying) {
      sendVideoCommand("pause");
      setProjectPlaying(false);
      return;
    }

    sendVideoCommand("play");
    setProjectPlaying(true);
  }, [projectPlaying, sendVideoCommand]);

  const toggleProjectMute = useCallback((event) => {
    event.stopPropagation();
    const nextMuted = !projectMuted;
    if (nextMuted) {
      sendVideoCommand("setVolume", 0);
      sendVideoCommand("setMuted", true);
    } else {
      sendVideoCommand("setVolume", 1);
      sendVideoCommand("setMuted", false);
      sendVideoCommand("play");
    }
    setProjectMuted(nextMuted);
  }, [projectMuted, sendVideoCommand]);

  const seekProjectVideo = useCallback((event) => {
    event.stopPropagation();
    if (!projectDuration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.min(Math.max(x / rect.width, 0), 1);
    const nextSeconds = projectDuration * ratio;
    setProjectSeconds(nextSeconds);
    sendVideoCommand("setCurrentTime", nextSeconds);
  }, [projectDuration, sendVideoCommand]);

  useEffect(() => {
    if (mediaType !== "video" || !projectMedia || !deferredVideoReady || !isVimeoVideo) return undefined;

    const onMessage = (event) => {
      if (event.origin !== iframeOrigin) return;

      let message = event.data;
      if (typeof message === "string") {
        try {
          message = JSON.parse(message);
        } catch {
          return;
        }
      }

      if (!message || typeof message !== "object") return;
      if (message.event === "ready") {
        ["play", "pause", "playProgress", "loaded", "volumechange"].forEach((eventName) => {
          sendVideoCommand("addEventListener", eventName);
        });
        sendVideoCommand("setVolume", projectMuted ? 0 : 1);
        sendVideoCommand("setMuted", projectMuted);
        if (!projectMuted) sendVideoCommand("play");
        return;
      }

      if (message.event === "play") setProjectPlaying(true);
      if (message.event === "pause") setProjectPlaying(false);
      if (message.event === "loaded" && Number.isFinite(message.data?.duration)) {
        setProjectDuration(message.data.duration);
      }
      if (message.event === "volumechange" && typeof message.data?.muted === "boolean") {
        setProjectMuted(message.data.muted);
      }
      if (message.event === "playProgress") {
        if (Number.isFinite(message.data?.seconds)) setProjectSeconds(message.data.seconds);
        if (Number.isFinite(message.data?.duration)) setProjectDuration(message.data.duration);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [deferredVideoReady, iframeOrigin, isVimeoVideo, mediaType, projectMedia, projectMuted, sendVideoCommand]);

  const formatTime = useCallback((seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }, []);

  if (!item.src || errored) return null;

  if (mediaType === "video") {
    const paddingBottom = aspectRatioPadding(item);
    const aspectRatio = aspectRatioValue(item);
    const requestedQuality = String(item.quality || "1080p");
    const url = isVimeoVideo
      ? buildVideoEmbedUrl(src, requestedQuality, interactionMode, !projectMedia)
      : src;
    const hoverProps =
      interactionMode === "hover"
        ? {
            onMouseEnter: enableAudio,
            onMouseLeave: disableAudio,
            onFocus: enableAudio,
            onBlur: disableAudio
          }
        : {};
    const clickProps =
      interactionMode === "click"
        ? {
            onClick: toggleProjectVideo,
            onKeyDown: (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              toggleProjectVideo();
            },
            role: "button",
            tabIndex: 0,
            "aria-pressed": clickPlaying,
            "aria-label": `${clickPlaying ? "Pause" : "Play"} ${item.alt || item.id || "video"}`
          }
        : {};

    return (
      <div
        ref={containerRef}
        className="video-container"
        style={{
          position: "relative",
          width: projectMedia
            ? `min(${projectExpanded ? "90vw" : "40vw"}, ${(aspectRatio * (projectExpanded ? 100 : 70)).toFixed(3)}dvh)`
            : "100%",
          height: 0,
          paddingBottom: `${paddingBottom}%`,
          cursor: interactionMode === "click" || projectMedia ? "pointer" : undefined
        }}
        data-project-media={projectMedia ? "true" : undefined}
        data-expanded={projectMedia && projectExpanded ? "true" : undefined}
        role={projectMedia ? "button" : undefined}
        tabIndex={projectMedia ? 0 : undefined}
        onClick={projectMedia ? toggleProjectMedia : undefined}
        onKeyDown={projectMedia ? handleProjectMediaKeyDown : undefined}
        {...hoverProps}
        {...clickProps}
      >
        {deferredVideoReady && isVimeoVideo ? (
          <iframe
            ref={iframeRef}
            src={url}
            title={item.alt || item.id}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, display: "block" }}
            allow="autoplay; fullscreen; picture-in-picture"
            loading={loadingMode}
            fetchPriority={fetchPriority}
          />
        ) : null}
        {deferredVideoReady && !isVimeoVideo ? (
          <video
            ref={videoRef}
            src={url}
            aria-label={item.alt || item.id}
            autoPlay
            muted={!projectMedia || projectMuted}
            loop
            playsInline
            preload={loadingMode === "eager" ? "auto" : "metadata"}
            onError={() => setErrored(true)}
            onLoadedMetadata={(event) => {
              if (projectMedia) setProjectDuration(event.currentTarget.duration || 0);
            }}
            onTimeUpdate={(event) => {
              if (projectMedia) setProjectSeconds(event.currentTarget.currentTime || 0);
            }}
            onPlay={() => setProjectPlaying(true)}
            onPause={() => setProjectPlaying(false)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
        {projectMedia ? (
          <button
            type="button"
            className="project-video-click-layer"
            aria-label={`${projectExpanded ? "Shrink" : "Expand"} ${item.alt || item.id || "video"}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleProjectMedia();
            }}
          />
        ) : null}
        {projectMedia ? (
          <div className="project-video-controls" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="project-video-control-button" onClick={toggleProjectPlayback}>
              {projectPlaying ? "Pause" : "Play"}
            </button>
            <button type="button" className="project-video-control-button" onClick={toggleProjectMute}>
              {projectMuted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              className="project-video-timeline"
              onClick={seekProjectVideo}
              aria-label="Seek video"
            >
              <span
                className="project-video-timeline-progress"
                style={{
                  left: `${projectDuration ? Math.min(Math.max(projectSeconds / projectDuration, 0), 1) * 100 : 0}%`
                }}
              />
            </button>
            <span className="project-video-time">
              {formatTime(projectSeconds)} / {formatTime(projectDuration)}
            </span>
          </div>
        ) : null}
        {interactionMode !== "none" ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "block",
              zIndex: 1
            }}
          />
        ) : null}
      </div>
    );
  }

  if (projectMedia) {
    const aspectRatio = aspectRatioValue(item);
    return (
      <button
        type="button"
        className="project-media-shell"
        data-expanded={projectExpanded ? "true" : undefined}
        onClick={toggleProjectMedia}
        style={{
          width: `min(${projectExpanded ? "90vw" : "40vw"}, ${(aspectRatio * (projectExpanded ? 100 : 70)).toFixed(3)}dvh)`
        }}
      >
        <img
          src={src}
          srcSet={srcSet}
          sizes={srcSet ? projectImageSizes(projectImageHighQuality) : undefined}
          alt={item.alt || ""}
          loading={loadingMode}
          decoding="async"
          fetchPriority={fetchPriority}
          className="project-media-image"
          onError={() => setErrored(true)}
        />
      </button>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <img
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? imageSizesForItem(item) : undefined}
        alt={item.alt || ""}
        loading={loadingMode}
        decoding="async"
        fetchPriority={fetchPriority}
        style={sharedStyle}
        onError={() => setErrored(true)}
      />
    </div>
  );
}
