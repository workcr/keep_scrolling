// Who is allowed in. Cloudflare Access sits in front of the Studio and signs
// every request with a JWT (header Cf-Access-Jwt-Assertion). The Worker checks
// that token itself as well, so the Studio stays locked even if Access is
// misconfigured or the Worker is reached another way. Fails closed: without
// ACCESS_TEAM_DOMAIN, ACCESS_AUD and ALLOWED_EMAILS, nobody gets in.

import { verifyJwt } from "./jwt.js";

let cachedKeys = null;
let cachedAt = 0;

async function accessKeys(teamDomain, fetchImpl) {
  if (cachedKeys && Date.now() - cachedAt < 60 * 60 * 1000) return cachedKeys;
  const response = await fetchImpl(`${teamDomain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`could not load Access keys (${response.status})`);
  cachedKeys = await response.json();
  cachedAt = Date.now();
  return cachedKeys;
}

export function resetAccessKeyCache() {
  cachedKeys = null;
  cachedAt = 0;
}

/**
 * @returns {Promise<{ email: string } | null>} the signed-in user, or null
 */
export async function authenticate(request, env, fetchImpl = fetch) {
  // Local development only (wrangler dev): never set this in production.
  if (env.DEV_BYPASS_AUTH === "true" && new URL(request.url).hostname === "localhost") {
    return { email: "dev@localhost" };
  }

  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
  const audience = env.ACCESS_AUD;
  const allowed = String(env.ALLOWED_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (!teamDomain || !audience || !allowed.length) return null;

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  try {
    const claims = await verifyJwt(token, await accessKeys(teamDomain, fetchImpl), {
      audience,
      issuer: teamDomain
    });
    const email = String(claims.email || "").toLowerCase();
    return allowed.includes(email) ? { email } : null;
  } catch {
    return null;
  }
}
