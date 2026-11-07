// Test stand-ins for Cloudflare D1 (backed by a real SQLite engine), R2, and
// the Google Sheet.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(new URL(file, dir), "utf8"));
  }
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

export { fakeSheets } from "../dev/fakeSheets.js";
