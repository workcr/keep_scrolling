// Google Sheets access as a service account (a robot Google user the sheet is
// shared with as Editor). Credentials come from the GOOGLE_SERVICE_ACCOUNT_JSON
// secret: the JSON key file Google Cloud gives you, pasted whole.

import { importPrivateKeyPem, signJwt } from "./jwt.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

let cachedToken = null;

export function resetTokenCache() {
  cachedToken = null;
}

async function accessToken(serviceAccountJson, fetchImpl) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const account = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(
    { iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 },
    await importPrivateKeyPem(account.private_key)
  );
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  if (!response.ok) throw new Error(`Google sign-in failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

export function columnLetter(index) {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function quote(sheetName) {
  return `'${String(sheetName).replace(/'/g, "''")}'`;
}

export function createSheetsClient({ spreadsheetId, serviceAccountJson, fetchImpl = fetch }) {
  async function call(path, init = {}) {
    const token = await accessToken(serviceAccountJson, fetchImpl);
    const response = await fetchImpl(`${API}/${spreadsheetId}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) }
    });
    if (!response.ok) throw new Error(`Google Sheets error (${response.status}): ${await response.text()}`);
    return response.json();
  }

  return {
    /** Whole tab as { headers, rows: [{ _row, ...values }] }; _row is the 1-based sheet row. */
    async readTab(sheetName) {
      const data = await call(`/values/${encodeURIComponent(quote(sheetName))}`);
      const [headers = [], ...rows] = data.values || [];
      const clean = headers.map((h) => String(h).trim());
      return {
        headers: clean,
        rows: rows.map((cells, i) => ({
          _row: i + 2,
          ...Object.fromEntries(clean.map((h, c) => [h, cells[c] ?? ""]))
        }))
      };
    },

    async appendRows(sheetName, rows) {
      if (!rows.length) return null;
      return call(
        `/values/${encodeURIComponent(quote(sheetName))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values: rows }) }
      );
    },

    /** Overwrite single cells: [{ row, column (0-based), value }] in one request. */
    async updateCells(sheetName, cells) {
      if (!cells.length) return null;
      return call(`/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: cells.map(({ row, column, value }) => ({
            range: `${quote(sheetName)}!${columnLetter(column)}${row}`,
            values: [[value]]
          }))
        })
      });
    },

    /** Delete whole rows (1-based sheet row numbers). Bottom-up, so numbers stay valid. */
    async deleteRows(sheetName, rows) {
      if (!rows.length) return null;
      const meta = await call(`?fields=sheets.properties(sheetId,title)`);
      const sheet = (meta.sheets || []).find((entry) => entry.properties.title === sheetName);
      if (!sheet) throw new Error(`No tab named "${sheetName}".`);
      const requests = [...new Set(rows)]
        .sort((a, b) => b - a)
        .map((row) => ({
          deleteDimension: {
            range: { sheetId: sheet.properties.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row }
          }
        }));
      return call(`:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
    }
  };
}
