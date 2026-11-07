// AI drafts for the Studio, using the Claude API.
//
// Two jobs, both returning structured JSON:
//   1. draftMedia: look at an uploaded image (or a video's still frames) and
//      suggest the project, client, category, discipline and alt text.
//   2. writeDescription: write a project description from YOUR answers, in
//      the style of an existing description.
//
// Ground rule for both: describe only what is visible or what you told it.
// Roles, credits, years, clients and results are never invented.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AiError extends Error {}

export function createClient(env) {
  if (!env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

const MEDIA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["project", "project_is_new", "project_reason", "client", "category", "discipline", "alt", "confidence"],
  properties: {
    project: { type: "string", description: "Existing project name exactly as listed, or a short lower-case name for a new project." },
    project_is_new: { type: "boolean" },
    project_reason: { type: "string", description: "One short sentence: why this project." },
    client: { type: "string", description: "Client/brand if listed for the project or clearly visible (e.g. a logo); otherwise empty." },
    category: { type: "string", description: "One of the existing categories, or empty." },
    discipline: { type: "string", description: "One of the existing disciplines, or empty." },
    alt: { type: "string", description: "Alt text, one or two sentences." },
    confidence: { type: "string", enum: ["high", "medium", "low"] }
  }
};

const DESCRIPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["description", "missing"],
  properties: {
    description: { type: "string" },
    missing: {
      type: "array",
      items: { type: "string" },
      description: "Facts that would make the description stronger but were not provided."
    }
  }
};

// The owner's own descriptions, agreed as the house style. Used as examples
// of tone and structure only; their facts never carry over to other projects.
export const STYLE_EXAMPLES = [
  `For Nike, we turned the Brazilian way of playing football into a single word: #brasileiragem.

The style is hard to put into words, so we invented one. Part slang, it captures the creativity, flair, and swagger Brazilians bring to the game.

To help turn #brasileiragem into a cultural movement, we teamed up with singer-songwriter Fabio Brazza on an original song, “Brasileiragem,” released on radio and streaming platforms as part of the campaign.

I worked on it as Creative Director at Wieden+Kennedy (2016).`,
  `“Connecting Changes Everything” gave AT&T a new brand voice, shifting the focus from deals and promotions to the power of human connection.

After years of mostly retail advertising, AT&T needed to show what it stood for beyond great prices. I worked on the campaign as Creative Director at BBDO (2023).

As part of it, we created a print series of intimate portraits by photographer Magdalena Wosinska, each paired with a short, personal story about how connectivity made a real difference in someone’s life.`,
  `In 2024, I created the visual identity for CR, the name my former creative partner, Caio Mattoso, and I worked under. It’s set in Octagrid, the first typeface I designed.

Typography has always been central to how I work, and our own brand was the obvious place to use it.

We positioned ourselves as creative directors who combine strategic thinking with a passion for crafting ideas and design systems that help brands make a lasting impact on culture.

We created everything from the logo and website to social media assets, posters, and apparel.

Fun fact: Octagrid is also the typeface you’re reading right now.`,
  `I designed the visual identity for Don’t Touch My Soda, film director Felipe Mansur’s new production company.

Felipe, a longtime friend, already had the name. He wanted the company to be a creative sanctuary, where his team could protect great ideas and the craft behind them. For the logo, he wanted to capture the lettering he remembered from soda cans growing up.

I took that starting point and mixed in influences from designers like Herb Lubalin, whose work combined expressive typography, bold personality, and timeless style.

I brought the identity to life with designer Cacá Barabás and motion designer Everton Guilherme.`,
  `Surf Overdose was the first apparel collection for Surf Junkie Club, a community of surf lovers who treat the ocean like an addiction. A good one.

The idea was to capture that irresistible urge to surf, chase the next wave, and spend as much time in the ocean as possible.

The collection featured 3,280 limited-edition pieces, produced on demand with a focus on quality, craft, and comfort. From oversized tees and hoodies to shirts and caps, every piece reflected the laid-back attitude of surf culture.

Visually, we went bold: expressive typography, clean compositions, and tactile details that bring the club’s raw, obsessive energy to life, all set in Söhne Breit by Klim Type Foundry.

I designed the collection with Cacá Barabás. 3D design by Flavio Carvalho; brand strategy by Caio Mattoso, Marcelo Serpa, and Felipe Baracchini, who also led production.`
];

const MEDIA_SYSTEM = `You are the picture editor for the portfolio of Rodrigo Mendes, a Creative Director (keep-scrolling.com). For each uploaded piece you suggest catalogue fields and write alt text.

Alt text rules:
- Describe what is actually visible: subject, composition, colours, medium (poster, apparel, packaging, video still...).
- Quote any clearly readable words exactly, in quotation marks. Never guess at text you can't read.
- One or two sentences, under 220 characters. Don't start with "Image of" or "Photo of".
- For a video you see six frames in order: describe what happens across them.

Catalogue rules:
- Prefer an existing project when the piece clearly belongs to it (same campaign, brand, typography, art direction). Use the name exactly as listed.
- Otherwise propose a short, lower-case project name and set project_is_new to true.
- Use existing category and discipline values when one fits; leave empty rather than invent one.
- Client: only if it is the existing project's client, or a brand is unmistakably visible. Never guess.
- confidence: how sure you are about the project match.`;

const DESCRIPTION_SYSTEM = `You write project descriptions for the portfolio of Rodrigo Mendes, a Creative Director (keep-scrolling.com), in his own voice.

Facts:
- Use ONLY facts from the owner's answers and what the alt texts say is visible. Never invent a role, client, agency, year, credit, number, award or result. If something important is missing, list it in "missing" instead of filling the gap.
- Don't add results or awards unless the owner's answers state them. Never brag.

Voice and structure (match the examples):
- First person: "I" for Rodrigo's own part, "we" for the team. Never the third person ("Rodrigo Mendes…").
- Open with one sentence that says what the project is and for whom; it is shown under the link in search results (about 155 characters).
- Name things precisely: keep the name of a client, company, brand or partnership separate from the work made for it. Write "I designed the visual identity for Don't Touch My Soda, Felipe Mansur's production company", never "Don't Touch My Soda is the visual identity…".
- State Rodrigo's role, and the agency and year when given, in one plain sentence (e.g. "I worked on it as Creative Director at BBDO (2023).").
- Three to five short paragraphs, separated by a blank line. Plain, warm, confident English with concrete details.
- Credit collaborators in a closing sentence, each with their role ("with designer Cacá Barabás and motion designer Everton Guilherme"). No praise adjectives ("incredibly talented", "legendary", "perfect", "beautiful").
- No hype words ("innovative", "cutting-edge", "seamless"), no emojis. Hashtags only when the hashtag is the campaign's own name.
- American English with the Oxford comma, curly quotes.`;

function catalogText({ projects }) {
  const lines = projects.map((p) => {
    const facts = [p.client && `client: ${p.client}`, p.category && `category: ${p.category}`, p.discipline && `discipline: ${p.discipline}`]
      .filter(Boolean)
      .join("; ");
    const examples = (p.alts || []).slice(0, 3).map((alt) => `    · ${alt}`).join("\n");
    return `- ${p.project}${facts ? ` (${facts})` : ""}${examples ? `\n${examples}` : ""}`;
  });
  return lines.join("\n");
}

/** Summarise the live sheet into what the AI needs: projects with their fields and a few alt texts. */
export function buildCatalog(items = [], projectRows = []) {
  const byProject = new Map();
  for (const item of items) {
    const name = String(item["data-project"] || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byProject.has(key)) byProject.set(key, { project: name, client: "", category: "", discipline: "", alts: [] });
    const entry = byProject.get(key);
    entry.client ||= item["data-client"] || "";
    entry.category ||= item["data-category"] || "";
    entry.discipline ||= item["data-discipline"] || "";
    const alt = String(item.alt || "").trim();
    if (alt && !/needs a description/i.test(alt)) entry.alts.push(alt);
  }
  const values = (field) => [...new Set(items.map((item) => String(item[field] || "").trim()).filter(Boolean))].sort();
  const descriptions = new Map(projectRows.map((row) => [String(row.project || "").trim().toLowerCase(), String(row.description || "").trim()]));
  return {
    projects: [...byProject.values()].sort((a, b) => a.project.localeCompare(b.project)),
    categories: values("data-category"),
    disciplines: values("data-discipline"),
    clients: values("data-client"),
    descriptions
  };
}

async function ask(client, { system, content, schema, effort }) {
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      output_config: { effort, format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content }]
    });
  } catch (error) {
    const status = error?.status;
    if (status === 401) throw new AiError("The Claude API key is not valid. Replace ANTHROPIC_API_KEY in Cloudflare.");
    if (status === 429) throw new AiError("The Claude API is busy or your monthly spend limit was reached. Try again later or check console.anthropic.com.");
    throw new AiError(`The Claude API call failed${status ? ` (${status})` : ""}: ${error?.message || error}`);
  }
  if (response.stop_reason === "refusal") throw new AiError("Claude declined to draft this one. Please fill it in by hand.");
  if (response.stop_reason === "max_tokens") throw new AiError("Claude's answer was cut off. Try again.");
  const text = (response.content || []).filter((block) => block.type === "text").map((block) => block.text).join("");
  try {
    return { data: JSON.parse(text), usage: response.usage, model: response.model };
  } catch {
    throw new AiError("Claude's answer couldn't be read. Try again.");
  }
}

/**
 * @param {object} draft  a Studio draft (kind, file_name, width, height, src, variants, frames, poster)
 * @param {ReturnType<typeof buildCatalog>} catalog
 */
export async function draftMedia(client, draft, catalog) {
  const images =
    draft.kind === "video"
      ? (draft.frames || []).filter(Boolean)
      : [draft.variants?.["1600"] || draft.variants?.["960"] || draft.src].filter(Boolean);
  if (!images.length && draft.poster) images.push(draft.poster);
  if (!images.length) throw new AiError("The file hasn't finished uploading.");

  const context = [
    `Existing projects (with a few of their alt texts):\n${catalogText(catalog) || "(none yet)"}`,
    `Existing categories: ${catalog.categories.join(", ") || "(none)"}`,
    `Existing disciplines: ${catalog.disciplines.join(", ") || "(none)"}`,
    `Existing clients: ${catalog.clients.join(", ") || "(none)"}`
  ].join("\n\n");

  const content = [
    ...images.map((url) => ({ type: "image", source: { type: "url", url } })),
    {
      type: "text",
      text: `${context}\n\nNew upload: "${draft.file_name}" (${draft.kind}, ${draft.width}×${draft.height}${
        draft.kind === "video" ? `, ${images.length} frames in order` : ""
      }). The file name may hint at the project or client. Suggest the catalogue fields and alt text.`
    }
  ];
  const { data, usage } = await ask(client, { system: MEDIA_SYSTEM, content, schema: MEDIA_SCHEMA, effort: "medium" });
  return { suggestion: data, usage };
}

export const QUESTIONS = [
  { key: "role", label: "Your role", hint: "e.g. Creative Director, Art Director" },
  { key: "year", label: "Year", hint: "e.g. 2024" },
  { key: "agency", label: "Agency or studio", hint: "where you made it, if any" },
  { key: "idea", label: "The idea or brief", hint: "what was the problem, what was the idea" },
  { key: "result", label: "What happened after launch (optional)", hint: "e.g. released on radio and streaming; leave empty if you prefer" },
  { key: "credits", label: "Credits", hint: "Role: Name. Role: Name." }
];

/**
 * @param {{ project: string, answers: Record<string,string>, alts: string[], examples?: string[] }} input
 */
export async function writeDescription(client, { project, answers = {}, alts = [], examples = STYLE_EXAMPLES }) {
  const given = QUESTIONS.map(({ key, label }) => `${label}: ${String(answers[key] || "").trim() || "(not provided)"}`).join("\n");
  const content = [
    {
      type: "text",
      text: [
        `Examples of the house style (match their tone and structure, never their facts):\n${examples
          .map((example, n) => `--- Example ${n + 1} ---\n${example}`)
          .join("\n\n")}`,
        `Project: ${project}`,
        `Owner's answers:\n${given}`,
        `What the pieces show (alt texts):\n${alts.map((alt) => `- ${alt}`).join("\n") || "(none)"}`,
        "Write the description."
      ].join("\n\n")
    }
  ];
  const { data, usage } = await ask(client, { system: DESCRIPTION_SYSTEM, content, schema: DESCRIPTION_SCHEMA, effort: "high" });
  return { description: String(data.description || "").trim(), missing: data.missing || [], usage };
}
