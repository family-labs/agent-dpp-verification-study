/**
 * Study 3 (arm U) stimulus builder: capture the live UCP responses, build the five listings.
 *
 * Usage (from harness/, with bun's absolute path on this machine):
 *   bun run ../stimulus/build-ucp.ts --capture   GET /.well-known/ucp and the dpp schema, POST
 *                                                /ucp/catalog/lookup once per fixture GTIN (A, B,
 *                                                C) and once for E's GTIN; keep every response
 *                                                byte for byte; build and check the listings
 *   bun run ../stimulus/build-ucp.ts --offline   rebuild the listings from the stored responses
 *                                                only; must reproduce the stored bytes exactly
 *
 * Writes (only after every check passes; exit 1 otherwise):
 *   stimulus/ucp/served/*        the raw responses (bytes as received; .gitattributes -text)
 *   stimulus/ucp/listings/U-<cond>.json   the five listings, compact JSON, as the prompt shows them
 *   stimulus/ucp/manifest.json   sha256 of every served file and listing, the extension version
 *                                and ETags, and the invariants that were checked
 *
 * The transform and the invariants are in stimulus/ucp.ts. Until universal-goods-testnet
 * PR #372 is deployed, --capture stops at the first request (HTTP 404) and writes nothing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { E_UPI, GTIN_E, readConditions } from "./condition-e";
import {
  checkListingInvariants,
  dppBytesServed,
  dppOf,
  DPP_EXTENSION_NAME,
  listingE,
  listingFromLookup,
  PAGE_FILE,
  pickVariant,
  serialiseListing,
  sha256,
  STIMULUS_DIR,
  UCP_DIR,
  UCP_LOOKUP_URL,
  UCP_MANIFEST,
  UCP_SCHEMA_URL,
  UCP_WELL_KNOWN_URL,
  type CondIds,
  type ServedLookup,
  type UcpCond,
  type UcpListingEntry,
  type UcpManifest,
  type UcpServedEntry,
} from "./ucp";

function fail(msg: string): never {
  console.error(`BUILD-UCP REFUSED: ${msg}`);
  process.exit(1);
}

const capture = process.argv.includes("--capture");
const offline = process.argv.includes("--offline");
if (capture === offline) fail("give exactly one of --capture or --offline");

const cond = readConditions();
const ids = {} as Record<"A" | "B" | "C", CondIds>;
for (const c of ["A", "B", "C"] as const) {
  const f = cond.assignments[c];
  if (!f.productId || !f.variantId || !f.gtin) fail(`fixture ${c} ids incomplete in fixtures/conditions.json`);
  ids[c] = { productId: f.productId, variantId: f.variantId, gtin: f.gtin };
}

// The pages the merchant fields come from must be the hashed Study 2 pages.
const stimManifest = JSON.parse(readFileSync(join(STIMULUS_DIR, "manifest.json"), "utf8")) as {
  pages: Array<{ file: string; sha256: string }>;
};
function page(file: string): { html: string; sha256: string } {
  const entry = stimManifest.pages.find((p) => p.file === file);
  if (!entry) fail(`${file} is not in stimulus/manifest.json`);
  const html = readFileSync(join(STIMULUS_DIR, file), "utf8");
  if (sha256(Buffer.from(html, "utf8")) !== entry.sha256) fail(`${file} does not match its manifest sha256`);
  return { html, sha256: entry.sha256 };
}

const SERVED_DIR = join(UCP_DIR, "served");
const LISTING_DIR = join(UCP_DIR, "listings");
interface Req {
  file: string;
  what: string;
  method: "GET" | "POST";
  url: string;
  body: string | null;
}
const requests: Req[] = [
  { file: "served/well-known-ucp.json", what: "business profile", method: "GET", url: UCP_WELL_KNOWN_URL, body: null },
  { file: "served/dpp-schema.json", what: "dpp extension schema", method: "GET", url: UCP_SCHEMA_URL, body: null },
  ...(["A", "B", "C"] as const).map((c) => ({
    file: `served/lookup-${c}-${ids[c].gtin}.json`,
    what: `catalog lookup, fixture ${c}`,
    method: "POST" as const,
    url: UCP_LOOKUP_URL,
    body: JSON.stringify({ ids: [ids[c].gtin] }),
  })),
  {
    file: `served/lookup-E-${GTIN_E}.json`,
    what: "catalog lookup, condition E's GTIN (must find nothing)",
    method: "POST",
    url: UCP_LOOKUP_URL,
    body: JSON.stringify({ ids: [GTIN_E] }),
  },
];

const served: UcpServedEntry[] = [];
const raw: Record<string, Buffer> = {};
let prev: UcpManifest | null = existsSync(UCP_MANIFEST) ? (JSON.parse(readFileSync(UCP_MANIFEST, "utf8")) as UcpManifest) : null;
if (capture) {
  for (const r of requests) {
    let res: Response;
    try {
      res = await fetch(r.url, {
        method: r.method,
        headers: { Accept: "application/json", ...(r.body ? { "Content-Type": "application/json" } : {}) },
        body: r.body ?? undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      fail(`${r.method} ${r.url}: ${e instanceof Error ? e.message : e}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.status !== 200)
      fail(
        `${r.method} ${r.url} -> HTTP ${res.status}. ` +
          (res.status === 404 ? "The UCP endpoint (universal-goods-testnet PR #372) is not deployed on testnet. " : "") +
          "Nothing written.",
      );
    raw[r.file] = buf;
    served.push({
      file: r.file,
      what: r.what,
      method: r.method,
      url: r.url,
      requestBody: r.body,
      status: res.status,
      contentType: res.headers.get("content-type"),
      etag: res.headers.get("etag"),
      fetchedAt: new Date().toISOString(),
      sha256: sha256(buf),
      bytes: buf.length,
    });
  }
} else {
  if (!prev) fail("--offline but stimulus/ucp/manifest.json does not exist (run --capture once the endpoint is deployed)");
  for (const s of prev.served) {
    const p = join(UCP_DIR, s.file);
    if (!existsSync(p)) fail(`stored ${s.file} is missing`);
    const buf = readFileSync(p);
    if (sha256(buf) !== s.sha256) fail(`stored ${s.file} does not match its manifest sha256`);
    raw[s.file] = buf;
    served.push(s);
  }
}

// ---------------------------------------------------------------- checks on what was served
const text = (f: string) => raw[f].toString("utf8");
const profile = JSON.parse(text("served/well-known-ucp.json")) as {
  ucp?: { capabilities?: Record<string, Array<{ version?: string; schema?: string; extends?: string[] }>> };
};
const ext = profile.ucp?.capabilities?.[DPP_EXTENSION_NAME]?.[0];
if (!ext) fail(`/.well-known/ucp does not declare ${DPP_EXTENSION_NAME}`);
if (ext.schema !== UCP_SCHEMA_URL) fail(`the profile's schema URL for the extension is ${ext.schema}, expected ${UCP_SCHEMA_URL}`);
const schema = JSON.parse(text("served/dpp-schema.json")) as { name?: string; version?: string };
if (schema.name !== DPP_EXTENSION_NAME) fail(`dpp schema name ${schema.name}, expected ${DPP_EXTENSION_NAME}`);

const lookups = {} as Record<"A" | "B" | "C", { lookup: ServedLookup; file: string; raw: string }>;
for (const c of ["A", "B", "C"] as const) {
  const file = `served/lookup-${c}-${ids[c].gtin}.json`;
  const t = text(file);
  let lookup: ServedLookup;
  try {
    lookup = JSON.parse(t);
  } catch {
    fail(`${file} is not JSON`);
  }
  const { productId, variant } = (() => {
    try {
      return pickVariant(lookup, ids[c].gtin);
    } catch (e) {
      fail(String(e instanceof Error ? e.message : e));
    }
  })();
  if (productId !== ids[c].productId || variant.id !== ids[c].variantId)
    fail(`${file}: product/variant ${productId}/${variant.id} are not fixture ${c}'s`);
  const dpp = dppOf(variant, ids[c].gtin);
  if (!dppBytesServed(t, dpp)) fail(`${file}: the dpp block's compact serialisation is not a substring of the served bytes`);
  if (dpp.upi !== `https://ugpdpp.xyz/01/${ids[c].gtin}`) fail(`${file}: dpp.upi ${dpp.upi} is not the fixture's model-level UPI`);
  lookups[c] = { lookup, file, raw: t };
}
const eLookup = JSON.parse(text(`served/lookup-E-${GTIN_E}.json`)) as ServedLookup;
if ((eLookup.products ?? []).length !== 0) fail(`a lookup of E's GTIN ${GTIN_E} returned a product: E would have UG presence`);

// ---------------------------------------------------------------- listings
const listings = {} as Record<UcpCond, string>;
const entries: UcpListingEntry[] = [];
for (const c of ["A", "B", "C", "D"] as const) {
  const src = c === "D" ? "A" : c;
  const pg = page(PAGE_FILE[c]);
  const l = listingFromLookup(lookups[src].lookup, ids[src].gtin, pg.html);
  listings[c] = serialiseListing(l);
  const v = (l.variants as Array<{ id: string; dpp: UcpListingEntry["dpp"] }>)[0];
  entries.push({
    file: `listings/U-${c}.json`,
    condition: c,
    gtin: ids[src].gtin,
    productId: ids[src].productId,
    variantId: v.id,
    sha256: sha256(Buffer.from(listings[c], "utf8")),
    bytes: Buffer.byteLength(listings[c], "utf8"),
    dpp: v.dpp,
    variantUrl: null,
    source: {
      lookupFile: lookups[src].file,
      lookupSha256: served.find((s) => s.file === lookups[src].file)!.sha256,
      pageFile: PAGE_FILE[c],
      pageSha256: pg.sha256,
    },
  });
}
listings.E = serialiseListing(listingE(JSON.parse(listings.A)));
{
  const e = JSON.parse(listings.E) as { id: string; variants: Array<{ id: string }> };
  const pg = page(PAGE_FILE.A);
  entries.push({
    file: "listings/U-E.json",
    condition: "E",
    gtin: GTIN_E,
    productId: e.id,
    variantId: e.variants[0].id,
    sha256: sha256(Buffer.from(listings.E, "utf8")),
    bytes: Buffer.byteLength(listings.E, "utf8"),
    dpp: null,
    variantUrl: E_UPI,
    source: { lookupFile: null, lookupSha256: null, pageFile: PAGE_FILE.A, pageSha256: pg.sha256 },
  });
}
let invariants: string[];
try {
  invariants = checkListingInvariants(listings, ids);
} catch (e) {
  fail(`invariant broken: ${e instanceof Error ? e.message : e}`);
}

// ---------------------------------------------------------------- write
if (offline) {
  for (const en of entries) {
    const p = join(UCP_DIR, en.file);
    if (!existsSync(p) || readFileSync(p, "utf8") !== listings[en.condition])
      fail(`--offline rebuild of ${en.file} does not reproduce the stored bytes`);
    const old = prev!.listings.find((x) => x.file === en.file);
    if (!old || old.sha256 !== en.sha256) fail(`--offline: ${en.file} sha256 differs from the manifest`);
  }
  console.log(`--offline: all ${entries.length} listings reproduced byte for byte from the stored responses`);
  for (const l of invariants) console.log(`  ok  ${l}`);
  process.exit(0);
}
mkdirSync(SERVED_DIR, { recursive: true });
mkdirSync(LISTING_DIR, { recursive: true });
for (const [f, buf] of Object.entries(raw)) writeFileSync(join(UCP_DIR, f), buf);
for (const en of entries) writeFileSync(join(UCP_DIR, en.file), listings[en.condition], "utf8");
const manifest: UcpManifest = {
  _comment:
    "Generated by stimulus/build-ucp.ts (Study 3, arm U). served/* are the live UCP responses byte for byte; listings/* are the exact text shown in the arm-U prompt (stimulus/ucp.ts listingFromLookup / listingE). sha256 over exact bytes.",
  extension: {
    name: DPP_EXTENSION_NAME,
    version: schema.version ?? ext.version ?? null,
    schemaEtag: served.find((s) => s.file === "served/dpp-schema.json")?.etag ?? null,
    wellKnownEtag: served.find((s) => s.file === "served/well-known-ucp.json")?.etag ?? null,
  },
  served,
  listings: entries,
  invariants,
  builtAt: new Date().toISOString(),
  capturedAt: served[0]?.fetchedAt ?? null,
};
writeFileSync(UCP_MANIFEST, JSON.stringify(manifest, null, 2) + "\n", "utf8");
for (const s of served) console.log(`  ${s.file}  ${s.sha256}  ${s.bytes} B  ${s.method} ${s.url}  etag=${s.etag}`);
for (const en of entries) console.log(`  ${en.file}  ${en.sha256}  ${en.bytes} B`);
for (const l of invariants) console.log(`  ok  ${l}`);
console.log(`Wrote ${served.length} served responses, ${entries.length} listings and stimulus/ucp/manifest.json`);
