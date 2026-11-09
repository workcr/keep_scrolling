// Single source of truth for SEO metadata. Used by the browser (Seo.jsx) and by
// the build-time generator (seo/build-plugin.js), so keep it free of
// browser-only or Vite-only APIs.
export const SITE = {
  url: "https://keep-scrolling.com",
  // Opening line of the home page (src/components/HomeIntro.jsx).
  intro: "Hi, I’m Rodrigo Mendes, a Creative Director who builds ideas into systems that make a lasting impact on culture.",
  name: "Rodrigo Mendes",
  siteName: "Keep Scrolling — Rodrigo Mendes",
  jobTitle: "Creative Director",
  title: "Rodrigo Mendes — Creative Director & Art Director Portfolio",
  description:
    "Portfolio of Rodrigo Mendes, art-driven Creative Director with 25+ years across São Paulo, Portland and Los Angeles (Wieden+Kennedy, BBDO). Brand platforms, campaigns, design systems and film for Nike and other global brands.",
  image: "/og-image.jpg",
  imageAlt: "Portrait of Rodrigo Mendes against a red-orange background",
  locale: "en_US",
  // Stored in pieces so the address never appears as "name@domain" in the
  // page source or JavaScript bundle, where spam bots harvest addresses.
  // It is assembled only when a visitor clicks "Email" (see emailHref).
  emailParts: ["rmnds1", "gmail.com"],
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
// Names the word-by-word rules below would get wrong (acronyms with vowels,
// accents the sheet leaves out). Keys are lower-case.
const NAMES = {
  att: "AT&T",
  cce: "CCE",
  ow: "OW",
  ooh: "OOH",
  "3d": "3D",
  guarana: "Guaraná",
  sjc: "SJC"
};

export function titleCase(value = "") {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (NAMES[word.toLowerCase()]) return NAMES[word.toLowerCase()];
      if (/[A-Z]/.test(word)) return word;
      // Vowel-less words are acronyms (DTMS, CR, WKSP); "y" words like "why" are not.
      if (/^[b-df-hj-np-tv-xz]+$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function projectTitle(project) {
  return `${titleCase(project)} — ${SITE.name}`;
}

// Search results show roughly 155-160 characters. Long sheet descriptions
// (with line breaks, credit lists, etc.) are flattened to one line and cut at
// a word boundary so the snippet ends cleanly instead of mid-word.
export function summarize(text, max = 160) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:.—–-]+$/, "");
  return `${atWord || cut}…`;
}

export function projectDescription({ project, client, category, discipline, description } = {}) {
  if (description && String(description).trim()) return summarize(description);
  const parts = [titleCase(project)];
  if (client) parts.push(`for ${titleCase(client)}`);
  const kinds = [category, discipline].filter(Boolean).map((value) => String(value).toLowerCase());
  const kindText = kinds.length ? ` ${[...new Set(kinds)].join(", ")}` : "";
  return `${parts.join(" ")} —${kindText} work by Creative Director ${SITE.name}.`;
}

export function emailHref() {
  const [user, domain] = SITE.emailParts;
  return ["mailto:", user, String.fromCharCode(64), domain].join("");
}
