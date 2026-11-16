/**
 * Study 6 live sites: builds the ONE bundle the Cloudflare Worker serves (site/dist/bundle.json).
 *
 * Input: the counted stimuli (stimulus/study6/manifest.json, built by stimulus/build-study6.ts --write,
 * every file re-hashed here) and the non-stimulus files of site/assets.ts. Output: every file once
 * (by sha256), and for each PHASE and each host the path -> file table the Worker uses. The content
 * of a response depends ONLY on (phase, host, path): never on the query string, the visitor or time.
 *
 * Phases (the Worker's switch; only the harness changes it, with the admin key):
 *   closed  both hosts: "/" = the holding page; every other page path 404 (holding page); assets and robots.txt
 *   check   closed, plus the two neutral tool-check pages on the brand host
 *   W       brand host: the shop with the W product pages (plain claim, no passport, no declaration
 *           of conformity, no declaration file); copycat host: closed
 *   D0      brand host: the shop of arm D0 (product pages, passport pages, declarations of conformity);
 *           copycat host: its copy of that shop (product pages, declarations of conformity, site pages)
 *   D1      as D0 with arm D1 pages, plus /.well-known/product-passports.json on the brand host only
 * Unknown paths in W, D0 and D1 answer 404 with the shop's own not-found page on that host.
 *
 * Usage (from harness/):  bun run ../site/build-site.ts [--mock]
 *   --mock builds from the MOCK stimuli (testnet collections), for local tests only; the bundle is
 *   then labelled mock and the Worker shows "mock" in its admin health answer.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRAND_HOST,
  BRAND_ORIGIN,
  LOOKALIKE_HOST,
  LOOKALIKE_ORIGIN,
  PRODUCT_KEYS,
  readS6Manifest,
  SITE_PAGE_NAMES,
  STIMULUS_DIR,
  type S6Manifest,
  BRAND,
  DECLARATION_URL,
  PRODUCTS,
} from "../stimulus/study6";
import { recordPath } from "../stimulus/study7";
import { SHOP_NOT_FOUND } from "../stimulus/study7r";
import { CHECKER_HOME, CHECKER_NOT_FOUND, CHECK_JSON, CHECK_JSON2, CHECK_JSON2_PATH, CHECK_PAGES, CHECK_PATHS, HOLDING_PAGE, notFoundPage, staticAssets } from "./assets";

export const SITE_DIR = dirname(fileURLToPath(import.meta.url));
export const BUNDLE_FILE = join(SITE_DIR, "dist", "bundle.json");
/** Study 6 phases, then the Study 7 format phases (each a D1 site with that format's product and passport pages). */
export const PHASES = ["closed", "check", "W", "D0", "D1", "S7F0", "S7F1", "S7F3", "S7R"] as const;
export type Phase = (typeof PHASES)[number];
export const HOSTS = [BRAND_HOST, LOOKALIKE_HOST] as const;

export interface BundleFile {
  contentType: string;
  body: string;
}
export interface Bundle {
  _comment: string;
  mock: boolean;
  builtAt: string;
  stimulusManifestSha256: string;
  /** sha256 of the canonical JSON of {files, routes, notFound, holding}: what the Worker reports as its build. */
  bundleSha256: string;
  files: Record<string, BundleFile>;
  /** phase -> host -> path -> file sha256 */
  routes: Record<Phase, Record<string, Record<string, string>>>;
  /** phase -> host -> the file a 404 answers with */
  notFound: Record<Phase, Record<string, string>>;
  holding: string;
  /**
   * Study 7's independent record service (served by the Worker on its own host, in every phase): per
   * record path, what to read LIVE from the public ledger, and the brand's declaration as published.
   */
  checker?: {
    host: string;
    explorerHost: string;
    brand: string;
    declaration: { website: string; account: string; url: string };
    records: Record<string, { product: string; serial: string; collection: string; tokenIdHex: string }>;
    pages: { home: string; notFound: string };
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function buildBundle(mock: boolean): Bundle {
  const m: S6Manifest | null = readS6Manifest(mock);
  if (!m) throw new Error(`stimulus manifest missing: run stimulus/build-study6.ts ${mock ? "--mock" : "--write"} first`);
  const manifestText = readFileSync(join(STIMULUS_DIR, mock ? "study6/mock/manifest.json" : "study6/manifest.json"), "utf8");
  const files: Record<string, BundleFile> = {};
  const put = (body: string, contentType: string) => {
    const h = sha256(body);
    files[h] = { contentType, body };
    return h;
  };

  // every stimulus, re-hashed against the manifest (a stale file fails the build)
  const stim: Record<string, { sha: string; host: string; path: string }> = {};
  for (const [key, e] of Object.entries(m.stimuli)) {
    const p = join(STIMULUS_DIR, e.file);
    if (!existsSync(p)) throw new Error(`${e.file} missing`);
    const text = readFileSync(p, "utf8");
    if (sha256(text) !== e.sha256) throw new Error(`${e.file}: bytes differ from the manifest`);
    const u = new URL(e.url);
    stim[key] = { sha: put(text, e.contentType), host: u.hostname, path: u.pathname };
  }

  const assets: Record<string, string> = {};
  for (const [path, a] of staticAssets()) assets[path] = put(a.text, a.contentType);
  const holding = put(HOLDING_PAGE, "text/html; charset=utf-8");
  const nf = { [BRAND_HOST]: put(notFoundPage(BRAND_ORIGIN), "text/html; charset=utf-8"), [LOOKALIKE_HOST]: put(notFoundPage(LOOKALIKE_ORIGIN), "text/html; charset=utf-8") };
  const checks: Record<string, string> = {};
  for (const [path, html] of Object.entries(CHECK_PAGES)) checks[path] = put(html, "text/html; charset=utf-8");
  checks[CHECK_PATHS.json] = put(CHECK_JSON, "application/json; charset=utf-8");
  checks[CHECK_JSON2_PATH] = put(CHECK_JSON2, "application/json; charset=utf-8");

  const table = (keys: string[], expectHost: string) => {
    const t: Record<string, string> = { ...assets };
    for (const k of keys) {
      const s = stim[k];
      if (!s) throw new Error(`no stimulus ${k}`);
      if (s.host !== expectHost) throw new Error(`${k} is on ${s.host}, not ${expectHost}`);
      if (t[s.path] && t[s.path] !== s.sha) throw new Error(`${expectHost}${s.path} would serve two files`);
      t[s.path] = s.sha;
    }
    return t;
  };
  const closedTable = () => ({ ...assets, "/": holding });
  const brandSite = SITE_PAGE_NAMES.map((s) => `brand/${s}`);
  const lookSite = SITE_PAGE_NAMES.map((s) => `lookalike/${s}`);
  const brandArm = (arm: "D0" | "D1") => [
    ...brandSite,
    ...PRODUCT_KEYS.map((k) => `${k}/store-G-${arm}`),
    ...PRODUCT_KEYS.map((k) => `${k}/passport-${arm}`),
    ...PRODUCT_KEYS.map((k) => `${k}/doc-G`),
    ...(arm === "D1" ? ["declaration"] : []),
  ];
  const lookArm = (arm: "D0" | "D1") => [...lookSite, ...PRODUCT_KEYS.map((k) => `${k}/lookalike-F-${arm}`), ...PRODUCT_KEYS.map((k) => `${k}/doc-F`)];

  const routes = {
    closed: { [BRAND_HOST]: closedTable(), [LOOKALIKE_HOST]: closedTable() },
    check: { [BRAND_HOST]: { ...closedTable(), ...checks }, [LOOKALIKE_HOST]: closedTable() },
    W: { [BRAND_HOST]: table([...brandSite, ...PRODUCT_KEYS.map((k) => `${k}/store-W`)], BRAND_HOST), [LOOKALIKE_HOST]: closedTable() },
    D0: { [BRAND_HOST]: table(brandArm("D0"), BRAND_HOST), [LOOKALIKE_HOST]: table(lookArm("D0"), LOOKALIKE_HOST) },
    D1: { [BRAND_HOST]: table(brandArm("D1"), BRAND_HOST), [LOOKALIKE_HOST]: table(lookArm("D1"), LOOKALIKE_HOST) },
  } as Bundle["routes"];
  const notFound = {
    closed: { [BRAND_HOST]: holding, [LOOKALIKE_HOST]: holding },
    check: { [BRAND_HOST]: holding, [LOOKALIKE_HOST]: holding },
    W: { [BRAND_HOST]: nf[BRAND_HOST], [LOOKALIKE_HOST]: holding },
    D0: { ...nf },
    D1: { ...nf },
  } as Bundle["notFound"];
  // ---- Study 7 (DRAFT): format phases and the independent record service
  let checker: Bundle["checker"];
  const m7File = join(STIMULUS_DIR, "study7", "manifest.json");
  if (!mock && existsSync(m7File)) {
    const m7 = JSON.parse(readFileSync(m7File, "utf8")) as { checkerHost: string; stimuli: Record<string, { file: string; sha256: string; url: string; contentType: string }> };
    const s7: Record<string, { sha: string; host: string; path: string }> = {};
    for (const [key, e] of Object.entries(m7.stimuli)) {
      const text = readFileSync(join(STIMULUS_DIR, e.file), "utf8");
      if (sha256(text) !== e.sha256) throw new Error(`${e.file}: bytes differ from the Study 7 manifest`);
      const u = new URL(e.url);
      s7[key] = { sha: put(text, e.contentType), host: u.hostname, path: u.pathname };
    }
    for (const fmt of ["F0", "F1", "F3"] as const) {
      const brand = table(brandArm("D1"), BRAND_HOST);
      const look = table(lookArm("D1"), LOOKALIKE_HOST);
      for (const [key, v] of Object.entries(s7)) {
        if (!key.startsWith(`${fmt}/`)) continue;
        (v.host === BRAND_HOST ? brand : look)[v.path] = v.sha;
      }
      routes[`S7${fmt}`] = { [BRAND_HOST]: brand, [LOOKALIKE_HOST]: look };
      notFound[`S7${fmt}`] = { ...nf };
    }
    // S7R (the recommendation study): the brand's own site as in S7F3, and the multi-brand shop on oskvale-store.com
    const shop: Record<string, string> = { ...assets };
    for (const [key, v] of Object.entries(s7)) if (key.startsWith("R/")) {
      if (v.host !== LOOKALIKE_HOST) throw new Error(`${key} is not on the shop host`);
      if (shop[v.path] && shop[v.path] !== v.sha && !(v.path in assets)) throw new Error(`shop path ${v.path} would serve two files`);
      shop[v.path] = v.sha;
    }
    routes.S7R = { [BRAND_HOST]: { ...routes.S7F3[BRAND_HOST] }, [LOOKALIKE_HOST]: shop };
    notFound.S7R = { [BRAND_HOST]: nf[BRAND_HOST], [LOOKALIKE_HOST]: put(SHOP_NOT_FOUND, "text/html; charset=utf-8") };
    const decl = JSON.parse(readFileSync(join(STIMULUS_DIR, m.stimuli.declaration.file), "utf8")) as { website: string; account: string };
    const records: NonNullable<Bundle["checker"]>["records"] = {};
    for (const k of PRODUCT_KEYS) {
      const f = m.fixtures.products[k];
      records[recordPath(k)] = { product: PRODUCTS[k].name, serial: PRODUCTS[k].serial, collection: f.collection, tokenIdHex: f.tokenId.replace(/^0x/, "") };
    }
    checker = {
      host: m7.checkerHost,
      explorerHost: m.explorerHost,
      brand: BRAND,
      declaration: { website: decl.website, account: decl.account.toLowerCase(), url: DECLARATION_URL },
      records,
      pages: { home: put(CHECKER_HOME, "text/html; charset=utf-8"), notFound: put(CHECKER_NOT_FOUND, "text/html; charset=utf-8") },
    };
  }
  const core = { files, routes, notFound, holding, ...(checker ? { checker } : {}) };
  return {
    _comment: `Study 6 live-site bundle (site/build-site.ts${mock ? " --mock: MOCK stimuli, local tests only" : ""}). Served by site/worker.ts; never edit by hand.`,
    mock,
    builtAt: new Date().toISOString(),
    stimulusManifestSha256: sha256(manifestText),
    bundleSha256: sha256(JSON.stringify(core)),
    ...core,
  };
}

if (import.meta.main) {
  const mock = process.argv.includes("--mock");
  const b = buildBundle(mock);
  mkdirSync(dirname(BUNDLE_FILE), { recursive: true });
  writeFileSync(BUNDLE_FILE, JSON.stringify(b) + "\n", "utf8");
  const bytes = Buffer.byteLength(JSON.stringify(b));
  for (const ph of PHASES) for (const h of HOSTS) console.log(`  ${ph.padEnd(6)} ${h.padEnd(18)} ${Object.keys(b.routes[ph][h]).length} paths`);
  console.log(`Wrote ${BUNDLE_FILE}: ${Object.keys(b.files).length} files, ${(bytes / 1024).toFixed(0)} KiB, bundle ${b.bundleSha256.slice(0, 16)}${mock ? " (MOCK)" : ""}`);
}
