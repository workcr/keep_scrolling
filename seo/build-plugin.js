// Build-time SEO for a client-rendered SPA.
//
// The app renders everything in the browser, so a crawler that does not run
// JavaScript (most AI crawlers: GPTBot, ClaudeBot, PerplexityBot, and the
// link-preview bots of Slack/LinkedIn/iMessage) only ever saw an empty <div>.
// After `vite build`, this plugin:
//   - writes one HTML file per route (about.html, project/<slug>.html, ...)
//     with its own <title>, description, canonical, Open Graph, JSON-LD and a
//     <noscript> text version of the page; .htaccess serves them for clean URLs
//   - writes sitemap.xml (with image entries), robots.txt and llms.txt
// The browser app still boots normally from every one of these files.
import fs from "node:fs";
import path from "node:path";
import { createAltLookup } from "../src/altText.js";
import { csvToObjects, projectsFromCsv } from "../src/csv.js";
import { SITE, projectDescription, projectTitle, titleCase } from "../src/site.js";

const DEFAULT_ITEMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1XQQqzopAlJpwbAhBulpXUH28aUlIqdj_yXO8YWn1S0E/export?format=csv&gid=0";
const DEFAULT_PROJECTS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1XQQqzopAlJpwbAhBulpXUH28aUlIqdj_yXO8YWn1S0E/gviz/tq?tqx=out:csv&sheet=projects";
const FETCH_TIMEOUT_MS = 15000;

const ABOUT_TEXT = [
  "Rodrigo Mendes is an art-driven Creative Director building brand platforms, campaigns, and design systems that connect strategy, visual language, film, digital, and culture.",
  "His work is shaped by a background in art direction, typography, and conceptual advertising, with 25+ years across São Paulo, Portland, and Los Angeles, including Wieden+Kennedy and BBDO. He has led work for global brands including Nike and has been recognized by Cannes Lions, Clio, D&AD, and The One Show.",
  "Rodrigo is especially interested in the systems behind memorable work: the insight, grid, voice, references, and production logic that help an idea travel across channels without losing its point of view."
];

function slugify(name = "") {
  return String(name).trim().toLowerCase().replace(/\s+/g, "-");
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLd(data) {
  // Escape "<" so a value can never close the <script> element.
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function absoluteUrl(value) {
  if (!value) return "";
  const raw = String(value).trim().replace(/\\/g, "/");
  if (/^https?:\/\//i.test(raw)) return encodeURI(decodeURI(raw));
  const relative = raw.replace(/^\.?\/*/, "").replace(/^staging\//, "");
  return encodeURI(decodeURI(`${SITE.url}/${relative}`));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadItems(rootDir, csvUrl, log) {
  try {
    const items = csvToObjects(await fetchText(csvUrl));
    if (items.length) {
      log(`seo: using ${items.length} rows from the live sheet`);
      return items;
    }
  } catch (error) {
    log(`seo: live sheet unavailable (${error.message}); using src/data/scroll-items.json`);
  }
  return JSON.parse(fs.readFileSync(path.join(rootDir, "src/data/scroll-items.json"), "utf8"));
}

async function loadProjectDescriptions(projectsCsvUrl, log) {
  try {
    return new Map(
      projectsFromCsv(await fetchText(projectsCsvUrl)).map((entry) => [
        String(entry.project).trim().toLowerCase(),
        String(entry.description || "").trim()
      ])
    );
  } catch (error) {
    log(`seo: projects tab unavailable (${error.message})`);
    return new Map();
  }
}

function field(item, key) {
  return String(item[key] ?? item[`data-${key}`] ?? "").trim();
}

function groupProjects(items, descriptions, altLookup) {
  const projects = new Map();
  for (const item of items) {
    const name = field(item, "project");
    const type = field(item, "media-type").toLowerCase() || String(item.mediaType || "").toLowerCase();
    if (!name || type === "text") continue;
    const slug = slugify(name);
    if (!projects.has(slug)) {
      projects.set(slug, {
        slug,
        name,
        project: name,
        client: field(item, "client"),
        category: field(item, "category"),
        discipline: field(item, "discipline"),
        description: descriptions.get(name.toLowerCase()) || "",
        images: [],
        videos: []
      });
    }
    const project = projects.get(slug);
    const alt = altLookup(item.alt, item.src);
    const src = absoluteUrl(item.src);
    if (!src) continue;
    if (type === "video") project.videos.push({ src, alt });
    else project.images.push({ src, alt });
  }
  return [...projects.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function personNode() {
  return {
    "@type": "Person",
    "@id": `${SITE.url}/#person`,
    name: SITE.name,
    jobTitle: SITE.jobTitle,
    url: `${SITE.url}/`,
    image: `${SITE.url}${SITE.image}`,
    description: ABOUT_TEXT[0],
    sameAs: SITE.sameAs,
    knowsAbout: SITE.knowsAbout,
    award: SITE.awards
  };
}

function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    url: `${SITE.url}/`,
    name: SITE.siteName,
    inLanguage: "en",
    author: { "@id": `${SITE.url}/#person` },
    publisher: { "@id": `${SITE.url}/#person` }
  };
}

function projectLinks(projects, base) {
  return `<ul>${projects
    .map((project) => {
      const meta = [project.client, project.category, project.discipline].filter(Boolean).map(titleCase);
      return `<li><a href="${base}project/${escapeHtml(project.slug)}">${escapeHtml(titleCase(project.name))}</a>${
        meta.length ? ` — ${escapeHtml(meta.join(", "))}` : ""
      }</li>`;
    })
    .join("")}</ul>`;
}

function nav(base) {
  return `<nav><a href="${base}">Home</a> · <a href="${base}gallery">Gallery</a> · <a href="${base}filters">Filters</a> · <a href="${base}about">About</a></nav>`;
}

function buildPages(projects, base) {
  const about = ABOUT_TEXT.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
  const header = (title) => `<header><h1>${escapeHtml(title)}</h1>${nav(base)}</header>`;

  const pages = [
    {
      route: "/",
      file: "index.html",
      title: SITE.title,
      description: SITE.description,
      graph: [personNode(), websiteNode()],
      body: `${header(`${SITE.name} — ${SITE.jobTitle}`)}<main>${about}<h2>Selected projects</h2>${projectLinks(projects, base)}</main>`
    },
    {
      route: "/about",
      file: "about.html",
      title: `About — ${SITE.name}, ${SITE.jobTitle}`,
      description: SITE.description,
      graph: [
        personNode(),
        websiteNode(),
        {
          "@type": "ProfilePage",
          "@id": `${SITE.url}/about#page`,
          url: `${SITE.url}/about`,
          name: `About ${SITE.name}`,
          mainEntity: { "@id": `${SITE.url}/#person` },
          isPartOf: { "@id": `${SITE.url}/#website` }
        }
      ],
      body: `${header(`About ${SITE.name}`)}<main>${about}<h2>Contact</h2><ul><li><a href="${escapeHtml(SITE.instagram)}" rel="me">Instagram</a></li><li><a href="${escapeHtml(SITE.linkedin)}" rel="me">LinkedIn</a></li></ul></main>`
    },
    {
      route: "/gallery",
      file: "gallery.html",
      title: `Gallery — ${SITE.name}, ${SITE.jobTitle}`,
      description: `Selected branding, campaign, film and design work by Creative Director ${SITE.name}.`,
      graph: [
        personNode(),
        {
          "@type": "CollectionPage",
          "@id": `${SITE.url}/gallery#page`,
          url: `${SITE.url}/gallery`,
          name: `Gallery — ${SITE.name}`,
          isPartOf: { "@id": `${SITE.url}/#website` },
          hasPart: projects.map((project) => ({ "@id": `${SITE.url}/project/${project.slug}#work` }))
        }
      ],
      body: `${header(`Gallery — ${SITE.name}`)}<main>${projectLinks(projects, base)}</main>`
    },
    {
      route: "/filters",
      file: "filters.html",
      title: `Browse work by client, project and discipline — ${SITE.name}`,
      description: `Filter the portfolio of Creative Director ${SITE.name} by client, project, category and discipline.`,
      graph: [personNode()],
      body: `${header(`Browse the work of ${SITE.name}`)}<main>${projectLinks(projects, base)}</main>`
    }
  ];

  for (const project of projects) {
    const title = projectTitle(project.name);
    const description = projectDescription(project);
    // Full text for crawlers and structured data; the short version is only
    // for the search-result snippet (<meta name="description">).
    const fullText = project.description ? project.description.replace(/\s+/g, " ").trim() : description;
    const url = `${SITE.url}/project/${project.slug}`;
    const images = project.images.map((image) => image.src);
    const imageList = project.images
      .map(
        (image) =>
          `<li><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt || `${titleCase(project.name)} by ${SITE.name}`)}" loading="lazy"></li>`
      )
      .join("");
    pages.push({
      route: `/project/${project.slug}`,
      file: `project/${project.slug}.html`,
      title,
      description,
      image: images[0],
      graph: [
        personNode(),
        {
          "@type": "CreativeWork",
          "@id": `${url}#work`,
          url,
          name: titleCase(project.name),
          description: fullText,
          creator: { "@id": `${SITE.url}/#person` },
          ...(project.client ? { sourceOrganization: { "@type": "Organization", name: titleCase(project.client) } } : {}),
          ...(project.category || project.discipline
            ? { genre: [project.category, project.discipline].filter(Boolean).map(titleCase) }
            : {}),
          ...(images.length ? { image: images } : {}),
          ...(project.videos.length ? { video: project.videos.map((video) => ({ "@type": "VideoObject", name: titleCase(project.name), contentUrl: video.src, thumbnailUrl: images[0] || `${SITE.url}${SITE.image}`, description })) } : {}),
          isPartOf: { "@id": `${SITE.url}/#website` }
        }
      ],
      body: `${header(titleCase(project.name))}<main><p>${escapeHtml(project.description || description).replace(/\n/g, "<br>")}</p>${
        imageList ? `<ul>${imageList}</ul>` : ""
      }<h2>More projects</h2>${projectLinks(projects.filter((other) => other.slug !== project.slug), base)}</main>`
    });
  }

  return pages;
}

function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`seo: index.html is missing ${pattern}`);
  return html.replace(pattern, replacement);
}

function renderPage(template, page, { noindex }) {
  const url = `${SITE.url}${page.route === "/" ? "/" : page.route}`;
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const image = page.image && /\.(?:jpe?g|png|webp)$/i.test(page.image) ? page.image : `${SITE.url}${SITE.image}`;
  let html = template;
  html = replaceTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = replaceTag(html, /<meta\s+name="description"[\s\S]*?\/>/, `<meta name="description" content="${description}" />`);
  html = replaceTag(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
  html = replaceTag(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
  html = replaceTag(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}" />`);
  html = replaceTag(html, /<meta\s+property="og:description"[\s\S]*?\/>/, `<meta property="og:description" content="${description}" />`);
  html = replaceTag(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}" />`);
  html = replaceTag(html, /<meta\s+name="twitter:description"[\s\S]*?\/>/, `<meta name="twitter:description" content="${description}" />`);
  html = replaceTag(html, /<meta property="og:image" [^>]*>/, `<meta property="og:image" content="${escapeHtml(image)}" />`);
  html = replaceTag(html, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeHtml(image)}" />`);
  if (image !== `${SITE.url}${SITE.image}`) {
    // Dimensions/alt of the default image no longer apply.
    html = html.replace(/\s*<meta property="og:image:(?:width|height|alt)"[^>]*>/g, "");
  }
  if (page.route.startsWith("/project/")) {
    html = html.replace('<meta property="og:type" content="website" />', '<meta property="og:type" content="article" />');
  }
  if (noindex) {
    html = replaceTag(html, /<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow" />');
  }
  html = replaceTag(
    html,
    /<!--seo:jsonld-->[\s\S]*?<!--\/seo:jsonld-->/,
    jsonLd({ "@context": "https://schema.org", "@graph": page.graph })
  );
  html = replaceTag(html, /<!--seo:noscript-->[\s\S]*?<!--\/seo:noscript-->/, `<noscript>${page.body}</noscript>`);
  return html;
}

function sitemap(pages) {
  const entries = pages
    .map((page) => {
      const images = page.route.startsWith("/project/")
        ? (page.graph.find((node) => node["@type"] === "CreativeWork")?.image || [])
            .slice(0, 50)
            .map((src) => `<image:image><image:loc>${escapeHtml(src)}</image:loc></image:image>`)
            .join("")
        : "";
      return `  <url><loc>${SITE.url}${page.route}</loc>${images}</url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries}
</urlset>
`;
}

function robots({ noindex }) {
  if (noindex) return "User-agent: *\nDisallow: /\n";
  // Search engines and AI assistants are explicitly welcome: the goal of this
  // site is to be found. /staging/ is a preview copy and must not compete with
  // the real pages.
  return `# Search engines and AI crawlers are welcome.
User-agent: *
Allow: /
Disallow: /staging/

User-agent: GPTBot
Allow: /
Disallow: /staging/

User-agent: OAI-SearchBot
Allow: /
Disallow: /staging/

User-agent: ClaudeBot
Allow: /
Disallow: /staging/

User-agent: Claude-SearchBot
Allow: /
Disallow: /staging/

User-agent: PerplexityBot
Allow: /
Disallow: /staging/

User-agent: Google-Extended
Allow: /
Disallow: /staging/

Sitemap: ${SITE.url}/sitemap.xml
`;
}

function llmsTxt(projects) {
  const list = projects
    .map((project) => `- [${titleCase(project.name)}](${SITE.url}/project/${project.slug}): ${project.description ? project.description.replace(/\s+/g, " ").trim() : projectDescription(project)}`)
    .join("\n");
  return `# ${SITE.name} — ${SITE.jobTitle}

> ${SITE.description}

${ABOUT_TEXT.join("\n\n")}

## Pages

- [About](${SITE.url}/about): Biography, background and contact links.
- [Gallery](${SITE.url}/gallery): All work in one scrolling grid.
- [Filters](${SITE.url}/filters): Browse by client, project, category and discipline.

## Projects

${list}

## Elsewhere

${SITE.sameAs.map((url) => `- ${url}`).join("\n")}
`;
}

export default function seoBuildPlugin() {
  let config;
  return {
    name: "seo-build",
    apply: "build",
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      const templatePath = path.join(outDir, "index.html");
      if (!fs.existsSync(templatePath)) return;

      const log = (message) => config.logger.info(message);
      const env = config.env || {};
      const base = config.base.endsWith("/") ? config.base : `${config.base}/`;
      // Only the production build at the site root may be indexed.
      const noindex = config.mode !== "production" || base !== "/";

      const items = await loadItems(config.root, env.VITE_ITEMS_CSV_URL || DEFAULT_ITEMS_CSV_URL, log);
      const descriptions = await loadProjectDescriptions(env.VITE_PROJECTS_CSV_URL || DEFAULT_PROJECTS_CSV_URL, log);
      const localItems = JSON.parse(fs.readFileSync(path.join(config.root, "src/data/scroll-items.json"), "utf8"));
      const projects = groupProjects(items, descriptions, createAltLookup(localItems));
      const pages = buildPages(projects, base);
      const template = fs.readFileSync(templatePath, "utf8");

      for (const page of pages) {
        const target = path.join(outDir, page.file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, renderPage(template, page, { noindex }));
      }

      fs.writeFileSync(path.join(outDir, "robots.txt"), robots({ noindex }));
      if (!noindex) {
        fs.writeFileSync(path.join(outDir, "sitemap.xml"), sitemap(pages));
        fs.writeFileSync(path.join(outDir, "llms.txt"), llmsTxt(projects));
      }
      log(`seo: wrote ${pages.length} pages${noindex ? " (noindex)" : ", sitemap.xml, robots.txt, llms.txt"}`);
    }
  };
}
