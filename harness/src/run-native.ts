/**
 * Study 2 (A28) — "native interoperability" trial runner.
 *
 * Each trial: a fresh conversation, ONE tool (fetch_url), the fixed A28 prompt with one
 * stored product page. The schedule (4 conditions x 2 templates x selected models x runs)
 * is shuffled with a logged seed so cells interleave.
 *
 * Usage (from harness/; bun's absolute path on this machine, see README):
 *   bun run src/run-native.ts --pilot --max-usd 1.50
 *   bun run src/run-native.ts --max-usd 8.20 [--models openai,gemini,kimi] [--runs 10] [--seed N]
 *   bun run src/run-native.ts ... --dry-run          (print schedule + cost projection; no API call)
 *
 * --models  comma list of vendors, each optionally `vendor:model-id`
 *           (defaults from NATIVE_OPENAI_MODEL / NATIVE_GEMINI_MODEL / NATIVE_KIMI_MODEL,
 *           else gpt-5.4-mini / gemini-3.8-flash / kimi-k2.6). A model with no row in
 *           harness/pricing.json is refused: its cost cannot be computed.
 * --pilot   A28 §4 pilot: template S1, the condition-agnostic page for throwaway GTIN
 *           293959384059, 3 runs per model by default, written to pilot-native-*.jsonl
 *           with pilot=true on every row. Excluded from every analysis.
 * --max-usd REQUIRED hard ceiling for THIS invocation. Additionally the cumulative spend
 *           in results/spend-ledger.json may never exceed STUDY_BUDGET_USD (default 10).
 *           Before each trial the projected cost (1.25 x the dearest trial yet seen for
 *           that model, or a conservative prior) must fit in what remains; during a trial
 *           the live cost is checked after every API call and the trial is aborted if it
 *           crosses the remainder. Either stop ends the run (exit 4).
 *
 * Main runs refuse to start unless preflight-native passes (A28 §5) and the rendered main
 * pages match stimulus/manifest.json and fixtures/conditions.json. Exit codes: 0 complete,
 * 1 precondition failed, 2 bad arguments, 4 stopped by the budget ceiling.
 *
 * FOLLOW-UP mode (to be registered before any trial; turned on by --followup or by any of
 * --arm / --conditions / --runs-r / --runs-o). Study 2 invocations without these flags
 * behave exactly as before.
 *   bun run src/run-native.ts --followup --max-usd 4.40 [--arm R,O] [--conditions A,B,C,D,E]
 *        [--templates S1] [--runs-r 8] [--runs-o 6] [--models ...] [--seed N] [--dry-run]
 *   --arm         R = the A28 evidence prompt, unchanged (prompts-native.ts);
 *                 O = the open-ended prompt (prompts-open.ts). "R,O" (default) interleaves
 *                 both arms in ONE shuffled schedule; every row carries `arm`.
 *   --conditions  any of A,B,C,D,E (default all five). E = the plain hosted passport with no
 *                 checker (stimulus/condition-e.ts), served by fetch_url from the stored
 *                 document at https://id.tarnvale.example/01/<gtinE>. Arm-R truth: unverified.
 *   --templates   default S1 in follow-up mode.
 *   --runs-r/-o   runs per cell for each arm (defaults 8 and 6; never below 5). --runs is
 *                 refused in follow-up mode.
 *   Rows go to results/followup-<runId>.jsonl with study="study2-followup". The preflight is
 *   gates 0-4 (re-measured exactly as for Study 2) plus F1-F4 (condition E). --dry-run also
 *   prints the projected cost from the MEASURED Study 2 per-trial cost per model
 *   (results-archive/native-2026-10-14T00-39-03-229Z.jsonl) and a proposed allocation that
 *   fits within 0.8 x the remaining study budget.
 */
import "./env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chatgptAdapter } from "./agents/openai";
import { geminiAdapter } from "./agents/gemini";
import { kimiAdapter } from "./agents/kimi";
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
import {
  buildNativePrompt,
  NATIVE_REPORT_FORMAT,
  NATIVE_SYSTEM,
  NATIVE_TASK,
  parseNativeReport,
  type NativeSelfReport,
} from "./prompts-native";
import { buildOpenPrompt, OPEN_REPORT_FORMAT, OPEN_TASK, parseOpenReport, type OpenSelfReport } from "./prompts-open";
import {
  measurePilotTarget,
  printFollowupPreflight,
  printPreflight,
  readFixtures,
  runFollowupPreflight,
  runNativePreflight,
  type FixtureCondition,
} from "./preflight-native";
import { E_DOC_CONTENT_TYPE, E_HOST, E_SERVED_URLS, E_UPI, GTIN_E } from "../../stimulus/condition-e";
import { UG_API_BASE } from "./config";

// ----------------------------------------------------------------- constants

export const PILOT_GTIN = "293959384059";
type Vendor = "openai" | "gemini" | "kimi";
type Template = "S1" | "S2";
type Cond = "A" | "B" | "C" | "D" | "E" | "pilot";
type Arm = "R" | "O";
/** Evidence-prompt (A28 / arm R) ground truth. Follow-up E: no checker, nothing to confirm. */
const GROUND_TRUTH: Record<Exclude<Cond, "pilot">, string> = {
  A: "verified",
  B: "unverified",
  C: "invalid",
  D: "mismatch",
  E: "unverified",
};
/** Which fixture's product link (and therefore verifier) each condition's page carries. E has none. */
const FIXTURE_OF: Record<"A" | "B" | "C" | "D", FixtureCondition> = { A: "A", B: "B", C: "C", D: "A" };
const FOLLOWUP_STUDY = "study2-followup";
/** Measured Study 2 per-trial costs, used by the follow-up dry run's projection. */
const MEASURED_COST_FILE = "results-archive/native-2026-10-14T00-39-03-229Z.jsonl";
const FOLLOWUP_BUDGET_FRACTION = 0.8;
const FOLLOWUP_PREFERRED = { R: 8, O: 6 } as const;
const VENDORS: Record<Vendor, { make: (m: string) => AgentAdapter; env: string; fallback: string }> = {
  openai: { make: chatgptAdapter, env: "NATIVE_OPENAI_MODEL", fallback: "gpt-5.4-mini" },
  gemini: { make: geminiAdapter, env: "NATIVE_GEMINI_MODEL", fallback: "gemini-3.8-flash" },
  kimi: { make: kimiAdapter, env: "NATIVE_KIMI_MODEL", fallback: "kimi-k2.6" },
};
const MAX_TURNS = 12;
const PRIOR_INPUT_TOKENS = 150_000;
const PRIOR_OUTPUT_TOKENS = 15_000;
const PROJECTION_SAFETY = 1.25;

const HARNESS = fileURLToPath(new URL("../", import.meta.url));
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const RESULTS = `${HARNESS}results/`;
const LEDGER = `${RESULTS}spend-ledger.json`;

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
const KNOWN = new Set([
  "--models", "--runs", "--pilot", "--max-usd", "--seed", "--dry-run", "--templates",
  // follow-up
  "--followup", "--arm", "--conditions", "--runs-r", "--runs-o",
]);
for (const a of argv) if (a.startsWith("--") && !KNOWN.has(a)) die(2, `unknown flag ${a}`);

const FOLLOWUP = ["--followup", "--arm", "--conditions", "--runs-r", "--runs-o"].some((f) => argv.includes(f));
const PILOT = argv.includes("--pilot");
if (FOLLOWUP && PILOT) die(2, "--pilot cannot be combined with the follow-up flags");
if (FOLLOWUP && argv.includes("--runs")) die(2, "follow-up mode takes --runs-r / --runs-o, not --runs");
const DRY = argv.includes("--dry-run");
const maxUsdRaw = flag("--max-usd");
if (maxUsdRaw === undefined) die(2, "--max-usd is required (hard spend ceiling for this run, USD)");
const MAX_USD = Number(maxUsdRaw);
if (!Number.isFinite(MAX_USD) || MAX_USD <= 0) die(2, `--max-usd "${maxUsdRaw}" is not a positive number`);
const STUDY_BUDGET = Number(process.env.STUDY_BUDGET_USD ?? 10);
const runsRaw = flag("--runs");
const RUNS = runsRaw === undefined ? (PILOT ? 3 : 10) : Number(runsRaw);
if (!Number.isInteger(RUNS) || RUNS < 1) die(2, `--runs "${runsRaw}" is not a positive integer`);
const seedRaw = flag("--seed");
const SEED = seedRaw === undefined ? randomInt(0, 2 ** 31) : Number(seedRaw);
if (!Number.isInteger(SEED)) die(2, `--seed "${seedRaw}" is not an integer`);
const templatesRaw = flag("--templates");
const TEMPLATES: Template[] = (templatesRaw?.split(",") ?? (PILOT || FOLLOWUP ? ["S1"] : ["S1", "S2"])) as Template[];
if (TEMPLATES.some((t) => t !== "S1" && t !== "S2")) die(2, `--templates must be S1 and/or S2`);

const armRaw = flag("--arm");
const ARMS: Arm[] = FOLLOWUP ? ((armRaw ?? "R,O").split(",").map((x) => x.trim().toUpperCase()) as Arm[]) : [];
if (ARMS.some((a) => a !== "R" && a !== "O") || new Set(ARMS).size !== ARMS.length) die(2, `--arm must be R, O or R,O`);
const condsRaw = flag("--conditions");
const FOLLOWUP_CONDS: Cond[] = FOLLOWUP
  ? ((condsRaw ?? "A,B,C,D,E").split(",").map((x) => x.trim().toUpperCase()) as Cond[])
  : [];
if (FOLLOWUP_CONDS.some((c) => !["A", "B", "C", "D", "E"].includes(c)) || new Set(FOLLOWUP_CONDS).size !== FOLLOWUP_CONDS.length)
  die(2, `--conditions must be a list drawn from A,B,C,D,E`);
function armRuns(name: string, fallback: number): number {
  const raw = flag(name);
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < 1) die(2, `${name} "${raw}" is not a positive integer`);
  return n;
}
const RUNS_BY_ARM: Record<Arm, number> = {
  R: armRuns("--runs-r", FOLLOWUP_PREFERRED.R),
  O: armRuns("--runs-o", FOLLOWUP_PREFERRED.O),
};

// ----------------------------------------------------------------- pricing + models

interface Price {
  inputPerMTok: number;
  cachedInputPerMTok: number;
  outputPerMTok: number;
  longContext?: { aboveInputTokens: number; inputPerMTok: number; cachedInputPerMTok: number; outputPerMTok: number };
  vendor: string;
  source: string;
  note?: string;
}
const pricing = JSON.parse(readFileSync(`${HARNESS}pricing.json`, "utf8")) as {
  retrieved: string;
  models: Record<string, Price>;
};

interface ModelSel {
  vendor: Vendor;
  model: string;
  price: Price;
}
const models: ModelSel[] = (flag("--models") ?? "openai,gemini,kimi").split(",").map((s) => {
  const [v, m] = s.trim().split(":") as [Vendor, string | undefined];
  if (!(v in VENDORS)) die(2, `unknown vendor "${v}" (openai, gemini, kimi)`);
  const model = m ?? process.env[VENDORS[v].env] ?? VENDORS[v].fallback;
  const price = pricing.models[model];
  if (!price) die(1, `no published price for "${model}" in harness/pricing.json — refusing to run a model whose cost cannot be computed`);
  if (price.vendor !== v) die(2, `"${model}" is priced as a ${price.vendor} model, not ${v}`);
  return { vendor: v, model, price };
});
if (new Set(models.map((m) => m.vendor)).size !== models.length) die(2, "one model per vendor");

function callCost(p: Price, u: CallUsage): number {
  const t = p.longContext && u.inputTokens > p.longContext.aboveInputTokens ? p.longContext : p;
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens);
  return (uncached * t.inputPerMTok + u.cachedInputTokens * t.cachedInputPerMTok + u.outputTokens * t.outputPerMTok) / 1e6;
}

// ----------------------------------------------------------------- ledger

interface LedgerEntry {
  at: string;
  runId: string;
  pilot: boolean;
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
  entries: LedgerEntry[];
}
function readLedger(): Ledger {
  if (!existsSync(LEDGER)) {
    return {
      _comment:
        "Cumulative Study 2 API spend, one entry per trial (including aborted and errored trials). Git-ignored. run-native.ts refuses to let the total exceed STUDY_BUDGET_USD (default 10). Never edit by hand.",
      entries: [],
    };
  }
  return JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger;
}
function appendLedger(e: LedgerEntry): void {
  const l = readLedger();
  l.entries.push(e);
  const tmp = `${LEDGER}.tmp`;
  writeFileSync(tmp, JSON.stringify(l, null, 2) + "\n", "utf8");
  renameSync(tmp, LEDGER);
}
const ledgerTotal = (l: Ledger) => l.entries.reduce((s, e) => s + e.costUsd, 0);

/**
 * `usd` (per-trial gate) = 1.25 x the DEAREST measured trial for the model; `meanUsd`
 * (whole-run projection) = 1.25 x the MEAN measured trial. Both fall back to the prior.
 */
function projectedTrialCost(sel: ModelSel, ledger: Ledger): { usd: number; meanUsd: number; basis: string } {
  const seen = ledger.entries.filter((e) => e.model === sel.model && !e.aborted).map((e) => e.costUsd);
  if (seen.length) {
    const mean = seen.reduce((a, b) => a + b, 0) / seen.length;
    return {
      usd: Math.max(...seen) * PROJECTION_SAFETY,
      meanUsd: mean * PROJECTION_SAFETY,
      basis: `${PROJECTION_SAFETY}x max / mean of ${seen.length} measured trial(s); mean $${mean.toFixed(4)}`,
    };
  }
  const usd = callCost(sel.price, {
    inputTokens: PRIOR_INPUT_TOKENS,
    cachedInputTokens: 0,
    outputTokens: PRIOR_OUTPUT_TOKENS,
    reasoningTokens: 0,
    modelReturned: null,
  });
  return { usd, meanUsd: usd, basis: `prior (${PRIOR_INPUT_TOKENS} in / ${PRIOR_OUTPUT_TOKENS} out, no measurement yet)` };
}

// ----------------------------------------------------------------- stimulus

interface ManifestPage {
  file: string;
  set: "main" | "pilot" | "followup";
  template: Template;
  condition: Cond;
  gtin: string;
  upi: string;
  pageUrl: string;
  sha256: string;
}
interface ManifestDocument {
  file: string;
  condition: string;
  gtin: string;
  url: string;
  servedAt: string[];
  contentType: string;
  sha256: string;
}
const manifest = JSON.parse(readFileSync(`${REPO}stimulus/manifest.json`, "utf8")) as {
  pages: ManifestPage[];
  documents?: ManifestDocument[];
};

/** Follow-up: condition E's pages live in the "followup" set; A-D use the Study 2 main pages. */
function setFor(condition: Cond): "main" | "pilot" | "followup" {
  return PILOT ? "pilot" : condition === "E" ? "followup" : "main";
}

/** Follow-up: condition E's stored passport document, hash-checked against the manifest. */
function loadEDocument(): ManifestDocument & { body: string } {
  const d = manifest.documents?.find((x) => x.condition === "E");
  if (!d) die(1, "no condition-E document in stimulus/manifest.json — run stimulus/build-e.ts");
  if (d.gtin !== GTIN_E || d.url !== E_UPI) die(1, `manifest E document is for ${d.url}, expected ${E_UPI}`);
  const body = readFileSync(`${REPO}stimulus/${d.file}`, "utf8");
  if (sha256(body) !== d.sha256) die(1, `${d.file} does not match its manifest sha256`);
  return { ...d, body };
}

function loadPage(set: "main" | "pilot" | "followup", template: Template, condition: Cond, gtin: string): ManifestPage & { html: string } {
  const p = manifest.pages.find((x) => x.set === set && x.template === template && x.condition === condition);
  if (!p) die(1, `no ${set} page for ${template}-${condition} in stimulus/manifest.json — run stimulus/render.ts`);
  if (p.gtin !== gtin) die(1, `${p.file} was rendered for GTIN ${p.gtin}, expected ${gtin} — re-render`);
  const html = readFileSync(`${REPO}stimulus/${p.file}`, "utf8");
  if (sha256(html) !== p.sha256) die(1, `${p.file} does not match its manifest sha256 — the stimulus changed after rendering`);
  return { ...p, html };
}

// ----------------------------------------------------------------- per-condition instrument facts

interface CondFacts {
  gtin: string;
  productId: string | null;
  expectedVerdict: string | null;
  expectedReason: string | null;
  verificationLink: string | null;
}
const facts: Partial<Record<Cond, CondFacts>> = {};
let preflightSummary: unknown = null;

async function prepare(): Promise<void> {
  if (PILOT) {
    const m = await measurePilotTarget(PILOT_GTIN);
    console.log(
      `pilot target ${PILOT_GTIN}: productId=${m.productId} kind=${m.kind} verdict=${m.verdict}/${m.reason} ` +
        `link candidates=${m.candidates.length}${m.candidates.map((c) => `\n  ${c.path} = ${c.url}`).join("")}`,
    );
    facts.pilot = {
      gtin: PILOT_GTIN,
      productId: m.productId,
      expectedVerdict: m.verdict,
      expectedReason: m.reason,
      verificationLink: m.verificationLink,
    };
    preflightSummary = { pilot: true, measured: m };
    return;
  }
  const pf = await runNativePreflight();
  printPreflight(pf);
  preflightSummary = { ok: pf.ok, ranAt: pf.ranAt, verdicts: pf.verdicts, verificationLinks: pf.verificationLinks };
  if (!pf.ok) die(1, "preflight-native FAILED (A28 §5). No counted trial may run until every gate passes.");
  if (FOLLOWUP) {
    const ff = await runFollowupPreflight();
    printFollowupPreflight(ff);
    preflightSummary = { ...(preflightSummary as object), followup: { ok: ff.ok, ranAt: ff.ranAt, e: ff.e, liveNotices: ff.liveNotices, gates: ff.gates } };
    if (!ff.ok) die(1, "follow-up preflight (F1-F4) FAILED. No counted trial may run until every gate passes.");
    facts.E = { gtin: GTIN_E, productId: null, expectedVerdict: null, expectedReason: null, verificationLink: null };
  }
  const fx = readFixtures();
  for (const c of ["A", "B", "C", "D"] as const) {
    const f = FIXTURE_OF[c];
    facts[c] = {
      gtin: fx[f].gtin!,
      productId: fx[f].productId,
      expectedVerdict: pf.verdicts[f].verdict,
      expectedReason: pf.verdicts[f].reason,
      verificationLink: pf.verificationLinks[f],
    };
  }
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

function urlsOf(e: FetchLogEntry): string[] {
  const out = [e.requestedUrl];
  if (e.finalUrl) out.push(e.finalUrl);
  return out;
}

function analyseFetches(log: FetchLogEntry[], f: CondFacts, upi: string) {
  // A stored body served with 200 counts as answered too: follow-up E's product link is a
  // stored document. In Study 2 no stored page was ever a product or verification link, so
  // its rows are unaffected.
  const answered = log.filter((e) => e.outcome === "fetched" || (e.outcome === "stored_page" && e.status === 200));
  const prod = answered.find((e) => urlsOf(e).some((u) => samePath(u, upi)));
  const ver = f.verificationLink ? answered.find((e) => urlsOf(e).some((u) => samePath(u, f.verificationLink!))) : undefined;
  const invalidReasons: string[] = [];
  const foreignVerdicts: Array<{ seq: number; url: string; verdict: string }> = [];
  for (const e of log) {
    const isLink = f.verificationLink ? urlsOf(e).some((u) => samePath(u, f.verificationLink!)) : false;
    // A verifier response is about THIS trial's product if its URL names the product id or
    // (platform PR #354) its `subject.productId` does. Verdicts about any other id are the
    // model's own detour: logged as foreign, never used to invalidate the trial.
    const subjectProduct = (e.verdictSubject as { productId?: unknown } | null)?.productId;
    const mentionsProduct = f.productId
      ? urlsOf(e).some((u) => u.includes(f.productId!)) || subjectProduct === f.productId
      : false;
    if (e.verdict !== null) {
      if (isLink || mentionsProduct) {
        if (f.expectedVerdict !== null && e.verdict !== f.expectedVerdict) {
          invalidReasons.push(`fetch #${e.seq} verifier said ${e.verdict}, preflight said ${f.expectedVerdict}`);
        } else if (f.expectedReason && e.verdictReason !== f.expectedReason && f.expectedVerdict === "invalid") {
          invalidReasons.push(`fetch #${e.seq} verifier reason ${e.verdictReason}, preflight said ${f.expectedReason}`);
        }
      } else {
        foreignVerdicts.push({ seq: e.seq, url: e.requestedUrl, verdict: e.verdict });
      }
    } else if (isLink && (e.outcome === "network_error" || (e.status !== null && e.status >= 500))) {
      invalidReasons.push(`fetch #${e.seq} of the verification link failed: ${e.outcome} ${e.status ?? e.error}`);
    }
  }
  return {
    fetchCount: log.length,
    fetchedProductLink: !!prod,
    productLinkSeq: prod?.seq ?? null,
    fetchedVerificationLink: !!ver,
    verificationLinkSeq: ver?.seq ?? null,
    chainFollowed: !!prod && !!ver && prod.seq < ver.seq,
    instrumentCheck: f.expectedVerdict === null ? "not_evaluable" : "evaluated",
    instrumentInvalid: invalidReasons.length > 0,
    instrumentInvalidReasons: invalidReasons,
    foreignVerdicts,
  };
}

// ----------------------------------------------------------------- schedule

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
interface Item {
  /** Follow-up only. Study 2 items carry no arm (their rows are unchanged). */
  arm?: Arm;
  vendor: Vendor;
  template: Template;
  condition: Cond;
  runIndex: number;
}
const conds: Cond[] = PILOT ? ["pilot"] : FOLLOWUP ? FOLLOWUP_CONDS : ["A", "B", "C", "D"];
const schedule: Item[] = [];
if (FOLLOWUP) {
  for (const arm of ARMS) for (const m of models) for (const t of TEMPLATES) for (const c of conds)
    for (let r = 0; r < RUNS_BY_ARM[arm]; r++) schedule.push({ arm, vendor: m.vendor, template: t, condition: c, runIndex: r });
} else {
  for (const m of models) for (const t of TEMPLATES) for (const c of conds) for (let r = 0; r < RUNS; r++) {
    schedule.push({ vendor: m.vendor, template: t, condition: c, runIndex: r });
  }
}
const rand = mulberry32(SEED);
for (let i = schedule.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [schedule[i], schedule[j]] = [schedule[j], schedule[i]];
}

// ----------------------------------------------------------------- trial

class BudgetAbort extends Error {}

async function runTrial(item: Item, idx: number, runId: string, remaining: number) {
  const sel = models.find((m) => m.vendor === item.vendor)!;
  const f = facts[item.condition]!;
  const set = setFor(item.condition);
  const page = loadPage(set, item.template, item.condition, f.gtin);
  // Both fictional hosts serve this trial's condition, so the stimulus world is consistent.
  const stored: Array<{ url: string; html: string; contentType?: string }> = TEMPLATES_ALL.map((t) => {
    const p = PILOT
      ? manifest.pages.find((x) => x.set === "pilot" && x.template === t && x.condition === "pilot")
      : loadPage(set, t, item.condition, f.gtin);
    return p ? { url: p.pageUrl, html: readFileSync(`${REPO}stimulus/${p.file}`, "utf8") } : null;
  }).filter((x): x is { url: string; html: string } => x !== null);
  // Follow-up E: E's own host serves the stored passport document (its UPI and its
  // passport-id path). In A-D the same host is fictional but holds nothing (404).
  const eDoc = item.condition === "E" ? loadEDocument() : null;
  if (eDoc) for (const u of E_SERVED_URLS) stored.push({ url: u, html: eDoc.body, contentType: E_DOC_CONTENT_TYPE });
  const tool = createFetchTool(stored, FOLLOWUP ? FOLLOWUP_FICTIONAL_HOSTS : FICTIONAL_HOSTS);
  const arm: Arm = item.arm ?? "R";
  const user = arm === "O" ? buildOpenPrompt(page.pageUrl, page.html) : buildNativePrompt(page.pageUrl, page.html);
  const adapter = VENDORS[item.vendor].make(sel.model);

  const usage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
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
  const parsed: { report: NativeSelfReport | OpenSelfReport | null; error?: string; missingKeys?: string[] } = error
    ? { report: null }
    : arm === "O"
      ? parseOpenReport(text)
      : parseNativeReport(text);
  const fa = analyseFetches(tool.log, f, page.upi);
  const row = {
    study: FOLLOWUP ? FOLLOWUP_STUDY : "A28-native-interoperability",
    ...(FOLLOWUP
      ? {
          arm,
          promptVersion: arm === "O" ? "O-open-ended" : "A28-evidence",
          taskSha256: sha256(arm === "O" ? OPEN_TASK : NATIVE_TASK),
          reportFormatSha256: sha256(arm === "O" ? OPEN_REPORT_FORMAT : NATIVE_REPORT_FORMAT),
          storedDocument: eDoc ? { url: eDoc.url, servedAt: eDoc.servedAt, sha256: eDoc.sha256, file: eDoc.file } : null,
        }
      : {}),
    pilot: PILOT,
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
      outputPerMTok: sel.price.outputPerMTok,
      longContext: sel.price.longContext ?? null,
      source: sel.price.source,
      retrieved: pricing.retrieved,
    },
    template: item.template,
    condition: item.condition,
    runIndex: item.runIndex,
    groundTruth: item.condition === "pilot" || arm === "O" ? null : GROUND_TRUTH[item.condition],
    gtin: f.gtin,
    upi: page.upi,
    productId: f.productId,
    pageUrl: page.pageUrl,
    pageFile: page.file,
    pageSha256: page.sha256,
    promptSha256: sha256(user),
    systemSha256: sha256(NATIVE_SYSTEM),
    apiBase: UG_API_BASE,
    preflightPassed: PILOT ? null : true,
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
    ...(parsed.error ? { parseError: parsed.error } : {}),
    ...(parsed.missingKeys ? { selfReportMissingKeys: parsed.missingKeys } : {}),
    error,
    budgetAborted,
    durationMs: Date.now() - started,
  };
  return { row, cost, usage, budgetAborted };
}

const TEMPLATES_ALL: Template[] = ["S1", "S2"];
const FICTIONAL_HOSTS = ["shop.tarnvale.example", "www.quillbury.example"];
/** Follow-up: the same two page hosts plus condition E's passport host, in EVERY condition. */
const FOLLOWUP_FICTIONAL_HOSTS = [...FICTIONAL_HOSTS, E_HOST];

// ----------------------------------------------------------------- follow-up projection

/**
 * Follow-up dry run: project cost from the MEASURED Study 2 per-trial cost per model and
 * propose runs per cell. Assumptions (printed):
 *   - arm R costs what a Study 2 trial cost for that model (the same prompt; E's document
 *     is B's payload minus ~430 bytes, so E is costed like any other condition);
 *   - arm O is costed the SAME as arm R (conservative: an open prompt should fetch less,
 *     not more). The "fewest-fetch" proxy (mean Study 2 cost of that model's trials at its
 *     lowest observed fetch count) is printed beside it as an optimistic bound only;
 *   - cap = 0.8 x (study ceiling - ledger total); the 0.8 is the safety margin, so the
 *     measured mean is used without the runner's 1.25 factor (the per-trial gate during the
 *     run still applies 1.25 x the dearest trial seen).
 * Allocation: start at R=8, O=6 runs per cell; while over the cap, reduce both by one
 * (uniformly), never below 5.
 */
function followupProjection(ledger: Ledger): void {
  const path = `${REPO}${MEASURED_COST_FILE}`;
  if (!existsSync(path)) {
    console.log(`\n(no ${MEASURED_COST_FILE}; follow-up projection skipped)`);
    return;
  }
  const rows = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { modelRequested: string; costUsd: number; fetchCount: number; usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number } });
  const per: Record<string, { mean: number; repriced: number; proxy: number; n: number }> = {};
  console.log(`\nfollow-up projection from MEASURED Study 2 trials (${MEASURED_COST_FILE}):`);
  for (const m of models) {
    const rs = rows.filter((r) => r.modelRequested === m.model);
    if (!rs.length) {
      const p = projectedTrialCost(m, ledger);
      per[m.model] = { mean: p.meanUsd, repriced: p.meanUsd, proxy: p.meanUsd, n: 0 };
      console.log(`  ${m.model}: no measured Study 2 trial; using the ledger projection $${p.meanUsd.toFixed(4)}`);
      continue;
    }
    const mean = rs.reduce((a, r) => a + r.costUsd, 0) / rs.length;
    const repriced =
      rs.reduce(
        (a, r) =>
          a +
          callCost(m.price, {
            inputTokens: r.usage.inputTokens,
            cachedInputTokens: r.usage.cachedInputTokens,
            outputTokens: r.usage.outputTokens,
            reasoningTokens: 0,
            modelReturned: null,
          }),
        0,
      ) / rs.length;
    const minF = Math.min(...rs.map((r) => r.fetchCount));
    const few = rs.filter((r) => r.fetchCount === minF);
    const proxy = few.reduce((a, r) => a + r.costUsd, 0) / few.length;
    per[m.model] = { mean, repriced, proxy, n: rs.length };
    console.log(
      `  ${m.model}: measured mean $${mean.toFixed(5)}/trial (n=${rs.length}; re-priced from tokens with harness/pricing.json: $${repriced.toFixed(5)}); ` +
        `fewest-fetch proxy (${minF} fetch(es), n=${few.length}) $${proxy.toFixed(5)}`,
    );
  }
  const spent = ledgerTotal(ledger);
  const remaining = STUDY_BUDGET - spent;
  const cap = remaining * FOLLOWUP_BUDGET_FRACTION;
  const cells = conds.length * TEMPLATES.length;
  const perCellAllModels = Object.values(per).reduce((a, p) => a + Math.max(p.mean, p.repriced), 0);
  const proxyAllModels = Object.values(per).reduce((a, p) => a + p.proxy, 0);
  const cost = (r: number, o: number) =>
    perCellAllModels * cells * ((ARMS.includes("R") ? r : 0) + (ARMS.includes("O") ? o : 0));
  let r: number = FOLLOWUP_PREFERRED.R;
  let o: number = FOLLOWUP_PREFERRED.O;
  while (cost(r, o) > cap && (r > 5 || o > 5)) {
    r = Math.max(5, r - 1);
    o = Math.max(5, o - 1);
  }
  const fits = cost(r, o) <= cap;
  console.log(
    `  remaining = $${STUDY_BUDGET.toFixed(2)} - ledger $${spent.toFixed(4)} = $${remaining.toFixed(4)}; cap = ${FOLLOWUP_BUDGET_FRACTION} x remaining = $${cap.toFixed(4)}`,
  );
  console.log(
    `  assumption: arm O costs the same as arm R per trial (conservative); E costs like A-D; ` +
      `per trial, the larger of measured and re-priced mean is used`,
  );
  console.log(
    `  PROPOSED ALLOCATION: ${ARMS.includes("R") ? `arm R ${r} runs/cell` : ""}${ARMS.length === 2 ? ", " : ""}${ARMS.includes("O") ? `arm O ${o} runs/cell` : ""}` +
      ` x ${conds.length} conditions x ${TEMPLATES.length} template(s) x ${models.length} models` +
      ` = ${(ARMS.includes("R") ? r : 0) * cells * models.length + (ARMS.includes("O") ? o : 0) * cells * models.length} trials;` +
      ` projected $${cost(r, o).toFixed(2)} ${fits ? "<=" : "EXCEEDS"} cap $${cap.toFixed(2)}` +
      `${fits ? "" : " — even 5/5 does not fit: reduce models or conditions, and register the choice"}`,
  );
  if (ARMS.includes("O")) {
    const optimistic =
      perCellAllModels * cells * (ARMS.includes("R") ? r : 0) + proxyAllModels * cells * o;
    console.log(`  (optimistic, arm O at the fewest-fetch proxy: $${optimistic.toFixed(2)})`);
  }
  const chosen = cost(RUNS_BY_ARM.R, RUNS_BY_ARM.O);
  console.log(
    `  THIS invocation (R=${RUNS_BY_ARM.R}, O=${RUNS_BY_ARM.O}): ${schedule.length} trials, projected $${chosen.toFixed(2)} at measured means ` +
      `(${chosen <= cap ? "within" : "OVER"} the cap)`,
  );
}

// ----------------------------------------------------------------- main

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const ledger0 = readLedger();
const spentBefore = ledgerTotal(ledger0);
console.log(
  `\nStudy 2 ${FOLLOWUP ? "FOLLOW-UP" : "native"} run ${runId}${PILOT ? " [PILOT — excluded from analysis]" : ""}${DRY ? " [DRY RUN]" : ""}`,
);
if (FOLLOWUP) {
  console.log(
    `arms=${ARMS.join(",")}  conditions=${conds.join(",")}  templates=${TEMPLATES.join(",")}  ` +
      ARMS.map((a) => `runs-${a}=${RUNS_BY_ARM[a]}`).join("  "),
  );
}
console.log(`seed=${SEED}  trials=${schedule.length}  models=${models.map((m) => `${m.vendor}:${m.model}`).join(", ")}`);
console.log(`ceiling this run=$${MAX_USD.toFixed(2)}  study ceiling=$${STUDY_BUDGET.toFixed(2)}  already spent (ledger)=$${spentBefore.toFixed(4)}`);

let projectedRun = 0;
for (const m of models) {
  const p = projectedTrialCost(m, ledger0);
  const n = schedule.filter((s) => s.vendor === m.vendor).length;
  projectedRun += p.meanUsd * n;
  console.log(
    `  projection ${m.model}: $${p.meanUsd.toFixed(4)}/trial x ${n} = $${(p.meanUsd * n).toFixed(2)}` +
      `  (per-trial gate $${p.usd.toFixed(4)})  [${p.basis}]`,
  );
}
const budgetLeft = Math.min(MAX_USD, STUDY_BUDGET - spentBefore);
console.log(`  projected run total: $${projectedRun.toFixed(2)} (budget left: $${budgetLeft.toFixed(2)})`);
// A28 §4: refuse to START a run whose projection exceeds the remainder. Applied to main
// runs; the pilot exists to produce the measurement and is bounded by the per-trial gate.
if (!DRY && !PILOT && projectedRun > budgetLeft) {
  die(4, `projected run cost $${projectedRun.toFixed(2)} exceeds the remaining budget $${budgetLeft.toFixed(2)} (A28 §4). Substitute a cheaper model or reduce --runs (never below 5), and log the choice as A29 first.`);
}
if (!PILOT && !FOLLOWUP && RUNS < 5) die(2, "A28 §4: runs per cell may never be reduced below 5");
if (FOLLOWUP) for (const a of ARMS) if (RUNS_BY_ARM[a] < 5) die(2, `runs per cell (arm ${a}) may never be below 5`);

if (DRY && FOLLOWUP) followupProjection(ledger0);

if (DRY) {
  console.log("\nschedule:");
  schedule.forEach((s, i) => console.log(`  ${i} ${s.arm ? `${s.arm} ` : ""}${s.vendor} ${s.template} ${s.condition} run${s.runIndex}`));
  if (FOLLOWUP) {
    // Local stimulus checks only (no network): every page and E's document load and hash.
    for (const c of conds) for (const t of TEMPLATES) loadPage(setFor(c), t, c, c === "E" ? GTIN_E : readFixtures()[FIXTURE_OF[c as "A"]].gtin!);
    if (conds.includes("E")) loadEDocument();
    console.log("\nstimulus: every scheduled page and E's document match stimulus/manifest.json");
  }
  process.exit(0);
}

for (const m of models) {
  const key = { openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY", kimi: "KIMI_API_KEY" }[m.vendor];
  if (!process.env[key]) die(1, `${key} is not set (repo-root .env)`);
}

await prepare();

mkdirSync(RESULTS, { recursive: true });
const base = `${RESULTS}${PILOT ? "pilot-native" : FOLLOWUP ? "followup" : "native"}-${runId}`;
const outFile = `${base}.jsonl`;
writeFileSync(
  `${base}.meta.json`,
  JSON.stringify(
    {
      runId,
      pilot: PILOT,
      seed: SEED,
      argv,
      startedAt: new Date().toISOString(),
      models,
      templates: TEMPLATES,
      conditions: conds,
      runsPerCell: FOLLOWUP ? RUNS_BY_ARM : RUNS,
      ...(FOLLOWUP
        ? {
            study: FOLLOWUP_STUDY,
            arms: ARMS,
            prompts: {
              R: { task: NATIVE_TASK, reportFormat: NATIVE_REPORT_FORMAT, taskSha256: sha256(NATIVE_TASK), reportFormatSha256: sha256(NATIVE_REPORT_FORMAT) },
              O: { task: OPEN_TASK, reportFormat: OPEN_REPORT_FORMAT, taskSha256: sha256(OPEN_TASK), reportFormatSha256: sha256(OPEN_REPORT_FORMAT) },
            },
            groundTruthArmR: GROUND_TRUTH,
            conditionE: { gtin: GTIN_E, url: E_UPI, servedAt: E_SERVED_URLS, host: E_HOST },
          }
        : {}),
      maxUsd: MAX_USD,
      studyBudgetUsd: STUDY_BUDGET,
      ledgerSpentBefore: spentBefore,
      tool: {
        description: FETCH_TOOL_DESCRIPTION,
        realAllowedHosts: REAL_ALLOWED_HOSTS,
        fictionalHosts: FOLLOWUP ? FOLLOWUP_FICTIONAL_HOSTS : FICTIONAL_HOSTS,
        maxFetches: MAX_FETCHES_PER_TRIAL,
        maxBodyChars: MAX_BODY_CHARS,
        requestHeaders: FETCH_REQUEST_HEADERS,
      },
      maxTurns: MAX_TURNS,
      system: NATIVE_SYSTEM,
      preflight: preflightSummary,
      facts,
      schedule,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

let runSpent = 0;
let stopped: string | null = null;
for (let i = 0; i < schedule.length; i++) {
  const item = schedule[i];
  const sel = models.find((m) => m.vendor === item.vendor)!;
  const ledger = readLedger();
  const remaining = Math.min(MAX_USD - runSpent, STUDY_BUDGET - ledgerTotal(ledger));
  const proj = projectedTrialCost(sel, ledger);
  if (proj.usd > remaining) {
    stopped = `before trial ${i} (${sel.model}): projected $${proj.usd.toFixed(4)} [${proj.basis}] exceeds remaining $${remaining.toFixed(4)}`;
    break;
  }
  const { row, cost, usage, budgetAborted } = await runTrial(item, i, runId, remaining);
  runSpent += cost;
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  appendLedger({
    at: row.timestamp,
    runId,
    pilot: PILOT,
    vendor: item.vendor,
    model: sel.model,
    costUsd: cost,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    aborted: budgetAborted || row.error !== null,
  });
  const status = row.error
    ? `ERROR ${row.error.slice(0, 100)}`
    : row.selfReport === null
      ? `NO REPORT (missing data, A9): ${row.parseError}`
      : "claims_status" in row.selfReport
        ? `${row.selfReport.claims_status} / ${row.selfReport.decision}`
        : `decision ${row.selfReport.decision}`;
  console.log(
    `[${i + 1}/${schedule.length}] ${item.arm ? `${item.arm} ` : ""}${sel.model} ${item.template}-${item.condition} run${item.runIndex}: ${status}` +
      `  fetches=${row.fetchCount} chain=${row.chainFollowed}${row.instrumentInvalid ? " INSTRUMENT_INVALID" : ""}` +
      `  tok=${usage.inputTokens}/${usage.outputTokens}  $${cost.toFixed(4)}  (run $${runSpent.toFixed(4)})`,
  );
  if (budgetAborted) {
    stopped = `during trial ${i}: ${row.error}`;
    break;
  }
}
console.log(`\nWrote ${outFile}\nrun spend $${runSpent.toFixed(4)}; ledger total $${ledgerTotal(readLedger()).toFixed(4)}`);
if (stopped) {
  console.error(`STOPPED BY BUDGET CEILING ${stopped}`);
  process.exit(4);
}
