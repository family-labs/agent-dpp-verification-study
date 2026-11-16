/**
 * Study 3 (arm U): the UCP catalog listing a shopping platform hands a model.
 *
 * The harness plays the agent platform. It POSTs the LIVE Universal Commerce Protocol
 * catalog lookup of the testnet endpoint (universal-goods-testnet PR #372) for each fixture
 * GTIN, keeps each response byte for byte (stimulus/ucp/served/), and turns it into the
 * listing a UCP platform would give a model about a merchant's product. That turn is ONE
 * pure, deterministic function, `listingFromLookup`, documented here:
 *
 *   Taken from the served lookup, unchanged:
 *     product.id, variant.id, variant.barcodes, and variant.dpp (the extension
 *     `xyz.universalgoods.api.shopping.dpp`: upi, passport_url, verification_url,
 *     granularity). The listing is serialised compact (JSON.stringify, no spaces), as the
 *     server serialises its response, so the dpp block appears in the prompt as the very
 *     bytes the server sent (`dppBytesServed` checks the substring).
 *   Filled from the merchant's page (the S1 brand-store page of the SAME condition, read
 *     from stimulus/pages/main/S1-<cond>.html, hash-checked against stimulus/manifest.json),
 *     because the endpoint holds no prices and is not the merchant:
 *     product.title / variant.title   = the page's <h1>
 *     product.description.plain       = the page's article text, in page order: the price
 *                                       line, the description paragraph, "Specifications"
 *                                       with one "- <item>" line per <li>, "Compliance" and
 *                                       its sentence (the product link is NOT copied: in
 *                                       UCP it is the dpp block)
 *     variant.description.plain       = the page's description paragraph
 *     product.url                     = the page's URL (canonical product page)
 *     price, price_range.min/max      = { amount: <page price in minor units>, currency: "EUR" }
 *     availability                    = { available: true, status: "in_stock" } (the page
 *                                       sells it: "Add to basket")
 *   Dropped from the served response: the `ucp` envelope, `messages` (the endpoint's
 *     "not offered, price 0 is a placeholder" note, which a merchant catalog would not
 *     carry), the endpoint's own title/description/price/availability, and `inputs` (the
 *     lookup's echo of the request).
 *   D = A's listing from page S1-D, i.e. A's listing with "Expected lifetime: 4000 cycles"
 *     replaced by "6000 cycles" in the one place the page states it.
 *   E = A's listing with NO dpp block, the plain passport URL
 *     https://id.tarnvale.example/01/04012346519005 as the variant `url`, and E's own
 *     fictional product id, variant id and GTIN (stimulus/condition-e.ts). E is not on our
 *     platform; its listing is built, not served (a lookup of E's GTIN must return nothing).
 *
 * `checkListingInvariants` enforces: A, B and C differ only in their own ids, GTIN and
 * the links built from them; D differs from A only in the claim; E differs from A only in
 * the missing extension, the added url and E's own identifiers; no merchant field outside
 * the dpp block / E's url says passport, verif*, credential, token or blockchain; and the
 * dpp object has the same keys, order and (masked) values in A, B and C.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { E_IDS, E_UPI, GTIN_E } from "./condition-e";

export const STIMULUS_DIR = dirname(fileURLToPath(import.meta.url));
export const UCP_DIR = join(STIMULUS_DIR, "ucp");
export const UCP_MANIFEST = join(UCP_DIR, "manifest.json");

/** The testnet API host that serves the UCP endpoint (PR #372 docs/ucp/README.md). */
export const UCP_API_BASE = (process.env.UG_API_BASE ?? "https://api.universalgoods.xyz").replace(/\/+$/, "");
export const UCP_WELL_KNOWN_URL = `${UCP_API_BASE}/.well-known/ucp`;
export const UCP_SCHEMA_URL = `${UCP_API_BASE}/ucp/schemas/shopping/dpp.json`;
export const UCP_LOOKUP_URL = `${UCP_API_BASE}/ucp/catalog/lookup`;
/** The extension name on testnet (PR #372 docs/ucp/dpp-extension.md). */
export const DPP_EXTENSION_NAME = "xyz.universalgoods.api.shopping.dpp";
export const DPP_KEYS = ["upi", "passport_url", "verification_url", "granularity"] as const;
export const UCP_CATALOG_LOOKUP = "dev.ucp.shopping.catalog.lookup";

export type UcpCond = "A" | "B" | "C" | "D" | "E";
export const UCP_CONDS: readonly UcpCond[] = ["A", "B", "C", "D", "E"];
/** The page each condition's merchant fields come from (stimulus/manifest.json, set "main"). */
export const PAGE_FILE: Record<"A" | "B" | "C" | "D", string> = {
  A: "pages/main/S1-A.html",
  B: "pages/main/S1-B.html",
  C: "pages/main/S1-C.html",
  D: "pages/main/S1-D.html",
};
export const S1_PAGE_URL = "https://shop.tarnvale.example/products/tarnvale-5000";
export const CLAIM_A = "Expected lifetime: 4000 cycles";
export const CLAIM_D = "Expected lifetime: 6000 cycles";
const FORBIDDEN = /blockchain|token|credential|verif|passport/i;

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

// ---------------------------------------------------------------- merchant fields from the page

export interface MerchantFields {
  title: string;
  priceText: string;
  priceMinor: number;
  currency: "EUR";
  description: string;
  specs: string[];
  compliance: string;
  /** The product description text as built for product.description.plain. */
  productPlain: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
function one(html: string, re: RegExp, what: string): RegExpMatchArray {
  const all = [...html.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))];
  if (all.length !== 1) throw new Error(`page: expected exactly one ${what}, found ${all.length}`);
  return all[0];
}

/** Reads the merchant's fields off one S1 page (render.ts's template; any change throws). */
export function merchantFieldsFromPage(html: string): MerchantFields {
  const title = stripTags(one(html, /<h1>([\s\S]*?)<\/h1>/, "<h1>")[1]);
  const priceText = stripTags(one(html, /<p class="price">([\s\S]*?)<\/p>/, "price line")[1]);
  const pm = priceText.match(/^€(\d{1,3}(?:,\d{3})*)\.(\d{2})\b/);
  if (!pm) throw new Error(`price line "${priceText}" is not "€<n>.<nn> …"`);
  const priceMinor = Number(pm[1].replaceAll(",", "") + pm[2]);
  const description = stripTags(one(html, /<\/p>\s*<p>([\s\S]*?)<\/p>\s*<h2>Specifications<\/h2>/, "description paragraph")[1]);
  const ul = one(html, /<h2>Specifications<\/h2>\s*<ul>([\s\S]*?)<\/ul>/, "specification list")[1];
  const specs = [...ul.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => stripTags(m[1]));
  if (specs.length === 0) throw new Error("page: empty specification list");
  const compliance = stripTags(one(html, /<h2>Compliance<\/h2>\s*<p>([\s\S]*?)<\/p>/, "compliance sentence")[1]);
  const productPlain = [
    priceText,
    "",
    description,
    "",
    "Specifications",
    ...specs.map((s) => `- ${s}`),
    "",
    "Compliance",
    compliance,
  ].join("\n");
  return { title, priceText, priceMinor, currency: "EUR", description, specs, compliance, productPlain };
}

// ---------------------------------------------------------------- the served lookup

export interface Dpp {
  upi: string;
  passport_url: string;
  verification_url: string;
  granularity: string;
}
export interface ServedVariant {
  id: string;
  barcodes?: Array<{ type: string; value: string }>;
  dpp?: Dpp;
  [k: string]: unknown;
}
export interface ServedLookup {
  ucp?: { version?: string; capabilities?: Record<string, unknown> };
  products?: Array<{ id: string; variants?: ServedVariant[]; [k: string]: unknown }>;
  messages?: unknown[];
}

/** The one product and one variant a lookup of `gtin` must return. Throws otherwise. */
export function pickVariant(lookup: ServedLookup, gtin: string): { productId: string; variant: ServedVariant } {
  const products = lookup.products ?? [];
  if (products.length !== 1) throw new Error(`lookup of ${gtin}: ${products.length} products, expected 1`);
  const vs = products[0].variants ?? [];
  const hits = vs.filter((v) => (v.barcodes ?? []).some((b) => b.value === gtin));
  if (vs.length !== 1 || hits.length !== 1)
    throw new Error(`lookup of ${gtin}: ${vs.length} variant(s), ${hits.length} carrying the GTIN; expected exactly 1`);
  return { productId: products[0].id, variant: hits[0] };
}

/** The dpp block, checked for the extension's four required keys in the served order. */
export function dppOf(variant: ServedVariant, gtin: string): Dpp {
  const d = variant.dpp;
  if (!d || typeof d !== "object") throw new Error(`lookup of ${gtin}: the variant has no dpp block`);
  const keys = Object.keys(d);
  if (JSON.stringify(keys) !== JSON.stringify(DPP_KEYS))
    throw new Error(`lookup of ${gtin}: dpp keys ${JSON.stringify(keys)}, expected ${JSON.stringify(DPP_KEYS)}`);
  for (const k of DPP_KEYS) if (typeof d[k] !== "string" || !d[k]) throw new Error(`lookup of ${gtin}: dpp.${k} empty`);
  return d;
}

/** True if the compact serialisation of the dpp block occurs verbatim in the served bytes. */
export function dppBytesServed(rawServed: string, dpp: Dpp): boolean {
  return rawServed.includes(`"dpp":${JSON.stringify(dpp)}`);
}

// ---------------------------------------------------------------- the transform

export function listingFromLookup(lookup: ServedLookup, gtin: string, pageHtml: string): Record<string, unknown> {
  const { productId, variant } = pickVariant(lookup, gtin);
  const dpp = dppOf(variant, gtin);
  const m = merchantFieldsFromPage(pageHtml);
  const price = { amount: m.priceMinor, currency: m.currency };
  return {
    id: productId,
    title: m.title,
    description: { plain: m.productPlain },
    url: S1_PAGE_URL,
    price_range: { min: price, max: price },
    variants: [
      {
        id: variant.id,
        title: m.title,
        description: { plain: m.description },
        barcodes: variant.barcodes,
        price,
        availability: { available: true, status: "in_stock" },
        dpp,
      },
    ],
  };
}

/** E: A's listing, no dpp, E's passport URL as the variant url, E's own identifiers. */
export function listingE(aListing: Record<string, unknown>): Record<string, unknown> {
  const a = structuredClone(aListing) as {
    id: string;
    variants: Array<Record<string, unknown>>;
    [k: string]: unknown;
  };
  const v = a.variants[0];
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(a)) out[k] = k === "id" ? E_IDS.productId : val;
  out.variants = [
    {
      id: E_IDS.variantId,
      title: v.title,
      description: v.description,
      url: E_UPI,
      barcodes: [{ type: "GTIN", value: GTIN_E }],
      price: v.price,
      availability: v.availability,
    },
  ];
  return out;
}

/** The exact text placed in the prompt and stored: compact, as the server serialises. */
export function serialiseListing(listing: Record<string, unknown>): string {
  return JSON.stringify(listing);
}

// ---------------------------------------------------------------- invariants

export interface CondIds {
  productId: string;
  variantId: string;
  gtin: string;
}

function mask(text: string, ids: CondIds): string {
  return text.split(ids.productId).join("<productId>").split(ids.variantId).join("<variantId>").split(ids.gtin).join("<gtin>");
}

/** Throws on the first broken invariant; returns the lines it checked. */
export function checkListingInvariants(text: Record<UcpCond, string>, ids: Record<"A" | "B" | "C", CondIds>): string[] {
  const out: string[] = [];
  const parsed = Object.fromEntries(UCP_CONDS.map((c) => [c, JSON.parse(text[c])])) as Record<UcpCond, any>;
  for (const c of UCP_CONDS) {
    if (serialiseListing(parsed[c]) !== text[c]) throw new Error(`listing ${c} is not in canonical compact form`);
  }
  // A, B, C: their own product id, variant id and GTIN, nothing else.
  for (const c of ["A", "B", "C"] as const) {
    const p = parsed[c];
    if (p.id !== ids[c].productId) throw new Error(`listing ${c}: product id ${p.id} is not fixture ${c}'s ${ids[c].productId}`);
    if (p.variants[0].id !== ids[c].variantId)
      throw new Error(`listing ${c}: variant id ${p.variants[0].id} is not fixture ${c}'s ${ids[c].variantId}`);
  }
  for (const c of ["B", "C"] as const) {
    if (mask(text.A, ids.A) !== mask(text[c], ids[c]))
      throw new Error(`listings A and ${c} differ in more than their own ids, GTIN and the links built from them`);
  }
  out.push("A, B, C differ only in product id, variant id, GTIN (and the dpp links built from them)");
  // dpp: same keys, order and masked values.
  const dppShapes = (["A", "B", "C"] as const).map((c) => mask(JSON.stringify(parsed[c].variants[0].dpp), ids[c]));
  if (new Set(dppShapes).size !== 1) throw new Error(`dpp block not identical in shape across A/B/C: ${dppShapes.join(" | ")}`);
  out.push(`dpp block identical across A/B/C once ids are masked: ${dppShapes[0]}`);
  // D: only the claim.
  if (text.A.split(CLAIM_A).length !== 2) throw new Error(`listing A must state "${CLAIM_A}" exactly once`);
  if (text.A.split(CLAIM_A).join(CLAIM_D) !== text.D) throw new Error(`listing D differs from A in more than "${CLAIM_A}" -> "${CLAIM_D}"`);
  out.push(`D = A with "${CLAIM_A}" -> "${CLAIM_D}" (once), nothing else`);
  // E: A minus dpp, plus url, with E's identifiers.
  if (serialiseListing(listingE(parsed.A)) !== text.E) throw new Error("listing E is not listingE(A)");
  const aNoDpp = structuredClone(parsed.A);
  delete aNoDpp.variants[0].dpp;
  const eNoUrl = structuredClone(parsed.E);
  if (eNoUrl.variants[0].url !== E_UPI) throw new Error("listing E's variant url is not E's passport URL");
  if ("dpp" in eNoUrl.variants[0]) throw new Error("listing E carries a dpp block");
  delete eNoUrl.variants[0].url;
  const eIds: CondIds = { productId: E_IDS.productId, variantId: E_IDS.variantId, gtin: GTIN_E };
  const canon = (o: any) => JSON.stringify(o, Object.keys(flatKeys(o)).sort());
  if (canon(JSON.parse(mask(JSON.stringify(aNoDpp), ids.A))) !== canon(JSON.parse(mask(JSON.stringify(eNoUrl), eIds))))
    throw new Error("listing E differs from A in more than the missing dpp block, the url and E's own ids");
  out.push("E = A without the dpp block, with variant url = E's passport URL and E's own ids, nothing else");
  // No merchant field names the passport / check.
  for (const c of UCP_CONDS) {
    const p = structuredClone(parsed[c]);
    delete p.variants[0].dpp;
    delete p.variants[0].url;
    const m = JSON.stringify(p).match(FORBIDDEN);
    if (m) throw new Error(`listing ${c}: a merchant field contains "${m[0]}"`);
  }
  out.push("no merchant field (outside dpp / E's url) contains passport, verif*, credential, token or blockchain");
  return out;
}

function flatKeys(o: unknown, acc: Record<string, true> = {}): Record<string, true> {
  if (Array.isArray(o)) o.forEach((x) => flatKeys(x, acc));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
    acc[k] = true;
    flatKeys(v, acc);
  }
  return acc;
}

// ---------------------------------------------------------------- stored manifest

export interface UcpServedEntry {
  file: string;
  what: string;
  method: "GET" | "POST";
  url: string;
  requestBody: string | null;
  status: number;
  contentType: string | null;
  etag: string | null;
  fetchedAt: string;
  sha256: string;
  bytes: number;
}
export interface UcpListingEntry {
  file: string;
  condition: UcpCond;
  gtin: string;
  productId: string;
  variantId: string;
  sha256: string;
  bytes: number;
  /** null for E (no extension). */
  dpp: Dpp | null;
  /** E only: the plain passport URL in the variant url. */
  variantUrl: string | null;
  source: { lookupFile: string | null; lookupSha256: string | null; pageFile: string; pageSha256: string };
}
export interface UcpManifest {
  _comment: string;
  extension: { name: string; version: string | null; schemaEtag: string | null; wellKnownEtag: string | null };
  served: UcpServedEntry[];
  listings: UcpListingEntry[];
  invariants: string[];
  builtAt: string;
  capturedAt: string | null;
}

export function readUcpManifest(): UcpManifest {
  return JSON.parse(readFileSync(UCP_MANIFEST, "utf8")) as UcpManifest;
}
