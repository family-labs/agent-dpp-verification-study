/**
 * Study 5 stimulus builder. Rules: stimulus/study5.ts.
 *
 * Usage (from harness/):
 *   bun run ../stimulus/build-study5.ts --write     fetch fixture A's and the unit's LIVE resolver
 *        JSON (GET, fetch_url's own headers), store them byte for byte as the sources, build
 *        H = neutralise(A), L = transformToL(H), G = neutralise(unit), F = transformToF(G) (all four
 *        served from the one mirror, H/L and G/F at the same URL), W, W2 and the three Test 1
 *        pages (H and L share one page linking to the mirror), write stimulus/study5/** and its
 *        manifest.
 *        If the platform contract (PR #382) is not live, the parts that do not need it (pages,
 *        W, W2) are written, the manifest says contractLive=false with the missing fields, and
 *        the builder exits 3. L and F are never built from anything but live contract data.
 *   bun run ../stimulus/build-study5.ts --offline   rebuild everything from the stored sources
 *        and stored inputs (no network) and require the stored bytes exactly.
 *   bun run ../stimulus/build-study5.ts --pilot     SMOKE ONLY: the current live A and unit JSON
 *        with a synthetic contract block (stimulus/study5-pilot.ts), written to
 *        stimulus/study5/pilot/ with its own manifest. Never used by a counted trial.
 *
 * Inputs, each hash-checked against stimulus/manifest.json first: pages/main/S1-A.html,
 * pages/followup/S1-E.html, passports/E-04012346519005.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { FETCH_REQUEST_HEADERS } from "../harness/src/fetch-tool";
import {
  A_UPI,
  contractProblems,
  E_DOC_FILE,
  MIRROR_T1_URL,
  MIRROR_T2_URL,
  neutralise,
  JSON_CT,
  L_FINGERPRINT_RULE,
  PAGE_URL,
  pageForMirror,
  pageForPilot,
  PILOT_T1_URL,
  PILOT_T2_URL,
  provenanceOf,
  renderW2Page,
  S1A_PAGE_FILE,
  S1E_PAGE_FILE,
  S5_DIR,
  S5_MANIFEST,
  S5_PILOT_MANIFEST,
  sha256,
  STIMULUS_DIR,
  transformToF,
  transformToL,
  transformToW,
  UNIT_UPI,
  W2_URL,
  W_PASSPORT_URL,
  FOREIGN_COLLECTION,
  FOREIGN_DEPLOY_TX,
  type S5FileEntry,
  type S5Manifest,
} from "./study5";
import { pilotPassportCheck, withPassportCheck } from "./study5-pilot";

const E_PASSPORT_ID_URL = "https://id.tarnvale.example/api/passport/5df1654d-e8b2-4bec-8f11-2a50494c9593";

function fail(msg: string, code = 1): never {
  console.error(`BUILD-STUDY5 REFUSED: ${msg}`);
  process.exit(code);
}
const mode = ["--write", "--offline", "--pilot"].filter((f) => process.argv.includes(f));
if (mode.length !== 1) fail("give exactly one of --write, --offline, --pilot");

// ---- hashed inputs
const stimManifest = JSON.parse(readFileSync(join(STIMULUS_DIR, "manifest.json"), "utf8")) as {
  pages: Array<{ file: string; sha256: string }>;
  documents: Array<{ file: string; sha256: string }>;
};
function input(rel: string): { text: string; entry: S5FileEntry } {
  const want = [...stimManifest.pages, ...stimManifest.documents].find((p) => p.file === rel);
  if (!want) fail(`${rel} is not in stimulus/manifest.json`);
  const text = readFileSync(join(STIMULUS_DIR, rel), "utf8");
  if (sha256(text) !== want.sha256) fail(`${rel} does not match its sha256 in stimulus/manifest.json`);
  return { text, entry: { file: rel, sha256: want.sha256, bytes: Buffer.byteLength(text) } };
}
const s1a = input(S1A_PAGE_FILE);
const s1e = input(S1E_PAGE_FILE);
const eDoc = input(E_DOC_FILE);

async function getLive(url: string): Promise<{ text: string; fetchedAt: string }> {
  const res = await fetch(url, { headers: FETCH_REQUEST_HEADERS, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (res.status !== 200) fail(`GET ${url} -> ${res.status}`);
  try {
    JSON.parse(text);
  } catch {
    fail(`GET ${url} did not return JSON`);
  }
  if (JSON.stringify(JSON.parse(text)) !== text) fail(`GET ${url}: the served JSON is not compact (round trip differs); the byte-level transforms assume it is`);
  return { text, fetchedAt: new Date().toISOString() };
}

const entry = (file: string, text: string): S5FileEntry => ({ file, sha256: sha256(text), bytes: Buffer.byteLength(text) });
function put(files: Map<string, string>, rel: string, text: string) {
  files.set(rel, text);
}
function writeAll(files: Map<string, string>) {
  for (const [rel, text] of files) {
    const p = join(STIMULUS_DIR, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, "utf8");
  }
}

// ---- pilot (smoke only)
if (mode[0] === "--pilot") {
  const a = await getLive(A_UPI);
  const u = await getLive(UNIT_UPI);
  const aDoc = JSON.parse(a.text);
  const uDoc = JSON.parse(u.text);
  const productId = (aDoc.ancestors as Array<{ type: string; id: string }>).find((x) => x.type === "product")!.id;
  const t1 = withPassportCheck(a.text, pilotPassportCheck({ productId, recheckUrl: aDoc.links.verificationUrl, withProvenance: false }));
  const t2 = withPassportCheck(u.text, pilotPassportCheck({ productId, recheckUrl: uDoc.links.verificationUrl, withProvenance: true }));
  const page = pageForPilot(s1a.text);
  const files = new Map<string, string>();
  put(files, "study5/pilot/T1-passport.json", t1);
  put(files, "study5/pilot/T2-passport.json", t2);
  put(files, "study5/pilot/T1-page.html", page);
  writeAll(files);
  const manifest = {
    _comment: "Study 5 SMOKE stimuli (pilot=true): the live A / unit resolver JSON of the build time plus a SYNTHETIC passportCheck in the PR #382 contract shape (stimulus/study5-pilot.ts). Excluded from every analysis.",
    builtAt: new Date().toISOString(),
    sources: { A: { url: A_UPI, fetchedAt: a.fetchedAt, sha256: sha256(a.text) }, unit: { url: UNIT_UPI, fetchedAt: u.fetchedAt, sha256: sha256(u.text) } },
    stimuli: {
      T1: { page: { ...entry("study5/pilot/T1-page.html", page), url: PAGE_URL }, passport: { ...entry("study5/pilot/T1-passport.json", t1), url: PILOT_T1_URL, contentType: JSON_CT } },
      T2: { passport: { ...entry("study5/pilot/T2-passport.json", t2), url: PILOT_T2_URL, contentType: JSON_CT } },
    },
  };
  writeFileSync(S5_PILOT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`Wrote the pilot stimuli and ${S5_PILOT_MANIFEST}`);
  process.exit(0);
}

// ---- static parts (no contract needed)
const files = new Map<string, string>();
const pageMirror = pageForMirror(s1a.text);
const wText = transformToW(eDoc.text);
const w2 = renderW2Page();
put(files, "study5/pages/T1-H.html", pageMirror);
put(files, "study5/pages/T1-L.html", pageMirror);
put(files, "study5/pages/T1-W.html", s1e.text);
put(files, "study5/passports/W.json", wText);
put(files, "study5/pages/W2.html", w2);

const stimuli: S5Manifest["stimuli"] = {
  "T1-H-page": { ...entry("study5/pages/T1-H.html", pageMirror), url: PAGE_URL, contentType: "text/html; charset=utf-8", condition: "H" },
  "T1-L-page": { ...entry("study5/pages/T1-L.html", pageMirror), url: PAGE_URL, contentType: "text/html; charset=utf-8", condition: "L" },
  "T1-W-page": { ...entry("study5/pages/T1-W.html", s1e.text), url: PAGE_URL, contentType: "text/html; charset=utf-8", condition: "W" },
  "W-passport": { ...entry("study5/passports/W.json", wText), url: W_PASSPORT_URL, contentType: JSON_CT, condition: "W" },
  "W-passport-id": { ...entry("study5/passports/W.json", wText), url: E_PASSPORT_ID_URL, contentType: JSON_CT, condition: "W" },
  "W2-page": { ...entry("study5/pages/W2.html", w2), url: W2_URL, contentType: "text/html; charset=utf-8", condition: "W2" },
};

// ---- live sources (or stored, offline)
let aText: string, gText: string, aAt: string, gAt: string;
const prior = existsSync(S5_MANIFEST) ? (JSON.parse(readFileSync(S5_MANIFEST, "utf8")) as S5Manifest) : null;
if (mode[0] === "--offline") {
  if (!prior?.sources) fail("--offline needs stored sources; none (the contract was not live at the last --write)");
  aText = readFileSync(join(STIMULUS_DIR, prior.sources.A.file), "utf8");
  gText = readFileSync(join(STIMULUS_DIR, prior.sources.G.file), "utf8");
  if (sha256(aText) !== prior.sources.A.sha256 || sha256(gText) !== prior.sources.G.sha256) fail("a stored source no longer matches its manifest hash");
  aAt = prior.sources.A.fetchedAt;
  gAt = prior.sources.G.fetchedAt;
} else {
  const a = await getLive(A_UPI);
  const g = await getLive(UNIT_UPI);
  aText = a.text;
  gText = g.text;
  aAt = a.fetchedAt;
  gAt = g.fetchedAt;
}
const problems = [
  ...contractProblems(JSON.parse(aText), false).map((p) => `A (${A_UPI}): ${p}`),
  ...contractProblems(JSON.parse(gText), true).map((p) => `G (${UNIT_UPI}): ${p}`),
];
const inputs = { S1A: s1a.entry, S1E: s1e.entry, E: eDoc.entry };

if (problems.length) {
  if (mode[0] === "--offline") fail(`stored sources fall short of the contract: ${problems.join("; ")}`);
  writeAll(files);
  const m: S5Manifest = {
    _comment: "Study 5 stimuli (stimulus/build-study5.ts). NOT READY: the platform contract (PR #382) is not live, so L and F (built only from live contract data) do not exist yet. Re-run --write after the deploy.",
    builtAt: new Date().toISOString(),
    contractLive: false,
    contractProblems: problems,
    inputs,
    stimuli,
  };
  writeFileSync(S5_MANIFEST, JSON.stringify(m, null, 2) + "\n", "utf8");
  console.error(`The platform contract is not live:\n  ${problems.join("\n  ")}`);
  console.error("Wrote the contract-independent stimuli (pages, W, W2) and a manifest with contractLive=false.");
  process.exit(3);
}

// Design fixes (2026-10-16): every copy neutralised (no route to /verify), all four on the mirror.
const hText = neutralise(aText);
const gCopy = neutralise(gText);
const l = transformToL(hText);
const f = transformToF(gCopy);
put(files, "study5/source/A-live.json", aText);
put(files, "study5/source/G-live.json", gText);
put(files, "study5/passports/H.json", hText);
put(files, "study5/passports/L.json", l.text);
put(files, "study5/passports/G.json", gCopy);
put(files, "study5/passports/F.json", f.text);
stimuli["H-passport"] = { ...entry("study5/passports/H.json", hText), url: MIRROR_T1_URL, contentType: JSON_CT, condition: "H" };
stimuli["L-passport"] = { ...entry("study5/passports/L.json", l.text), url: MIRROR_T1_URL, contentType: JSON_CT, condition: "L" };
stimuli["G-passport"] = { ...entry("study5/passports/G.json", gCopy), url: MIRROR_T2_URL, contentType: JSON_CT, condition: "G" };
stimuli["F-passport"] = { ...entry("study5/passports/F.json", f.text), url: MIRROR_T2_URL, contentType: JSON_CT, condition: "F" };
const manifest: S5Manifest = {
  _comment:
    "Study 5 stimuli (stimulus/build-study5.ts, rules in stimulus/study5.ts). sha256 over the exact UTF-8 bytes. sources = the live resolver JSON L and F were built from, stored byte for byte. url = where fetch_url serves the stimulus.",
  builtAt: mode[0] === "--offline" && prior ? prior.builtAt : new Date().toISOString(),
  contractLive: true,
  contractProblems: [],
  inputs,
  sources: {
    A: { ...entry("study5/source/A-live.json", aText), url: A_UPI, fetchedAt: aAt },
    G: { ...entry("study5/source/G-live.json", gText), url: UNIT_UPI, fetchedAt: gAt },
  },
  stimuli,
  facts: {
    realFingerprint: l.real,
    lFingerprint: l.fake,
    lRule: L_FINGERPRINT_RULE,
    provenancePath: f.path,
    realCollection: f.realCollection,
    realDeployTx: f.realDeployTx,
    foreignCollection: FOREIGN_COLLECTION,
    foreignDeployTx: FOREIGN_DEPLOY_TX,
  },
};
if (provenanceOf(JSON.parse(f.text))?.value.collection !== FOREIGN_COLLECTION) fail("F's provenance.collection is not the foreign collection");

if (mode[0] === "--offline") {
  const bad: string[] = [];
  for (const [rel, text] of files) {
    const p = join(STIMULUS_DIR, rel);
    if (!existsSync(p) || readFileSync(p, "utf8") !== text) bad.push(rel);
  }
  if (bad.length) fail(`offline rebuild differs from the stored bytes: ${bad.join(", ")}`);
  console.log(`Offline rebuild reproduces all ${files.size} stored files byte for byte.`);
  process.exit(0);
}
writeAll(files);
writeFileSync(S5_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
for (const [k, v] of Object.entries(stimuli)) console.log(`  ${k.padEnd(14)} ${v!.sha256}  ${v!.bytes} B  ${v!.url}`);
console.log(`Wrote ${files.size} files and stimulus/study5/manifest.json (contract live).`);
