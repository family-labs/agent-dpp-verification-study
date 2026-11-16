/**
 * Follow-up condition E builder: the plain hosted passport (no checker) and its pages.
 *
 * Usage (from harness/, with bun's absolute path on this machine):
 *   bun run ../stimulus/build-e.ts            fetch fixture B's live resolver JSON (read-only
 *                                             GET), keep its bytes, build E from it
 *   bun run ../stimulus/build-e.ts --offline  rebuild E from the stored B source only
 *                                             (must reproduce the stored E byte for byte)
 *
 * Writes (only after every check passes; exit 1 otherwise):
 *   stimulus/passports/source-B-04012346283401.json   B's payload as served (online mode)
 *   stimulus/passports/E-<gtinE>.json                  E's document (compact JSON)
 *   stimulus/pages/followup/S1-E.html, S2-E.html        A's page with E's link
 *   stimulus/manifest.json                              + E pages (set "followup") + documents[]
 *
 * Checks:
 *   - E's GTIN has a valid check digit and is none of the study's GTINs (current, retired,
 *     pilot);
 *   - E's document has no UG presence (condition-e.ts UG_PRESENCE_PATTERNS, our ids, any host
 *     outside E's own set) and keeps B's information (same leaf paths, dropped keys aside);
 *   - A's main pages, re-rendered now, are byte-identical to the manifest (the stimulus did
 *     not move), and page E differs from page A ONLY in the product link;
 *   - page E passes render.ts's forbidden-word check.
 * The manifest's A-D (main) and pilot entries are left untouched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertNoForbiddenWords,
  assertOnlyDiffers,
  gtinCheckDigitValid,
  MANIFEST,
  readManifest,
  renderPage,
  sha256,
  STIMULUS_DIR,
  TEMPLATES,
  upiFor,
  type Manifest,
  type ManifestDocument,
  type ManifestPage,
  type Template,
} from "./render";
import {
  B_SOURCE_FILE,
  B_SOURCE_URL,
  E_DOC_CONTENT_TYPE,
  E_DOC_FILE,
  E_SERVED_URLS,
  E_UPI,
  GTIN_E,
  ourFixtureIdentifiers,
  readConditions,
  serialiseE,
  transformToE,
  ugPresenceHits,
} from "./condition-e";

function fail(msg: string): never {
  console.error(`BUILD-E REFUSED: ${msg}`);
  process.exit(1);
}

const offline = process.argv.includes("--offline");
const cond = readConditions();
const A = cond.assignments.A;
const B = cond.assignments.B;
if (!A.gtin || !B.gtin) fail("fixtures A/B have no GTIN");

if (!gtinCheckDigitValid(GTIN_E)) fail(`GTIN_E ${GTIN_E} has an invalid check digit`);
if (ourFixtureIdentifiers().includes(GTIN_E)) fail(`GTIN_E ${GTIN_E} is already a study GTIN`);

// ---------------------------------------------------------------- B source
const srcPath = join(STIMULUS_DIR, B_SOURCE_FILE);
let srcText: string;
let fetchedAt: string | null = null;
if (offline) {
  if (!existsSync(srcPath)) fail(`--offline but ${B_SOURCE_FILE} does not exist`);
  srcText = readFileSync(srcPath, "utf8");
  const prev = readManifest()?.documents?.find((d) => d.condition === "E");
  fetchedAt = prev?.derivedFrom.fetchedAt ?? null;
} else {
  const res = await fetch(B_SOURCE_URL, {
    headers: { Accept: "*/*", "User-Agent": "Mozilla/5.0 (compatible; fetch_url/1.0)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status !== 200) fail(`${B_SOURCE_URL} -> HTTP ${res.status}`);
  srcText = await res.text();
  fetchedAt = new Date().toISOString();
}
let bPayload: Record<string, unknown>;
try {
  bPayload = JSON.parse(srcText);
} catch (e) {
  fail(`B source is not JSON: ${e}`);
}
if (bPayload.uniqueProductIdentifier !== B_SOURCE_URL) fail("B source is not fixture B's model-level passport");

// ---------------------------------------------------------------- E document
const eDoc = transformToE(bPayload, B);
const eText = serialiseE(eDoc);
const hits = ugPresenceHits(eText);
if (hits.length) fail(`E document still carries UG presence:\n  ${hits.join("\n  ")}`);
if (eDoc.uniqueProductIdentifier !== E_UPI) fail("E's uniqueProductIdentifier is not E_UPI");

// Information parity: every leaf path of B (dropped keys aside) is present in E.
function leafPaths(v: unknown, p = "$"): string[] {
  if (Array.isArray(v)) return v.length ? v.flatMap((x, i) => leafPaths(x, `${p}[${i}]`)) : [p];
  if (v !== null && typeof v === "object") {
    const e = Object.entries(v as Record<string, unknown>);
    return e.length ? e.flatMap(([k, x]) => leafPaths(x, `${p}.${k}`)) : [p];
  }
  return [p];
}
const dropped = /^\$\.(links|warnings|notices)(\b|\.|\[)|^\$\.dpp\.(conformanceWarnings|notices|warnings)(\b|\.|\[)/;
const bPaths = leafPaths(bPayload).filter((p) => !dropped.test(p));
const ePaths = new Set(leafPaths(eDoc));
const lost = bPaths.filter((p) => !ePaths.has(p));
if (lost.length) fail(`E lost B leaf path(s): ${lost.join(", ")}`);
if (ePaths.size !== bPaths.length) fail(`E has ${ePaths.size} leaf paths, B (minus dropped) ${bPaths.length}`);

// ---------------------------------------------------------------- pages
const manifest = readManifest();
if (!manifest) fail("stimulus/manifest.json missing; render the main pages first");
const newPages: ManifestPage[] = [];
const rendered: Array<{ path: string; html: string }> = [];
for (const t of Object.keys(TEMPLATES) as Template[]) {
  const aEntry = manifest.pages.find((p) => p.set === "main" && p.template === t && p.condition === "A");
  if (!aEntry) fail(`no main ${t}-A page in the manifest`);
  const aHtml = renderPage(t, A.gtin!, "A");
  if (sha256(Buffer.from(aHtml, "utf8")) !== aEntry.sha256)
    fail(`${t}-A re-rendered now does not match its manifest sha256 — the stimulus moved`);
  const onDisk = readFileSync(join(STIMULUS_DIR, aEntry.file), "utf8");
  if (onDisk !== aHtml) fail(`${aEntry.file} on disk differs from a fresh render`);
  const eHtml = renderPage(t, A.gtin!, "E", E_UPI);
  assertOnlyDiffers(aHtml, eHtml, upiFor(A.gtin!), E_UPI, `${t} A vs E`);
  if (aHtml.split(upiFor(A.gtin!)).length !== eHtml.split(E_UPI).length)
    fail(`${t}: E carries its link a different number of times than A`);
  assertNoForbiddenWords(eHtml, E_UPI, `${t}-E`);
  const pageHits = ugPresenceHits(eHtml.split(E_UPI).join("")).filter((h) => !h.startsWith("host outside"));
  if (pageHits.length) fail(`page ${t}-E carries UG presence: ${pageHits.join("; ")}`);
  const path = join(STIMULUS_DIR, "pages", "followup", `${t}-E.html`);
  rendered.push({ path, html: eHtml });
  newPages.push({
    file: `pages/followup/${t}-E.html`,
    set: "followup",
    template: t,
    condition: "E",
    gtin: GTIN_E,
    upi: E_UPI,
    pageUrl: TEMPLATES[t].pageUrl,
    sha256: sha256(Buffer.from(eHtml, "utf8")),
    bytes: Buffer.byteLength(eHtml, "utf8"),
  });
}

// ---------------------------------------------------------------- write
const docPath = join(STIMULUS_DIR, E_DOC_FILE);
if (offline) {
  if (existsSync(docPath) && readFileSync(docPath, "utf8") !== eText)
    fail(`--offline rebuild of ${E_DOC_FILE} does not reproduce the stored bytes`);
  for (const r of rendered)
    if (existsSync(r.path) && readFileSync(r.path, "utf8") !== r.html)
      fail(`--offline rebuild of ${r.path} does not reproduce the stored bytes`);
}
mkdirSync(join(STIMULUS_DIR, "passports"), { recursive: true });
mkdirSync(join(STIMULUS_DIR, "pages", "followup"), { recursive: true });
if (!offline) writeFileSync(srcPath, srcText, "utf8");
writeFileSync(docPath, eText, "utf8");
for (const r of rendered) writeFileSync(r.path, r.html, "utf8");

const doc: ManifestDocument = {
  file: E_DOC_FILE,
  condition: "E",
  gtin: GTIN_E,
  url: E_UPI,
  servedAt: [...E_SERVED_URLS],
  contentType: E_DOC_CONTENT_TYPE,
  sha256: sha256(Buffer.from(eText, "utf8")),
  bytes: Buffer.byteLength(eText, "utf8"),
  derivedFrom: {
    url: B_SOURCE_URL,
    file: B_SOURCE_FILE,
    sha256: sha256(Buffer.from(srcText, "utf8")),
    fetchedAt,
    transform: "stimulus/condition-e.ts transformToE + serialiseE",
  },
};
const out: Manifest = {
  ...manifest,
  pages: [...manifest.pages.filter((p) => p.set !== "followup"), ...newPages].sort((a, b) =>
    a.file.localeCompare(b.file),
  ),
  documents: [...(manifest.documents ?? []).filter((d) => d.condition !== "E"), doc],
  // --offline is a reproduction check: it never moves the render date.
  renderedAt: offline ? manifest.renderedAt : { ...manifest.renderedAt, followup: new Date().toISOString() },
};
writeFileSync(MANIFEST, JSON.stringify(out, null, 2) + "\n", "utf8");
for (const p of newPages) console.log(`  ${p.file}  ${p.sha256}  ${p.bytes} B  ${p.upi}`);
console.log(`  ${doc.file}  ${doc.sha256}  ${doc.bytes} B  served at ${doc.servedAt.join(" , ")}`);
console.log(`  source ${B_SOURCE_FILE}  ${doc.derivedFrom.sha256}  (${offline ? "stored" : `fetched ${fetchedAt}`})`);
console.log(`E: ${ePaths.size} leaf paths, same as B minus dropped keys; no UG presence.`);
