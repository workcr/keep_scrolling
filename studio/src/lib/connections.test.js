import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, checkAccess, refusalMessage, resetAccessKeyCache } from "./access.js";
import { triggerSiteDeploy } from "./github.js";
import { base64urlDecode, signJwt, verifyJwt } from "./jwt.js";
import { columnLetter, createSheetsClient, resetTokenCache } from "./sheets.js";

const RS256 = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
const TEAM = "https://rmnds.cloudflareaccess.com";
const AUD = "studio-aud-123";

async function keyPair(kid = "k1") {
  const pair = await crypto.subtle.generateKey(RS256, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid, alg: "RS256", use: "sig" };
  return { ...pair, jwks: { keys: [jwk] }, kid };
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function accessRequest(token) {
  return new Request("https://studio.example.workers.dev/api/drafts", {
    headers: token ? { "Cf-Access-Jwt-Assertion": token } : {}
  });
}

const env = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAILS: "rmnds1@gmail.com" };

describe("Cloudflare Access check", () => {
  let keys;
  let fetchKeys;
  beforeEach(async () => {
    resetAccessKeyCache();
    keys = await keyPair();
    fetchKeys = async (url) => {
      expect(url).toBe(`${TEAM}/cdn-cgi/access/certs`);
      return new Response(JSON.stringify(keys.jwks));
    };
  });

  const sign = (claims, key = keys.privateKey, kid = keys.kid) =>
    signJwt({ iss: TEAM, aud: [AUD], email: "rmnds1@gmail.com", exp: now() + 300, ...claims }, key, { kid });

  it("lets the owner in", async () => {
    expect(await authenticate(accessRequest(await sign({})), env, fetchKeys)).toEqual({ email: "rmnds1@gmail.com" });
  });

  it("rejects missing, expired, foreign and tampered tokens, and other people", async () => {
    const other = await keyPair("k1");
    const attempts = [
      null,
      await sign({ exp: now() - 10 }),
      await sign({ aud: ["someone-else"] }),
      await sign({ iss: "https://evil.cloudflareaccess.com" }),
      await sign({ email: "stranger@example.com" }),
      await sign({}, other.privateKey)
    ];
    for (const token of attempts) {
      expect(await authenticate(accessRequest(token), env, fetchKeys)).toBeNull();
    }
  });

  it("explains refusals to a signed-in owner, and nothing to a stranger", async () => {
    const check = async (token, e = env) => checkAccess(accessRequest(token), e, fetchKeys);
    expect((await check(null)).reason).toBe("no-login");
    expect(refusalMessage(await check(null))).toBe("Sign in through Cloudflare Access to use the Studio.");
    expect(await check(await sign({ aud: ["new-app"] }))).toMatchObject({ reason: "token-rejected", detail: "wrong audience" });
    expect(refusalMessage(await check(await sign({ aud: ["new-app"] })))).toMatch(/AUD tag/);
    expect(await check(await sign({ email: "other@example.com" }))).toMatchObject({ reason: "email-not-allowed", detail: "other@example.com" });
    expect(await check(await sign({}), { ...env, ALLOWED_EMAILS: "" })).toMatchObject({ reason: "not-configured", detail: "ALLOWED_EMAILS secret" });
    expect((await check(await sign({}))).user).toEqual({ email: "rmnds1@gmail.com" });
  });

  it("accepts the owner by email fingerprint, so the address needn't be in the public repo", async () => {
    const hashed = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAIL_SHA256: "646310a8ebe3c1c53d21a39d19f3f55ca69a44d651ca8f86f330c1834a689046" };
    expect((await checkAccess(accessRequest(await sign({})), hashed, fetchKeys)).user).toEqual({ email: "rmnds1@gmail.com" });
    expect((await checkAccess(accessRequest(await sign({ email: "RMNDS1@gmail.com" })), hashed, fetchKeys)).user).toEqual({ email: "rmnds1@gmail.com" });
    expect((await checkAccess(accessRequest(await sign({ email: "other@example.com" })), hashed, fetchKeys)).reason).toBe("email-not-allowed");
  });

  it("fails closed when Access is not configured", async () => {
    expect(await authenticate(accessRequest(await sign({})), {}, fetchKeys)).toBeNull();
  });

  it("only allows the dev bypass on localhost", async () => {
    const bypass = { DEV_BYPASS_AUTH: "true" };
    expect(await authenticate(new Request("http://localhost:8787/api"), bypass)).toEqual({ email: "dev@localhost" });
    expect(await authenticate(new Request("https://studio.example.workers.dev/api"), bypass)).toBeNull();
  });

  it("verifies tokens with the matching key id only", async () => {
    const token = await sign({}, keys.privateKey, "unknown-kid");
    await expect(verifyJwt(token, keys.jwks, { audience: AUD, issuer: TEAM })).rejects.toThrow("unknown signing key");
  });
});

describe("Google Sheets client", () => {
  it("signs in as the service account and reads, appends and updates", async () => {
    resetTokenCache();
    const pair = await crypto.subtle.generateKey(RS256, true, ["sign", "verify"]);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`;
    const account = JSON.stringify({ client_email: "studio@proj.iam.gserviceaccount.com", private_key: pem });

    const calls = [];
    const fakeFetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
        const assertion = new URLSearchParams(init.body).get("assertion");
        const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(assertion.split(".")[1])));
        expect(claims.iss).toBe("studio@proj.iam.gserviceaccount.com");
        expect(claims.scope).toBe("https://www.googleapis.com/auth/spreadsheets");
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
      }
      expect(init.headers.Authorization).toBe("Bearer tok");
      if (init.method === undefined) {
        return new Response(JSON.stringify({ values: [["id", " src "], ["scroll-item-1", "a.webp"], ["scroll-item-2"]] }));
      }
      return new Response("{}");
    };

    const sheets = createSheetsClient({ spreadsheetId: "SHEET", serviceAccountJson: account, fetchImpl: fakeFetch });
    const tab = await sheets.readTab("Sheet1");
    expect(tab.headers).toEqual(["id", "src"]);
    expect(tab.rows).toEqual([
      { _row: 2, id: "scroll-item-1", src: "a.webp" },
      { _row: 3, id: "scroll-item-2", src: "" }
    ]);
    await sheets.appendRows("Sheet1", [["scroll-item-3", "b.webp"]]);
    await sheets.updateCells("projects", [{ row: 4, column: 1, value: "Text" }]);

    const urls = calls.map((c) => c.url);
    expect(urls.filter((u) => u.includes("oauth2")).length).toBe(1); // token is reused
    expect(urls).toContain("https://sheets.googleapis.com/v4/spreadsheets/SHEET/values/'Sheet1'".replace("'Sheet1'", encodeURIComponent("'Sheet1'")));
    expect(urls.some((u) => u.includes(":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS"))).toBe(true);
    const batch = JSON.parse(calls.find((c) => c.url.endsWith("/values:batchUpdate")).init.body);
    expect(batch.data[0].range).toBe("'projects'!B4");
  });

  it("deletes rows bottom-up in the right tab", async () => {
    resetTokenCache();
    const pair = await crypto.subtle.generateKey(RS256, true, ["sign", "verify"]);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`;
    const account = JSON.stringify({ client_email: "studio@p.iam.gserviceaccount.com", private_key: pem });
    const calls = [];
    const fakeFetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
      if (String(url).includes("?fields=")) {
        return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }, { properties: { sheetId: 77, title: "projects" } }] }));
      }
      return new Response("{}");
    };
    const sheets = createSheetsClient({ spreadsheetId: "SHEET", serviceAccountJson: account, fetchImpl: fakeFetch });
    await sheets.deleteRows("projects", [3, 9]);
    const batch = calls.find((c) => c.url.endsWith("/SHEET:batchUpdate"));
    expect(JSON.parse(batch.init.body).requests).toEqual([
      { deleteDimension: { range: { sheetId: 77, dimension: "ROWS", startIndex: 8, endIndex: 9 } } },
      { deleteDimension: { range: { sheetId: 77, dimension: "ROWS", startIndex: 2, endIndex: 3 } } }
    ]);
    await expect(sheets.deleteRows("Nope", [2])).rejects.toThrow(/No tab named/);
  });

  it("names columns like the spreadsheet does", () => {
    expect([0, 25, 26, 27, 51].map(columnLetter)).toEqual(["A", "Z", "AA", "AB", "AZ"]);
  });
});

describe("site deploy trigger", () => {
  it("dispatches the deploy workflow on main", async () => {
    let request;
    const result = await triggerSiteDeploy({ GITHUB_TOKEN: "gh" }, async (url, init) => {
      request = { url, init };
      return new Response(null, { status: 204 });
    });
    expect(result).toEqual({ ok: true });
    expect(request.url).toBe("https://api.github.com/repos/workcr/keep_scrolling/actions/workflows/deploy.yml/dispatches");
    expect(JSON.parse(request.init.body)).toEqual({ ref: "main" });
  });

  it("reports, rather than throws, when it can't deploy", async () => {
    expect((await triggerSiteDeploy({})).ok).toBe(false);
    const result = await triggerSiteDeploy({ GITHUB_TOKEN: "gh" }, async () => new Response("nope", { status: 403 }));
    expect(result).toEqual({ ok: false, reason: "GitHub responded 403: nope" });
  });
});
