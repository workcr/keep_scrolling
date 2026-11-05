// Minimal RS256 JWT signing/verification with the Web Crypto API (available
// in Cloudflare Workers and Node 20+). Used to sign Google service-account
// assertions and to verify Cloudflare Access login tokens.

const encoder = new TextEncoder();

export function base64url(input) {
  const bytes = typeof input === "string" ? encoder.encode(input) : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const RS256 = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };

export async function importPrivateKeyPem(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, RS256, false, ["sign"]);
}

export async function signJwt(claims, privateKey, header = {}) {
  const head = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", ...header }));
  const body = base64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(RS256, privateKey, encoder.encode(`${head}.${body}`));
  return `${head}.${body}.${base64url(signature)}`;
}

/**
 * Verify an RS256 JWT against a JWKS ({ keys: [...] }).
 * Returns the claims, or throws with a reason.
 */
export async function verifyJwt(token, jwks, { audience, issuer, now = Date.now() / 1000 } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [head, body, signature] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(head)));
  if (header.alg !== "RS256") throw new Error("unexpected algorithm");
  const jwk = (jwks.keys || []).find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("unknown signing key");
  const key = await crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"]);
  const valid = await crypto.subtle.verify(RS256, key, base64urlDecode(signature), encoder.encode(`${head}.${body}`));
  if (!valid) throw new Error("bad signature");

  const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
  if (typeof claims.exp !== "number" || claims.exp < now) throw new Error("token expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) throw new Error("token not yet valid");
  if (issuer && claims.iss !== issuer) throw new Error("wrong issuer");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (audience && !audiences.includes(audience)) throw new Error("wrong audience");
  return claims;
}
