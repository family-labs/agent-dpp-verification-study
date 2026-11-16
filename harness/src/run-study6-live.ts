/**
 * Study 6 LIVE trial runner (James, 23 Oct 2026): does a brand's own declaration let AI models tell
 * the brand's shop from a copycat, when each model browses the LIVE sites with its own vendor's tool?
 * Plan: STUDY6-LIVE-PLAN.md. Amendment: STUDY6-A36-DRAFT.md (must be registered first).
 *
 * One trial:
 *   system    "You are a helpful assistant."
 *   user      S6_QUESTION, a blank line, then the product page address with the trial's share tag
 *             (https://oskvale.com/products/<slug>?utm_source=share&utm_id=<8 chars>; F: oskvale-store.com)
 *   tools     the vendor's OWN web tool (agents/live-web.ts); Meta's models: OpenRouter's web fetch
 *   then      ONE fixed follow-up, same conversation, web tools off: the JSON report (S6_FOLLOW_UP)
 *   evidence  the Worker's access log for our two hosts (rows inside the trial's time window or
 *             carrying its tag) + the vendor's own record of every web action
 *
 * TIME BLOCKS (the live sites show one thing at a time; the Worker's phase switch):
 *   --block W      condition W      (site phase W: plain-claim product pages, no passport)
 *   --block D0     G-D0 and F-D0    (site phase D0: passport block, no declaration file)
 *   --block D1     G-D1 and F-D1    (site phase D1: the declaration file is published)
 *   --block drift  W again, after D1, one run per model and product (15 trials), labelled drift:
 *                  compared with the first W block to show whether answers moved over the study
 * The full schedule (3 products x 5 conditions x 5 models x 5 runs = 375, seed 20261020; Gemini only in
 * its postponed own-tool block, 75 more, seed 20261022) is built
 * once and shuffled; each block runs its own conditions in that order. Trials run ONE AT A TIME with a
 * gap, so the access log can never mix two trials.
 *
 * Usage (from harness/):
 *   bun run src/run-study6-live.ts --block D0 --dry-run              schedule + projection, nothing called
 *   bun run src/run-study6-live.ts --block D1 --mock-models          the whole pipeline offline: the real
 *        Worker code over the built bundle in memory, scripted fake vendors that visit it, no API call,
 *        no ledger entry; rows in results/mock-study6-live-*.jsonl, never analysed
 *   bun run src/run-study6-live.ts --block W --i-have-registered A36 [--max-usd N]
 *   bun run src/run-study6-live.ts --block W --pilot --i-have-registered A36 [--pilot-product lmt]
 *   options: --models openai,kimi,anthropic,glimmer,spark   (or --models gemini: the postponed own-tool block)
 *
 * Refusals (any run that calls a model API):
 *   - without `--i-have-registered A36` and a "### A36" heading in PREREGISTRATION.md;
 *   - if the Study 6 preflight (offline gates + live explorer) fails;
 *   - if the live site is not in the block's phase, or serves a bundle other than the local build, or
 *     any of the block's product pages is not served with its manifest bytes (checked at the start);
 *   - before any trial whose worst-case cost does not fit its vendor cap, the kind's total (counted
 *     USD 25, pilot USD 2) or --max-usd; the live cost is checked after every API call;
 *   - if the site's phase changes during the block (checked every 10 trials and at the end).
 * Exit codes: 0 complete, 1 precondition failed, 2 bad arguments, 4 stopped/shortened by budget, 5 site phase changed.
 */
import "./env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { liveAdapter, type LiveResult, type WebCall } from "./agents/live-web";
import { S6_FOLLOW_UP, S6_QUESTION, S6_SYSTEM, s6LiveUser, PROMPT_FORBIDDEN_RE } from "./prompts-study6";
import { scoreTrial } from "./study6-score";
import { attribute, bundleContentTypes, evidenceLog, localBundleSha, localSite, remoteSite, shareQuery, shareTag, TRIAL_GAP_MS, WINDOW_PAD_MS, type LogRow, type Phase, type SiteClient } from "./study6-site";
import { appendLiveLedger, callCost, KIND_CAP, liveKindSpent, liveVendorSpent, readLiveLedger, readPricing, RESULTS, type LiveKind, type Price } from "./study6-live-ledger";
import { ALL_LABELS, LIVE_VENDOR_CAPS, LIVE_WORST_CASE_USD, OPENROUTER_PINS, POOLED_LABELS, S6_MODELS, TOOL_FEE_SOURCES, type BillingVendor, type LiveLabel } from "./study6-live-models";
import { buildSchedule, S6_SEED } from "./study6-schedule";
import type { CallUsage } from "./types";
import { recordUrl } from "../../stimulus/study7";
import { DECLARATION_URL, givenUrlOf, itemRecordUrl, passportPageUrl, PRODUCT_KEYS, readS6Manifest, type ProductKey, type S6Cond } from "../../stimulus/study6";

/**
 * --study 7 (DRAFT, needs amendment A37): the same runner on the Study 7 format phases. Blocks S7F0,
 * S7F1, S7F3 run conditions G-D1 and F-D1 on that format's pages, 3 runs, seed 20261024; every row also
 * records whether the model opened the item's independent record (Study 7's record service).
 */
const STUDY_NO = (() => {
  const i = process.argv.indexOf("--study");
  return i >= 0 ? process.argv[i + 1] : "6";
})();
if (STUDY_NO !== "6" && STUDY_NO !== "7") {
  console.error("--study must be 6 or 7");
  process.exit(2);
}
const S7 = STUDY_NO === "7";
const STUDY = S7 ? "study7-live-page-formats" : "study6-live-brand-declaration";
const AMENDMENT = S7 ? "A37" : "A36";
const RUNS_COUNTED = S7 ? 3 : 5;
const S7_SEED = 20261024;
const SAFETY = 1.25;
const REPO = new URL("../../", import.meta.url);
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
const VALUED = new Set(["--block", "--models", "--max-usd", "--pilot-product", "--i-have-registered", "--resume", "--study"]);
const BOOL = new Set(["--dry-run", "--pilot", "--mock-models"]);
for (let i = 0; i < argv.length; i++) {
  if (VALUED.has(argv[i])) i++;
  else if (!BOOL.has(argv[i])) die(2, `unknown argument ${argv[i]}`);
}
const DRY = argv.includes("--dry-run");
const PILOT = argv.includes("--pilot");
const MOCK = argv.includes("--mock-models");
const API = !DRY && !MOCK;
if (DRY && MOCK) die(2, "--dry-run and --mock-models are exclusive");
const BLOCKS = S7
  ? ({ S7F0: { phase: "S7F0", conds: ["G-D1", "F-D1"] }, S7F1: { phase: "S7F1", conds: ["G-D1", "F-D1"] }, S7F3: { phase: "S7F3", conds: ["G-D1", "F-D1"] } } as const)
  : ({ W: { phase: "W", conds: ["W"] }, D0: { phase: "D0", conds: ["G-D0", "F-D0"] }, D1: { phase: "D1", conds: ["G-D1", "F-D1"] }, drift: { phase: "W", conds: ["W"] } } as const);
type BlockName = "W" | "D0" | "D1" | "drift" | "S7F0" | "S7F1" | "S7F3";
const BLOCK = flag("--block") as BlockName | undefined;
if (!BLOCK || !((BLOCKS as unknown as Record<string, unknown>)[BLOCK])) die(2, `--block must be one of ${Object.keys(BLOCKS).join(", ")}`);
if (PILOT && BLOCK === "drift") die(2, "the drift check is part of the counted run, not the pilot");
const BLK = (BLOCKS as unknown as Record<string, { phase: string; conds: readonly string[] }>)[BLOCK];
const PHASE = BLK.phase as Phase;
const KIND: LiveKind = PILOT ? "pilot" : "counted";

if (API) {
  if (flag("--i-have-registered") !== AMENDMENT) die(1, `a run that calls a model API needs \`--i-have-registered ${AMENDMENT}\` (append ${AMENDMENT} to PREREGISTRATION.md and push it first).`);
  const prereg = readFileSync(new URL("PREREGISTRATION.md", REPO), "utf8");
  if (!new RegExp(`^### ${AMENDMENT}\\b`, "m").test(prereg)) die(1, `PREREGISTRATION.md has no "### ${AMENDMENT}" heading: the amendment is not registered. No trial, counted or pilot, may run.`);
}
const MAX_USD = Number(flag("--max-usd") ?? KIND_CAP[KIND].toFixed(2));
if (!Number.isFinite(MAX_USD) || MAX_USD <= 0 || MAX_USD > KIND_CAP[KIND] + 1e-9) die(2, `--max-usd must be in (0, ${KIND_CAP[KIND]}] for a ${KIND} run`);
let PRODUCTS: ProductKey[] = [...PRODUCT_KEYS];
if (PILOT) {
  const pp = (flag("--pilot-product") ?? "lmt") as ProductKey;
  if (!PRODUCT_KEYS.includes(pp)) die(2, `--pilot-product must be one of ${PRODUCT_KEYS.join(",")}`);
  PRODUCTS = [pp];
}

const pricing = readPricing();
interface ModelSel {
  label: LiveLabel;
  vendor: BillingVendor;
  model: string;
  price: Price;
}
const models: ModelSel[] = (flag("--models") ?? ALL_LABELS.join(",")).split(",").map((s) => {
  const l = s.trim() as LiveLabel;
  const def = S6_MODELS[l];
  if (!def) die(2, `unknown model label "${l}" (${ALL_LABELS.join(", ")})`);
  const model = process.env[def.env] ?? def.fallback;
  const price = pricing.models[model];
  if (!price) die(1, `no price for "${model}" in harness/pricing.json`);
  return { label: l, vendor: def.vendor, model, price };
});
/**
 * Two counted schedules: the main one (the six ALL_LABELS, seed S6_SEED) and the POSTPONED Gemini
 * own-tool block (label "gemini" alone, seed S6_SEED + 2, all three time blocks), which runs only once
 * src/gemini-domain-probe.ts shows Gemini's URL tool reads both domains (checked before every block).
 */
const GEMINI_OWN = models.length === 1 && models[0].label === "gemini";
if (API && !PILOT && !GEMINI_OWN && (models.length !== ALL_LABELS.length || models.some((m) => !ALL_LABELS.includes(m.label)))) die(2, `a counted block runs the five registered labels (${ALL_LABELS.join(", ")}), or "gemini" alone for the postponed own-tool block`);
if (GEMINI_OWN && BLOCK === "drift") die(2, "the postponed Gemini block has no drift block");
if (API && models.some((m) => m.label === "geminifetch")) die(2, "geminifetch is not scheduled (James, 23 Oct 2026: no Gemini trials until its own tool reads the sites)");

// ----------------------------------------------------------------- schedule

const full = S7
  ? buildSchedule(models.map((m) => m.label), PRODUCTS, ["G-D1", "F-D1"], PILOT ? 1 : RUNS_COUNTED, S7_SEED + ["S7F0", "S7F1", "S7F3"].indexOf(BLOCK))
  : BLOCK === "drift"
    ? buildSchedule(models.map((m) => m.label), PRODUCTS, ["W"], 1, S6_SEED + 1)
    : buildSchedule(models.map((m) => m.label), PRODUCTS, ["W", "G-D0", "F-D0", "G-D1", "F-D1"], PILOT ? 1 : RUNS_COUNTED, GEMINI_OWN ? S6_SEED + 2 : S6_SEED);
/**
 * --resume <earlier results .jsonl of the SAME block>: continue an interrupted block. Every schedule item
 * that already has a row in that file is skipped, so no finished trial is run twice; the rest run in the
 * registered order. A trial that was in flight when the block was interrupted has no row and runs now
 * (its first completed attempt); the analysis reports every resume and the gap it leaves.
 */
const RESUME = flag("--resume");
const resumedDone = new Set<number>();
if (RESUME) {
  if (!existsSync(RESUME)) die(2, `--resume file ${RESUME} not found`);
  for (const line of readFileSync(RESUME, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as { block?: string; scheduleIndex?: number; kind?: string };
    if (r.block !== BLOCK) die(2, `--resume file holds block ${r.block}, not ${BLOCK}`);
    if (r.kind !== KIND) die(2, `--resume file holds ${r.kind} rows, not ${KIND}`);
    resumedDone.add(r.scheduleIndex!);
  }
}
const schedule = full
  .map((it, scheduleIndex) => ({ ...it, scheduleIndex }))
  .filter((it) => (BLK.conds as readonly string[]).includes(it.condition))
  .filter((it) => !resumedDone.has(it.scheduleIndex));
if (RESUME) console.log(`resuming ${RESUME}: ${resumedDone.size} trial(s) already done are skipped; ${schedule.length} remain`);

// ----------------------------------------------------------------- the scripted fake vendors (--mock-models only)

/** Deterministic scripts that VISIT the local Worker as a fetcher would; they model nothing about real models. */
async function mockVendor(label: LiveLabel, site: SiteClient, product: ProductKey, cond: S6Cond, url: string): Promise<LiveResult> {
  const calls: WebCall[] = [];
  const visit = async (u: string, ua: string) => {
    const r = await site.visit!(u, ua);
    calls.push({ tool: "mock", action: "fetch", url: u, query: null, ok: r.status === 200, detail: String(r.status), turn: 0 });
    return r;
  };
  const m = readS6Manifest(false)!;
  const fx = m.fixtures.products[product];
  const item = itemRecordUrl(m.explorerHost, fx.collection, fx.tokenId);
  const g = cond[0];
  const d1 = cond.endsWith("D1");
  let genuine = "yes";
  let seller = "yes";
  let text = "The listing looks consistent.";
  switch (label) {
    case "openai": // opens the page, the declaration in D1, and (vendor-reported only) the item record
      await visit(url, "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)");
      if (d1) await visit(DECLARATION_URL, "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)");
      if (g !== "W") calls.push({ tool: "mock", action: "open_page", url: item, query: null, ok: true, detail: "vendor-reported", turn: 0 });
      seller = g === "W" ? "unsure" : g === "G" ? "yes" : d1 ? "no" : "yes";
      text = d1 && g === "F" ? "I checked the declaration and the item record: the brand's account holds the item, not this seller." : text;
      break;
    case "gemini": // own tool (postponed block): reads only the given page
    case "geminifetch":
      await visit(url, "Google");
      seller = g === "F" ? "unsure" : "yes";
      break;
    case "kimi": // claims an explorer look-up it never made
      await visit(url, "Kimi-Fetcher");
      text = "I verified the item on the explorer and it is held by the seller.";
      break;
    case "anthropic": // the page and the passport page
      await visit(url, "Claude-User");
      if (g !== "W") await visit(passportPageUrl(product), "Claude-User");
      seller = g === "G" ? "yes" : "unsure";
      genuine = g === "W" ? "unsure" : "yes";
      text = "I opened the passport page on the brand's site.";
      break;
    case "glimmer": // the vendor serves a cached copy: no access-log row
      calls.push({ tool: "mock", action: "fetch", url, query: null, ok: true, detail: "cache", turn: 0 });
      return { text: "Looks fine.", followUpText: "Genuine: yes. Seller has it: yes.", webCalls: calls, fees: { searches: 0, fetches: 0, usd: 0 }, mainCalls: 1, mainLoopLimit: false, raw: [], reportedCostUsd: 0, provider: ["mock"] };
    default: // spark: a 404 guess on the copycat host
      await visit(url, "OpenRouter");
      await visit(url.replace(/\/products\/.*/, "/.well-known/product-passports.json"), "OpenRouter");
  }
  return { text, followUpText: "```json\n" + JSON.stringify({ genuine, seller_has_item: seller, reasons: [text] }) + "\n```", webCalls: calls, fees: { searches: 0, fetches: calls.length, usd: 0 }, mainCalls: 1, mainLoopLimit: false, raw: [], reportedCostUsd: null, provider: [] };
}

// ----------------------------------------------------------------- budget gate

function trialGate(sel: ModelSel): number {
  const l = readLiveLedger();
  const seen = l.entries.filter((e) => e.model === sel.model && !e.aborted && e.kind !== "check").map((e) => e.costUsd);
  return (seen.length ? Math.max(...seen) : LIVE_WORST_CASE_USD[sel.label]) * SAFETY;
}

// ----------------------------------------------------------------- main

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const projection = models.map((m) => ({ m, n: schedule.filter((s) => s.label === m.label).length })).map((x) => ({ ...x, usd: x.n * LIVE_WORST_CASE_USD[x.m.label] * SAFETY }));
const projTotal = projection.reduce((s, x) => s + x.usd, 0);
console.log(`\nStudy ${STUDY_NO} LIVE, block ${BLOCK} (site phase ${PHASE}), run ${runId}${MOCK ? " [MOCK MODELS: local site, no API call]" : PILOT ? " [PILOT]" : DRY ? " [DRY RUN]" : ""}`);
console.log(`products=${PRODUCTS.join(",")} conditions=${BLK.conds.join(",")} trials=${schedule.length} (seed ${S7 ? S7_SEED + ["S7F0", "S7F1", "S7F3"].indexOf(BLOCK) : BLOCK === "drift" ? S6_SEED + 1 : S6_SEED})`);
console.log(`models=${models.map((m) => `${m.label}=${m.model}`).join(", ")}; pooled primary: ${POOLED_LABELS.join(", ")}`);
console.log(`user: ${JSON.stringify(S6_QUESTION)} + "\\n\\n" + <page address with share tag>\nfollow-up: ${JSON.stringify(S6_FOLLOW_UP)}`);
console.log(`worst-case projection x ${SAFETY}: ${projection.map((x) => `${x.m.label} ${x.n} x $${(LIVE_WORST_CASE_USD[x.m.label] * SAFETY).toFixed(3)}`).join("; ")} = $${projTotal.toFixed(2)}`);
const l0 = readLiveLedger();
console.log(`ledger: ${KIND} $${liveKindSpent(l0, KIND).toFixed(4)} of $${KIND_CAP[KIND].toFixed(2)}; ${[...new Set(models.map((m) => m.vendor))].map((v) => `${v} $${liveVendorSpent(l0, v).toFixed(3)}/${LIVE_VENDOR_CAPS[v]}`).join(", ")}`);
if (PROMPT_FORBIDDEN_RE.test(S6_SYSTEM) || PROMPT_FORBIDDEN_RE.test(S6_QUESTION) || PROMPT_FORBIDDEN_RE.test(S6_FOLLOW_UP)) die(1, "a prompt names a checking method (PROMPT_FORBIDDEN_RE)");
if (DRY) {
  schedule.slice(0, 12).forEach((s, i) => console.log(`  ${i} [${s.scheduleIndex}] ${s.label} ${s.product} ${s.condition} run${s.runIndex}`));
  process.exit(0);
}

const manifest = readS6Manifest(false);
if (!manifest) die(1, "stimulus/study6/manifest.json missing (stimulus/build-study6.ts --write)");
const site: SiteClient = MOCK ? await localSite() : remoteSite();
const ct = bundleContentTypes();
if (MOCK) await site.setPhase(PHASE, `mock run ${runId}`);
if (API) {
  const { runStudy6Preflight, printStudy6Preflight } = await import("./preflight-study6");
  const pf = await runStudy6Preflight({ mock: false, live: true });
  printStudy6Preflight(pf);
  if (!pf.ok) die(1, "Study 6 preflight FAILED. No trial may run.");
  for (const m of models) if (!process.env[S6_MODELS[m.label].key]) die(1, `${S6_MODELS[m.label].key} is not set`);
  if (models.some((m) => m.label === "gemini")) {
    const { geminiReadsDomains } = await import("./gemini-domain-probe");
    const g = await geminiReadsDomains();
    if (!g.ok) die(1, `Gemini's own URL tool still refuses the shop domains (${JSON.stringify(g.statuses)}): its block stays postponed.`);
  }
}
const h = await site.health();
if (h.phase !== PHASE) die(1, `the site shows phase ${h.phase}; block ${BLOCK} needs ${PHASE} (switch it with src/site-admin.ts phase ${PHASE})`);
if (h.bundleSha256 !== localBundleSha()) die(1, `the site serves bundle ${h.bundleSha256.slice(0, 16)}, not the local build ${String(localBundleSha()).slice(0, 16)}`);
if (h.mock) die(1, "the site serves a MOCK bundle");
// the block's pages, read once as a plain client would (these rows fall outside every trial window)
for (const p of PRODUCTS)
  for (const c of BLK.conds as readonly S6Cond[]) {
    const key = S7 ? `${PHASE.slice(2)}/${p}/${c.startsWith("F") ? "lookalike-F" : "store-G"}` : c === "W" ? `${p}/store-W` : c.startsWith("F") ? `${p}/lookalike-F-${c.slice(2)}` : `${p}/store-G-${c.slice(2)}`;
    const url = givenUrlOf(p, c);
    const r = MOCK ? await site.visit!(url, "study6-harness-preflight") : await fetch(url, { headers: { "User-Agent": "study6-harness-preflight" }, signal: AbortSignal.timeout(20_000) }).then(async (x) => ({ status: x.status, body: await x.text() }));
    const want = S7 ? (JSON.parse(readFileSync(new URL("stimulus/study7/manifest.json", REPO), "utf8")) as { stimuli: Record<string, { sha256: string }> }).stimuli[key].sha256 : manifest.stimuli[key].sha256;
    if (r.status !== 200 || sha256(r.body) !== want) die(1, `${url} is not served with ${key}'s bytes in phase ${PHASE} (${r.status})`);
  }
console.log(`site: phase ${h.phase}, bundle ${h.bundleSha256.slice(0, 16)} (= local build), the block's ${PRODUCTS.length * BLK.conds.length} product pages served with their manifest bytes`);

mkdirSync(RESULTS, { recursive: true });
const base = `${RESULTS}${MOCK ? `mock-study${STUDY_NO}-live` : PILOT ? `pilot-study${STUDY_NO}-live` : `study${STUDY_NO}-live`}-${BLOCK}-${runId}`;
const rawDir = `${base}.raw`;
mkdirSync(rawDir, { recursive: true });
writeFileSync(
  `${base}.meta.json`,
  JSON.stringify({ runId, study: STUDY, block: BLOCK, phase: PHASE, resumeOf: RESUME ?? null, resumedSkipped: [...resumedDone], kind: MOCK ? "mock" : KIND, argv, startedAt: new Date().toISOString(), models, prompts: { system: S6_SYSTEM, question: S6_QUESTION, layout: 'question + "\\n\\n" + page address with "?utm_source=share&utm_id=<8 chars>"', followUp: S6_FOLLOW_UP }, toolFeeSources: TOOL_FEE_SOURCES, vendorCaps: LIVE_VENDOR_CAPS, kindCap: KIND_CAP[KIND], maxUsd: MAX_USD, site: h, window: { padMs: WINDOW_PAD_MS, gapMs: TRIAL_GAP_MS }, schedule }, null, 2) + "\n",
  "utf8",
);

let lastLogId = (await site.logSince(0)).requests.reduce((m, r) => Math.max(m, r.id), 0);
let runSpent = 0;
let stopped: string | null = null;
const exhausted = new Set<BillingVendor>();
const skipped: unknown[] = [];
class BudgetAbort extends Error {}

for (let i = 0; i < schedule.length; i++) {
  const it = schedule[i];
  const sel = models.find((m) => m.label === it.label)!;
  let remaining = Infinity;
  if (API) {
    if (exhausted.has(sel.vendor)) {
      skipped.push({ i, it, reason: `${sel.vendor} cap` });
      continue;
    }
    const l = readLiveLedger();
    const vendorRem = LIVE_VENDOR_CAPS[sel.vendor] - liveVendorSpent(l, sel.vendor);
    const kindRem = KIND_CAP[KIND] - liveKindSpent(l, KIND);
    const gate = trialGate(sel);
    if (gate > vendorRem) {
      exhausted.add(sel.vendor);
      skipped.push({ i, it, reason: `${sel.vendor} cap: projected $${gate.toFixed(4)} > remaining $${vendorRem.toFixed(4)}` });
      console.log(`[${i + 1}/${schedule.length}] VENDOR STOPPED: ${sel.vendor}`);
      continue;
    }
    if (gate > Math.min(kindRem, MAX_USD - runSpent)) {
      stopped = `before trial ${i}: projected $${gate.toFixed(4)} exceeds the remaining $${Math.min(kindRem, MAX_USD - runSpent).toFixed(4)}`;
      break;
    }
    remaining = Math.min(vendorRem, kindRem, MAX_USD - runSpent);
  }
  if (i > 0 && i % 10 === 0) {
    const ph = (await site.health()).phase;
    if (ph !== PHASE) {
      stopped = `the site's phase changed to ${ph} before trial ${i}`;
      break;
    }
  }

  const tag = shareTag();
  const givenUrl = givenUrlOf(it.product, it.condition) + shareQuery(tag);
  const user = s6LiveUser(givenUrl);
  const usage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const returned = new Set<string>();
  let tokens = 0;
  let out: LiveResult | null = null;
  let error: string | null = null;
  let budgetAborted = false;
  const startMs = Date.now();
  try {
    if (MOCK) out = await mockVendor(sel.label, site, it.product, it.condition, givenUrl);
    else
      out = await liveAdapter(sel.vendor, sel.model, OPENROUTER_PINS[sel.model], sel.label).run({
        system: S6_SYSTEM,
        user,
        followUp: S6_FOLLOW_UP,
        onUsage: (u: CallUsage) => {
          usage.calls++;
          usage.inputTokens += u.inputTokens;
          usage.cachedInputTokens += u.cachedInputTokens;
          usage.outputTokens += u.outputTokens;
          usage.reasoningTokens += u.reasoningTokens;
          if (u.modelReturned) returned.add(u.modelReturned);
          tokens += callCost(sel.price, u);
          if (tokens > remaining) throw new BudgetAbort(`trial token cost ${tokens.toFixed(4)} crossed the remaining budget ${remaining.toFixed(4)}`);
        },
      });
  } catch (e) {
    budgetAborted = e instanceof BudgetAbort;
    error = e instanceof Error ? e.message : String(e);
  }
  const endMs = Date.now();
  await sleep(MOCK ? 0 : TRIAL_GAP_MS);
  const fresh = await site.logSince(lastLogId);
  const rowsAll: LogRow[] = fresh.requests;
  if (rowsAll.length) lastLogId = rowsAll[rowsAll.length - 1].id;
  const att = MOCK ? { rows: rowsAll, taggedOutsideWindow: [] as number[], tagSeen: rowsAll.some((r) => r.query.includes(tag)), backgroundRows: 0 } : attribute(rowsAll, { startMs, endMs, tag, vendor: sel.label, requested: (out?.webCalls ?? []).map((c) => c.url) });
  const unattributed = rowsAll.filter((r) => !att.rows.includes(r) && /^\/(products|01|doc|\.well-known\/product-passports)/.test(r.path)).map((r) => ({ id: r.id, ts: r.ts, host: r.host, path: r.path, ua: r.ua }));
  const calls = out?.webCalls ?? [];
  const ev = evidenceLog(att.rows, calls, ct, new Date(startMs).toISOString());
  const fees = out?.fees.usd ?? 0;
  const cost = Math.max(tokens + fees, out?.reportedCostUsd ?? 0);
  runSpent += cost;
  const text = out?.text ?? "";
  const followUpText = out?.followUpText ?? "";
  const sc = scoreTrial({ product: it.product, condition: it.condition, givenUrl, explorerHost: manifest.explorerHost, fixtures: manifest.fixtures }, ev.log, text, followUpText);
  const rawFile = `${rawDir}/${String(i).padStart(4, "0")}-${it.label}.json`;
  writeFileSync(rawFile, JSON.stringify(out?.raw ?? [], null, 1));
  const row = {
    study: STUDY,
    block: BLOCK,
    kind: MOCK ? "mock" : KIND,
    pilot: PILOT,
    drift: BLOCK === "drift",
    resumeOf: RESUME ?? null,
    mock: MOCK,
    runId,
    seed: BLOCK === "drift" ? S6_SEED + 1 : S6_SEED,
    scheduleIndex: it.scheduleIndex,
    timestamp: new Date(startMs).toISOString(),
    window: { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), padMs: WINDOW_PAD_MS },
    label: sel.label,
    pooled: (POOLED_LABELS as readonly string[]).includes(sel.label),
    geminiOwnToolBlock: GEMINI_OWN,
    vendor: sel.vendor,
    modelRequested: MOCK ? `mock:${sel.label}` : sel.model,
    modelIdsReturned: [...returned],
    provider: out?.provider ?? [],
    product: it.product,
    condition: it.condition,
    runIndex: it.runIndex,
    shareTag: tag,
    givenUrl,
    systemSha256: sha256(S6_SYSTEM),
    userSha256: sha256(user),
    followUpSha256: sha256(S6_FOLLOW_UP),
    sitePhase: PHASE,
    siteBundleSha256: h.bundleSha256,
    usage,
    mainCalls: out?.mainCalls ?? null,
    mainLoopLimit: out?.mainLoopLimit ?? null,
    toolFees: out?.fees ?? null,
    costUsd: Number(cost.toFixed(6)),
    costTokensUsd: Number(tokens.toFixed(6)),
    costReportedUsd: out?.reportedCostUsd ?? null,
    ...sc,
    // Study 7: the item's independent record (the record service), opened = an answered fetch of its path
    recordOpened: S7 ? ev.log.some((e) => e.status === 200 && e.requestedUrl.split("?")[0] === recordUrl(it.product)) : null,
    givenPageFetchedLive: att.tagSeen,
    siteRows: att.rows,
    siteUserAgents: [...new Set(att.rows.map((r) => r.ua))],
    taggedOutsideWindow: att.taggedOutsideWindow,
    backgroundRowsInWindow: att.backgroundRows,
    unattributedRows: unattributed,
    vendorOnlySiteFetches: ev.vendorOnly,
    webCalls: calls,
    searches: calls.filter((c) => c.action === "search").map((c) => c.query),
    evidence: ev.log,
    rawFile,
    responseText: text,
    followUpText,
    error,
    budgetAborted,
    durationMs: endMs - startMs,
  };
  appendFileSync(`${base}.jsonl`, JSON.stringify(row) + "\n");
  if (API)
    appendLiveLedger({ at: row.timestamp, runId, kind: KIND, block: BLOCK, product: it.product, condition: it.condition, vendor: sel.vendor, model: sel.model, costUsd: cost, toolFeesUsd: fees, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, aborted: budgetAborted || error !== null });
  console.log(
    `[${i + 1}/${schedule.length}] ${sel.label} ${it.product} ${it.condition}: ${error ? `ERROR ${error.slice(0, 100)}` : `genuine=${row.genuine ?? "MISSING"} seller=${row.sellerHasItem ?? "MISSING"}`} live=${att.tagSeen} rows=${att.rows.length} web=${calls.length} decl=${row.declarationFetched} item=${row.explorerItemFetched} invented=${row.inventedVerification} $${cost.toFixed(4)} (run $${runSpent.toFixed(3)})`,
  );
  if (budgetAborted) {
    stopped = `during trial ${i}: ${error}`;
    break;
  }
}
const endPhase = (await site.health()).phase;
if (skipped.length) writeFileSync(`${base}.skipped.json`, JSON.stringify(skipped, null, 2) + "\n");
console.log(`\nWrote ${base}.jsonl; run spend $${runSpent.toFixed(4)}; site phase at end ${endPhase}`);
if (endPhase !== PHASE) {
  console.error(`SITE PHASE CHANGED during the block (now ${endPhase}).`);
  process.exit(5);
}
if (stopped || skipped.length) {
  console.error(`STOPPED/SHORTENED BY BUDGET: ${stopped ?? `${skipped.length} skipped`}`);
  process.exit(4);
}
