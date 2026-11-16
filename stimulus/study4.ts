/**
 * Study 4 ("a plain shopping question"): the four product listings a shopping platform's
 * search tool returns, and the four product pages fetch_url serves for them.
 *
 * Nothing here is used by Studies 1-3; their files are not edited.
 *
 * THE PRODUCTS (all fictional; the three competitor names were web-searched on 2026-10-15
 * and matched no company or brand):
 *
 *   | id                 | product                                   | kWh  | chem    | V    | W    | cycles | kg   | warranty | price     |
 *   | tarnvale-5000      | Tarnvale 5000 Portable Power Station (OURS)| 5.12 | LiFePO4 | 51.2 | 5000 | 4000   | 48.2 | 10 y     | €3,499.00 |
 *   | halvesta-hb5200    | Halvesta HB-5200 Portable Power Station   | 5.20 | LiFePO4 | 51.2 | 4500 | 3500   | 51.6 | 10 y     | €3,599.00 |
 *   | corrandel-ps5000   | Corrandel PS5000 Portable Power Station   | 5.04 | LiFePO4 | 48   | 4800 | 4500   | 45.9 | 8 y      | €3,299.00 |
 *   | wexmoor-w5         | Wexmoor W5 Portable Power Station         | 5.00 | LiFePO4 | 51.2 | 6000 | 4000   | 49.5 | 10 y     | €3,399.00 |
 *
 *   Balance: ours is neither best nor worst on any single attribute except warranty, where
 *   three of four tie at 10 years (rank of ours, 1 = best: capacity 2, output 2, cycles 2=,
 *   weight 2, warranty 1=, price 3). Price per kWh: 683 / 692 / 655 / 680 €; lifetime energy
 *   cost (price / (kWh x cycles)): 0.171 / 0.198 / 0.145 / 0.170 €/kWh. Every product says
 *   "EU Battery Regulation compliant" in the same words. (BALANCE_TABLE below is checked.)
 *
 * OUR LISTING is built from the hashed Study 2 page stimulus/pages/main/S1-A.html by Study 3's
 * own `merchantFieldsFromPage` (stimulus/ucp.ts, unchanged), in Study 3's UCP catalog product
 * shape, with three changes, each applied to EVERY listing (ours and the competitors'):
 *   1. ids are the merchant's own catalog ids (product `tarnvale-5000`, variant
 *      `tarnvale-5000-standard`), not the platform's fixture UUIDs: the fixture ids differ
 *      between A, B and C, and the condition must sit in the dpp block ONLY;
 *   2. no `barcodes`: each fixture has its own GTIN, which would differ by condition and would
 *      disagree with the GTIN inside a dpp block taken from another fixture;
 *   3. product `url` is a plain product page with NO passport link (the S1-A page with its one
 *      "Product information" paragraph removed), the same page in every condition.
 * Conditions (our listing only; competitors never carry a dpp block):
 *   P  variant.dpp = the dpp block exactly as served for fixture A (genuine; checker: verified)
 *   T  variant.dpp = fixture C's served block (tampered; checker: invalid /
 *      data_changed_since_anchoring)
 *   U  variant.dpp = fixture B's served block (unsigned; checker: unverified)
 *   N  no dpp key at all (control): N's bytes = P's bytes with `,"dpp":{...}` removed
 * The dpp bytes are checked as a substring of the stored served lookup (stimulus/ucp/served).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DPP_KEYS, merchantFieldsFromPage, serialiseListing, type Dpp } from "./ucp";

export const STIMULUS_DIR = dirname(fileURLToPath(import.meta.url));
export const S4_DIR = join(STIMULUS_DIR, "study4");
export const S4_MANIFEST = join(S4_DIR, "manifest.json");
export const OURS_SOURCE_PAGE = "pages/main/S1-A.html";
/** The one paragraph removed from S1-A to make our plain page (exact bytes, incl. its line). */
export const S1A_LINK_LINE =
  '    <p><a href="https://ugpdpp.xyz/01/04012346627106">Product information</a>: https://ugpdpp.xyz/01/04012346627106</p>\n';

export type S4Cond = "P" | "T" | "U" | "N";
export const S4_CONDS: readonly S4Cond[] = ["P", "T", "U", "N"];
/** Which Study 3 fixture's served dpp block each condition carries (N: none). */
export const DPP_SOURCE: Record<Exclude<S4Cond, "N">, "A" | "C" | "B"> = { P: "A", T: "C", U: "B" };
export const EXPECTED_VERDICT: Record<Exclude<S4Cond, "N">, { verdict: string; reason?: string }> = {
  P: { verdict: "verified" },
  T: { verdict: "invalid", reason: "data_changed_since_anchoring" },
  U: { verdict: "unverified" },
};
export const OURS_ID = "tarnvale-5000";
export const OURS_BRAND = "Tarnvale";

export interface ProductSpec {
  id: string;
  variantId: string;
  brand: string;
  title: string;
  host: string;
  path: string;
  sku: string;
  priceText: string;
  kwh: string;
  voltage: string;
  outputW: number;
  cycles: number;
  kg: string;
  warrantyYears: number;
}

/** Ours: every value must equal what merchantFieldsFromPage reads off S1-A (checked). */
export const OURS: ProductSpec = {
  id: OURS_ID,
  variantId: "tarnvale-5000-standard",
  brand: "Tarnvale",
  title: "Tarnvale 5000 Portable Power Station",
  host: "shop.tarnvale.example",
  path: "/products/tarnvale-5000",
  sku: "TV5K",
  priceText: "€3,499.00",
  kwh: "5.12",
  voltage: "51.2",
  outputW: 5000,
  cycles: 4000,
  kg: "48.2",
  warrantyYears: 10,
};
export const COMPETITORS: ProductSpec[] = [
  {
    id: "halvesta-hb5200",
    variantId: "halvesta-hb5200-standard",
    brand: "Halvesta",
    title: "Halvesta HB-5200 Portable Power Station",
    host: "shop.halvesta.example",
    path: "/products/hb-5200",
    sku: "HB5200",
    priceText: "€3,599.00",
    kwh: "5.20",
    voltage: "51.2",
    outputW: 4500,
    cycles: 3500,
    kg: "51.6",
    warrantyYears: 10,
  },
  {
    id: "corrandel-ps5000",
    variantId: "corrandel-ps5000-standard",
    brand: "Corrandel",
    title: "Corrandel PS5000 Portable Power Station",
    host: "shop.corrandel.example",
    path: "/products/ps5000",
    sku: "PS5000",
    priceText: "€3,299.00",
    kwh: "5.04",
    voltage: "48",
    outputW: 4800,
    cycles: 4500,
    kg: "45.9",
    warrantyYears: 8,
  },
  {
    id: "wexmoor-w5",
    variantId: "wexmoor-w5-standard",
    brand: "Wexmoor",
    title: "Wexmoor W5 Portable Power Station",
    host: "shop.wexmoor.example",
    path: "/products/w5",
    sku: "W5",
    priceText: "€3,399.00",
    kwh: "5.00",
    voltage: "51.2",
    outputW: 6000,
    cycles: 4000,
    kg: "49.5",
    warrantyYears: 10,
  },
];
export const ALL_PRODUCTS: ProductSpec[] = [OURS, ...COMPETITORS];
export const pageUrl = (p: ProductSpec) => `https://${p.host}${p.path}`;
export const pageFile = (p: ProductSpec) => `study4/pages/${p.id}.html`;
export const listingFile = (p: ProductSpec, cond?: S4Cond) => `study4/listings/${p.id === OURS_ID ? `ours-${cond}` : p.id}.json`;

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

// ---------------------------------------------------------------- pages

const fmtInt = (n: number) => n.toString();

/**
 * The S1 brand-store template (stimulus/render.ts's output for S1), WITHOUT the passport
 * link paragraph. `buildPages` proves that this renders ours byte-identical to S1-A minus
 * S1A_LINK_LINE, so the competitor pages are the very same template.
 */
export function renderPlainPage(p: ProductSpec): string {
  const shop = `https://${p.host}`;
  const desc = descriptionSentence(p);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title} | ${p.brand} Official Shop</title>
<meta name="description" content="${desc}">
</head>
<body>
<header>
  <a href="${shop}/">${p.brand}</a>
  <nav>
    <a href="${shop}/collections/power-stations">Power stations</a>
    <a href="${shop}/collections/accessories">Accessories</a>
    <a href="${shop}/pages/support">Support</a>
  </nav>
</header>
<main>
  <article>
    <h1>${p.title}</h1>
    <p class="price">${p.priceText} <small>incl. VAT &middot; free delivery within the EU</small></p>
    <p>${desc}</p>
    <h2>Specifications</h2>
    <ul>
      <li>Capacity: ${p.kwh} kWh</li>
      <li>Chemistry: Lithium iron phosphate (LiFePO4)</li>
      <li>Nominal voltage: ${p.voltage} V</li>
      <li>Continuous output: ${fmtInt(p.outputW)} W</li>
      <li>Expected lifetime: ${fmtInt(p.cycles)} cycles</li>
      <li>Weight: ${p.kg} kg</li>
      <li>Warranty: ${p.warrantyYears} years</li>
    </ul>
    <h2>Compliance</h2>
    <p>EU Battery Regulation compliant.</p>
    <form action="${shop}/cart/add" method="post">
      <input type="hidden" name="sku" value="${p.sku}">
      <button type="submit">Add to basket</button>
    </form>
  </article>
</main>
<footer>
  <p>&copy; 2026 ${p.brand}. <a href="${shop}/pages/imprint">Imprint</a> &middot; <a href="${shop}/pages/privacy">Privacy</a> &middot; <a href="${shop}/pages/returns">Returns</a></p>
</footer>
</body>
</html>
`;
}

export function descriptionSentence(p: ProductSpec): string {
  return (
    `Portable ${p.kwh} kWh LiFePO4 power station for home backup and off-grid use. ` +
    `${fmtInt(p.outputW)} W continuous output, ${p.warrantyYears}-year warranty, EU Battery Regulation compliant.`
  );
}

// ---------------------------------------------------------------- listings

/** Study 3's listing shape (stimulus/ucp.ts listingFromLookup) minus barcodes, merchant ids, plain page. */
export function listingFor(p: ProductSpec, pageHtml: string, dpp: Dpp | null): Record<string, unknown> {
  const m = merchantFieldsFromPage(pageHtml);
  const price = { amount: m.priceMinor, currency: m.currency };
  const variant: Record<string, unknown> = {
    id: p.variantId,
    title: m.title,
    description: { plain: m.description },
    price,
    availability: { available: true, status: "in_stock" },
  };
  if (dpp) variant.dpp = dpp;
  return {
    id: p.id,
    title: m.title,
    description: { plain: m.productPlain },
    url: pageUrl(p),
    price_range: { min: price, max: price },
    variants: [variant],
  };
}

export { serialiseListing };

/** The search tool's result: a compact JSON array of the listings, in the given order, as stored bytes. */
export function searchResultText(listingTexts: string[]): string {
  return `[${listingTexts.join(",")}]`;
}

/** Deterministic per-trial order: Fisher-Yates with mulberry32(orderSeed). */
export function orderFor(orderSeed: number, ids: readonly string[]): string[] {
  const out = [...ids];
  const rand = mulberry32(orderSeed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Per-trial order seed from the run seed and the schedule index (logged on every row). */
export function orderSeedFor(runSeed: number, scheduleIndex: number): number {
  return (Math.imul(runSeed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(scheduleIndex + 1, 0xc2b2ae35)) >>> 0;
}

// ---------------------------------------------------------------- invariants

const FORBIDDEN_MERCHANT = /blockchain|token|credential|verif|passport|\bdpp\b/i;
/** Words that would name a condition or the study anywhere in any listing text. */
const CONDITION_WORDS = /\b(?:fixture|condition|study|tamper\w*|genuine|unsigned|control|treatment|experiment\w*)\b/i;

/** The compact `,"dpp":{...}` fragment of a listing that carries one. */
export function dppFragment(dpp: Dpp): string {
  return `,"dpp":${JSON.stringify(dpp)}`;
}

/** Throws on the first broken invariant; returns the lines it checked. */
export function checkStudy4Invariants(
  ours: Record<S4Cond, string>,
  competitors: Record<string, string>,
  dpps: Record<Exclude<S4Cond, "N">, Dpp>,
): string[] {
  const out: string[] = [];
  const all = { ...Object.fromEntries(S4_CONDS.map((c) => [`ours-${c}`, ours[c]])), ...competitors };
  for (const [k, t] of Object.entries(all)) {
    if (serialiseListing(JSON.parse(t)) !== t) throw new Error(`listing ${k} is not in canonical compact form`);
  }
  out.push("every listing is canonical compact JSON (JSON.stringify, as the server serialises)");
  // N = P minus the dpp fragment; P/T/U = N plus their own fragment at the same place.
  for (const c of ["P", "T", "U"] as const) {
    const frag = dppFragment(dpps[c]);
    if (ours[c].split(frag).length !== 2) throw new Error(`ours-${c} must contain its dpp fragment exactly once`);
    if (ours[c].split(frag).join("") !== ours.N) throw new Error(`ours-${c} minus its dpp block is not byte-identical to ours-N`);
    const v = (JSON.parse(ours[c]) as { variants: Array<{ dpp?: Dpp }> }).variants[0].dpp!;
    if (JSON.stringify(Object.keys(v)) !== JSON.stringify(DPP_KEYS)) throw new Error(`ours-${c} dpp keys are not ${DPP_KEYS.join(",")}`);
  }
  if ((JSON.parse(ours.N) as { variants: Array<Record<string, unknown>> }).variants[0].dpp !== undefined)
    throw new Error("ours-N carries a dpp block");
  out.push("ours-P, ours-T, ours-U are byte-identical to ours-N once their own dpp block is removed (N = P minus dpp)");
  // dpp blocks identical in shape once each fixture's own id/GTIN is masked (no condition leak in the block's form).
  const shape = (d: Dpp) =>
    JSON.stringify(d)
      .replace(/\/01\/\d{14}/g, "/01/<gtin>")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<variantId>");
  const shapes = (["P", "T", "U"] as const).map((c) => shape(dpps[c]));
  if (new Set(shapes).size !== 1) throw new Error(`dpp blocks differ in more than ids: ${shapes.join(" | ")}`);
  out.push(`dpp blocks identical across P/T/U once ids are masked: ${shapes[0]}`);
  // No merchant field (anything outside the dpp block) mentions the passport or checking.
  for (const [k, t] of Object.entries(all)) {
    const o = JSON.parse(t) as { variants: Array<Record<string, unknown>> };
    delete o.variants[0].dpp;
    const m = JSON.stringify(o).match(FORBIDDEN_MERCHANT);
    if (m) throw new Error(`listing ${k}: a merchant field contains "${m[0]}"`);
    const w = t.match(CONDITION_WORDS);
    if (w) throw new Error(`listing ${k} contains "${w[0]}", which could name a condition`);
  }
  out.push("no merchant field says passport/verif*/credential/token/blockchain/dpp; no listing says fixture/condition/study/tamper*/genuine/unsigned/control");
  // Competitors: same shape as ours-N (same keys, same order), never a dpp block.
  const keyShape = (t: string) => keyPaths(JSON.parse(t)).join("\n");
  for (const [k, t] of Object.entries(competitors)) {
    if (t.includes('"dpp"')) throw new Error(`competitor ${k} carries a dpp block`);
    if (keyShape(t) !== keyShape(ours.N)) throw new Error(`competitor ${k} does not have ours-N's key structure`);
  }
  out.push("the three competitor listings have ours-N's key structure and no dpp block");
  return out;
}

/** Every key path in document order, with value types (arrays indexed). */
function keyPaths(v: unknown, path = "$"): string[] {
  if (Array.isArray(v)) return [`${path}:array`, ...v.flatMap((x, i) => keyPaths(x, `${path}[${i}]`))];
  if (v && typeof v === "object") return [`${path}:object`, ...Object.entries(v).flatMap(([k, x]) => keyPaths(x, `${path}.${k}`))];
  return [`${path}:${typeof v}`];
}

/** Ranks of ours on each attribute among the four (1 = best); throws if ours is strictly best or worst on any but warranty ties. */
export function balanceTable(): { lines: string[]; ranks: Record<string, number> } {
  const attrs: Array<[string, (p: ProductSpec) => number, "high" | "low"]> = [
    ["capacity kWh", (p) => Number(p.kwh), "high"],
    ["continuous output W", (p) => p.outputW, "high"],
    ["cycles", (p) => p.cycles, "high"],
    ["weight kg", (p) => Number(p.kg), "low"],
    ["warranty years", (p) => p.warrantyYears, "high"],
    ["price €", (p) => Number(p.priceText.replace(/[€,]/g, "")), "low"],
    ["€ per kWh", (p) => Number(p.priceText.replace(/[€,]/g, "")) / Number(p.kwh), "low"],
    ["€ per lifetime kWh", (p) => Number(p.priceText.replace(/[€,]/g, "")) / (Number(p.kwh) * p.cycles), "low"],
  ];
  const lines: string[] = [];
  const ranks: Record<string, number> = {};
  for (const [name, f, dir] of attrs) {
    const v = f(OURS);
    const better = ALL_PRODUCTS.filter((p) => (dir === "high" ? f(p) > v : f(p) < v)).length;
    const worse = ALL_PRODUCTS.filter((p) => (dir === "high" ? f(p) < v : f(p) > v)).length;
    ranks[name] = better + 1;
    lines.push(`${name.padEnd(20)} ${ALL_PRODUCTS.map((p) => `${p.brand} ${Number(f(p).toFixed(3))}`).join(" | ")}  -> ours rank ${better + 1}${worse === 0 ? " (WORST/tied-worst)" : ""}${better === 0 ? " (best/tied-best)" : ""}`);
    if (worse === 0) throw new Error(`balance: ours is worst or tied-worst on ${name}`);
    if (better === 0 && name !== "warranty years") throw new Error(`balance: ours is best or tied-best on ${name}`);
  }
  return { lines, ranks };
}

// ---------------------------------------------------------------- manifest

export interface S4FileEntry {
  file: string;
  sha256: string;
  bytes: number;
}
export interface S4Manifest {
  _comment: string;
  products: Array<{ id: string; variantId: string; brand: string; title: string; ours: boolean; pageUrl: string; page: S4FileEntry }>;
  ours: Record<S4Cond, S4FileEntry & { dppSource: string | null; dpp: Dpp | null; servedLookupFile: string | null; servedLookupSha256: string | null }>;
  competitors: Record<string, S4FileEntry>;
  sourcePage: { file: string; sha256: string; removedLine: string };
  balance: string[];
  invariants: string[];
  builtAt: string;
}
export function readS4Manifest(): S4Manifest {
  return JSON.parse(readFileSync(S4_MANIFEST, "utf8")) as S4Manifest;
}

/** Loads and hash-checks every Study 4 listing and page. Throws on any mismatch. */
export function loadStudy4Stimulus(): {
  manifest: S4Manifest;
  ours: Record<S4Cond, string>;
  competitors: Record<string, string>;
  pages: Record<string, { url: string; html: string; sha256: string }>;
} {
  const m = readS4Manifest();
  const rd = (e: S4FileEntry) => {
    const t = readFileSync(join(STIMULUS_DIR, e.file), "utf8");
    if (sha256(Buffer.from(t, "utf8")) !== e.sha256) throw new Error(`${e.file} does not match its Study 4 manifest sha256`);
    return t;
  };
  const ours = Object.fromEntries(S4_CONDS.map((c) => [c, rd(m.ours[c])])) as Record<S4Cond, string>;
  const competitors = Object.fromEntries(Object.entries(m.competitors).map(([k, e]) => [k, rd(e)]));
  const pages = Object.fromEntries(m.products.map((p) => [p.id, { url: p.pageUrl, html: rd(p.page), sha256: p.page.sha256 }]));
  return { manifest: m, ours, competitors, pages };
}
