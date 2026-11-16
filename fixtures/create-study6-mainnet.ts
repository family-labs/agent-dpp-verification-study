/**
 * Create the three Study 6 battery products on the Universal Goods MAINNET platform, up to
 * the point where a human has to sign. Derived from create-fixtures.ts (Study 2, testnet):
 * same endpoints, same headers, same order, same `_identity` placement of the GTIN.
 *
 *   DEFAULT IS A DRY RUN. It validates everything locally, makes at most ONE read-only
 *   request (GET /api/products, to spot products that already exist), and prints every
 *   request it WOULD send: method, path and body, with no secrets.
 *
 *   It writes only when BOTH hold: the API host is exactly api.universalgoods.org (https,
 *   no port, no path) AND the flag --write-mainnet is given. Anything else is refused
 *   before a single request leaves this machine.
 *
 * Run (from the repo root; bun is C:/Users/REDACTED_USER/.bun/bin/bun.exe on James's machine):
 *   bun run fixtures/create-study6-mainnet.ts --schemas <dir>                 dry run
 *   bun run fixtures/create-study6-mainnet.ts --schemas <dir> --write-mainnet  real writes
 *
 * Flags:
 *   --write-mainnet      send the writes (refused unless the host is the mainnet API host)
 *   --schemas <dir>      folder holding the platform's battery section schemas, exported from
 *                        the private platform repo as <section>.schema.json + applicability.json.
 *                        Without it the schema and per-category checks are SKIPPED, and a
 *                        --write-mainnet run is refused unless --skip-schema-check is also given.
 *   --skip-schema-check  allow --write-mainnet without --schemas (the server still validates)
 *   --offline            dry run with no network at all (skips the GET)
 *   --env <file>         env file to read (default: the dpp-verification-study .env below)
 *
 * Env (read from the env file by this script, never printed; only "present" or "missing"):
 *   UGM_API_BASE   the MAINNET API origin
 *   UGM_API_TOKEN  an organisation-scoped API key, sent as x-api-key
 *   UGM_ORG_ID     the study organisation, sent as x-organization-id
 *
 * Per product (lmt, industrial, stationary), in order. Every step is skipped when
 * study6-conditions.json already records the id it would create, so a run that dies half
 * way is resumed by running it again.
 *   1. POST /api/products                                      categoryId per battery category
 *   2. PUT  /api/metadata/product/{id}/detail/{slug}           x the eight Annex XIII sections
 *   3. POST /api/products/{id}/variants                        one variant
 *   4. PUT  /api/metadata/variant/{vid}/detail/_identity       { gtin } (what sealing reads)
 *   5. POST /api/products/{id}/batches                         one batch, "Production lot <model>-2610"
 *   6. POST /api/lifecycle/products/{id}/batches/{bid}/generate-items   { count: 1 }
 *
 * Not done here (each needs a person and a key in a browser): Tokenise (seal, deploy the
 * collection, mint), Sync, and recording the collection address and token id in
 * study6-conditions.json. Generating the item is free on the platform (no credit gate);
 * the on-chain cost lands at Tokenise and is bounded by the profile's monthly gas allowance
 * in the relayer, which this script cannot see.
 *
 * All product data is synthetic (study6-batteries.json, see its _comment). GTINs use the
 * GS1 prefix 952, which GS1 reserves for demonstrations.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// ------------------------------------------------------------------ constants

/** The study brand. James may correct the spelling: change it here and nowhere else. */
export const BRAND = "Oskvale";
/** The brand's web origin. Every brand link in the data is built from this. */
export const WEB_ORIGIN = "https://oskvale.com";

const MAINNET_API_HOST = "api.universalgoods.org";
const DEFAULT_ENV_FILE = "C:/Users/REDACTED_USER/Downloads/dpp-verification-study/.env";
const DATA_FILE = new URL("./study6-batteries.json", import.meta.url);
const CONDITIONS_FILE = new URL("./study6-conditions.json", import.meta.url);
const MIN_REQUEST_GAP_MS = 1000; // one request per second at most, reads and writes alike
const LOT_SUFFIX = "2610";

const PRODUCT_KEYS = ["lmt", "industrial", "stationary"] as const;
type Key = (typeof PRODUCT_KEYS)[number];
const CATEGORY_IDS: Record<Key, string> = {
  lmt: "c0000000-0000-4000-8000-000000000202",
  industrial: "c0000000-0000-4000-8000-000000000204",
  stationary: "c0000000-0000-4000-8000-000000000203",
};
const SECTION_SLUGS = [
  "batteryIdentification",
  "materialComposition",
  "performanceAndDurability",
  "batteryCircularity",
  "conformity",
  "endOfLife",
  "safetyAndDocumentation",
  "testReports",
] as const;
const GTINS: Record<Key, string> = {
  lmt: "09520606000019",
  industrial: "09520606000026",
  stationary: "09520606000033",
};
const BANNED = /complian|certif/i;

// ------------------------------------------------------------------ args

const argv = process.argv.slice(2);
const flag = (f: string) => argv.includes(f);
const opt = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};
const WRITE = flag("--write-mainnet");
const OFFLINE = flag("--offline");
const SKIP_SCHEMA = flag("--skip-schema-check");
const SCHEMAS_DIR = opt("--schemas");
const ENV_FILE = opt("--env") ?? DEFAULT_ENV_FILE;
const known = new Set(["--write-mainnet", "--offline", "--skip-schema-check", "--schemas", "--env"]);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--schemas" || argv[i] === "--env") { i++; continue; }
  if (!known.has(argv[i])) fail(`unknown argument ${argv[i]}`);
}
if (WRITE && OFFLINE) fail("--write-mainnet and --offline contradict each other");

function fail(msg: string): never {
  console.error(`REFUSED: ${msg}`);
  process.exit(1);
}

// ------------------------------------------------------------------ env (parsed by hand, never printed)

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = readEnv(ENV_FILE);
const BASE = env.UGM_API_BASE?.trim() || "";
const TOKEN = env.UGM_API_TOKEN?.trim() || "";
const ORG = env.UGM_ORG_ID?.trim() || "";
console.log(`env file: ${existsSync(ENV_FILE) ? "found" : "NOT FOUND"}`);
for (const [name, v] of [["UGM_API_BASE", BASE], ["UGM_API_TOKEN", TOKEN], ["UGM_ORG_ID", ORG]] as const) {
  console.log(`  ${name}: ${v ? "present" : "missing"}`);
}

/** True only for exactly https://api.universalgoods.org (optionally with a trailing slash). */
function isMainnetHost(base: string): boolean {
  try {
    const u = new URL(base);
    return (
      u.protocol === "https:" &&
      u.hostname.toLowerCase() === MAINNET_API_HOST &&
      u.port === "" &&
      (u.pathname === "/" || u.pathname === "") &&
      !u.search && !u.hash && !u.username && !u.password
    );
  } catch {
    return false;
  }
}
const HOST_OK = isMainnetHost(BASE);
console.log(`  host is exactly the mainnet API host: ${HOST_OK ? "yes" : "no"}`);
const ORIGIN = HOST_OK ? new URL(BASE).origin : "";

if (WRITE) {
  if (!HOST_OK) fail(`--write-mainnet needs UGM_API_BASE to be exactly https://${MAINNET_API_HOST}`);
  if (!TOKEN || !ORG) fail("--write-mainnet needs UGM_API_TOKEN and UGM_ORG_ID");
  if (!SCHEMAS_DIR && !SKIP_SCHEMA) fail("--write-mainnet needs --schemas <dir> (or an explicit --skip-schema-check)");
}
console.log(`mode: ${WRITE ? "WRITE (mainnet)" : `DRY RUN${OFFLINE ? ", offline" : ""}`}\n`);

// ------------------------------------------------------------------ data

/** GTIN-14 check digit: weights 3,1,3,1... from the LEFT over the 13 body digits. */
export function gtin14(body13: string): string {
  if (!/^\d{13}$/.test(body13)) throw new Error(`GTIN body must be 13 digits: ${body13}`);
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(body13[i]) * (i % 2 === 0 ? 3 : 1);
  return body13 + String((10 - (sum % 10)) % 10);
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Section = { title: string; data: Record<string, Json> };
type ProductData = {
  categoryId: string;
  title: string;
  description: string;
  model: string;
  gtin: string;
  sections: Record<string, Section>;
};

/** Fill {brand} and {web} from the two constants, in every string and nowhere else. */
function fill<T extends Json>(v: T): T {
  if (typeof v === "string") return v.replaceAll("{brand}", BRAND).replaceAll("{web}", WEB_ORIGIN) as T;
  if (Array.isArray(v)) return v.map(fill) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) as T;
  return v;
}

const rawData = JSON.parse(readFileSync(DATA_FILE, "utf8")) as { products: Record<string, Json> };
const PRODUCTS = Object.fromEntries(
  Object.entries(rawData.products).map(([k, v]) => [k, fill(v)]),
) as unknown as Record<Key, ProductData>;

type Recorded = {
  collection: string | null;
  tokenId: string | null;
  productId: string | null;
  variantId: string | null;
  batchId: string | null;
  gtin: string | null;
};
type Conditions = {
  _comment: string;
  network: { name: string; chainId: number };
  organisation: { profileAddress: string | null };
  products: Record<string, Recorded>;
};
const conditions = JSON.parse(readFileSync(CONDITIONS_FILE, "utf8")) as Conditions;
const persist = () => {
  if (!WRITE) return; // a dry run never touches the file
  writeFileSync(CONDITIONS_FILE, JSON.stringify(conditions, null, 2) + "\n");
};

// ------------------------------------------------------------------ local validation

const problems: string[] = [];
const notes: string[] = [];
const bad = (m: string) => problems.push(m);

function walkStrings(v: Json, path: string, visit: (s: string, path: string, isKey: boolean) => void) {
  if (typeof v === "string") visit(v, path, false);
  else if (Array.isArray(v)) v.forEach((x, i) => walkStrings(x, `${path}[${i}]`, visit));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      visit(k, `${path}.${k}`, true);
      walkStrings(x, `${path}.${k}`, visit);
    }
}

function validateLocal() {
  if (!BRAND.trim()) bad("BRAND is empty");
  let web: URL | null = null;
  try {
    web = new URL(WEB_ORIGIN);
  } catch {
    bad(`WEB_ORIGIN is not a URL`);
  }
  if (web && (web.protocol !== "https:" || web.origin !== WEB_ORIGIN)) bad("WEB_ORIGIN must be a bare https origin");

  if (conditions.network?.chainId !== 42) bad("study6-conditions.json network.chainId is not 42");
  const keys = Object.keys(PRODUCTS).sort().join(",");
  if (keys !== [...PRODUCT_KEYS].sort().join(",")) bad(`products in the data file are ${keys}, expected ${PRODUCT_KEYS.join(",")}`);

  const seenGtins = new Set<string>();
  for (const key of PRODUCT_KEYS) {
    const p = PRODUCTS[key];
    if (!p) continue;
    const at = `[${key}]`;

    // GTIN: 14 digits, GS1 952 demo prefix, check digit recomputed by gtin14().
    if (p.gtin !== GTINS[key]) bad(`${at} gtin ${p.gtin} is not the briefed ${GTINS[key]}`);
    if (!/^\d{14}$/.test(p.gtin)) bad(`${at} gtin ${p.gtin} is not 14 digits`);
    else {
      const recomputed = gtin14(p.gtin.slice(0, 13));
      if (recomputed !== p.gtin) bad(`${at} gtin check digit wrong: ${p.gtin}, gtin14() gives ${recomputed}`);
      if (!p.gtin.startsWith("0952")) bad(`${at} gtin ${p.gtin} is not under the GS1 952 demonstration prefix`);
    }
    if (seenGtins.has(p.gtin)) bad(`${at} gtin ${p.gtin} repeats`);
    seenGtins.add(p.gtin);
    const rec = conditions.products?.[key];
    if (!rec) bad(`${at} study6-conditions.json has no products.${key}`);
    else if (rec.gtin !== p.gtin) bad(`${at} study6-conditions.json gtin ${rec.gtin} differs from the data file's ${p.gtin}`);

    // Category.
    if (p.categoryId !== CATEGORY_IDS[key]) bad(`${at} categoryId ${p.categoryId} is not ${CATEGORY_IDS[key]}`);
    const id = p.sections.batteryIdentification?.data ?? {};
    if (id.batteryCategory !== key) bad(`${at} batteryCategory ${JSON.stringify(id.batteryCategory)} is not "${key}"`);

    // Brand and model consistency.
    if (!p.title.startsWith(`${BRAND} `)) bad(`${at} title does not start with the brand`);
    const man = id.manufacturer as Record<string, Json> | undefined;
    if (man?.name !== BRAND) bad(`${at} manufacturer.name is not the brand`);
    if (man?.webAddress !== WEB_ORIGIN) bad(`${at} manufacturer.webAddress is not WEB_ORIGIN`);
    const addr = man?.postalAddress as Record<string, Json> | undefined;
    if (addr?.locality !== "Copenhagen" || addr?.country !== "DK") bad(`${at} postalAddress is not Copenhagen, DK`);
    if (addr && "postalCode" in addr) bad(`${at} postalAddress carries a postal code (kept out on purpose)`);
    if (id.manufacturingPlace !== "Odense, Denmark") bad(`${at} manufacturingPlace is not "Odense, Denmark"`);
    if (id.modelIdentification !== p.model) bad(`${at} modelIdentification ${id.modelIdentification} is not ${p.model}`);
    if (id.identifyingElement !== `Lot ${p.model}-${LOT_SUFFIX}`) bad(`${at} identifyingElement is not "Lot ${p.model}-${LOT_SUFFIX}"`);
    const doc = (p.sections.conformity?.data?.declarationOfConformity ?? {}) as Record<string, Json>;
    if (doc.identificationNumber !== `DoC-${p.model}-2026-01`) bad(`${at} DoC identificationNumber is not DoC-${p.model}-2026-01`);
    const docModel = doc.batteryModel as Record<string, Json> | undefined;
    if (typeof docModel?.product !== "string" || !docModel.product.startsWith(p.title) || !docModel.product.includes(p.model))
      bad(`${at} DoC batteryModel.product does not name this product and model`);
    if ((doc.manufacturer as Record<string, Json> | undefined)?.name !== BRAND) bad(`${at} DoC manufacturer.name is not the brand`);
    const object = JSON.stringify(doc.objectOfDeclaration ?? "");
    if (!object.includes(p.title) || !object.includes(p.model)) bad(`${at} DoC objectOfDeclaration does not name this product and model`);

    // Sections: exactly the eight, each with a title and an object.
    const slugs = Object.keys(p.sections);
    for (const s of SECTION_SLUGS) if (!slugs.includes(s)) bad(`${at} section ${s} missing`);
    for (const s of slugs) if (!(SECTION_SLUGS as readonly string[]).includes(s)) bad(`${at} unexpected section ${s}`);
    for (const [s, sec] of Object.entries(p.sections)) {
      if (!sec.title?.trim()) bad(`${at} ${s} has no title`);
      if (!sec.data || typeof sec.data !== "object" || Array.isArray(sec.data)) bad(`${at} ${s}.data is not an object`);
    }

    // Words, placeholders and hosts, over every key and string.
    walkStrings(p as unknown as Json, key, (s, path, isKey) => {
      if (BANNED.test(s)) bad(`${path}: banned word in ${isKey ? "key" : "value"} ${JSON.stringify(s)}`);
      if (!isKey && /\{(brand|web)\}/.test(s)) bad(`${path}: unfilled placeholder`);
      if (!isKey) for (const url of s.match(/https?:\/\/[^\s,)]+/g) ?? [])
        if (!url.startsWith(`${WEB_ORIGIN}/`) && url !== WEB_ORIGIN) bad(`${path}: link ${url} is not on ${WEB_ORIGIN}`);
    });
  }
}

// ---------- schema validation against the platform's own section schemas (optional dir)

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  required?: string[];
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
};

/**
 * A small JSON Schema checker for exactly the keywords the battery section schemas use
 * (type, properties, items, enum, required, pattern, format uri, minimum, maximum), PLUS a
 * check the server does not make: a key the schema does not declare is an error here. The
 * platform accepts and silently stores an unknown key (no additionalProperties: false), so a
 * typo would otherwise reach the passport unnoticed.
 */
function checkSchema(v: unknown, s: Schema, path: string, out: string[]) {
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type];
  if (types.length) {
    const ok = types.some((t) =>
      t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v)
      : t === "array" ? Array.isArray(v)
      : t === "integer" ? Number.isInteger(v)
      : t === "number" ? typeof v === "number" && Number.isFinite(v)
      : t === "null" ? v === null
      : typeof v === t,
    );
    if (!ok) return void out.push(`${path}: expected ${types.join("|")}, got ${Array.isArray(v) ? "array" : typeof v}`);
  }
  if (s.enum && !s.enum.includes(v)) out.push(`${path}: ${JSON.stringify(v)} is not one of ${JSON.stringify(s.enum)}`);
  if (typeof v === "string") {
    if (s.pattern && !new RegExp(s.pattern, "u").test(v)) out.push(`${path}: ${JSON.stringify(v)} does not match ${s.pattern}`);
    if (s.format === "uri") {
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) out.push(`${path}: not an http(s) URI`);
      } catch {
        out.push(`${path}: not a URI`);
      }
    }
  }
  if (typeof v === "number") {
    if (s.minimum !== undefined && v < s.minimum) out.push(`${path}: below ${s.minimum}`);
    if (s.maximum !== undefined && v > s.maximum) out.push(`${path}: above ${s.maximum}`);
  }
  if (Array.isArray(v) && s.items) v.forEach((x, i) => checkSchema(x, s.items!, `${path}[${i}]`, out));
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const r of s.required ?? []) if (!(r in o)) out.push(`${path}: missing required ${r}`);
    const props = s.properties;
    if (props && Object.keys(props).length) {
      for (const [k, x] of Object.entries(o)) {
        if (!(k in props)) out.push(`${path}.${k}: not a key the platform schema declares`);
        else checkSchema(x, props[k], `${path}.${k}`, out);
      }
    }
  }
}

type Applicability = {
  sections: Record<
    string,
    {
      itemLevel: boolean;
      keys: Record<string, Record<Key, string>>;
      attributes: Record<string, { gate: string | null } & Record<Key, string>>;
    }
  >;
};

const getAt = (o: unknown, path: string) =>
  path.split(".").reduce<unknown>((x, k) => (x && typeof x === "object" ? (x as Record<string, unknown>)[k] : undefined), o);

let schemaChecked = false;
function validateAgainstSchemas(dir: string) {
  const appFile = join(dir, "applicability.json");
  if (!existsSync(appFile)) return void bad(`--schemas ${dir}: applicability.json not found`);
  const app = JSON.parse(readFileSync(appFile, "utf8")) as Applicability;
  for (const key of PRODUCT_KEYS) {
    const p = PRODUCTS[key];
    let fieldCount = 0;
    for (const slug of SECTION_SLUGS) {
      const file = join(dir, `${slug}.schema.json`);
      if (!existsSync(file)) { bad(`--schemas ${dir}: ${slug}.schema.json not found`); continue; }
      const schema = JSON.parse(readFileSync(file, "utf8")) as Schema;
      const data = p.sections[slug]?.data ?? {};
      const errs: string[] = [];
      checkSchema(data, schema, `${key}.${slug}`, errs);
      errs.forEach(bad);

      const meta = app.sections[slug];
      if (!meta) { bad(`${slug}: no applicability record`); continue; }
      if (meta.itemLevel) bad(`${slug} is an item-level section; it cannot be written at product level`);
      // Top-level keys: nothing pending_act or not_applicable may be filled; every required key must be.
      for (const k of Object.keys(data)) {
        const r = meta.keys[k]?.[key];
        if (!r) continue; // unknown keys were reported by checkSchema
        if (r === "pending_act" || r === "not_applicable") bad(`${key}.${slug}.${k} is ${r} for ${key} and must be omitted`);
      }
      for (const [k, byCat] of Object.entries(meta.keys))
        if (byCat[key] === "required" && !(k in data)) bad(`${key}.${slug}.${k} is required for ${key} but missing`);
      // Leaf attributes: a filled path must not be gated or not applicable for this category.
      for (const [path, a] of Object.entries(meta.attributes)) {
        const v = getAt(data, path);
        if (v === undefined) continue;
        fieldCount++;
        if (a.gate) bad(`${key}.${slug}.${path} waits on an act (${a.gate}) and must be omitted`);
        if (a[key] === "not_applicable") bad(`${key}.${slug}.${path} is not applicable to ${key}`);
      }
    }
    notes.push(`${key}: ${fieldCount} corpus attributes filled across the eight sections`);
  }
  schemaChecked = true;
}

validateLocal();
if (SCHEMAS_DIR) validateAgainstSchemas(SCHEMAS_DIR);

console.log("local validation:");
console.log(`  GTIN check digits, categories, brand, address, links, banned words, section set: ${problems.length ? "see below" : "ok"}`);
console.log(`  platform section schemas + per-category applicability: ${SCHEMAS_DIR ? (schemaChecked ? "checked" : "FAILED TO LOAD") : "SKIPPED (no --schemas dir)"}`);
for (const n of notes) console.log(`  ${n}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const m of problems) console.error(`  - ${m}`);
  fail("local validation failed; nothing was sent");
}
console.log("  all checks passed\n");

// ------------------------------------------------------------------ requests

let lastRequestAt = 0;
async function pace() {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

/** Body as it may be printed: the org id from the env file is shown as a placeholder. */
function printable(body: unknown): string {
  if (body === undefined) return "";
  const s = JSON.stringify(body, null, 2);
  return ORG ? s.replaceAll(ORG, "<UGM_ORG_ID>") : s;
}

const wouldSend: { method: string; path: string }[] = [];
let placeholderSeq = 0;

async function http(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<any> {
  const readOnlyAllowed = method === "GET" && path === "/api/products" && !OFFLINE && HOST_OK && TOKEN && ORG;
  if (!WRITE && !readOnlyAllowed) {
    wouldSend.push({ method, path });
    console.log(`WOULD SEND ${method} ${path}${body === undefined ? "" : `\n${printable(body).replace(/^/gm, "    ")}`}`);
    return { __dry: true, id: `<new-${++placeholderSeq}>` };
  }
  await pace();
  const res = await fetch(`${ORIGIN}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // An API key travels in x-api-key; Authorization: Bearer is the OAuth path and
      // rejects an API key with 401 (measured on testnet 2026-10-12).
      "x-api-key": TOKEN,
      "x-organization-id": ORG,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const safe = (TOKEN ? text.replaceAll(TOKEN, "<UGM_API_TOKEN>") : text).slice(0, 2000);
    throw new Error(`${method} ${path} -> ${res.status}: ${ORG ? safe.replaceAll(ORG, "<UGM_ORG_ID>") : safe}`);
  }
  return text ? JSON.parse(text) : null;
}

// ---------- existing products (the one read-only request a dry run may make)

type ListedProduct = { id: string; title: string; categoryId?: string | null };
let existing: ListedProduct[] | null = null;
if (!OFFLINE && HOST_OK && TOKEN && ORG) {
  try {
    const rows = await http("GET", "/api/products");
    existing = Array.isArray(rows) ? rows : Array.isArray(rows?.products) ? rows.products : null;
    console.log(`GET /api/products: ${existing ? `${existing.length} product(s) in the organisation` : "unexpected response shape"}`);
  } catch (e) {
    const msg = (e as Error).message;
    if (WRITE) fail(`could not list existing products: ${msg}`);
    console.log(`GET /api/products failed: ${msg}`);
  }
} else {
  console.log(`GET /api/products: not made (${OFFLINE ? "--offline" : !HOST_OK ? "host is not the mainnet API host" : "token or org id missing"})`);
}

const titleClash: string[] = [];
for (const key of PRODUCT_KEYS) {
  const p = PRODUCTS[key];
  const rec = conditions.products[key];
  if (!existing) continue;
  const same = existing.filter((x) => x.title === p.title);
  if (!rec.productId && same.length) titleClash.push(`${key}: "${p.title}" already exists as ${same.map((x) => x.id).join(", ")} but no productId is recorded`);
  if (rec.productId && !existing.some((x) => x.id === rec.productId)) titleClash.push(`${key}: recorded productId ${rec.productId} is not in this organisation`);
}
if (titleClash.length) {
  console.log("\nexisting-product check:");
  titleClash.forEach((m) => console.log(`  - ${m}`));
  if (WRITE) fail("record or remove the existing products in study6-conditions.json first; nothing was written");
} else if (existing) {
  console.log("existing-product check: no clash with the three titles\n");
}

// ---------- the six steps per product

for (const key of PRODUCT_KEYS) {
  const p = PRODUCTS[key];
  const rec = conditions.products[key];
  console.log(`\n========== [${key}] ${p.title}  gtin ${p.gtin}`);

  // 1. product. collectionKind is NOT sent, so the database default (v3) answers.
  if (!rec.productId) {
    const product = await http("POST", "/api/products", {
      organizationId: ORG || "<UGM_ORG_ID>",
      title: p.title,
      description: p.description,
      categoryId: p.categoryId,
    });
    if (!product.__dry) {
      if (product.categoryId !== p.categoryId) throw new Error(`product ${product.id} came back with categoryId ${product.categoryId}`);
      rec.productId = product.id;
      persist();
      console.log(`[${key}] product -> ${rec.productId}`);
    }
  } else console.log(`[${key}] product exists -> ${rec.productId}`);
  const pid = rec.productId ?? `<productId:${key}>`;

  // 2. the eight sections. PUT is idempotent; the server's 422 carries the AJV paths.
  for (const slug of SECTION_SLUGS) {
    const section = p.sections[slug];
    const r = await http("PUT", `/api/metadata/product/${pid}/detail/${slug}`, { title: section.title, data: section.data });
    if (!r?.__dry) console.log(`[${key}]   section ${slug} ok`);
  }

  // 3. one variant
  if (!rec.variantId) {
    const variant = await http("POST", `/api/products/${pid}/variants`, { variantKey: { edition: "standard" } });
    if (!variant.__dry) {
      rec.variantId = variant.id;
      persist();
      console.log(`[${key}] variant -> ${rec.variantId}`);
    }
  } else console.log(`[${key}] variant exists -> ${rec.variantId}`);
  const vid = rec.variantId ?? `<variantId:${key}>`;

  // 4. the GTIN where sealing reads it. Variant first; product as a fallback.
  const identity = { title: "Identity", data: { gtin: p.gtin } };
  if (WRITE) {
    try {
      await http("PUT", `/api/metadata/variant/${vid}/detail/_identity`, identity);
      console.log(`[${key}]   _identity.gtin=${p.gtin} on variant ok`);
    } catch (e) {
      console.warn(`[${key}]   variant _identity refused (${(e as Error).message.slice(0, 160)}); trying product`);
      await http("PUT", `/api/metadata/product/${pid}/detail/_identity`, identity);
      console.log(`[${key}]   _identity.gtin=${p.gtin} on product ok`);
    }
  } else {
    await http("PUT", `/api/metadata/variant/${vid}/detail/_identity`, identity);
    console.log(`    (only if the variant refuses it: PUT /api/metadata/product/${pid}/detail/_identity, same body)`);
  }

  // 5. one batch on that variant. Neutral description: the resolver serves it publicly.
  if (!rec.batchId) {
    const batch = await http("POST", `/api/products/${pid}/batches`, {
      variantId: vid,
      description: `Production lot ${p.model}-${LOT_SUFFIX}`,
    });
    if (!batch.__dry) {
      rec.batchId = batch.id;
      persist();
      console.log(`[${key}] batch -> ${rec.batchId}`);
    }
  } else console.log(`[${key}] batch exists -> ${rec.batchId}`);
  const bid = rec.batchId ?? `<batchId:${key}>`;

  // 6. one keyless item, derived server-side. Skipped when the batch already holds one.
  //    The item count is read only in a write run; a dry run cannot know it.
  let held = 0;
  if (WRITE) {
    const items = await http("GET", `/api/products/${pid}/batches/${bid}/items`).catch(() => null);
    held = Array.isArray(items) ? items.length : Array.isArray(items?.items) ? items.items.length : 0;
  } else {
    console.log(`    (a write run first reads GET /api/products/${pid}/batches/${bid}/items and skips the next request if the batch already holds an item)`);
  }
  if (held === 0) {
    const r = await http("POST", `/api/lifecycle/products/${pid}/batches/${bid}/generate-items`, { count: 1 });
    if (!r?.__dry) console.log(`[${key}] generated 1 item ok`);
  } else console.log(`[${key}] batch already holds ${held} item(s), not generating`);
}

// ------------------------------------------------------------------ summary

if (WRITE) {
  persist();
  console.log("\nDone. study6-conditions.json carries productId, variantId, batchId and gtin per product.");
  console.log("Next, in the console with a key: Tokenise each batch, then Sync each product; record collection + tokenId.");
} else {
  const by = wouldSend.reduce<Record<string, number>>((m, r) => ((m[r.method] = (m[r.method] ?? 0) + 1), m), {});
  console.log(`\nDRY RUN: nothing was written. ${wouldSend.length} request(s) would be sent: ${Object.entries(by).map(([m, n]) => `${n} ${m}`).join(", ")}.`);
  console.log("A write run also reads each batch's items (3 GETs) and may add a product-level _identity PUT if a variant refuses it.");
  console.log(`To write for real: bun run fixtures/create-study6-mainnet.ts --schemas <dir> --write-mainnet`);
}
