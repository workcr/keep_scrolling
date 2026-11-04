// Test stand-ins for Cloudflare D1 (backed by a real SQLite engine), R2, and
// the Google Sheet.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const schema = fs.readFileSync(new URL("../../migrations/0001_drafts.sql", import.meta.url), "utf8");
  db.exec(schema);
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args)
  });
  return { prepare: (sql) => statement(sql) };
}

export function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, body, options) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, { bytes, options });
    },
    async list({ prefix }) {
      return { objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    async delete(keys) {
      for (const key of [].concat(keys)) objects.delete(key);
    }
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
    }
  };
}
