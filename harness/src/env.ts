/**
 * Load the repo-root `.env` (git-ignored) into process.env WITHOUT overriding variables
 * already set, and without ever printing a value. Import this FIRST in an entry point:
 * ES modules evaluate imports in order, so everything imported after it sees the keys.
 *
 * Bun auto-loads `.env` only from the working directory (harness/), not the repo root.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_FILE = fileURLToPath(new URL("../../.env", import.meta.url));

export const loadedEnvKeys: string[] = [];

if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined || process.env[m[1]] === "") {
      process.env[m[1]] = value;
      loadedEnvKeys.push(m[1]);
    }
  }
}
