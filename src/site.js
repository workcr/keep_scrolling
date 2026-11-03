// Single source of truth for SEO metadata. Used by the browser (Seo.jsx) and by
// the build-time generator (seo/build-plugin.js), so keep it free of
// browser-only or Vite-only APIs.
export const SITE = {
  url: "https://keep-scrolling.com",
  name: "Rodrigo Mendes",
  siteName: "Keep Scrolling — Rodrigo Mendes",
  jobTitle: "Creative Director",
  title: "Rodrigo Mendes — Creative Director & Art Director Portfolio",
  description:
    "Portfolio of Rodrigo Mendes, art-driven Creative Director with 25+ years across São Paulo, Portland and Los Angeles (Wieden+Kennedy, BBDO). Brand platforms, campaigns, design systems and film for Nike and other global brands.",
  image: "/og-image.jpg",
  imageAlt: "Portrait of Rodrigo Mendes against a red-orange background",
  locale: "en_US",
  email: "rmnds1@gmail.com",
  instagram: "https://www.instagram.com/rmnds1/",
  linkedin: "https://www.linkedin.com/in/rodrigo-mendes-4029b821",
  sameAs: ["https://www.linkedin.com/in/rodrigo-mendes-4029b821", "https://www.instagram.com/rmnds1/"],
  knowsAbout: [
    "Creative Direction",
    "Art Direction",
    "Brand Identity",
    "Design Systems",
    "Advertising Campaigns",
    "Typography",
    "Film"
  ],
  awards: ["Cannes Lions", "Clio Awards", "D&AD", "The One Show"]
};

// Sheet values are lowercase ("dtms branding"). Capitalise words and upper-case
// vowel-less tokens, which are almost always acronyms (DTMS, CR, WKSP, HS).
export function titleCase(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (/[A-Z]/.test(word)) return word;
      if (/^[b-df-hj-np-tv-z]+$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function projectTitle(project) {
  return `${titleCase(project)} — ${SITE.name}`;
}

export function projectDescription({ project, client, category, discipline, description } = {}) {
  if (description && String(description).trim()) return String(description).trim().slice(0, 300);
  const parts = [titleCase(project)];
  if (client) parts.push(`for ${titleCase(client)}`);
  const kinds = [category, discipline].filter(Boolean).map((value) => String(value).toLowerCase());
  const kindText = kinds.length ? ` ${[...new Set(kinds)].join(", ")}` : "";
  return `${parts.join(" ")} —${kindText} work by Creative Director ${SITE.name}.`;
}
