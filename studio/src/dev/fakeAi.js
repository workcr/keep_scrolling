// Local development only (DEV_FAKE_AI=true on localhost): a stand-in for the
// Claude API with canned answers, so the Studio page can be tried end to end
// without an API key or spending anything.
export const fakeAi = {
  beta: {
    messages: {
      async create(request) {
        const schema = request.output_config.format.schema;
        const answer = schema.required.includes("alt")
          ? {
              project: "dev sample project",
              project_is_new: true,
              project_reason: "Practice answer from the local stand-in, not the real AI.",
              client: "",
              category: "Design",
              discipline: "Art Direction",
              alt: "Practice alt text from the local stand-in.",
              confidence: "low"
            }
          : { description: "Practice description from the local stand-in.\nIt only proves the button works.", missing: ["result"] };
        return { stop_reason: "end_turn", model: "dev", content: [{ type: "text", text: JSON.stringify(answer) }], usage: {} };
      }
    }
  }
};
