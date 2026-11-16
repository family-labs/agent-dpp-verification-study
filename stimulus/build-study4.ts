/**
 * Study 4 stimulus builder: the four product pages and the listings (ours in P/T/U/N, three
 * competitors), from stored, hashed inputs only. No network.
 *
 * Usage (from harness/, with bun's absolute path on this machine):
 *   bun run ../stimulus/build-study4.ts --write     build, check, write stimulus/study4/**
 *   bun run ../stimulus/build-study4.ts --offline   rebuild and require the stored bytes exactly
 *
 * Inputs (each hash-checked before use):
 *   stimulus/pages/main/S1-A.html            (stimulus/manifest.json)  -> our merchant fields + page
 *   stimulus/ucp/served/lookup-{A,C,B}-*.json (stimulus/ucp/manifest.json) -> the dpp blocks of P, T, U
 * Every rule of the transform is documented in stimulus/study4.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConditions } from "./condition-e";
import { dppBytesServed, dppOf, pickVariant, type Dpp, type ServedLookup, type UcpManifest } from "./ucp";
import {
  balanceTable,
  checkStudy4Invariants,
  COMPETITORS,
  DPP_SOURCE,
  listingFile,
  listingFor,
  OURS,
  OURS_SOURCE_PAGE,
  pageFile,
  pageUrl,
  renderPlainPage,
  S1A_LINK_LINE,
  S4_CONDS,
  S4_DIR,
  S4_MANIFEST,
  serialiseListing,
  sha256,
  STIMULUS_DIR,
  type S4Cond,
  type S4FileEntry,
  type S4Manifest,
} from "./study4";

function fail(msg: string): never {
  console.error(`BUILD-STUDY4 REFUSED: ${msg}`);
  process.exit(1);
}
const write = process.argv.includes("--write");
const offline = process.argv.includes("--offline");
if (write === offline) fail("give exactly one of --write or --offline");

// ---- our source page (hashed Study 2 page)
const stim = JSON.parse(readFileSync(join(STIMULUS_DIR, "manifest.json"), "utf8")) as { pages: Array<{ file: string; sha256: string }> };
const srcEntry = stim.pages.find((p) => p.file === OURS_SOURCE_PAGE);
if (!srcEntry) fail(`${OURS_SOURCE_PAGE} is not in stimulus/manifest.json`);
const s1a = readFileSync(join(STIMULUS_DIR, OURS_SOURCE_PAGE), "utf8");
if (sha256(Buffer.from(s1a, "utf8")) !== srcEntry.sha256) fail(`${OURS_SOURCE_PAGE} does not match its manifest sha256`);
if (s1a.split(S1A_LINK_LINE).length !== 2) fail("S1-A does not contain the product-information line exactly once");
const oursPage = s1a.split(S1A_LINK_LINE).join("");
if (renderPlainPage(OURS) !== oursPage) fail("renderPlainPage(OURS) is not S1-A minus its product-information line: the competitor template would differ from ours");

// ---- dpp blocks from the stored served lookups (Study 3)
const ucpDir = join(STIMULUS_DIR, "ucp");
const ucpM = JSON.parse(readFileSync(join(ucpDir, "manifest.json"), "utf8")) as UcpManifest;
const fx = readConditions().assignments as Record<"A" | "B" | "C", { gtin: string | null; variantId: string | null }>;
const dpps = {} as Record<Exclude<S4Cond, "N">, Dpp>;
const servedOf = {} as Record<Exclude<S4Cond, "N">, { file: string; sha256: string }>;
for (const c of ["P", "T", "U"] as const) {
  const f = DPP_SOURCE[c];
  const gtin = fx[f].gtin!;
  const e = ucpM.served.find((s) => s.file === `served/lookup-${f}-${gtin}.json`);
  if (!e) fail(`no stored served lookup for fixture ${f}`);
  const raw = readFileSync(join(ucpDir, e.file));
  if (sha256(raw) !== e.sha256) fail(`${e.file} does not match stimulus/ucp/manifest.json`);
  const text = raw.toString("utf8");
  const { variant } = pickVariant(JSON.parse(text) as ServedLookup, gtin);
  if (variant.id !== fx[f].variantId) fail(`${e.file}: variant ${variant.id} is not fixture ${f}'s`);
  const d = dppOf(variant, gtin);
  if (!dppBytesServed(text, d)) fail(`${e.file}: dpp bytes are not a substring of the served response`);
  dpps[c] = d;
  servedOf[c] = { file: `ucp/${e.file}`, sha256: e.sha256 };
}

// ---- pages + listings
const pages: Record<string, string> = { [OURS.id]: oursPage };
for (const p of COMPETITORS) pages[p.id] = renderPlainPage(p);
const ours = {} as Record<S4Cond, string>;
for (const c of S4_CONDS) ours[c] = serialiseListing(listingFor(OURS, oursPage, c === "N" ? null : dpps[c]));
const competitors: Record<string, string> = {};
for (const p of COMPETITORS) competitors[p.id] = serialiseListing(listingFor(p, pages[p.id], null));

let invariants: string[];
let balance: string[];
try {
  invariants = checkStudy4Invariants(ours, competitors, dpps);
  balance = balanceTable().lines;
} catch (e) {
  fail(`invariant broken: ${e instanceof Error ? e.message : e}`);
}
// The merchant fields read back must equal the spec (our listing really is S1-A's).
for (const p of [OURS, ...COMPETITORS]) {
  const l = JSON.parse(p.id === OURS.id ? ours.N : competitors[p.id]) as { title: string; url: string; price_range: { min: { amount: number } } };
  if (l.title !== p.title || l.url !== pageUrl(p) || l.price_range.min.amount !== Number(p.priceText.replace(/[€,.]/g, "")))
    fail(`listing of ${p.id} does not carry its spec's title/url/price`);
}

const entry = (file: string, text: string): S4FileEntry => ({ file, sha256: sha256(Buffer.from(text, "utf8")), bytes: Buffer.byteLength(text, "utf8") });
const files: Record<string, string> = {};
for (const p of [OURS, ...COMPETITORS]) files[pageFile(p)] = pages[p.id];
for (const c of S4_CONDS) files[listingFile(OURS, c)] = ours[c];
for (const p of COMPETITORS) files[listingFile(p)] = competitors[p.id];

if (offline) {
  if (!existsSync(S4_MANIFEST)) fail("--offline but stimulus/study4/manifest.json does not exist (run --write)");
  const m = JSON.parse(readFileSync(S4_MANIFEST, "utf8")) as S4Manifest;
  const stored = [...m.products.map((p) => p.page), ...Object.values(m.ours), ...Object.values(m.competitors)];
  for (const [f, t] of Object.entries(files)) {
    const p = join(STIMULUS_DIR, f);
    if (!existsSync(p) || readFileSync(p, "utf8") !== t) fail(`--offline rebuild of ${f} does not reproduce the stored bytes`);
    const s = stored.find((x) => x.file === f);
    if (!s || s.sha256 !== entry(f, t).sha256) fail(`--offline: ${f} sha256 differs from the manifest`);
  }
  console.log(`--offline: all ${Object.keys(files).length} Study 4 files reproduced byte for byte`);
  for (const l of invariants) console.log(`  ok  ${l}`);
  for (const l of balance) console.log(`  balance  ${l}`);
  process.exit(0);
}

mkdirSync(join(S4_DIR, "pages"), { recursive: true });
mkdirSync(join(S4_DIR, "listings"), { recursive: true });
for (const [f, t] of Object.entries(files)) writeFileSync(join(STIMULUS_DIR, f), t, "utf8");
const manifest: S4Manifest = {
  _comment:
    "Generated by stimulus/build-study4.ts (Study 4). pages/* are served by fetch_url at each listing's url; listings/* are the exact bytes the search_products tool returns (compact JSON, joined into one array in the trial's order). sha256 over exact bytes. Transform and checks: stimulus/study4.ts.",
  products: [OURS, ...COMPETITORS].map((p) => ({
    id: p.id,
    variantId: p.variantId,
    brand: p.brand,
    title: p.title,
    ours: p.id === OURS.id,
    pageUrl: pageUrl(p),
    page: entry(pageFile(p), pages[p.id]),
  })),
  ours: Object.fromEntries(
    S4_CONDS.map((c) => [
      c,
      {
        ...entry(listingFile(OURS, c), ours[c]),
        dppSource: c === "N" ? null : `fixture ${DPP_SOURCE[c]}`,
        dpp: c === "N" ? null : dpps[c],
        servedLookupFile: c === "N" ? null : servedOf[c].file,
        servedLookupSha256: c === "N" ? null : servedOf[c].sha256,
      },
    ]),
  ) as S4Manifest["ours"],
  competitors: Object.fromEntries(COMPETITORS.map((p) => [p.id, entry(listingFile(p), competitors[p.id])])),
  sourcePage: { file: OURS_SOURCE_PAGE, sha256: srcEntry.sha256, removedLine: S1A_LINK_LINE },
  balance,
  invariants,
  builtAt: new Date().toISOString(),
};
writeFileSync(S4_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
for (const [f, t] of Object.entries(files)) console.log(`  ${f}  ${entry(f, t).sha256}  ${entry(f, t).bytes} B`);
for (const l of invariants) console.log(`  ok  ${l}`);
for (const l of balance) console.log(`  balance  ${l}`);
console.log(`Wrote ${Object.keys(files).length} files and stimulus/study4/manifest.json`);
