import { checkAccess, refusalMessage } from "./lib/access.js";
import { handle } from "./app.js";
import { fakeAi } from "./dev/fakeAi.js";
import { fakeSheets, sampleSheet } from "./dev/fakeSheets.js";

let devSheets = null;

function isLocal(request) {
  return new URL(request.url).hostname === "localhost";
}

export default {
  async fetch(request, env) {
    // Local development only: a practice copy of the sheet, never in production.
    const deps = {};
    if (env.DEV_FAKE_SHEET === "true" && isLocal(request)) {
      devSheets ||= fakeSheets(sampleSheet());
      deps.sheets = devSheets;
    }
    if (env.DEV_FAKE_AI === "true" && isLocal(request)) deps.ai = fakeAi;
    const response = await handle(request, env, deps);
    if (response) return response;
    // Everything that isn't /api/* is the Studio page (studio/public). It holds
    // no data, but it still requires the signed-in owner.
    const access = await checkAccess(request, env);
    if (!access.user) {
      return new Response(refusalMessage(access), { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return env.ASSETS.fetch(request);
  }
};
