import { describe, expect, it } from "vitest";
import scrollItems from "../../../src/data/scroll-items.json";
import { AiError, MODEL, buildCatalog, draftMedia, writeDescription } from "./ai.js";

function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        async create(request) {
          calls.push(request);
          if (reply instanceof Error) throw reply;
          return typeof reply === "function" ? reply(request) : reply;
        }
      }
    }
  };
}

const jsonReply = (data, extra = {}) => ({
  stop_reason: "end_turn",
  model: MODEL,
  content: [{ type: "text", text: JSON.stringify(data) }],
  usage: { input_tokens: 1000, output_tokens: 100 },
  ...extra
});

const sheetItems = scrollItems.map((item) => ({ ...item }));
const catalog = buildCatalog(sheetItems, [{ project: "surf overdose", description: "Surf Overdose was…" }]);

describe("buildCatalog", () => {
  it("summarises projects with their client and real alt texts only", () => {
    const sjc = catalog.projects.find((p) => p.project === "surf overdose");
    expect(sjc.client).toBe("surf junkie club");
    expect(sjc.alts.length).toBeGreaterThan(0);
    expect(sjc.alts.join(" ")).not.toMatch(/needs a description/);
    expect(catalog.categories.length).toBeGreaterThan(0);
    expect(catalog.descriptions.get("surf overdose")).toBe("Surf Overdose was…");
  });
});

describe("draftMedia", () => {
  const suggestion = {
    project: "surf overdose",
    project_is_new: false,
    project_reason: "Same cap and typography.",
    client: "surf junkie club",
    category: "Design",
    discipline: "Fashion Design",
    alt: "A black cap on a cactus.",
    confidence: "high"
  };

  it("sends the image by URL with the catalogue, structured output, and automatic fallback", async () => {
    const client = fakeClient(jsonReply(suggestion));
    const result = await draftMedia(
      client,
      { kind: "image", file_name: "cap.png", width: 2560, height: 1440, src: "https://m/a.webp", variants: { 960: "https://m/a-960.webp", 1600: "https://m/a-1600.webp" } },
      catalog
    );
    expect(result.suggestion).toEqual(suggestion);
    const request = client.calls[0];
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.fallbacks).toBe("default");
    expect(request.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.output_config.format.schema.required).toContain("alt");
    const [image, text] = request.messages[0].content;
    expect(image).toEqual({ type: "image", source: { type: "url", url: "https://m/a-1600.webp" } });
    expect(text.text).toMatch(/surf overdose/);
    expect(request.system).toMatch(/Never guess/);
  });

  it("sends all six frames for a video", async () => {
    const client = fakeClient(jsonReply(suggestion));
    const frames = [0, 1, 2, 3, 4, 5].map((n) => `https://m/f${n}.webp`);
    await draftMedia(client, { kind: "video", file_name: "reel.mp4", width: 1920, height: 1080, frames }, catalog);
    const images = client.calls[0].messages[0].content.filter((block) => block.type === "image");
    expect(images.map((block) => block.source.url)).toEqual(frames);
  });

  it("turns refusals, cut-off answers and API errors into plain messages", async () => {
    const draft = { kind: "image", file_name: "a.png", width: 1, height: 1, src: "https://m/a.webp", variants: {} };
    await expect(draftMedia(fakeClient(jsonReply({}, { stop_reason: "refusal", content: [] })), draft, catalog)).rejects.toThrow(/declined/);
    await expect(draftMedia(fakeClient(jsonReply({}, { stop_reason: "max_tokens" })), draft, catalog)).rejects.toThrow(/cut off/);
    await expect(draftMedia(fakeClient(Object.assign(new Error("bad key"), { status: 401 })), draft, catalog)).rejects.toThrow(/key is not valid/);
    await expect(draftMedia(fakeClient(Object.assign(new Error("slow"), { status: 429 })), draft, catalog)).rejects.toThrow(AiError);
    await expect(draftMedia(fakeClient(jsonReply({})), { ...draft, src: "", variants: {} }, catalog)).rejects.toThrow(/finished uploading/);
  });
});

describe("writeDescription", () => {
  it("passes only your answers and the visible content, in your style", async () => {
    const client = fakeClient(jsonReply({ description: "DTMS is a film production company…", missing: ["result"] }));
    const result = await writeDescription(client, {
      project: "dtms branding",
      answers: { role: "Creative Director", year: "2024", credits: "Designer: Cacá Barabás." },
      alts: ["DTMS poster reading “Bottle of Soda”."],
      styleExample: "Surf Overdose was the first apparel collection…"
    });
    expect(result).toMatchObject({ description: "DTMS is a film production company…", missing: ["result"] });
    const prompt = client.calls[0].messages[0].content[0].text;
    expect(prompt).toMatch(/Your role: Creative Director/);
    expect(prompt).toMatch(/Result or recognition: \(not provided\)/);
    expect(prompt).toMatch(/Surf Overdose was the first apparel collection/);
    expect(client.calls[0].system).toMatch(/Never invent a role, client, year, credit/);
    expect(client.calls[0].output_config.effort).toBe("high");
  });
});
