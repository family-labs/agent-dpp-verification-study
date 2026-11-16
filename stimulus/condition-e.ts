/**
 * Follow-up condition E: a plain hosted passport with no checker.
 *
 * E carries the SAME battery data as fixture B, published the way a conventional passport
 * vendor would: one static JSON document on an ordinary host, with no `links` block, no
 * verifier, no platform notices or warnings, and no Universal Goods host or id. It is
 * built from fixture B's live resolver JSON (GET https://ugpdpp.xyz/01/04012346283401,
 * read-only) by `transformToE` below, so E and B carry the same information and differ only
 * in where they live and whether a checker exists.
 *
 * Format decision: JSON in B's served shape (same keys, same nesting, same values), served
 * with `Content-Type: application/json`, compact (as the resolver serves B). Only these
 * change:
 *   - dropped: `$.links`, `$.warnings`, `$.dpp.conformanceWarnings`, `$.dpp.notices`
 *     (and any other key in DROP_PATHS);
 *   - B's UPI, passport-id URL, product/variant/category ids, GTIN and SKU are replaced by
 *     E's own (fictional) ones;
 *   - the `ug:` namespace prefix of schema ids becomes `tv:`;
 *   - the manufacturer's two familylabs.xyz web addresses move to fictional tarnvale.example
 *     hosts (neither is reachable through fetch_url, exactly like the originals).
 * Kept unchanged: every data value, `restricted` (it carries no host), `dpp.lastUpdated`,
 * `dpp.responsibleEconomicOperator` and the manufacturer NAME ("Family Labs Energy Systems
 * GmbH", the fictional manufacturer in all five conditions, A30 §3).
 *
 * The document is served by fetch_url at E_UPI (and at its own passport-id URL, as the
 * resolver serves B at both) from the stored file; nothing is ever fetched from a
 * `.example` host.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STIMULUS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO = join(STIMULUS_DIR, "..");

/** GS1 GTIN-14 body 0401234651900 + computed check digit 5. New; never bound on ugpdpp.xyz. */
export const GTIN_E = "04012346519005";
export const SKU_E = "TV5K-5190";
export const E_HOST = "id.tarnvale.example";
/** GS1 Digital Link-shaped URL on E's own host. */
export const E_UPI = `https://${E_HOST}/01/${GTIN_E}`;
/** E's own fictional ids (uuid4, generated once on 2026-10-14). */
export const E_IDS = {
  productId: "49707d32-9d40-4271-8038-450ebcb8fb6d",
  variantId: "5df1654d-e8b2-4bec-8f11-2a50494c9593",
  categoryId: "e4fe2ee7-0e86-4f5f-8e0a-cb8bab60e1fa",
} as const;
export const E_PASSPORT_ID_URL = `https://${E_HOST}/api/passport/${E_IDS.variantId}?kind=variant`;
/** Paths (query dropped) at which fetch_url serves E's document. */
export const E_SERVED_URLS = [E_UPI, `https://${E_HOST}/api/passport/${E_IDS.variantId}`] as const;
export const E_DOC_FILE = `passports/E-${GTIN_E}.json`;
export const E_DOC_CONTENT_TYPE = "application/json; charset=utf-8";
/** The source B payload as fetched (bytes kept), for an offline, reproducible rebuild. */
export const B_SOURCE_FILE = "passports/source-B-04012346283401.json";
export const B_SOURCE_URL = "https://ugpdpp.xyz/01/04012346283401";

/** Hosts E's document may name. Every other host is a failure. */
export const E_ALLOWED_HOSTS = [E_HOST, "support.tarnvale.example", "compliance.tarnvale.example"] as const;

/** Top-level / dpp keys removed from B (platform links, notices and warnings). */
export const DROP_PATHS = [
  ["links"],
  ["warnings"],
  ["notices"],
  ["dpp", "conformanceWarnings"],
  ["dpp", "notices"],
  ["dpp", "warnings"],
] as const;

interface FixtureIds {
  sku: string;
  productId: string | null;
  variantId: string | null;
  batchId: string | null;
  gtin: string | null;
}
interface ConditionsFile {
  assignments: Record<"A" | "B" | "C", FixtureIds>;
  [k: string]: unknown;
}

export function readConditions(): ConditionsFile {
  return JSON.parse(
    readFileSync(process.env.FIXTURES_FILE ?? join(REPO, "fixtures/conditions.json"), "utf8"),
  ) as ConditionsFile;
}

/** Every id/GTIN/SKU of ours that the study ever used (current and retired fixtures). */
export function ourFixtureIdentifiers(): string[] {
  const c = readConditions();
  const out = new Set<string>();
  const collect = (a: Record<string, FixtureIds> | undefined) => {
    for (const f of Object.values(a ?? {})) {
      for (const v of [f.sku, f.productId, f.variantId, f.batchId, f.gtin]) if (v) out.add(v);
    }
  };
  collect(c.assignments);
  for (const [k, v] of Object.entries(c)) {
    if (k.startsWith("_retired") && v && typeof v === "object") {
      collect((v as { assignments?: Record<string, FixtureIds> }).assignments);
    }
  }
  out.add("293959384059"); // pilot GTIN (A29)
  // Platform category registry ids (Industrial battery, Battery) — A30 §1.
  out.add("c0000000-0000-4000-8000-000000000204");
  out.add("b0000000-0000-4000-8000-0000000000b1");
  return [...out];
}

/**
 * The UG-presence grep list. A hit on E's document (or E's page) fails preflight.
 * Each entry: [label, pattern]. Applied to the raw text.
 */
export const UG_PRESENCE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["UG resolver host", /ugpdpp/i],
  ["UG host", /universalgoods/i],
  ["UG name", /universal[\s_-]*goods/i],
  ["Family Labs host", /familylabs/i],
  ["UG schema namespace", /(^|["\s])ug:/],
  ["chain", /lukso|blockchain|on-chain|smart[\s-]*contract/i],
  ["verification link key", /verificationUrl|jsonLdUrl/i],
  ["verifier path", /\/verify\b/i],
  ["platform links block", /"links"\s*:/],
  ["platform warnings key", /"(?:warnings|conformanceWarnings|notices)"\s*:/],
  ["granularity notice text", /conformant DPP|per individual battery|served at variant level/i],
  ["credential / anchor", /credential|anchor/i],
];

export function ugPresenceHits(text: string): string[] {
  const hits: string[] = [];
  for (const [label, re] of UG_PRESENCE_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push(`${label}: ${JSON.stringify(text.slice(Math.max(0, m.index! - 30), m.index! + 50))}`);
  }
  for (const id of ourFixtureIdentifiers()) {
    if (text.includes(id)) hits.push(`our fixture identifier ${id}`);
  }
  const hosts = [...text.matchAll(/https?:\/\/([^/\s"'<>?#]+)/gi)].map((m) => m[1].toLowerCase());
  for (const h of new Set(hosts)) {
    if (!(E_ALLOWED_HOSTS as readonly string[]).includes(h)) hits.push(`host outside E's own set: ${h}`);
  }
  return hits;
}

function deepMapStrings(v: unknown, f: (s: string) => string): unknown {
  if (typeof v === "string") return f(v);
  if (Array.isArray(v)) return v.map((x) => deepMapStrings(x, f));
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, deepMapStrings(x, f)]),
    );
  }
  return v;
}

/**
 * Pure transform: B's served payload -> E's document object. Deterministic, so the
 * preflight can re-apply it to B's live payload and compare with the stored E (parity).
 */
export function transformToE(bPayload: unknown, b: FixtureIds): Record<string, unknown> {
  if (!b.productId || !b.variantId || !b.gtin) throw new Error("fixture B ids incomplete");
  const src = structuredClone(bPayload) as Record<string, unknown>;
  for (const path of DROP_PATHS) {
    let o: Record<string, unknown> | undefined = src;
    for (let i = 0; i < path.length - 1 && o; i++) o = o[path[i]] as Record<string, unknown> | undefined;
    if (o && typeof o === "object") delete o[path[path.length - 1]];
  }
  const cat = ((src.ancestors as Array<{ type: string; id: string }> | undefined) ?? []).find(
    (a) => a.type === "category",
  )?.id;
  const pairs: Array<[string, string]> = [
    [`https://ugpdpp.xyz/01/${b.gtin}`, E_UPI],
    [`https://ugpdpp.xyz/api/passport/${b.variantId}`, `https://${E_HOST}/api/passport/${E_IDS.variantId}`],
    ["https://support.familylabs.xyz/", "https://support.tarnvale.example/"],
    ["https://compliance.familylabs.xyz/", "https://compliance.tarnvale.example/"],
    [b.variantId, E_IDS.variantId],
    [b.productId, E_IDS.productId],
    [b.gtin, GTIN_E],
    [b.sku, SKU_E],
  ];
  if (cat) pairs.push([cat, E_IDS.categoryId]);
  const out = deepMapStrings(src, (s) => {
    let t = s;
    for (const [from, to] of pairs) t = t.split(from).join(to);
    if (t.startsWith("ug:")) t = `tv:${t.slice(3)}`;
    return t;
  }) as Record<string, unknown>;
  return out;
}

/** The exact bytes stored for E: compact JSON, as the resolver serves B. */
export function serialiseE(doc: Record<string, unknown>): string {
  return JSON.stringify(doc);
}
