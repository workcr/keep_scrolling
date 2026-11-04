import { authenticate } from "./lib/access.js";
import { handle } from "./app.js";

export default {
  async fetch(request, env) {
    const response = await handle(request, env);
    if (response) return response;
    // Everything that isn't /api/* is the Studio page (studio/public). It holds
    // no data, but it still requires the signed-in owner.
    if (!(await authenticate(request, env))) {
      return new Response("Sign in through Cloudflare Access to use the Studio.", { status: 401 });
    }
    return env.ASSETS.fetch(request);
  }
};
