/**
 * Study 7 stimulus builder (DRAFT study, not registered). Rules: stimulus/study7.ts. No network.
 * Usage (from harness/):  bun run ../stimulus/build-study7.ts --write | --check
 * Writes stimulus/study7/<fmt>/... and stimulus/study7/manifest.json (sha256 of every file, LF bytes).
 * Refuses unless the Study 6 counted stimuli are built and intact (Study 7 builds on them).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { readS6Manifest, STIMULUS_DIR } from "./study6";
import { buildAll7, CHECKER_HOST } from "./study7";
import { buildAll7r } from "./study7r";
import { staticAssets } from "../site/assets";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const mode = process.argv[2];
if (mode !== "--write" && mode !== "--check") {
  console.error("give --write or --check");
  process.exit(2);
}
const m6 = readS6Manifest(false);
if (!m6) {
  console.error("Study 6 counted stimuli missing (stimulus/build-study6.ts --write)");
  process.exit(3);
}
const files = buildAll7(m6.fixtures);
const oskImages = new Map([...staticAssets()].filter(([path]) => path.startsWith("/images/")).map(([path, a]) => [path, a.text]));
for (const [k, v] of buildAll7r(m6.fixtures, oskImages)) files.set(k, v);
const MANIFEST = join(STIMULUS_DIR, "study7", "manifest.json");
const fileOf = (key: string) => `study7/${key}${key.endsWith("jsonld") ? ".jsonld" : key.endsWith("llms") ? ".txt" : /\/qr(-copy)?$|^R\/(qr|img)-/.test(key) ? ".svg" : ".html"}`;

if (mode === "--check") {
  if (!existsSync(MANIFEST)) {
    console.error("stimulus/study7/manifest.json missing");
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(MANIFEST, "utf8")) as { stimuli: Record<string, { file: string; sha256: string; url: string }> };
  const bad: string[] = [];
  for (const [k, f] of files) {
    const e = m.stimuli[k];
    if (!e || e.sha256 !== sha(f.text) || e.url !== f.url) bad.push(`${k}: manifest differs from the rebuild`);
    const p = join(STIMULUS_DIR, fileOf(k));
    if (!existsSync(p) || readFileSync(p, "utf8") !== f.text) bad.push(`${fileOf(k)}: stored bytes differ`);
  }
  for (const k of Object.keys(m.stimuli)) if (!files.has(k)) bad.push(`${k}: in the manifest, not built`);
  if (bad.length) {
    console.error(`check failed:\n  ${bad.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`Rebuild reproduces all ${files.size} stored Study 7 stimuli byte for byte.`);
  process.exit(0);
}
const stimuli: Record<string, { file: string; sha256: string; bytes: number; url: string; contentType: string }> = {};
for (const [k, f] of files) {
  const p = join(STIMULUS_DIR, fileOf(k));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.text, "utf8");
  stimuli[k] = { file: fileOf(k), sha256: sha(f.text), bytes: Buffer.byteLength(f.text), url: f.url, contentType: f.contentType };
}
mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(
  MANIFEST,
  JSON.stringify({ _comment: "Study 7 stimuli (DRAFT study): stimulus/build-study7.ts from the Study 6 fixtures; Study 6 files are reused unchanged for site pages, DoC pages and the declaration.", builtAt: new Date().toISOString(), study6ManifestBuiltAt: m6.builtAt, checkerHost: CHECKER_HOST, stimuli }, null, 2) + "\n",
  "utf8",
);
for (const [k, v] of Object.entries(stimuli)) console.log(`  ${k.padEnd(28)} ${v.sha256.slice(0, 16)} ${String(v.bytes).padStart(6)} B  ${v.url}`);
console.log(`Wrote ${files.size} Study 7 files and ${MANIFEST}`);
