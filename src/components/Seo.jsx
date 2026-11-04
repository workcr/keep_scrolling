import { useEffect } from "react";
import { SITE } from "../site";

function setMeta(selector, attribute, value) {
  const element = document.head.querySelector(selector);
  if (element && value !== undefined) element.setAttribute(attribute, value);
}

// index.html (and the per-route HTML generated at build time) already ships the
// right tags for crawlers that do not run JavaScript. This keeps them in sync
// during client-side navigation so Google's rendered snapshot, browser tabs and
// share previews match the page actually shown. It mutates the existing tags
// rather than rendering new ones, because a second <title> would be ignored.
export default function Seo({ title = SITE.title, description = SITE.description, path, noindex = false }) {
  useEffect(() => {
    const url = path === undefined ? undefined : new URL(path, SITE.url).toString();
    document.title = title;
    setMeta('meta[name="description"]', "content", description);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", description);
    setMeta('meta[name="twitter:title"]', "content", title);
    setMeta('meta[name="twitter:description"]', "content", description);
    if (url) {
      setMeta('link[rel="canonical"]', "href", url);
      setMeta('meta[property="og:url"]', "content", url);
    }

    const robots = document.head.querySelector('meta[name="robots"]');
    const base = robots?.dataset.base || robots?.getAttribute("content") || "index, follow";
    if (robots) {
      robots.dataset.base = base;
      robots.setAttribute("content", noindex ? "noindex, follow" : base);
    }
  }, [description, noindex, path, title]);

  return null;
}
