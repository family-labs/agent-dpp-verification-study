/**
 * A local stand-in for the Worker's Cloudflare bindings, for the site selftest and the local preview:
 * D1 is an in-memory SQLite database (bun:sqlite) loaded with site/schema.sql. No network.
 */
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { D1Like, Env } from "./worker";

export function localEnv(adminToken: string): Env & { sqlite: Database; pending: Promise<unknown>[] } {
  const sqlite = new Database(":memory:");
  sqlite.exec(readFileSync(join(import.meta.dir, "schema.sql"), "utf8"));
  const DB: D1Like = {
    prepare(sql: string) {
      return {
        bind(...v: unknown[]) {
          const args = v as Array<string | number | null>;
          return {
            run: async () => sqlite.query(sql).run(...args),
            first: async <T>() => (sqlite.query(sql).get(...args) as T) ?? null,
            all: async <T>() => ({ results: sqlite.query(sql).all(...args) as T[] }),
          };
        },
      };
    },
  };
  return { DB, ADMIN_TOKEN: adminToken, sqlite, pending: [] };
}
