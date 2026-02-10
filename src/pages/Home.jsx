import { useMemo } from "react";
import MediaCard from "../components/MediaCard";
import scrollItems from "../data/scroll-items.json";

function parseInlineStyle(input) {
  if (!input) return {};
  const normalized = String(input).replace(/^style=\\"/, "").replace(/\\"$/, "");
  const out = {};
  normalized.split(";").forEach((entry) => {
    const [k, v] = entry.split(":").map((part) => part && part.trim());
    if (!k || !v) return;
    const camel = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  });
  return out;
}

function mediaContainerStyle(item) {
  const style = {};
  if (item["data-aspect-ratio"]) {
    const aspect = item["data-aspect-ratio"].split(":")[1]?.trim().replace(";", "");
    if (aspect) style.aspectRatio = aspect;
  } else if (item["data-media-type"] === "video") {
    style.aspectRatio = "16 / 9";
  }
  return { ...parseInlineStyle(item.style), ...style };
}

export default function Home() {
  const items = useMemo(() => {
    const source = scrollItems.filter((item) => String(item.class || "").includes("scroll-item"));
    const looped = [];
    let cycle = 0;
    while (looped.length < 50) {
      for (let i = 0; i < source.length; i += 1) {
        const item = source[i];
        const key = item.id ?? item.src ?? i;
        looped.push({ ...item, __loopKey: `${key}#${cycle}` });
      }
      cycle += 1;
    }
    return looped;
  }, []);

  return (
    <div className="carrousel-container">
      <div className="flex items-center justify-center h-full fixed w-full">
        <div className="text-3xl flex flex-col gap-6">
          Scroll
          <div className="flex flex-col items-center">
            <span>↓</span>
            <span>↓</span>
            <span>↓</span>
          </div>
        </div>
      </div>

      <div className="fixed bottom-6 left-0 flex items-center justify-center w-full">
        <img src="/src/assets/keep%20scRolling.svg" alt="Keep scrolling" className="w-11/12" />
      </div>

      <div style={{ height: `${items.length * 100}dvh`, position: "relative" }}>
        {items.map((item) => {
          const maxW = item["data-maxWidth"] || undefined;
          const maxH = item["data-maxHeight"] || undefined;
          const mediaType = String(item["data-media-type"] || "").toLowerCase();
          return (
            <div
              key={item.__loopKey}
              style={{
                position: "sticky",
                top: 0,
                height: "100dvh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: maxW || "80%",
                  height: maxH || "auto",
                  maxWidth: "96vw",
                  maxHeight: "96dvh",
                  ...mediaContainerStyle(item),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {mediaType === "text" ? (
                  <div className="text-3xl">{item.content}</div>
                ) : (
                  <MediaCard {...item} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
