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
  return (await checkAccess(request, env, fetchImpl)).user;
}

/**
 * Like authenticate(), but also says why a request was refused, so setup
 * problems can be fixed. The reasons reveal nothing useful to a stranger:
 * without a Cloudflare Access login they only ever get "no-login".
 * @returns {Promise<{ user: { email: string } | null, reason?: string, detail?: string }>}
 */
export async function checkAccess(request, env, fetchImpl = fetch) {
  // Local development only (wrangler dev): never set this in production.
  if (env.DEV_BYPASS_AUTH === "true" && new URL(request.url).hostname === "localhost") {
    return { user: { email: "dev@localhost" } };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { user: null, reason: "no-login" };

  const teamDomain = String(env.ACCESS_TEAM_DOMAIN || "").replace(/\/$/, "");
  const audience = env.ACCESS_AUD;
  const list = (value) =>
    String(value || "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
  // Who may sign in: plain addresses (ALLOWED_EMAILS, a secret) and/or SHA-256
  // fingerprints of addresses (ALLOWED_EMAIL_SHA256, safe to keep in the public
  // repository because a fingerprint can't be turned back into the address).
  const allowed = list(env.ALLOWED_EMAILS);
  const allowedHashes = list(env.ALLOWED_EMAIL_SHA256);
  if (!teamDomain || !audience) return { user: null, reason: "not-configured", detail: "ACCESS_TEAM_DOMAIN / ACCESS_AUD" };
  if (!allowed.length && !allowedHashes.length) return { user: null, reason: "not-configured", detail: "ALLOWED_EMAILS secret" };

  let claims;
  try {
    claims = await verifyJwt(token, await accessKeys(teamDomain, fetchImpl), { audience, issuer: teamDomain });
  } catch (error) {
    return { user: null, reason: "token-rejected", detail: String(error.message || error) };
  }
  const email = String(claims.email || "").toLowerCase();
  const permitted = email && (allowed.includes(email) || allowedHashes.includes(await sha256Hex(email)));
  if (!permitted) return { user: null, reason: "email-not-allowed", detail: email || "(no email in login)" };
  return { user: { email } };
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Plain-language explanation of a refusal, for the owner. */
export function refusalMessage({ reason, detail }) {
  switch (reason) {
    case "not-configured":
      return `You signed in, but the Studio isn't fully configured: ${detail} is missing.`;
    case "token-rejected":
      return `You signed in, but the Studio couldn't verify the login (${detail}). If it says "wrong audience", the AUD tag on the Access tab has changed: send it again.`;
    case "email-not-allowed":
      return `You signed in as ${detail}, but that address isn't in the ALLOWED_EMAILS secret.`;
    default:
      return "Sign in through Cloudflare Access to use the Studio.";
  }
}
