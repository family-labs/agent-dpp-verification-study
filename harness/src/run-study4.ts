/**
 * Study 4 ("a plain shopping question") trial runner. Studies 2 and 3's runners, adapters and
 * stimuli are NOT edited; this file reuses fetch_url (fetch-tool.ts) and the Study 3 pricing,
 * and adds a search tool, a follow-up turn (agents/conversation.ts) and its own ledger.
 *
 * One trial:
 *   system   "You are a helpful shopping assistant. User locale: en-IE."
 *   user     "Help me decide which battery to buy for backup power at home."
 *   platform search (as Google AI Mode fetches product data behind the scenes): the harness
 *            runs ONE search_products call itself, query = the user's request text, and the
 *            conversation starts with that completed call and its result in each vendor's native
 *            tool-call format (agents/conversation.ts), between the user turn and the model's
 *            first turn. Logged as initiator "platform"; any later search is the model's own.
 *   tools    search_products(query) — "Search merchant catalogs for products. Returns product
 *            listings." Whatever the query, it returns the same JSON array of four listings
 *            (stimulus/study4/listings), in the trial's order; every query is logged.
 *            fetch_url(url) — Study 2/3's tool, description and allow-list unchanged; the four
 *            listing urls are served from stimulus/study4/pages; 8 fetches per trial.
 *   then     ONE fixed follow-up user turn, in the same conversation, tools declared but off:
 *            "Which one product would you pick? Reply with only its id."
 *   order    of the four listings: Fisher-Yates with mulberry32(orderSeed), orderSeed derived
 *            from the run seed and the schedule index (stimulus/study4.ts orderSeedFor); the
 *            order and the position of ours (1-4) are logged on every row.
 *   condition (ours only): P genuine dpp block (fixture A), T tampered (C), U unsigned (B),
 *            N no dpp block. Everything else in every listing is identical across conditions
 *            (preflight Q5).
 *
 * Usage (from harness/; bun's absolute path on this machine):
 *   bun run src/run-study4.ts --max-usd <n> [--runs 10] [--models openai,gemini,kimi,anthropic]
 *        [--conditions P,T,U,N] [--seed N] [--dry-run]
 *   bun run src/run-study4.ts --smoke --max-usd 0.40 [--models ...]
 *
 * --dry-run  schedule size; projected cost PER VENDOR = INFLATION x the model's MEASURED mean
 *            per-trial cost in Study 3 arm U (results-archive), or its Study 4 smoke trial if
 *            dearer, x 1.25; and the allocation that fits every vendor cap (runs reduced
 *            uniformly across models and conditions, never below 6). No API call, no network.
 * --smoke    ONE trial per selected model on a THROWAWAY: our listing carrying a synthetic dpp
 *            block of the retired, non-fixture product GTIN 04012345730104 (its real resolver
 *            and verifier links, built as the server would; stimulus/ucp-synthetic.ts), the
 *            three competitors unchanged. pilot=true, written to results/smoke-study4-*.jsonl,
 *            excluded from every analysis. Hard ceiling USD 0.40 in total.
 *
 * Budget (James, 2026-10-15): a SEPARATE Study 4 ledger (results/study4-spend-ledger.json).
 * Per-vendor caps = 60% of the balances remaining after Study 3: OpenAI 11.70, Gemini 3.90,
 * Kimi 12.50, Anthropic 8.20 (USD). Before each trial its projected cost must fit what remains
 * of the vendor's cap AND of --max-usd; during a trial the live cost is checked after every API
 * call (the follow-up included) and the trial aborts if it would cross either. A vendor whose
 * cap cannot take its next trial is STOPPED; the others continue. A main run refuses to START
 * if any vendor's projection exceeds what remains of its cap.
 *
 * Exit codes: 0 complete, 1 precondition failed, 2 bad arguments, 4 stopped/shortened by budget.
 */
import "./env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { conversationAdapter, type S4Vendor } from "./agents/conversation";
import type { CallUsage } from "./types";
import {
  createFetchTool,
  FETCH_REQUEST_HEADERS,
  FETCH_TOOL_DESCRIPTION,
  MAX_BODY_CHARS,
  MAX_FETCHES_PER_TRIAL,
  REAL_ALLOWED_HOSTS,
  type FetchLogEntry,
} from "./fetch-tool";
import {
  createSearchTool,
  PLATFORM_SEARCH_CALL_ID,
  languageGuess,
  parsePick,
  PASSPORT_RE,
  S4_FOLLOW_UP,
  S4_SYSTEM,
  S4_USER,
  SEARCH_QUERY_DESCRIPTION,
  SEARCH_TOOL_DESCRIPTION,
  SEARCH_TOOL_NAME,
  sentencesNaming,
  VERIFICATION_RE,
} from "./prompts-study4";
import { getJson, readFixtures, RESOLVER_BASE } from "./preflight-native";
import { printStudy4Preflight, runStudy4Preflight, S4_FICTIONAL_HOSTS } from "./preflight-study4";
import {
  ALL_PRODUCTS,
  DPP_SOURCE,
  EXPECTED_VERDICT,
  listingFor,
  loadStudy4Stimulus,
  orderFor,
  orderSeedFor,
  OURS,
  OURS_BRAND,
  OURS_ID,
  searchResultText,
  serialiseListing,
  type S4Cond,
} from "../../stimulus/study4";
import { dppOf, pickVariant, type Dpp, type ServedLookup } from "../../stimulus/ucp";
import { syntheticLookupText } from "../../stimulus/ucp-synthetic";

// ----------------------------------------------------------------- constants

const STUDY = "study4-shopping";
const SMOKE_STUDY = "study4-shopping-smoke";
type Vendor = S4Vendor;
type Cond = S4Cond | "smoke";
const ALL_CONDS: S4Cond[] = ["P", "T", "U", "N"];
/** 60% of James's balances remaining after Study 3 (USD), as he gave them on 2026-10-15. */
export const VENDOR_CAPS: Record<Vendor, number> = { openai: 11.7, gemini: 3.9, kimi: 12.5, anthropic: 8.2 };
const PREFERRED_RUNS = 10;
const MIN_RUNS = 6;
const SMOKE_MAX_USD = 0.4;
const SMOKE_GTIN = "04012345730104";
/**
 * Cost inflation over Study 3 arm U, fixed a priori (before the first smoke trials): a Study 4
 * trial makes about two more API calls than a Study 3 arm-U trial (a search turn and the
 * follow-up pick), and every call carries the ~4,500-character four-listing result instead of
 * one ~1,500-character listing, while the prompt loses the report format. Study 3 arm U
 * averaged 1.8 (GPT) to 5.3 (Gemini) calls per trial; two more calls with a longer context
 * roughly doubles input tokens. Kept at 2.0 after the switch to a platform-run search (one
 * model search turn fewer, the listings in every call from the first). The dry run also prints
 * the smoke trials' measured cost and allocates on whichever is dearer.
 */
export const INFLATION = 2.0;
const PROJECTION_SAFETY = 1.25;
const MEASURED_FILE = "results-archive/study3-2026-10-14T23-38-42-887Z.jsonl";
const MAX_TURNS = 12;
const VENDORS: Record<Vendor, { env: string; fallback: string; key: string }> = {
  openai: { env: "NATIVE_OPENAI_MODEL", fallback: "gpt-5.4-mini", key: "OPENAI_API_KEY" },
  gemini: { env: "NATIVE_GEMINI_MODEL", fallback: "gemini-3.8-flash", key: "GEMINI_API_KEY" },
  kimi: { env: "NATIVE_KIMI_MODEL", fallback: "kimi-k2.6", key: "KIMI_API_KEY" },
  anthropic: { env: "NATIVE_ANTHROPIC_MODEL", fallback: "claude-haiku-5-5", key: "ANTHROPIC_API_KEY" },
};

const HARNESS = fileURLToPath(new URL("../", import.meta.url));
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const RESULTS = `${HARNESS}results/`;
const LEDGER = `${RESULTS}study4-spend-ledger.json`;

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}
function die(code: number, msg: string): never {
  console.error(`\n${code === 2 ? "ARGUMENT ERROR" : "REFUSED"}: ${msg}\n`);
  process.exit(code);
}

// ----------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(2, `${name} needs a value`);
  return v;
}
const KNOWN = new Set(["--models", "--conditions", "--runs", "--max-usd", "--seed", "--dry-run", "--smoke"]);
for (const a of argv) if (a.startsWith("--") && !KNOWN.has(a)) die(2, `unknown flag ${a}`);
const DRY = argv.includes("--dry-run");
const SMOKE = argv.includes("--smoke");
const maxUsdRaw = flag("--max-usd");
if (maxUsdRaw === undefined) die(2, "--max-usd is required (hard spend ceiling for this invocation, USD)");
const MAX_USD = Number(maxUsdRaw);
if (!Number.isFinite(MAX_USD) || MAX_USD <= 0) die(2, `--max-usd "${maxUsdRaw}" is not a positive number`);
if (SMOKE && MAX_USD > SMOKE_MAX_USD) die(2, `--smoke is capped at USD ${SMOKE_MAX_USD.toFixed(2)} in total`);
const seedRaw = flag("--seed");
const SEED = seedRaw === undefined ? randomInt(0, 2 ** 31) : Number(seedRaw);
if (!Number.isInteger(SEED)) die(2, `--seed "${seedRaw}" is not an integer`);
const CONDS: Cond[] = SMOKE ? ["smoke"] : ((flag("--conditions") ?? "P,T,U,N").split(",").map((x) => x.trim().toUpperCase()) as Cond[]);
if (CONDS.some((c) => c !== "smoke" && !ALL_CONDS.includes(c as S4Cond)) || new Set(CONDS).size !== CONDS.length) die(2, "--conditions must be drawn from P,T,U,N");
const runsRaw = flag("--runs");
const RUNS = runsRaw === undefined ? PREFERRED_RUNS : Number(runsRaw);
if (!Number.isInteger(RUNS) || RUNS < 1) die(2, `--runs "${runsRaw}" is not a positive integer`);
if (!SMOKE && RUNS < MIN_RUNS) die(2, `runs per cell may never be below ${MIN_RUNS}`);

// ----------------------------------------------------------------- pricing + models

interface Tier {
  inputPerMTok: number;
  cachedInputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok?: number;
}
interface Price extends Tier {
  longContext?: Tier & { aboveInputTokens: number };
  vendor: string;
  source: string;
  retrieved?: string;
}
const pricing = JSON.parse(readFileSync(`${HARNESS}pricing.json`, "utf8")) as { retrieved: string; models: Record<string, Price> };
interface ModelSel {
  vendor: Vendor;
  model: string;
  price: Price;
}
const models: ModelSel[] = (flag("--models") ?? "openai,gemini,kimi,anthropic").split(",").map((s) => {
  const [v, m] = s.trim().split(":") as [Vendor, string | undefined];
  if (!(v in VENDORS)) die(2, `unknown vendor "${v}" (openai, gemini, kimi, anthropic)`);
  const model = m ?? process.env[VENDORS[v].env] ?? VENDORS[v].fallback;
  const price = pricing.models[model];
  if (!price) die(1, `no published price for "${model}" in harness/pricing.json`);
  if (price.vendor !== v) die(2, `"${model}" is priced as a ${price.vendor} model, not ${v}`);
  return { vendor: v, model, price };
});
if (new Set(models.map((m) => m.vendor)).size !== models.length) die(2, "one model per vendor");

/** Cost of one API call (Study 3's formula). `inputTokens` includes cached and cache-written tokens. */
export function callCost(p: Price, u: CallUsage): number {
  const t: Tier = p.longContext && u.inputTokens > p.longContext.aboveInputTokens ? p.longContext : p;
  const write = u.cacheWriteInputTokens ?? 0;
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens - write);
  return (uncached * t.inputPerMTok + u.cachedInputTokens * t.cachedInputPerMTok + write * (t.cacheWritePerMTok ?? t.inputPerMTok) + u.outputTokens * t.outputPerMTok) / 1e6;
}

// ----------------------------------------------------------------- Study 4 ledger

interface LedgerEntry {
  at: string;
  runId: string;
  pilot: boolean;
  condition: Cond;
  vendor: Vendor;
  model: string;
  costUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  aborted: boolean;
}
interface Ledger {
  _comment: string;
  caps: Record<Vendor, number>;
  entries: LedgerEntry[];
}
function readLedger(): Ledger {
  if (!existsSync(LEDGER))
    return {
      _comment:
        "Study 4 API spend, one entry per trial (smoke, aborted and errored included). SEPARATE from the Study 2 and Study 3 ledgers. Git-ignored. run-study4.ts refuses any trial that would take a vendor past its cap (60% of the balance remaining after Study 3, James 2026-10-15). Never edit by hand.",
      caps: VENDOR_CAPS,
      entries: [],
    };
  return JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger;
}
function appendLedger(e: LedgerEntry): void {
  const l = readLedger();
  l.entries.push(e);
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(`${LEDGER}.tmp`, JSON.stringify(l, null, 2) + "\n", "utf8");
  renameSync(`${LEDGER}.tmp`, LEDGER);
}
const vendorSpent = (l: Ledger, v: Vendor) => l.entries.filter((e) => e.vendor === v).reduce((s, e) => s + e.costUsd, 0);

// ----------------------------------------------------------------- measured per-trial costs

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function study3ArmU(model: string): number[] {
  const p = `${REPO}${MEASURED_FILE}`;
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { modelRequested: string; arm: string; costUsd: number; pilot?: boolean })
    .filter((r) => r.modelRequested === model && r.arm === "U" && !r.pilot)
    .map((r) => r.costUsd);
}
/** Per-trial projection basis: INFLATION x Study 3 arm-U mean, or the Study 4 smoke trial if dearer. */
function measured(sel: ModelSel, ledger: Ledger): { each: number; max: number; basis: string } {
  const u = study3ArmU(sel.model);
  const smoke = ledger.entries.filter((e) => e.model === sel.model && e.pilot && !e.aborted).map((e) => e.costUsd);
  const inflated = u.length ? mean(u) * INFLATION : NaN;
  const inflatedMax = u.length ? Math.max(...u) * INFLATION : NaN;
  const smokeMax = smoke.length ? Math.max(...smoke) : NaN;
  if (!u.length && !smoke.length) die(1, `no measured cost for ${sel.model} (no Study 3 arm-U rows, no Study 4 smoke trial)`);
  const each = Math.max(Number.isNaN(inflated) ? 0 : inflated, Number.isNaN(smokeMax) ? 0 : smokeMax);
  const max = Math.max(Number.isNaN(inflatedMax) ? 0 : inflatedMax, Number.isNaN(smokeMax) ? 0 : smokeMax);
  const basis =
    `Study 3 arm U mean $${mean(u).toFixed(5)} (n=${u.length}) x ${INFLATION} = $${inflated.toFixed(5)}` +
    `; Study 4 smoke ${smoke.length ? `$${smokeMax.toFixed(5)} (n=${smoke.length})` : "none"}; using the dearer`;
  return { each, max, basis };
}
function trialGate(sel: ModelSel, ledger: Ledger): { usd: number; basis: string } {
  const seen = ledger.entries.filter((e) => e.model === sel.model && !e.aborted && !e.pilot).map((e) => e.costUsd);
  if (seen.length) return { usd: Math.max(...seen) * PROJECTION_SAFETY, basis: `${PROJECTION_SAFETY} x dearest of ${seen.length} Study 4 trial(s)` };
  const m = measured(sel, ledger);
  return { usd: m.max * PROJECTION_SAFETY, basis: `${PROJECTION_SAFETY} x max(Study 3 arm-U max x ${INFLATION}, smoke)` };
}

// ----------------------------------------------------------------- schedule

interface Item {
  vendor: Vendor;
  condition: Cond;
  runIndex: number;
}
function buildSchedule(runs: number): Item[] {
  const out: Item[] = [];
  for (const m of models) for (const c of CONDS) for (let r = 0; r < (SMOKE ? 1 : runs); r++) out.push({ vendor: m.vendor, condition: c, runIndex: r });
  const rand = mulberry(SEED);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function projection(runs: number, ledger: Ledger) {
  const per: Record<string, { vendor: Vendor; total: number; line: string }> = {};
  for (const m of models) {
    const n = SMOKE ? CONDS.length : runs * CONDS.length;
    const c = measured(m, ledger);
    const each = c.each * PROJECTION_SAFETY;
    per[m.vendor] = { vendor: m.vendor, total: each * n, line: `${n} x $${each.toFixed(5)} (${PROJECTION_SAFETY} x $${c.each.toFixed(5)} [${c.basis}]) = $${(each * n).toFixed(2)}` };
  }
  return per;
}
function allocate(ledger: Ledger): { runs: number; fits: boolean } {
  let runs = PREFERRED_RUNS;
  const fits = () => Object.values(projection(runs, ledger)).every((x) => x.total <= VENDOR_CAPS[x.vendor] - vendorSpent(ledger, x.vendor));
  while (!fits() && runs > MIN_RUNS) runs--;
  return { runs, fits: fits() };
}

// ----------------------------------------------------------------- per-condition facts

interface Facts {
  /** Our listing as returned by search in this condition (exact bytes). */
  oursText: string;
  oursFile: string;
  oursSha256: string;
  dpp: Dpp | null;
  fixture: "A" | "B" | "C" | null;
  fixtureProductId: string | null;
  expectedVerdict: string | null;
  expectedReason: string | null;
}
const facts: Partial<Record<Cond, Facts>> = {};
let preflightSummary: unknown = null;
let stim: ReturnType<typeof loadStudy4Stimulus>;
try {
  stim = loadStudy4Stimulus();
} catch (e) {
  die(1, `Study 4 stimulus not ready: ${e instanceof Error ? e.message : e} (run stimulus/build-study4.ts --write)`);
}

async function prepare(): Promise<void> {
  if (SMOKE) {
    const r = await getJson(`${RESOLVER_BASE}${SMOKE_GTIN}`);
    const j = r.json as { kind?: string; id?: string; granularityLevel?: string; ancestors?: Array<{ type: string; id: string }>; links?: { verificationUrl?: string } };
    const productId = j?.ancestors?.find((a) => a.type === "product")?.id ?? null;
    const vurl = j?.links?.verificationUrl ?? null;
    if (r.status !== 200 || j?.kind !== "variant" || !j.id || !productId || !vurl) die(1, `smoke target ${SMOKE_GTIN} no longer resolves to a variant with a verification link`);
    const v = await getJson(vurl);
    const vj = v.json as { verdict?: string; reason?: string };
    const lookup = JSON.parse(
      syntheticLookupText({ productId, variantId: j.id, gtin: SMOKE_GTIN, productTitle: "", productDescription: "", verificationUrl: vurl, granularity: j.granularityLevel ?? "model" }),
    ) as ServedLookup;
    const dpp = dppOf(pickVariant(lookup, SMOKE_GTIN).variant, SMOKE_GTIN);
    const text = serialiseListing(listingFor(OURS, stim.pages[OURS_ID].html, dpp));
    facts.smoke = {
      oursText: text,
      oursFile: "(synthetic smoke listing, not stored)",
      oursSha256: sha256(text),
      dpp,
      fixture: null,
      fixtureProductId: productId,
      expectedVerdict: vj?.verdict ?? null,
      expectedReason: vj?.reason ?? null,
    };
    preflightSummary = { smoke: true, target: SMOKE_GTIN, productId, variantId: j.id, verdict: vj?.verdict, reason: vj?.reason };
    console.log(`smoke target ${SMOKE_GTIN}: product ${productId}, verdict ${vj?.verdict}/${vj?.reason}, dpp ${JSON.stringify(dpp)}`);
    return;
  }
  const pf = await runStudy4Preflight();
  printStudy4Preflight(pf);
  if (!pf.ok) die(1, "Study 4 preflight gates Q1-Q6 FAILED. No counted trial may run.");
  preflightSummary = { ok: pf.ok, ranAt: pf.ranAt, verdicts: pf.verdicts };
  const fx = readFixtures();
  for (const c of ALL_CONDS) {
    const e = stim.manifest.ours[c];
    const f = c === "N" ? null : DPP_SOURCE[c];
    facts[c] = {
      oursText: stim.ours[c],
      oursFile: `stimulus/${e.file}`,
      oursSha256: e.sha256,
      dpp: e.dpp,
      fixture: f,
      fixtureProductId: f ? fx[f].productId : null,
      expectedVerdict: c === "N" ? null : EXPECTED_VERDICT[c].verdict,
      expectedReason: c === "N" ? null : (EXPECTED_VERDICT[c].reason ?? null),
    };
  }
}

// ----------------------------------------------------------------- fetch-log analysis (as Study 3)

function samePath(a: string, b: string): boolean {
  try {
    const norm = (u: URL) => `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    return norm(new URL(a)) === norm(new URL(b));
  } catch {
    return false;
  }
}
const urlsOf = (e: FetchLogEntry) => (e.finalUrl ? [e.requestedUrl, e.finalUrl] : [e.requestedUrl]);
const answered = (e: FetchLogEntry) => e.outcome === "fetched" || (e.outcome === "stored_page" && e.status === 200);

function analyseFetches(log: FetchLogEntry[], f: Facts) {
  const ok = log.filter(answered);
  const firstSeq = (target: string | null | undefined) => (target ? (ok.find((e) => urlsOf(e).some((u) => samePath(u, target)))?.seq ?? null) : null);
  const upiSeq = firstSeq(f.dpp?.upi);
  const ppSeq = firstSeq(f.dpp?.passport_url);
  const verSeq = f.dpp ? (ok.find((e) => e.outcome === "fetched" && urlsOf(e).some((u) => samePath(u, f.dpp!.verification_url)))?.seq ?? null) : null;
  const passSeq = [upiSeq, ppSeq].filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null;
  const pagesOpened = ALL_PRODUCTS.filter((p) => firstSeq(`https://${p.host}${p.path}`) !== null).map((p) => p.id);
  const invalid: string[] = [];
  const foreign: Array<{ seq: number; url: string; verdict: string }> = [];
  for (const e of log) {
    const isLink = f.dpp ? urlsOf(e).some((u) => samePath(u, f.dpp!.verification_url)) : false;
    const subj = (e.verdictSubject as { productId?: unknown } | null)?.productId;
    const mentions = f.fixtureProductId ? urlsOf(e).some((u) => u.includes(f.fixtureProductId!)) || subj === f.fixtureProductId : false;
    if (e.verdict !== null) {
      if (isLink || mentions) {
        if (f.expectedVerdict !== null && e.verdict !== f.expectedVerdict) invalid.push(`fetch #${e.seq} verifier said ${e.verdict}, preflight said ${f.expectedVerdict}`);
        else if (f.expectedReason && f.expectedVerdict === "invalid" && e.verdictReason !== f.expectedReason) invalid.push(`fetch #${e.seq} verifier reason ${e.verdictReason}, preflight said ${f.expectedReason}`);
      } else foreign.push({ seq: e.seq, url: e.requestedUrl, verdict: e.verdict });
    } else if (isLink && (e.outcome === "network_error" || (e.status !== null && e.status >= 500))) invalid.push(`fetch #${e.seq} of the verification link failed: ${e.outcome} ${e.status ?? e.error}`);
    else if (isLink && e.status === 429) invalid.push(`fetch #${e.seq} of the verification link was rate-limited (429)`);
  }
  return {
    fetchCount: log.length,
    openedUpi: upiSeq !== null,
    openedPassportUrl: ppSeq !== null,
    openedOurPassport: passSeq !== null,
    ourPassportSeq: passSeq,
    reachedChecker: verSeq !== null,
    checkerSeq: verSeq,
    chainFollowed: passSeq !== null && verSeq !== null && passSeq < verSeq,
    pagesOpened,
    openedOurPage: pagesOpened.includes(OURS_ID),
    instrumentInvalid: invalid.length > 0,
    instrumentInvalidReasons: invalid,
    foreignVerdicts: foreign,
  };
}

// ----------------------------------------------------------------- one trial

class BudgetAbort extends Error {}
const PICK_PRODUCTS = ALL_PRODUCTS.map((p) => ({ id: p.id, variantId: p.variantId, brand: p.brand }));

async function runTrial(item: Item, idx: number, runId: string, remaining: number) {
  const sel = models.find((m) => m.vendor === item.vendor)!;
  const f = facts[item.condition]!;
  const orderSeed = orderSeedFor(SEED, idx);
  const order = orderFor(orderSeed, ALL_PRODUCTS.map((p) => p.id));
  const texts = order.map((id) => (id === OURS_ID ? f.oursText : stim.competitors[id]));
  const resultText = searchResultText(texts);
  const search = createSearchTool(resultText, order);
  const platformQuery = S4_USER;
  const prelude = [{ id: PLATFORM_SEARCH_CALL_ID, name: SEARCH_TOOL_NAME, input: { query: platformQuery }, result: search.platformSearch(platformQuery) }];
  const fetchTool = createFetchTool(Object.values(stim.pages).map((p) => ({ url: p.url, html: p.html })), S4_FICTIONAL_HOSTS);
  const adapter = conversationAdapter(item.vendor, sel.model);
  const usage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const returned = new Set<string>();
  let cost = 0;
  const started = Date.now();
  let out: Awaited<ReturnType<typeof adapter.run>> | null = null;
  let error: string | null = null;
  let budgetAborted = false;
  try {
    out = await adapter.run({
      system: S4_SYSTEM,
      user: S4_USER,
      followUp: S4_FOLLOW_UP,
      tools: [search.spec, fetchTool.spec],
      maxTurns: MAX_TURNS,
      prelude,
      toolsExhausted: fetchTool.exhausted,
      onUsage: (u) => {
        usage.calls++;
        usage.inputTokens += u.inputTokens;
        usage.cachedInputTokens += u.cachedInputTokens;
        usage.cacheWriteInputTokens += u.cacheWriteInputTokens ?? 0;
        usage.outputTokens += u.outputTokens;
        usage.reasoningTokens += u.reasoningTokens;
        if (u.modelReturned) returned.add(u.modelReturned);
        cost += callCost(sel.price, u);
        if (cost > remaining) throw new BudgetAbort(`trial cost ${cost.toFixed(4)} crossed the remaining budget ${remaining.toFixed(4)}`);
      },
    });
  } catch (e) {
    budgetAborted = e instanceof BudgetAbort;
    error = e instanceof Error ? e.message : String(e);
  }
  const text = out?.text ?? "";
  const followUpText = out?.followUpText ?? "";
  const pick = error ? { pickId: null, matchedBy: null, candidates: [] as string[] } : parsePick(followUpText, PICK_PRODUCTS);
  const fa = analyseFetches(fetchTool.log, f);
  const row = {
    study: SMOKE ? SMOKE_STUDY : STUDY,
    pilot: SMOKE,
    runId,
    seed: SEED,
    scheduleIndex: idx,
    timestamp: new Date(started).toISOString(),
    vendor: item.vendor,
    modelRequested: sel.model,
    modelIdsReturned: [...returned],
    price: {
      inputPerMTok: sel.price.inputPerMTok,
      cachedInputPerMTok: sel.price.cachedInputPerMTok,
      cacheWritePerMTok: sel.price.cacheWritePerMTok ?? null,
      outputPerMTok: sel.price.outputPerMTok,
      longContext: sel.price.longContext ?? null,
      source: sel.price.source,
      retrieved: sel.price.retrieved ?? pricing.retrieved,
    },
    condition: item.condition,
    runIndex: item.runIndex,
    systemSha256: sha256(S4_SYSTEM),
    userSha256: sha256(S4_USER),
    followUpSha256: sha256(S4_FOLLOW_UP),
    ours: { id: OURS_ID, file: f.oursFile, sha256: f.oursSha256, dpp: f.dpp, fixture: f.fixture, fixtureProductId: f.fixtureProductId },
    orderSeed,
    order,
    oursPosition: order.indexOf(OURS_ID) + 1,
    searchResultSha256: sha256(resultText),
    expectedVerdict: f.expectedVerdict,
    expectedReason: f.expectedReason,
    advertisedVerificationLink: f.dpp?.verification_url ?? null,
    preflightPassed: SMOKE ? null : true,
    usage,
    mainCalls: out?.mainCalls ?? null,
    mainLoopLimit: out?.mainLoopLimit ?? null,
    costUsd: Number(cost.toFixed(6)),
    platformSearch: { callId: PLATFORM_SEARCH_CALL_ID, query: platformQuery, resultSha256: sha256(resultText) },
    modelSearched: search.log.some((e) => e.initiator === "model"),
    modelSearchCount: search.log.filter((e) => e.initiator === "model").length,
    searches: search.log,
    ...fa,
    fetches: fetchTool.log,
    toolCalls: out?.toolCalls ?? [],
    responseText: text,
    followUpText,
    pickId: pick.pickId,
    pickMatchedBy: pick.matchedBy,
    pickCandidates: pick.candidates,
    recommendedOurs: pick.pickId === null ? null : pick.pickId === OURS_ID,
    pickPosition: pick.pickId === null ? null : order.indexOf(pick.pickId) + 1,
    oursMentioned: new RegExp(`\\b${OURS_BRAND}\\b`, "i").test(text),
    mentionedPassport: PASSPORT_RE.test(text),
    mentionedVerification: VERIFICATION_RE.test(text),
    oursSentences: sentencesNaming(text, OURS_BRAND),
    responseLanguage: languageGuess(text),
    error,
    budgetAborted,
    durationMs: Date.now() - started,
  };
  return { row, cost, usage, budgetAborted };
}

// ----------------------------------------------------------------- main

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const ledger0 = readLedger();
const alloc = allocate(ledger0);
const schedule = buildSchedule(RUNS);
console.log(`\nStudy 4 (a plain shopping question) run ${runId}${SMOKE ? " [SMOKE — pilot, excluded from analysis]" : ""}${DRY ? " [DRY RUN]" : ""}`);
console.log(`conditions=${CONDS.join(",")}  runs per cell=${SMOKE ? 1 : RUNS}  seed=${SEED}  trials=${schedule.length}`);
console.log(`models=${models.map((m) => `${m.vendor}:${m.model}`).join(", ")}   ceiling this invocation=$${MAX_USD.toFixed(2)}`);
console.log(`system: ${JSON.stringify(S4_SYSTEM)}\nuser:   ${JSON.stringify(S4_USER)}\nfollow-up: ${JSON.stringify(S4_FOLLOW_UP)}`);
console.log(`tools: ${SEARCH_TOOL_NAME} ${JSON.stringify(SEARCH_TOOL_DESCRIPTION)} (query: ${JSON.stringify(SEARCH_QUERY_DESCRIPTION)}); fetch_url ${JSON.stringify(FETCH_TOOL_DESCRIPTION)}`);
console.log("vendor caps (60% of the balance remaining after Study 3) and the Study 4 ledger:");
for (const m of models) {
  const s = vendorSpent(ledger0, m.vendor);
  console.log(`  ${m.vendor.padEnd(9)} cap $${VENDOR_CAPS[m.vendor].toFixed(2)}  spent $${s.toFixed(4)}  remaining $${(VENDOR_CAPS[m.vendor] - s).toFixed(4)}`);
}
const proj = projection(RUNS, ledger0);
console.log(`\nprojection for THIS schedule (inflation ${INFLATION} on Study 3 arm U, or the smoke trial if dearer; x ${PROJECTION_SAFETY}):`);
let overCap = false;
for (const p of Object.values(proj)) {
  const rem = VENDOR_CAPS[p.vendor] - vendorSpent(ledger0, p.vendor);
  const over = p.total > rem;
  overCap ||= over;
  console.log(`  ${p.vendor}: $${p.total.toFixed(2)} ${over ? "EXCEEDS" : "<="} remaining cap $${rem.toFixed(2)}\n      ${p.line}`);
}
console.log(`  all vendors: $${Object.values(proj).reduce((a, p) => a + p.total, 0).toFixed(2)}`);
if (!SMOKE) {
  console.log(
    `\nPROPOSED ALLOCATION (start ${PREFERRED_RUNS} runs per model x condition; reduce all cells by 1 until every vendor fits; never below ${MIN_RUNS}): ` +
      `runs=${alloc.runs} -> ${models.length * CONDS.length * alloc.runs} trials, ${alloc.fits ? "fits every vendor cap" : "DOES NOT FIT even at the floor"}`,
  );
  const pa = projection(alloc.runs, ledger0);
  for (const p of Object.values(pa)) console.log(`  at runs=${alloc.runs}: ${p.vendor} $${p.total.toFixed(2)} of cap $${(VENDOR_CAPS[p.vendor] - vendorSpent(ledger0, p.vendor)).toFixed(2)}`);
  if (runsRaw === undefined && alloc.runs !== RUNS) console.log("  (the default does not fit: pass --runs and register the choice)");
}

if (DRY) {
  console.log(`\nstimulus: ${Object.keys(stim.ours).length} listings of ours, ${Object.keys(stim.competitors).length} competitor listings, ${Object.keys(stim.pages).length} pages match stimulus/study4/manifest.json`);
  console.log("\nschedule (first 12, with the listing order):");
  schedule.slice(0, 12).forEach((s, i) => {
    const o = orderFor(orderSeedFor(SEED, i), ALL_PRODUCTS.map((p) => p.id));
    console.log(`  ${i} ${s.vendor} ${s.condition} run${s.runIndex}  order=${o.join(",")}  ours@${o.indexOf(OURS_ID) + 1}`);
  });
  process.exit(0);
}

if (!SMOKE && overCap) die(4, "the projected spend of at least one vendor exceeds what remains of its Study 4 cap. Reduce --runs (never below 6) and register the choice first.");
for (const m of models) if (!process.env[VENDORS[m.vendor].key]) die(1, `${VENDORS[m.vendor].key} is not set (repo-root .env)`);

await prepare();

mkdirSync(RESULTS, { recursive: true });
const base = `${RESULTS}${SMOKE ? "smoke-study4" : "study4"}-${runId}`;
const outFile = `${base}.jsonl`;
writeFileSync(
  `${base}.meta.json`,
  JSON.stringify(
    {
      runId,
      study: SMOKE ? SMOKE_STUDY : STUDY,
      pilot: SMOKE,
      seed: SEED,
      argv,
      startedAt: new Date().toISOString(),
      models,
      conditions: CONDS,
      runsPerCell: SMOKE ? 1 : RUNS,
      platformSearch: { callId: PLATFORM_SEARCH_CALL_ID, query: S4_USER, initiator: "platform", placement: "after the user turn, before the model's first turn, in each vendor's native tool-call format" },
      prompts: { system: S4_SYSTEM, user: S4_USER, followUp: S4_FOLLOW_UP, systemSha256: sha256(S4_SYSTEM), userSha256: sha256(S4_USER), followUpSha256: sha256(S4_FOLLOW_UP) },
      tools: {
        search: { name: SEARCH_TOOL_NAME, description: SEARCH_TOOL_DESCRIPTION, queryDescription: SEARCH_QUERY_DESCRIPTION },
        fetch: { description: FETCH_TOOL_DESCRIPTION, realAllowedHosts: REAL_ALLOWED_HOSTS, fictionalHosts: S4_FICTIONAL_HOSTS, maxFetches: MAX_FETCHES_PER_TRIAL, maxBodyChars: MAX_BODY_CHARS, requestHeaders: FETCH_REQUEST_HEADERS },
      },
      maxTurns: MAX_TURNS,
      vendorCaps: VENDOR_CAPS,
      inflation: INFLATION,
      ledgerBefore: Object.fromEntries(models.map((m) => [m.vendor, vendorSpent(ledger0, m.vendor)])),
      maxUsd: MAX_USD,
      stimulus: { manifestBuiltAt: stim.manifest.builtAt, ours: stim.manifest.ours, competitors: stim.manifest.competitors, pages: stim.manifest.products.map((p) => ({ id: p.id, url: p.pageUrl, sha256: p.page.sha256 })) },
      preflight: preflightSummary,
      facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, { ...v, oursText: undefined }])),
      schedule,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

let runSpent = 0;
let stopped: string | null = null;
const exhausted = new Map<Vendor, string>();
const skipped: Array<{ index: number; item: Item; reason: string }> = [];
for (let i = 0; i < schedule.length; i++) {
  const item = schedule[i];
  const sel = models.find((m) => m.vendor === item.vendor)!;
  if (exhausted.has(item.vendor)) {
    skipped.push({ index: i, item, reason: exhausted.get(item.vendor)! });
    continue;
  }
  const ledger = readLedger();
  const vendorRemaining = VENDOR_CAPS[item.vendor] - vendorSpent(ledger, item.vendor);
  const runRemaining = MAX_USD - runSpent;
  const gate = trialGate(sel, ledger);
  if (gate.usd > vendorRemaining) {
    const why = `${item.vendor} cap: projected $${gate.usd.toFixed(4)} [${gate.basis}] exceeds the vendor's remaining $${vendorRemaining.toFixed(4)}`;
    exhausted.set(item.vendor, why);
    skipped.push({ index: i, item, reason: why });
    console.log(`[${i + 1}/${schedule.length}] VENDOR STOPPED — ${why}`);
    continue;
  }
  if (gate.usd > runRemaining) {
    stopped = `before trial ${i} (${sel.model}): projected $${gate.usd.toFixed(4)} exceeds this invocation's remaining $${runRemaining.toFixed(4)}`;
    break;
  }
  const { row, cost, usage, budgetAborted } = await runTrial(item, i, runId, Math.min(vendorRemaining, runRemaining));
  runSpent += cost;
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  appendLedger({
    at: row.timestamp,
    runId,
    pilot: SMOKE,
    condition: item.condition,
    vendor: item.vendor,
    model: sel.model,
    costUsd: cost,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    aborted: budgetAborted || row.error !== null,
  });
  const status = row.error ? `ERROR ${row.error.slice(0, 100)}` : `pick=${row.pickId ?? `NONE(${JSON.stringify(row.followUpText.slice(0, 40))})`}${row.pickMatchedBy === "brand" ? "(by brand)" : ""}`;
  console.log(
    `[${i + 1}/${schedule.length}] ${sel.model} ${item.condition} run${item.runIndex} ours@${row.oursPosition}: ${status}` +
      `  modelSearches=${row.modelSearchCount} fetches=${row.fetchCount} passport=${row.openedOurPassport} checker=${row.reachedChecker} pages=${row.pagesOpened.length}${row.instrumentInvalid ? " INSTRUMENT_INVALID" : ""}` +
      `  lang=${row.responseLanguage} ids=${row.modelIdsReturned.join(",")} tok=${usage.inputTokens}/${usage.outputTokens} $${cost.toFixed(5)} (run $${runSpent.toFixed(4)})`,
  );
  if (budgetAborted) {
    if (cost > runRemaining - 1e-9) {
      stopped = `during trial ${i}: ${row.error}`;
      break;
    }
    exhausted.set(item.vendor, `during trial ${i}: ${row.error}`);
  }
}
if (skipped.length) {
  writeFileSync(`${base}.skipped.json`, JSON.stringify(skipped, null, 2) + "\n", "utf8");
  console.log(`\n${skipped.length} trial(s) skipped by a vendor cap; listed in ${base}.skipped.json`);
}
const l1 = readLedger();
console.log(`\nWrote ${existsSync(outFile) ? outFile : "(no rows)"}\nrun spend $${runSpent.toFixed(4)}; Study 4 ledger by vendor: ${models.map((m) => `${m.vendor} $${vendorSpent(l1, m.vendor).toFixed(4)}`).join(", ")}`);
if (stopped || skipped.length) {
  console.error(`STOPPED/SHORTENED BY BUDGET: ${stopped ?? `${skipped.length} trial(s) skipped`}`);
  process.exit(4);
}
