// In-memory stand-in for the Google Sheet. Used by the tests, and by local
// development (wrangler dev with DEV_FAKE_SHEET=true on localhost) so the
// Studio page can be tried without touching the real sheet.
import scrollItems from "../../../src/data/scroll-items.json";

export const SHEET_HEADERS = [
  "id", "class", "data-media-type", "src", "srcset", "content", "alt", "style", "data-width", "data-height",
  "data-aspect-ratio", "data-orientation", "data-maxWidth", "width", "data-maxHeight",
  "data-client", "data-project", "data-category", "data-discipline", "order"
];

/** A copy of the site's content shaped like the real sheet. */
export function sampleSheet() {
  return {
    Sheet1: [SHEET_HEADERS, ...scrollItems.map((item) => SHEET_HEADERS.map((h) => (h === "order" ? "" : String(item[h] ?? ""))))],
    projects: [["project", "description"], ["surf overdose", "Surf Overdose was the first apparel collection created for Surf Junkie Club."]]
  };
}

/** An in-memory spreadsheet with named tabs: { Sheet1: [[headers...], [row...]], ... } */
export function fakeSheets(tabs) {
  const calls = [];
  return {
    tabs,
    calls,
    async readTab(name) {
      if (!tabs[name]) throw new Error(`no tab ${name}`);
      const [headers = [], ...rows] = tabs[name];
      return {
        headers,
        rows: rows.map((cells, i) => ({ _row: i + 2, ...Object.fromEntries(headers.map((h, c) => [h, cells[c] ?? ""])) }))
      };
    },
    async appendRows(name, rows) {
      calls.push({ type: "append", name, rows });
      tabs[name].push(...rows);
    },
    async updateCells(name, cells) {
      calls.push({ type: "update", name, cells });
      for (const { row, column, value } of cells) {
        const target = tabs[name][row - 1];
        while (target.length <= column) target.push("");
        target[column] = value;
      }
    },
    async deleteRows(name, rows) {
      calls.push({ type: "delete", name, rows });
      for (const row of [...new Set(rows)].sort((a, b) => b - a)) tabs[name].splice(row - 1, 1);
    }
  };
}
