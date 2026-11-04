import { authenticate } from "./lib/access.js";
import { handle } from "./app.js";
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
    const response = await handle(request, env, deps);
    if (response) return response;
    // Everything that isn't /api/* is the Studio page (studio/public). It holds
    // no data, but it still requires the signed-in owner.
    if (!(await authenticate(request, env))) {
      return new Response("Sign in through Cloudflare Access to use the Studio.", { status: 401 });
    }
    return env.ASSETS.fetch(request);
  }
};
