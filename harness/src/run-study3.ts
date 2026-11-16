/**
 * Study 3 ("UCP") trial runner. Study 2's run-native.ts is NOT edited and stays the runner
 * of Study 2 and its follow-up; this file reuses its tool, prompts, adapters and preflight.
 *
 * Arms, interleaved in ONE shuffled schedule (logged seed), template S1, conditions A-E:
 *   U  the product as the merchant's UCP catalog listing (stimulus/ucp/listings/U-<cond>.json,
 *      built by stimulus/build-ucp.ts from the live endpoint's stored responses), open-ended
 *      prompt (prompts-ucp.ts), every model.
 *   H  arm O of the follow-up, unchanged: the S1 page and the open-ended prompt
 *      (prompts-open.ts), every model. Same-day control for U.
 *   R  the A28 evidence prompt (prompts-native.ts) on the S1 pages, Claude ONLY, so Claude has
 *      a "when asked" number like the other three models.
 * Every arm: system "You are a helpful assistant.", ONE tool fetch_url with the A28
 * description, the A29 allow-list unchanged (every dpp link is already inside it, preflight U5),
 * 8 fetches and 12 turns per trial, the fictional page hosts serving the trial's condition and,
 * in E, E's stored passport document.
 *
 * Usage (from harness/; bun's absolute path on this machine):
 *   bun run src/run-study3.ts --max-usd <n> [--arms U,H,R] [--runs-u 10] [--runs-h 10] [--runs-r 8]
 *        [--models openai,gemini,kimi,anthropic] [--conditions A,B,C,D,E] [--seed N] [--dry-run]
 *   bun run src/run-study3.ts --smoke --max-usd 0.30 [--models ...]
 *
 * --dry-run  prints the schedule size, the projected cost PER VENDOR from MEASURED per-trial
 *            costs (Study 2 and follow-up archives; Claude from its Study 3 smoke trial in the
 *            Study 3 ledger) and the allocation that fits every vendor cap (runs reduced
 *            uniformly across arms, never below 6). No API call, no network.
 * --smoke    ONE trial per selected model, arm U, on a THROWAWAY: a synthetic listing
 *            (stimulus/ucp-synthetic.ts) for the retired, non-fixture product GTIN
 *            04012345730104, whose dpp links are that product's real resolver and verifier
 *            links. pilot=true on every row, written to results/smoke-study3-*.jsonl, excluded
 *            from every analysis. Hard ceiling USD 0.30.
 *
 * Budget (James, 2026-10-15): a SEPARATE Study 3 ledger (results/study3-spend-ledger.json).
 * Per-vendor caps = 60% of the account balance: OpenAI 0.6 x 20 = 12.00, Gemini 0.6 x 11 = 6.60,
 * Kimi 0.6 x 23 = 13.80, Anthropic 0.6 x 14 = 8.40 (USD). Study 2's ledger and USD 10 ceiling
 * are untouched. Before each trial its projected cost (1.25 x the dearest trial yet measured for
 * that model) must fit in what remains of the vendor's cap AND of --max-usd; during a trial the
 * live cost is checked after every API call and the trial is aborted if it would cross either.
 * A vendor whose cap cannot take its next trial is STOPPED (its remaining trials are skipped and
 * listed); other vendors continue. A main run refuses to START if any vendor's projection
 * exceeds what remains of its cap.
 *
 * Exit codes: 0 complete, 1 precondition failed, 2 bad arguments, 4 stopped or shortened by a
 * budget ceiling.
 */
import "./env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chatgptAdapter } from "./agents/openai";
import { geminiAdapter } from "./agents/gemini";
import { kimiAdapter } from "./agents/kimi";
import { claudeNativeAdapter } from "./agents/anthropic-native";
import type { AgentAdapter, CallUsage } from "./types";
import {
  createFetchTool,
  FETCH_REQUEST_HEADERS,
  FETCH_TOOL_DESCRIPTION,
  MAX_BODY_CHARS,
  MAX_FETCHES_PER_TRIAL,
  REAL_ALLOWED_HOSTS,
  type FetchLogEntry,
} from "./fetch-tool";
import { buildNativePrompt, NATIVE_REPORT_FORMAT, NATIVE_SYSTEM, NATIVE_TASK, parseNativeReport } from "./prompts-native";
import { buildOpenPrompt, OPEN_REPORT_FORMAT, OPEN_TASK, parseOpenReport } from "./prompts-open";
import { buildUcpPrompt, UCP_REPORT_FORMAT, UCP_TASK } from "./prompts-ucp";
import {
  getJson,
  printFollowupPreflight,
  printPreflight,
  readFixtures,
  RESOLVER_BASE,
  runFollowupPreflight,
  runNativePreflight,
  type FixtureCondition,
} from "./preflight-native";
import { loadStoredListings, printStudy3Preflight, runStudy3Preflight } from "./preflight-study3";
import { E_DOC_CONTENT_TYPE, E_HOST, E_SERVED_URLS, E_UPI, GTIN_E } from "../../stimulus/condition-e";
import { listingFromLookup, serialiseListing, type Dpp, type ServedLookup } from "../../stimulus/ucp";
import { syntheticLookupText } from "../../stimulus/ucp-synthetic";
import { UG_API_BASE } from "./config";

// ----------------------------------------------------------------- constants

const STUDY = "study3-ucp";
const SMOKE_STUDY = "study3-ucp-smoke";
type Vendor = "openai" | "gemini" | "kimi" | "anthropic";
type Cond = "A" | "B" | "C" | "D" | "E" | "smoke";
type Arm = "U" | "H" | "R";
const ALL_ARMS: Arm[] = ["U", "H", "R"];
/** Account balances James gave on 2026-10-15 (USD) and the 60% Study 3 cap of each. */
export const VENDOR_BALANCES: Record<Vendor, number> = { openai: 20, gemini: 11, kimi: 23, anthropic: 14 };
export const CAP_FRACTION = 0.6;
export const VENDOR_CAPS: Record<Vendor, number> = Object.fromEntries(
  Object.entries(VENDOR_BALANCES).map(([v, b]) => [v, Math.round(b * CAP_FRACTION * 100) / 100]),
) as Record<Vendor, number>;
const PREFERRED = { U: 10, H: 10, R: 8 } as const;
const MIN_RUNS = 6;
const SMOKE_MAX_USD = 0.3;
/** Retired generic fixture A (A30): live on testnet, not a fixture, used by no counted trial. */
const SMOKE_GTIN = "04012345730104";
/** Evidence-prompt (arm R) ground truth, as A28/A32. */
const GROUND_TRUTH: Record<"A" | "B" | "C" | "D" | "E", string> = {
  A: "verified",
  B: "unverified",
  C: "invalid",
  D: "mismatch",
  E: "unverified",
};
const FIXTURE_OF: Record<"A" | "B" | "C" | "D", FixtureCondition> = { A: "A", B: "B", C: "C", D: "A" };
const VENDORS: Record<Vendor, { make: (m: string) => AgentAdapter; env: string; fallback: string; key: string }> = {
  openai: { make: chatgptAdapter, env: "NATIVE_OPENAI_MODEL", fallback: "gpt-5.4-mini", key: "OPENAI_API_KEY" },
  gemini: { make: geminiAdapter, env: "NATIVE_GEMINI_MODEL", fallback: "gemini-3.8-flash", key: "GEMINI_API_KEY" },
  kimi: { make: kimiAdapter, env: "NATIVE_KIMI_MODEL", fallback: "kimi-k2.6", key: "KIMI_API_KEY" },
  anthropic: { make: claudeNativeAdapter, env: "NATIVE_ANTHROPIC_MODEL", fallback: "claude-haiku-5-5", key: "ANTHROPIC_API_KEY" },
};
const MAX_TURNS = 12;
const PRIOR_INPUT_TOKENS = 150_000;
const PRIOR_OUTPUT_TOKENS = 15_000;
const PROJECTION_SAFETY = 1.25;
/** Claude has no archive: its projection is this multiple of its dearest smoke trial (one sample). */
const CLAUDE_SMOKE_MULTIPLIER = 2;
const MEASURED_FILES = {
  study2: "results-archive/native-2026-10-14T00-39-03-229Z.jsonl",
  followup: "results-archive/followup-2026-10-14T06-43-19-769Z.jsonl",
} as const;

const HARNESS = fileURLToPath(new URL("../", import.meta.url));
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const RESULTS = `${HARNESS}results/`;
const LEDGER = `${RESULTS}study3-spend-ledger.json`;
const TEMPLATES_ALL = ["S1", "S2"] as const;
const FICTIONAL_HOSTS = ["shop.tarnvale.example", "www.quillbury.example", E_HOST];

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
const KNOWN = new Set(["--models", "--arms", "--conditions", "--runs-u", "--runs-h", "--runs-r", "--max-usd", "--seed", "--dry-run", "--smoke"]);
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
const ARMS: Arm[] = SMOKE ? ["U"] : ((flag("--arms") ?? "U,H,R").split(",").map((x) => x.trim().toUpperCase()) as Arm[]);
if (ARMS.some((a) => !ALL_ARMS.includes(a)) || new Set(ARMS).size !== ARMS.length) die(2, "--arms must be drawn from U,H,R");
const CONDS: Cond[] = SMOKE ? ["smoke"] : ((flag("--conditions") ?? "A,B,C,D,E").split(",").map((x) => x.trim().toUpperCase()) as Cond[]);
if (CONDS.some((c) => !["A", "B", "C", "D", "E"].includes(c) && c !== "smoke") || new Set(CONDS).size !== CONDS.length)
  die(2, "--conditions must be drawn from A,B,C,D,E");
function runsFlag(name: string, fallback: number): number {
  const raw = flag(name);
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < 1) die(2, `${name} "${raw}" is not a positive integer`);
  return n;
}
const RUNS: Record<Arm, number> = {
  U: runsFlag("--runs-u", PREFERRED.U),
  H: runsFlag("--runs-h", PREFERRED.H),
  R: runsFlag("--runs-r", PREFERRED.R),
};

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
  if (!price) die(1, `no published price for "${model}" in harness/pricing.json — refusing to run a model whose cost cannot be computed`);
  if (price.vendor !== v) die(2, `"${model}" is priced as a ${price.vendor} model, not ${v}`);
  return { vendor: v, model, price };
});
if (new Set(models.map((m) => m.vendor)).size !== models.length) die(2, "one model per vendor");

/** Cost of one API call. `inputTokens` includes cached and cache-written tokens. */
export function callCost(p: Price, u: CallUsage): number {
  const t: Tier = p.longContext && u.inputTokens > p.longContext.aboveInputTokens ? p.longContext : p;
  const write = u.cacheWriteInputTokens ?? 0;
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens - write);
  return (
    (uncached * t.inputPerMTok +
      u.cachedInputTokens * t.cachedInputPerMTok +
      write * (t.cacheWritePerMTok ?? t.inputPerMTok) +
      u.outputTokens * t.outputPerMTok) /
    1e6
  );
}

// ----------------------------------------------------------------- Study 3 ledger

interface LedgerEntry {
  at: string;
  runId: string;
  pilot: boolean;
  arm: Arm;
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
  if (!existsSync(LEDGER)) {
    return {
      _comment:
        "Study 3 API spend, one entry per trial (smoke, aborted and errored included). SEPARATE from spend-ledger.json (Study 2 + follow-up, USD 10 ceiling). Git-ignored. run-study3.ts refuses any trial that would take a vendor past its cap (60% of the account balance James gave on 2026-10-15). Never edit by hand.",
      caps: VENDOR_CAPS,
      entries: [],
    };
  }
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

interface ArchRow {
  modelRequested: string;
  arm?: string;
  costUsd: number;
  pilot?: boolean;
}
function readArchive(rel: string): ArchRow[] {
  const p = `${REPO}${rel}`;
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as ArchRow);
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/**
 * Measured mean and max cost per trial for (model, arm), and where it came from.
 *   H: follow-up arm O (the same prompt and page);
 *   R: follow-up arm R (+ Study 2, the same prompt);
 *   U: the LARGER of follow-up arm O and arm R means (U is new: priced like the dearer arm);
 *   Claude (no archive): CLAUDE_SMOKE_MULTIPLIER x its dearest smoke trial in the Study 3
 *   ledger, for every arm; without a smoke trial, the 150k-in / 15k-out prior.
 */
function measured(sel: ModelSel, arm: Arm, ledger: Ledger): { mean: number; max: number; basis: string } {
  const fu = readArchive(MEASURED_FILES.followup).filter((r) => r.modelRequested === sel.model);
  const s2 = readArchive(MEASURED_FILES.study2).filter((r) => r.modelRequested === sel.model && !r.pilot);
  const O = fu.filter((r) => r.arm === "O").map((r) => r.costUsd);
  const R = [...fu.filter((r) => r.arm === "R"), ...s2].map((r) => r.costUsd);
  if (O.length && R.length) {
    if (arm === "H") return { mean: mean(O), max: Math.max(...O), basis: `follow-up arm O, n=${O.length}` };
    if (arm === "R") return { mean: mean(R), max: Math.max(...R), basis: `follow-up arm R + Study 2, n=${R.length}` };
    const useO = mean(O) >= mean(R);
    const xs = useO ? O : R;
    return { mean: mean(xs), max: Math.max(...O, ...R), basis: `max(arm O, arm R) mean = ${useO ? "arm O" : "arm R"}, n=${xs.length}` };
  }
  const smoke = ledger.entries.filter((e) => e.model === sel.model && !e.aborted).map((e) => e.costUsd);
  if (smoke.length) {
    const m = Math.max(...smoke) * CLAUDE_SMOKE_MULTIPLIER;
    return { mean: m, max: m, basis: `${CLAUDE_SMOKE_MULTIPLIER} x dearest of ${smoke.length} Study 3 smoke/measured trial(s) ($${Math.max(...smoke).toFixed(5)})` };
  }
  const prior = callCost(sel.price, { inputTokens: PRIOR_INPUT_TOKENS, cachedInputTokens: 0, outputTokens: PRIOR_OUTPUT_TOKENS, reasoningTokens: 0, modelReturned: null });
  return { mean: prior, max: prior, basis: `prior (${PRIOR_INPUT_TOKENS} in / ${PRIOR_OUTPUT_TOKENS} out; no measurement)` };
}

/** Per-trial gate during the run: 1.25 x the dearest Study 3 trial of this model, else the measured max. */
function trialGate(sel: ModelSel, arm: Arm, ledger: Ledger): { usd: number; basis: string } {
  const seen = ledger.entries.filter((e) => e.model === sel.model && !e.aborted && !e.pilot).map((e) => e.costUsd);
  if (seen.length) return { usd: Math.max(...seen) * PROJECTION_SAFETY, basis: `${PROJECTION_SAFETY} x dearest of ${seen.length} Study 3 trial(s)` };
  const m = measured(sel, arm, ledger);
  return { usd: m.max * PROJECTION_SAFETY, basis: `${PROJECTION_SAFETY} x measured max [${m.basis}]` };
}

// ----------------------------------------------------------------- schedule

interface Item {
  arm: Arm;
  vendor: Vendor;
  condition: Cond;
  runIndex: number;
}
function buildSchedule(runs: Record<Arm, number>): Item[] {
  const out: Item[] = [];
  for (const arm of ARMS) for (const m of models) {
    if (arm === "R" && m.vendor !== "anthropic") continue; // arm R is Claude only
    for (const c of CONDS) for (let r = 0; r < (SMOKE ? 1 : runs[arm]); r++) out.push({ arm, vendor: m.vendor, condition: c, runIndex: r });
  }
  const rand = mulberry32(SEED);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------- projection + allocation

function projection(runs: Record<Arm, number>, ledger: Ledger) {
  const per: Record<string, { vendor: Vendor; total: number; lines: string[] }> = {};
  for (const m of models) {
    per[m.vendor] = { vendor: m.vendor, total: 0, lines: [] };
    for (const arm of ARMS) {
      if (arm === "R" && m.vendor !== "anthropic") continue;
      const n = SMOKE ? CONDS.length : runs[arm] * CONDS.length;
      const c = measured(m, arm, ledger);
      const each = c.mean * PROJECTION_SAFETY;
      per[m.vendor].total += each * n;
      per[m.vendor].lines.push(`arm ${arm}: ${n} x $${each.toFixed(5)} (${PROJECTION_SAFETY} x mean $${c.mean.toFixed(5)}; ${c.basis}) = $${(each * n).toFixed(2)}`);
    }
  }
  return per;
}
function allocate(ledger: Ledger): { runs: Record<Arm, number>; fits: boolean } {
  const runs = { ...PREFERRED } as Record<Arm, number>;
  const fits = () => {
    const p = projection(runs, ledger);
    return Object.values(p).every((x) => x.total <= VENDOR_CAPS[x.vendor] - vendorSpent(ledger, x.vendor));
  };
  while (!fits() && (runs.U > MIN_RUNS || runs.H > MIN_RUNS || runs.R > MIN_RUNS)) {
    runs.U = Math.max(MIN_RUNS, runs.U - 1);
    runs.H = Math.max(MIN_RUNS, runs.H - 1);
    runs.R = Math.max(MIN_RUNS, runs.R - 1);
  }
  return { runs, fits: fits() };
}

// ----------------------------------------------------------------- stimulus

interface ManifestPage {
  file: string;
  set: string;
  template: string;
  condition: string;
  gtin: string;
  upi: string;
  pageUrl: string;
  sha256: string;
}
const manifest = JSON.parse(readFileSync(`${REPO}stimulus/manifest.json`, "utf8")) as {
  pages: ManifestPage[];
  documents?: Array<{ file: string; condition: string; gtin: string; url: string; servedAt: string[]; sha256: string }>;
};
function loadPage(template: string, condition: Cond): ManifestPage & { html: string } {
  const set = condition === "smoke" ? "pilot" : condition === "E" ? "followup" : "main";
  const want = condition === "smoke" ? "pilot" : condition;
  const p = manifest.pages.find((x) => x.set === set && x.template === template && x.condition === want);
  if (!p) die(1, `no ${set} page for ${template}-${want} in stimulus/manifest.json`);
  const html = readFileSync(`${REPO}stimulus/${p.file}`, "utf8");
  if (sha256(html) !== p.sha256) die(1, `${p.file} does not match its manifest sha256`);
  return { ...p, html };
}
function loadEDocument(): { url: string; servedAt: string[]; sha256: string; file: string; body: string } {
  const d = manifest.documents?.find((x) => x.condition === "E");
  if (!d || d.gtin !== GTIN_E || d.url !== E_UPI) die(1, "no valid condition-E document in stimulus/manifest.json");
  const body = readFileSync(`${REPO}stimulus/${d.file}`, "utf8");
  if (sha256(body) !== d.sha256) die(1, `${d.file} does not match its manifest sha256`);
  return { ...d, body };
}

// ----------------------------------------------------------------- per-condition facts

interface Facts {
  gtin: string;
  productId: string | null;
  expectedVerdict: string | null;
  expectedReason: string | null;
  /** The checker: the page's resolver-advertised link (H/R) — equal to dpp.verification_url (U, gate U2). */
  verificationLink: string | null;
  /** Arm U: the listing as shown, its file and hash, its dpp block (null in E) and E's variant url. */
  listing: { text: string; file: string; sha256: string; dpp: Dpp | null; variantUrl: string | null } | null;
}
const facts: Partial<Record<Cond, Facts>> = {};
let preflightSummary: unknown = null;

async function prepare(): Promise<void> {
  if (SMOKE) {
    const r = await getJson(`${RESOLVER_BASE}${SMOKE_GTIN}`);
    const j = r.json as {
      kind?: string;
      id?: string;
      granularityLevel?: string;
      ancestors?: Array<{ type: string; id: string }>;
      links?: { verificationUrl?: string };
      identities?: { product?: { name?: string; description?: string } };
    };
    const productId = j?.ancestors?.find((a) => a.type === "product")?.id ?? null;
    const vurl = j?.links?.verificationUrl ?? null;
    if (r.status !== 200 || j?.kind !== "variant" || !j.id || !productId || !vurl) die(1, `smoke target ${SMOKE_GTIN} no longer resolves to a variant with a verification link`);
    const v = await getJson(vurl);
    const vj = v.json as { verdict?: string; reason?: string };
    const lookup = JSON.parse(
      syntheticLookupText({
        productId,
        variantId: j.id,
        gtin: SMOKE_GTIN,
        productTitle: j.identities?.product?.name ?? "",
        productDescription: j.identities?.product?.description ?? "",
        verificationUrl: vurl,
        granularity: j.granularityLevel ?? "model",
      }),
    ) as ServedLookup;
    const pilotPage = loadPage("S1", "smoke");
    const listing = listingFromLookup(lookup, SMOKE_GTIN, pilotPage.html);
    const text = serialiseListing(listing);
    const dpp = (listing.variants as Array<{ dpp: Dpp }>)[0].dpp;
    facts.smoke = {
      gtin: SMOKE_GTIN,
      productId,
      expectedVerdict: vj?.verdict ?? null,
      expectedReason: vj?.reason ?? null,
      verificationLink: vurl,
      listing: { text, file: "(synthetic smoke listing, not stored)", sha256: sha256(text), dpp, variantUrl: null },
    };
    preflightSummary = { smoke: true, target: SMOKE_GTIN, productId, variantId: j.id, verdict: vj?.verdict, reason: vj?.reason };
    console.log(`smoke target ${SMOKE_GTIN}: product ${productId}, verdict ${vj?.verdict}/${vj?.reason}, dpp ${JSON.stringify(dpp)}`);
    return;
  }
  const pf = await runNativePreflight();
  printPreflight(pf);
  if (!pf.ok) die(1, "preflight-native gates 0-4 FAILED. No counted trial may run.");
  const ff = await runFollowupPreflight();
  printFollowupPreflight(ff);
  if (!ff.ok) die(1, "follow-up gates F1-F4 FAILED. No counted trial may run.");
  let s3: Awaited<ReturnType<typeof runStudy3Preflight>> | null = null;
  if (ARMS.includes("U")) {
    s3 = await runStudy3Preflight(pf);
    printStudy3Preflight(s3);
    if (!s3.ok) die(1, "Study 3 UCP gates U1-U5 FAILED (is PR #372 deployed and stimulus/ucp captured?). No counted trial may run.");
  }
  preflightSummary = {
    ranAt: pf.ranAt,
    verdicts: pf.verdicts,
    verificationLinks: pf.verificationLinks,
    followup: { ok: ff.ok, ranAt: ff.ranAt },
    ucp: s3 ? { ok: s3.ok, ranAt: s3.ranAt, extension: s3.extension, liveDpp: s3.liveDpp } : null,
  };
  const stored = ARMS.includes("U") ? loadStoredListings() : null;
  const fx = readFixtures();
  for (const c of ["A", "B", "C", "D"] as const) {
    const f = FIXTURE_OF[c];
    const l = stored?.[c];
    facts[c] = {
      gtin: fx[f].gtin!,
      productId: fx[f].productId,
      expectedVerdict: pf.verdicts[f].verdict,
      expectedReason: pf.verdicts[f].reason,
      verificationLink: pf.verificationLinks[f],
      listing: l ? { text: l.text, file: `stimulus/ucp/${l.entry.file}`, sha256: l.entry.sha256, dpp: l.entry.dpp, variantUrl: null } : null,
    };
    if (l && l.entry.dpp?.verification_url !== pf.verificationLinks[f]) die(1, `listing ${c}'s dpp.verification_url is not the resolver's advertised link`);
  }
  // The listing's product.url must be the page fetch_url serves for that condition (the
  // smoke trial showed what happens otherwise: the pilot pages carry the pre-A29 host, 404).
  for (const c of ["A", "B", "C", "D", "E"] as const) {
    const l = stored?.[c];
    if (l && (JSON.parse(l.text) as { url?: string }).url !== loadPage("S1", c).pageUrl)
      die(1, `listing ${c}'s product url is not the S1 page fetch_url serves in that condition`);
  }
  const le = stored?.E;
  facts.E = {
    gtin: GTIN_E,
    productId: null,
    expectedVerdict: null,
    expectedReason: null,
    verificationLink: null,
    listing: le ? { text: le.text, file: `stimulus/ucp/${le.entry.file}`, sha256: le.entry.sha256, dpp: null, variantUrl: le.entry.variantUrl } : null,
  };
}

// ----------------------------------------------------------------- fetch-log analysis

function samePath(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const norm = (u: URL) => `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    return norm(x) === norm(y);
  } catch {
    return false;
  }
}
const urlsOf = (e: FetchLogEntry) => (e.finalUrl ? [e.requestedUrl, e.finalUrl] : [e.requestedUrl]);
const answered = (e: FetchLogEntry) => e.outcome === "fetched" || (e.outcome === "stored_page" && e.status === 200);

/**
 * The fetch-log outcomes (never the model's own account):
 *   fetchedUpi              an answered fetch of the product link: the page's UPI (H, R), dpp.upi
 *                           (U, A-D) or E's passport URL (E, every arm; the variant url in U)
 *   fetchedPassportUrl      U only: an answered fetch of dpp.passport_url
 *   followedProductLink     U: fetchedUpi OR fetchedPassportUrl ("followed a dpp link");
 *                           H, R: fetchedUpi (arm O's openedProductLink)
 *   fetchedVerificationLink an answered fetch of the checker (reachedChecker); E has none
 *   chainFollowed           the product link (either) fetched before the checker
 *   instrumentInvalid       a verifier response about THIS trial's product disagreeing with
 *                           preflight, or a failed fetch of the checker (A28 §5, A29 §2.8)
 */
function analyseFetches(log: FetchLogEntry[], f: Facts, upi: string, passportUrl: string | null) {
  const ok = log.filter(answered);
  const firstSeq = (target: string | null) => (target ? ok.find((e) => urlsOf(e).some((u) => samePath(u, target)))?.seq ?? null : null);
  const upiSeq = firstSeq(upi);
  const ppSeq = firstSeq(passportUrl);
  const verSeq = f.verificationLink ? (ok.find((e) => e.outcome === "fetched" && urlsOf(e).some((u) => samePath(u, f.verificationLink!)))?.seq ?? null) : null;
  const prodSeq = [upiSeq, ppSeq].filter((x): x is number => x !== null).sort((a, b) => a - b)[0] ?? null;
  const invalidReasons: string[] = [];
  const foreignVerdicts: Array<{ seq: number; url: string; verdict: string }> = [];
  for (const e of log) {
    const isLink = f.verificationLink ? urlsOf(e).some((u) => samePath(u, f.verificationLink!)) : false;
    const subjectProduct = (e.verdictSubject as { productId?: unknown } | null)?.productId;
    const mentions = f.productId ? urlsOf(e).some((u) => u.includes(f.productId!)) || subjectProduct === f.productId : false;
    if (e.verdict !== null) {
      if (isLink || mentions) {
        if (f.expectedVerdict !== null && e.verdict !== f.expectedVerdict)
          invalidReasons.push(`fetch #${e.seq} verifier said ${e.verdict}, preflight said ${f.expectedVerdict}`);
        else if (f.expectedReason && e.verdictReason !== f.expectedReason && f.expectedVerdict === "invalid")
          invalidReasons.push(`fetch #${e.seq} verifier reason ${e.verdictReason}, preflight said ${f.expectedReason}`);
      } else foreignVerdicts.push({ seq: e.seq, url: e.requestedUrl, verdict: e.verdict });
    } else if (isLink && (e.outcome === "network_error" || (e.status !== null && e.status >= 500))) {
      invalidReasons.push(`fetch #${e.seq} of the verification link failed: ${e.outcome} ${e.status ?? e.error}`);
    } else if (isLink && e.status === 429) {
      invalidReasons.push(`fetch #${e.seq} of the verification link was rate-limited (429)`);
    }
  }
  return {
    fetchCount: log.length,
    fetchedUpi: upiSeq !== null,
    upiSeq,
    fetchedPassportUrl: ppSeq !== null,
    passportUrlSeq: ppSeq,
    followedProductLink: prodSeq !== null,
    productLinkSeq: prodSeq,
    fetchedVerificationLink: verSeq !== null,
    verificationLinkSeq: verSeq,
    chainFollowed: prodSeq !== null && verSeq !== null && prodSeq < verSeq,
    instrumentCheck: f.expectedVerdict === null ? "not_evaluable" : "evaluated",
    instrumentInvalid: invalidReasons.length > 0,
    instrumentInvalidReasons: invalidReasons,
    foreignVerdicts,
  };
}

// ----------------------------------------------------------------- one trial

class BudgetAbort extends Error {}
const PROMPT_VERSION: Record<Arm, string> = { U: "U-ucp-open-ended", H: "O-open-ended", R: "A28-evidence" };
const TASK: Record<Arm, string> = { U: UCP_TASK, H: OPEN_TASK, R: NATIVE_TASK };
const REPORT: Record<Arm, string> = { U: UCP_REPORT_FORMAT, H: OPEN_REPORT_FORMAT, R: NATIVE_REPORT_FORMAT };

async function runTrial(item: Item, idx: number, runId: string, remaining: number) {
  const sel = models.find((m) => m.vendor === item.vendor)!;
  const f = facts[item.condition]!;
  const page = loadPage("S1", item.condition);
  const stored: Array<{ url: string; html: string; contentType?: string }> = TEMPLATES_ALL.map((t) => {
    const p = loadPage(t, item.condition);
    return { url: p.pageUrl, html: p.html };
  });
  const eDoc = item.condition === "E" ? loadEDocument() : null;
  if (eDoc) for (const u of E_SERVED_URLS) stored.push({ url: u, html: eDoc.body, contentType: E_DOC_CONTENT_TYPE });
  const tool = createFetchTool(stored, FICTIONAL_HOSTS);

  let user: string;
  let upi: string;
  let passportUrl: string | null = null;
  if (item.arm === "U") {
    if (!f.listing) die(1, `no arm-U listing for ${item.condition}`);
    user = buildUcpPrompt(f.listing.text);
    upi = f.listing.dpp?.upi ?? f.listing.variantUrl!;
    passportUrl = f.listing.dpp?.passport_url ?? null;
  } else {
    user = item.arm === "H" ? buildOpenPrompt(page.pageUrl, page.html) : buildNativePrompt(page.pageUrl, page.html);
    upi = page.upi;
  }
  const adapter = VENDORS[item.vendor].make(sel.model);
  const usage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const returned = new Set<string>();
  let cost = 0;
  const started = Date.now();
  let text = "";
  let toolCalls: Array<{ name: string; input: unknown; result?: string }> = [];
  let error: string | null = null;
  let budgetAborted = false;
  try {
    const out = await adapter.run({
      system: NATIVE_SYSTEM,
      user,
      tools: [tool.spec],
      maxTurns: MAX_TURNS,
      toolsExhausted: tool.exhausted,
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
    text = out.text;
    toolCalls = out.toolCalls;
  } catch (e) {
    budgetAborted = e instanceof BudgetAbort;
    error = e instanceof Error ? e.message : String(e);
  }
  const parsed = error ? { report: null } : item.arm === "R" ? parseNativeReport(text) : parseOpenReport(text);
  const fa = analyseFetches(tool.log, f, upi, passportUrl);
  const row = {
    study: SMOKE ? SMOKE_STUDY : STUDY,
    arm: item.arm,
    promptVersion: PROMPT_VERSION[item.arm],
    taskSha256: sha256(TASK[item.arm]),
    reportFormatSha256: sha256(REPORT[item.arm]),
    stimulusKind: item.arm === "U" ? "ucp-listing" : "html-page",
    listing: item.arm === "U" ? { file: f.listing!.file, sha256: f.listing!.sha256, dpp: f.listing!.dpp, variantUrl: f.listing!.variantUrl } : null,
    storedDocument: eDoc ? { url: eDoc.url, servedAt: eDoc.servedAt, sha256: eDoc.sha256, file: eDoc.file } : null,
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
    template: "S1",
    condition: item.condition,
    runIndex: item.runIndex,
    groundTruth: item.arm === "R" && item.condition !== "smoke" ? GROUND_TRUTH[item.condition] : null,
    gtin: f.gtin,
    upi,
    passportUrl,
    productId: f.productId,
    pageUrl: item.arm === "U" ? null : page.pageUrl,
    pageFile: page.file,
    pageSha256: page.sha256,
    promptSha256: sha256(user),
    systemSha256: sha256(NATIVE_SYSTEM),
    apiBase: UG_API_BASE,
    preflightPassed: SMOKE ? null : true,
    expectedVerdict: f.expectedVerdict,
    expectedReason: f.expectedReason,
    advertisedVerificationLink: f.verificationLink,
    usage,
    costUsd: Number(cost.toFixed(6)),
    ...fa,
    fetches: tool.log,
    toolCalls,
    responseText: text,
    selfReport: parsed.report,
    ...("error" in parsed && parsed.error ? { parseError: parsed.error } : {}),
    ...("missingKeys" in parsed && parsed.missingKeys ? { selfReportMissingKeys: parsed.missingKeys } : {}),
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
const anyRunsFlag = ["--runs-u", "--runs-h", "--runs-r"].some((f) => argv.includes(f));
const schedule = buildSchedule(RUNS);
console.log(`\nStudy 3 (UCP) run ${runId}${SMOKE ? " [SMOKE — pilot, excluded from analysis]" : ""}${DRY ? " [DRY RUN]" : ""}`);
console.log(`arms=${ARMS.join(",")}  conditions=${CONDS.join(",")}  template=S1  runs U=${RUNS.U} H=${RUNS.H} R=${RUNS.R} (R: Claude only)`);
console.log(`seed=${SEED}  trials=${schedule.length}  models=${models.map((m) => `${m.vendor}:${m.model}`).join(", ")}`);
console.log(`ceiling this invocation=$${MAX_USD.toFixed(2)}`);
console.log("vendor caps (60% of balance) and Study 3 ledger:");
for (const m of models) {
  const s = vendorSpent(ledger0, m.vendor);
  console.log(`  ${m.vendor.padEnd(9)} balance $${VENDOR_BALANCES[m.vendor].toFixed(2)}  cap $${VENDOR_CAPS[m.vendor].toFixed(2)}  spent $${s.toFixed(4)}  remaining $${(VENDOR_CAPS[m.vendor] - s).toFixed(4)}`);
}
const proj = projection(RUNS, ledger0);
console.log(`\nprojection for THIS schedule (measured per-trial costs x ${PROJECTION_SAFETY}):`);
let overCap = false;
for (const p of Object.values(proj)) {
  const rem = VENDOR_CAPS[p.vendor] - vendorSpent(ledger0, p.vendor);
  const over = p.total > rem;
  overCap ||= over;
  console.log(`  ${p.vendor}: $${p.total.toFixed(2)} ${over ? "EXCEEDS" : "<="} remaining cap $${rem.toFixed(2)}`);
  for (const l of p.lines) console.log(`      ${l}`);
}
console.log(`  all vendors: $${Object.values(proj).reduce((a, p) => a + p.total, 0).toFixed(2)}`);
if (!SMOKE) {
  console.log(
    `\nPROPOSED ALLOCATION (start U=${PREFERRED.U}, H=${PREFERRED.H}, R=${PREFERRED.R}; reduce all arms by 1 until every vendor fits; never below ${MIN_RUNS}): ` +
      `U=${alloc.runs.U} H=${alloc.runs.H} R=${alloc.runs.R} -> ${buildSchedule(alloc.runs).length} trials, ${alloc.fits ? "fits every vendor cap" : "DOES NOT FIT even at the floor"}`,
  );
  if (!anyRunsFlag && (alloc.runs.U !== RUNS.U || alloc.runs.H !== RUNS.H || alloc.runs.R !== RUNS.R))
    console.log("  (the default allocation does not fit: pass the proposed --runs-u/--runs-h/--runs-r, and register the choice)");
}
for (const a of ARMS) if (!SMOKE && RUNS[a] < MIN_RUNS) die(2, `runs per cell (arm ${a}) may never be below ${MIN_RUNS}`);
if (!ARMS.includes("U") || !ARMS.includes("H")) console.log("\nWARNING: U vs H is a same-schedule comparison; running one without the other breaks it.");

if (DRY) {
  if (!SMOKE) {
    for (const c of CONDS) for (const t of TEMPLATES_ALL) loadPage(t, c);
    if (CONDS.includes("E")) loadEDocument();
    console.log("\nstimulus: every scheduled page and E's document match stimulus/manifest.json");
    if (ARMS.includes("U")) {
      try {
        loadStoredListings();
        console.log("stimulus: the five arm-U listings match stimulus/ucp/manifest.json");
      } catch (e) {
        console.log(`stimulus: arm-U listings NOT READY — ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  console.log("\nschedule (first 20):");
  schedule.slice(0, 20).forEach((s, i) => console.log(`  ${i} ${s.arm} ${s.vendor} ${s.condition} run${s.runIndex}`));
  process.exit(0);
}

if (!SMOKE && overCap) die(4, "the projected spend of at least one vendor exceeds what remains of its Study 3 cap. Reduce the runs (never below 6) and register the choice first.");
for (const m of models) if (!process.env[VENDORS[m.vendor].key]) die(1, `${VENDORS[m.vendor].key} is not set (repo-root .env)`);

await prepare();

mkdirSync(RESULTS, { recursive: true });
const base = `${RESULTS}${SMOKE ? "smoke-study3" : "study3"}-${runId}`;
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
      arms: ARMS,
      conditions: CONDS,
      template: "S1",
      runsPerCell: RUNS,
      prompts: Object.fromEntries(ALL_ARMS.map((a) => [a, { version: PROMPT_VERSION[a], task: TASK[a], reportFormat: REPORT[a], taskSha256: sha256(TASK[a]), reportFormatSha256: sha256(REPORT[a]) }])),
      groundTruthArmR: GROUND_TRUTH,
      vendorBalances: VENDOR_BALANCES,
      vendorCaps: VENDOR_CAPS,
      ledgerBefore: Object.fromEntries(models.map((m) => [m.vendor, vendorSpent(ledger0, m.vendor)])),
      maxUsd: MAX_USD,
      tool: {
        description: FETCH_TOOL_DESCRIPTION,
        realAllowedHosts: REAL_ALLOWED_HOSTS,
        fictionalHosts: FICTIONAL_HOSTS,
        maxFetches: MAX_FETCHES_PER_TRIAL,
        maxBodyChars: MAX_BODY_CHARS,
        requestHeaders: FETCH_REQUEST_HEADERS,
      },
      maxTurns: MAX_TURNS,
      system: NATIVE_SYSTEM,
      preflight: preflightSummary,
      facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, { ...v, listing: v?.listing ? { ...v.listing, text: undefined } : null }])),
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
  const gate = trialGate(sel, item.arm, ledger);
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
    arm: item.arm,
    vendor: item.vendor,
    model: sel.model,
    costUsd: cost,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    aborted: budgetAborted || row.error !== null,
  });
  const sr = row.selfReport as { decision?: string; claims_status?: string } | null;
  const status = row.error
    ? `ERROR ${row.error.slice(0, 100)}`
    : sr === null
      ? `NO REPORT (missing data, A9): ${(row as { parseError?: string }).parseError}`
      : `${sr.claims_status ? `${sr.claims_status} / ` : ""}${sr.decision}`;
  console.log(
    `[${i + 1}/${schedule.length}] ${item.arm} ${sel.model} ${item.condition} run${item.runIndex}: ${status}` +
      `  fetches=${row.fetchCount} product=${row.followedProductLink} checker=${row.fetchedVerificationLink}${row.instrumentInvalid ? " INSTRUMENT_INVALID" : ""}` +
      `  ids=${row.modelIdsReturned.join(",")}  tok=${usage.inputTokens}/${usage.outputTokens}  $${cost.toFixed(5)}  (run $${runSpent.toFixed(4)})`,
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
console.log(`\nWrote ${existsSync(outFile) ? outFile : "(no rows)"}\nrun spend $${runSpent.toFixed(4)}; Study 3 ledger by vendor: ${models.map((m) => `${m.vendor} $${vendorSpent(l1, m.vendor).toFixed(4)}`).join(", ")}`);
if (stopped || skipped.length) {
  console.error(`STOPPED/SHORTENED BY BUDGET: ${stopped ?? `${skipped.length} trial(s) skipped`}`);
  process.exit(4);
}
