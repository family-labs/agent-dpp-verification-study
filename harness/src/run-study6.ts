/**
 * Study 6 trial runner: does a brand's own declaration let AI models tell who really has the item?
 * Spec: STUDY6-DESIGN-DRAFT.md; amendment text: STUDY6-A36-DRAFT.md (NOT registered when this was
 * written). Studies 2-5's runners, adapters and stimuli are NOT edited. Reused unchanged: fetch_url
 * (fetch-tool.ts, with a Study 6 allow-list passed in), the Study 4 conversation adapters with their
 * ONE follow-up (agents/conversation.ts), the OpenRouter adapter and pins (agents/openrouter.ts,
 * study5-models.ts), Study 5's pricing and cost formula (study5-ledger.ts).
 *
 * One trial:
 *   system    "You are a helpful assistant."
 *   user      S6_QUESTION + "Page URL: <url>" + the page HTML (prompts-study6.ts)
 *   tool      fetch_url only: GET, no JavaScript, no search; stored pages on oskvale.com (the brand's shop)
 *             and oskvale-store.com (the copycat shop of condition F) (404 elsewhere on them); the
 *             public LUKSO MAINNET explorer host live on every path; every other host (ours included)
 *             "not reachable"; 8 fetches, 30,000 chars.
 *   then      ONE fixed follow-up, same conversation, tools declared but off: the JSON report
 *             {"genuine", "seller_has_item", "reasons"} (S6_FOLLOW_UP).
 * Cells: 3 products x {G-D0, F-D0, G-D1, F-D1, W} x 6 models x 4 runs = 360, one seeded shuffle.
 *
 * Usage (from harness/):
 *   bun run src/run-study6.ts --dry-run [--mock]           schedule + projection; no API call, no network
 *   bun run src/run-study6.ts --mock-models [--mock]       the WHOLE pipeline with a scripted fake model:
 *        no API call, no network (canned explorer JSON served from memory), no ledger entry; rows
 *        labelled mock in results/mock-study6-*.jsonl, excluded from every analysis by default
 *   bun run src/run-study6.ts --i-have-registered A36 [--max-usd 10] [--runs 4] [--seed N] ...
 *   bun run src/run-study6.ts --pilot --i-have-registered A36 [--pilot-product lmt] [--max-usd 1]
 *        at most ONE trial per cell for ONE product (5 cells x 6 models = 30); rows pilot=true,
 *        results/pilot-study6-*.jsonl, excluded from every analysis
 *   options: --models openai,gemini,kimi,anthropic,glimmer,spark  --products lmt,industrial,stationary
 *            --conditions G-D0,F-D0,G-D1,F-D1,W
 *
 * Refusals (any run that would call a model API):
 *   - without `--i-have-registered A36`, or if PREREGISTRATION.md has no "### A36" heading;
 *   - on MOCK stimuli (testnet collections), or if fixtures/study6-conditions.json has a null id;
 *   - if the Study 6 preflight (preflight-study6.ts, offline gates + live explorer gate) fails;
 *   - if --max-usd exceeds USD 10.00 (counted) or USD 1.00 (pilot);
 *   - before any trial whose projected cost does not fit what remains of: its vendor's cap, the
 *     study's counted total (USD 10.00) or pilot total (USD 1.00) in the Study 6 ledger, and
 *     --max-usd for this invocation. The live cost is checked after every API call.
 *
 * Mock stimuli (--mock) point at the TESTNET collections A/B/C and the testnet explorer; counted
 * stimuli point at LUKSO MAINNET (chain 42) from fixtures/study6-conditions.json.
 *
 * Exit codes: 0 complete, 1 precondition failed, 2 bad arguments, 4 stopped/shortened by budget.
 */
import "./env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { conversationAdapter } from "./agents/conversation";
import { OPENROUTER_MAX_TOKENS, openRouterConversation, type OrCallMeta } from "./agents/openrouter";
import { FETCH_REQUEST_HEADERS, FETCH_TOOL_DESCRIPTION, MAX_BODY_CHARS, MAX_FETCHES_PER_TRIAL, type FetchToolHandle, type StoredPage } from "./fetch-tool";
import { S6_FOLLOW_UP, S6_QUESTION, S6_SYSTEM } from "./prompts-study6";
import { scoreTrial } from "./study6-score";
import { fetchToolFor, setupFor, type S6TrialSetup } from "./study6-stimulus";
import { appendLedger, callCost, readLedger, readPricing, RESULTS, totalSpent, vendorSpent, type Price, type S6Ledger } from "./study6-ledger";
import { ALL_LABELS, OPENROUTER_PINS, OPENROUTER_TOOLS_OFF, S6_COUNTED_TOTAL_CAP, S6_MODELS, S6_PILOT_TOTAL_CAP, S6_VENDOR_CAPS, type BillingVendor, type ModelLabel } from "./study6-models";
import type { CallUsage } from "./types";
import {
  collectionRecordUrl,
  DECLARATION_URL,
  fixtureProblems,
  itemRecordUrl,
  passportPageUrl,
  PRODUCT_KEYS,
  readFixtures,
  readS6Manifest,
  S6_CONDS,
  tokenIdHex,
  type ProductKey,
  type ResolvedFixtures,
  type S6Cond,
} from "../../stimulus/study6";

const STUDY = "study6-brand-declaration";
export { S6_SEED } from "./study6-schedule";
import { buildSchedule as sharedSchedule, S6_SEED, type Item } from "./study6-schedule";
const RUNS_DEFAULT = 4;
const MAX_TURNS = 12;
/**
 * Projection, fixed a priori: per trial = INFLATION x the model's Study 5 COUNTED mean cost
 * (results-archive), x SAFETY. Since 22 Oct 2026 a Study 6 trial carries a full shop page in the
 * prompt (~9.3 KB, against Study 5's ~2.2 KB) and its fetchable bodies are a whole shop (product
 * pages ~9 KB, site pages 2-3.5 KB, declaration 0.6 KB, item JSON ~1.5 KB, collection logs ~13 KB). A
 * rough token estimate (the extra page bytes on every call plus two larger fetches) puts the trial
 * cost at 1.5-1.8 x Study 5 for five models and ~3.4 x for gpt-5.4-mini, ~USD 9.5 in all with SAFETY:
 * inside the cap but with little room. The pilot measures it; the per-trial gate uses the dearest
 * Study 6 trial seen once there is one, and the live cost is checked after every API call.
 */
export const INFLATION = 1.5;
const SAFETY = 1.25;
const MEASURED_FILE = "results-archive/study5-2026-10-15T23-55-41-521Z.jsonl";
export const BROWSING_NOTE =
  "fetch_url is GET-only with no JavaScript and no search: it emulates the simplest browsing of a free consumer AI app. The brand shop (oskvale.com: product, passport, declaration-of-conformity, returns, warranty and contact pages, and in D1 its declaration) and the copycat shop (oskvale-store.com) are stored pages served by the harness (neither host is fetched; neither is in DNS); the only live host is the public LUKSO explorer (its JSON API answers a plain GET; its HTML pages are JavaScript-rendered and hold no data). Our platform hosts are not reachable.";

const REPO = new URL("../../", import.meta.url);
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
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
const VALUED = new Set(["--models", "--products", "--conditions", "--runs", "--max-usd", "--seed", "--pilot-product", "--i-have-registered"]);
const BOOL = new Set(["--dry-run", "--pilot", "--mock", "--mock-models"]);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUED.has(a)) i++;
  else if (!BOOL.has(a)) die(2, `unknown argument ${a}`);
}
const DRY = argv.includes("--dry-run");
const PILOT = argv.includes("--pilot");
const MOCK_STIMULI = argv.includes("--mock");
const MOCK_MODELS = argv.includes("--mock-models");
const API = !DRY && !MOCK_MODELS;
if (DRY && MOCK_MODELS) die(2, "--dry-run and --mock-models are exclusive");

const registered = flag("--i-have-registered");
if (API) {
  if (registered !== "A36") die(1, "a run that calls a model API needs `--i-have-registered A36` (append A36 to PREREGISTRATION.md and push it first).");
  const prereg = readFileSync(new URL("PREREGISTRATION.md", REPO), "utf8");
  if (!/^### A36\b/m.test(prereg)) die(1, 'PREREGISTRATION.md has no "### A36" heading: the amendment is not registered. No trial, counted or pilot, may run.');
  if (MOCK_STIMULI) die(1, "--mock stimuli (testnet collections) are never sent to a model API, not even as a pilot.");
}
const ceiling = PILOT ? S6_PILOT_TOTAL_CAP : S6_COUNTED_TOTAL_CAP;
const MAX_USD = Number(flag("--max-usd") ?? ceiling.toFixed(2));
if (!Number.isFinite(MAX_USD) || MAX_USD <= 0) die(2, "--max-usd is not a positive number");
if (MAX_USD > ceiling + 1e-9) die(2, `--max-usd ${MAX_USD} exceeds the Study 6 ${PILOT ? "pilot" : "counted"} cap of USD ${ceiling.toFixed(2)}`);
const seedRaw = flag("--seed");
const SEED = seedRaw === undefined ? S6_SEED : Number(seedRaw);
if (!Number.isInteger(SEED)) die(2, `--seed "${seedRaw}" is not an integer`);
if (API && !PILOT && SEED !== S6_SEED) die(2, `counted trials use the registered seed ${S6_SEED}`);
const CONDS = (flag("--conditions") ?? S6_CONDS.join(",")).split(",").map((x) => x.trim().toUpperCase()) as S6Cond[];
if (CONDS.some((c) => !S6_CONDS.includes(c)) || new Set(CONDS).size !== CONDS.length) die(2, `--conditions must be drawn from ${S6_CONDS.join(",")}`);
let PRODUCTS = (flag("--products") ?? PRODUCT_KEYS.join(",")).split(",").map((x) => x.trim().toLowerCase()) as ProductKey[];
if (PRODUCTS.some((p) => !PRODUCT_KEYS.includes(p)) || new Set(PRODUCTS).size !== PRODUCTS.length) die(2, `--products must be drawn from ${PRODUCT_KEYS.join(",")}`);
if (PILOT) {
  const pp = (flag("--pilot-product") ?? "lmt") as ProductKey;
  if (!PRODUCT_KEYS.includes(pp)) die(2, `--pilot-product must be one of ${PRODUCT_KEYS.join(",")}`);
  if (flag("--products") !== undefined) die(2, "--pilot takes --pilot-product, not --products (one product only)");
  PRODUCTS = [pp];
}
const runsRaw = flag("--runs");
const RUNS = PILOT ? 1 : runsRaw === undefined ? RUNS_DEFAULT : Number(runsRaw);
if (PILOT && runsRaw !== undefined && Number(runsRaw) !== 1) die(2, "--pilot runs at most ONE trial per cell");
if (!Number.isInteger(RUNS) || RUNS < 1) die(2, `--runs "${runsRaw}" is not a positive integer`);
if (API && !PILOT && RUNS !== RUNS_DEFAULT) die(2, `counted trials use the registered ${RUNS_DEFAULT} runs per cell`);

const pricing = readPricing();
interface ModelSel {
  label: ModelLabel;
  vendor: BillingVendor;
  model: string;
  price: Price;
}
const models: ModelSel[] = (flag("--models") ?? ALL_LABELS.join(",")).split(",").map((s) => {
  const l = s.trim() as ModelLabel;
  const def = S6_MODELS[l];
  if (!def) die(2, `unknown model label "${l}" (${ALL_LABELS.join(", ")})`);
  const model = process.env[def.env] ?? def.fallback;
  const price = pricing.models[model];
  if (!price) die(1, `no price for "${model}" in harness/pricing.json`);
  if (price.vendor !== def.vendor) die(2, `"${model}" is priced as a ${price.vendor} model, not ${def.vendor}`);
  if (def.vendor === "openrouter" && !OPENROUTER_PINS[model]) die(2, `no provider pin for ${model}`);
  return { label: l, vendor: def.vendor, model, price };
});
if (new Set(models.map((m) => m.label)).size !== models.length) die(2, "each model label once");
const VENDORS_USED = [...new Set(models.map((m) => m.vendor))];

// ----------------------------------------------------------------- stimuli + fixtures

const manifest = readS6Manifest(MOCK_STIMULI);
if (!manifest) die(1, `${MOCK_STIMULI ? "stimulus/study6/mock" : "stimulus/study6"}/manifest.json missing (run stimulus/build-study6.ts ${MOCK_STIMULI ? "--mock" : "--write"}).`);
if (!MOCK_STIMULI) {
  const bad = fixtureProblems(readFixtures());
  if (bad.length) die(1, `fixtures/study6-conditions.json is incomplete (${bad.join("; ")}).`);
}
const FX: ResolvedFixtures = manifest.fixtures;

// ----------------------------------------------------------------- projection

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function study5(model: string): number[] {
  const p = new URL(MEASURED_FILE, REPO);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { modelRequested: string; costUsd: number; pilot?: boolean })
    .filter((r) => r.modelRequested === model && !r.pilot)
    .map((r) => r.costUsd);
}
function trialGate(sel: ModelSel, ledger: S6Ledger): { usd: number; basis: string } {
  const seen = ledger.entries.filter((e) => e.model === sel.model && !e.aborted).map((e) => e.costUsd);
  if (seen.length) return { usd: Math.max(...seen) * SAFETY, basis: `${SAFETY} x dearest of ${seen.length} Study 6 trial(s)` };
  const s5 = study5(sel.model);
  if (!s5.length) return { usd: Infinity, basis: "no measurement" };
  return { usd: Math.max(...s5) * INFLATION * SAFETY, basis: `${SAFETY} x ${INFLATION} x Study 5 max $${Math.max(...s5).toFixed(5)}` };
}
function projection() {
  const n = PRODUCTS.length * CONDS.length * RUNS;
  const perModel = models.map((m) => {
    const s5 = study5(m.model);
    const each = s5.length ? mean(s5) * INFLATION * SAFETY : NaN;
    return { m, n, total: each * n, line: s5.length ? `${m.label} ${m.model}: ${n} x $${each.toFixed(5)} (${INFLATION} x Study 5 mean $${mean(s5).toFixed(5)}, n=${s5.length}, x ${SAFETY}) = $${(each * n).toFixed(2)}` : `${m.label} ${m.model}: NO MEASUREMENT` };
  });
  const perVendor = Object.fromEntries(VENDORS_USED.map((v) => [v, perModel.filter((x) => x.m.vendor === v).reduce((s, x) => s + x.total, 0)])) as Record<BillingVendor, number>;
  return { perModel, perVendor, total: perModel.reduce((s, x) => s + x.total, 0) };
}

// ----------------------------------------------------------------- schedule

export const buildSchedule = sharedSchedule;

// ----------------------------------------------------------------- the scripted fake model (--mock-models only)

/** Canned explorer bodies in the measured testnet shape (evidence/study6-explorer-shape-testnet-2026-10-20.txt), owner = the fixture profile. */
function cannedExplorer(fx: ResolvedFixtures, host: string): StoredPage[] {
  const pages: StoredPage[] = [];
  for (const p of PRODUCT_KEYS) {
    const f = fx.products[p];
    pages.push({ url: itemRecordUrl(host, f.collection, f.tokenId), contentType: "application/json; charset=utf-8", html: JSON.stringify({ id: tokenIdHex(f.tokenId), is_unique: true, owner: { hash: fx.profileAddress, is_contract: true }, token: { address_hash: f.collection, type: "LSP8", holders_count: "1", total_supply: "1" } }) });
    pages.push({ url: collectionRecordUrl(host, f.collection), contentType: "application/json; charset=utf-8", html: JSON.stringify({ items: [{ decoded: { method_call: "OwnershipTransferred(address indexed previousOwner, address indexed newOwner)", parameters: [{ name: "newOwner", value: fx.profileAddress }] } }], next_page_params: null }) });
  }
  return pages;
}
/**
 * Deterministic scripts, one per label, so the pipeline (fetch log, report parse, invented
 * verification, analysis) sees varied behaviour. They model NOTHING about real models.
 */
async function mockModel(label: ModelLabel, s: S6TrialSetup, tool: FetchToolHandle, runIndex: number): Promise<{ text: string; followUpText: string; toolCalls: Array<{ name: string; input: unknown; result?: string; turn: number }> }> {
  const calls: Array<{ name: string; input: unknown; result?: string; turn: number }> = [];
  const get = async (url: string) => {
    const result = await tool.spec.execute({ url });
    calls.push({ name: "fetch_url", input: { url }, result, turn: calls.length });
    return result;
  };
  const fx = s.manifest.fixtures.products[s.product];
  const item = itemRecordUrl(s.explorerHost, fx.collection, fx.tokenId);
  const g = s.condition[0];
  const d1 = s.condition.endsWith("D1");
  let seller: string, genuine: string, text: string;
  switch (label) {
    case "openai": // reads the declaration and the item record; discriminates only in D1
      if (d1) await get(DECLARATION_URL);
      if (g !== "W") await get(item);
      seller = g === "W" ? "unsure" : g === "G" ? "yes" : d1 ? "no" : "yes";
      genuine = g === "W" ? "unsure" : "yes";
      text = d1 && g === "F" ? "I checked the declaration and the item record: the brand's account holds the item, not this seller." : "The listing looks consistent.";
      break;
    case "gemini": // never fetches; cautious about the lookalike shop in both arms
      seller = g === "F" ? "unsure" : "yes";
      genuine = "yes";
      text = "It appears to be a normal listing.";
      break;
    case "kimi": // claims an explorer look-up it never made
      seller = "yes";
      genuine = "yes";
      text = "I verified the item on the explorer and it is held by the seller.";
      break;
    case "anthropic": // opens the passport page, then answers unsure on everything but G
      if (g !== "W") await get(passportPageUrl(s.product));
      seller = g === "G" ? "yes" : "unsure";
      genuine = g === "W" ? "unsure" : "yes";
      text = "I opened the passport page on the brand's site.";
      break;
    case "glimmer": // malformed report on even runs (missing data)
      seller = "yes";
      genuine = "yes";
      text = "Looks fine.";
      if (runIndex % 2 === 0) return { text, followUpText: "Genuine: yes. Seller has it: yes.", toolCalls: calls };
      break;
    default: // spark: tries our platform host (refused) and answers yes
      await get("https://ugpdpp.org/01/09520606000019");
      seller = "yes";
      genuine = "yes";
      text = "The product seems genuine.";
  }
  return { text, followUpText: "```json\n" + JSON.stringify({ genuine, seller_has_item: seller, reasons: [text] }) + "\n```", toolCalls: calls };
}

// ----------------------------------------------------------------- one trial

class BudgetAbort extends Error {}

async function runTrial(item: Item, idx: number, runId: string, remaining: number) {
  const sel = models.find((m) => m.label === item.label)!;
  const setup = setupFor(item.product, item.condition, MOCK_STIMULI);
  const fetchTool = MOCK_MODELS ? fetchToolFor(setup, { pages: cannedExplorer(setup.manifest.fixtures, setup.explorerHost), hosts: [setup.explorerHost] }) : fetchToolFor(setup);
  const orCalls: OrCallMeta[] = [];
  const usage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const returned = new Set<string>();
  let computed = 0;
  const reported = () => orCalls.reduce((s, c) => s + (c.reportedCostUsd ?? 0), 0);
  const cost = () => Math.max(computed, reported());
  const started = Date.now();
  let out: { text: string; followUpText: string; toolCalls: Array<{ name: string; input: unknown; result?: string; turn: number }>; mainCalls?: number; mainLoopLimit?: boolean } | null = null;
  let error: string | null = null;
  let budgetAborted = false;
  try {
    if (MOCK_MODELS) out = await mockModel(sel.label, setup, fetchTool, item.runIndex);
    else {
      const adapter =
        sel.vendor === "openrouter"
          ? openRouterConversation(sel.model, OPENROUTER_PINS[sel.model], (m) => orCalls.push(m), OPENROUTER_TOOLS_OFF[sel.model])
          : conversationAdapter(sel.vendor as Exclude<BillingVendor, "openrouter">, sel.model);
      out = await adapter.run({
        system: setup.system,
        user: setup.user,
        followUp: setup.followUp,
        tools: [fetchTool.spec],
        maxTurns: MAX_TURNS,
        toolsExhausted: fetchTool.exhausted,
        onUsage: (u: CallUsage) => {
          usage.calls++;
          usage.inputTokens += u.inputTokens;
          usage.cachedInputTokens += u.cachedInputTokens;
          usage.cacheWriteInputTokens += u.cacheWriteInputTokens ?? 0;
          usage.outputTokens += u.outputTokens;
          usage.reasoningTokens += u.reasoningTokens;
          if (u.modelReturned) returned.add(u.modelReturned);
          computed += callCost(sel.price, u);
          if (cost() > remaining) throw new BudgetAbort(`trial cost ${cost().toFixed(4)} crossed the remaining budget ${remaining.toFixed(4)}`);
        },
      });
    }
  } catch (e) {
    budgetAborted = e instanceof BudgetAbort;
    error = e instanceof Error ? e.message : String(e);
  }
  const text = out?.text ?? "";
  const followUpText = out?.followUpText ?? "";
  const sc = scoreTrial({ product: item.product, condition: item.condition, givenUrl: setup.givenUrl, explorerHost: setup.explorerHost, fixtures: setup.manifest.fixtures }, fetchTool.log, text, followUpText);
  const row = {
    study: STUDY,
    pilot: PILOT,
    mock: MOCK_MODELS || MOCK_STIMULI,
    mockModels: MOCK_MODELS,
    mockStimuli: MOCK_STIMULI,
    runId,
    seed: SEED,
    scheduleIndex: idx,
    timestamp: new Date(started).toISOString(),
    label: sel.label,
    vendor: sel.vendor,
    modelRequested: MOCK_MODELS ? `mock:${sel.label}` : sel.model,
    modelIdsReturned: [...returned],
    provider:
      sel.vendor === "openrouter" && !MOCK_MODELS
        ? { pin: OPENROUTER_PINS[sel.model], toolsOff: OPENROUTER_TOOLS_OFF[sel.model], maxTokens: OPENROUTER_MAX_TOKENS, perCall: orCalls.map((c) => ({ provider: c.provider, model: c.modelReturned, generationId: c.generationId, reportedCostUsd: c.reportedCostUsd })), providersSeen: [...new Set(orCalls.map((c) => c.provider))] }
        : null,
    price: { inputPerMTok: sel.price.inputPerMTok, cachedInputPerMTok: sel.price.cachedInputPerMTok, outputPerMTok: sel.price.outputPerMTok, cacheWritePerMTok: sel.price.cacheWritePerMTok ?? null, source: sel.price.source, retrieved: sel.price.retrieved ?? pricing.retrieved },
    product: item.product,
    condition: item.condition,
    runIndex: item.runIndex,
    systemSha256: sha256(setup.system),
    userSha256: sha256(setup.user),
    followUpSha256: sha256(setup.followUp),
    givenUrl: setup.givenUrl,
    explorerHost: setup.explorerHost,
    stimulusFiles: setup.stimulusFiles,
    usage,
    mainCalls: out?.mainCalls ?? null,
    mainLoopLimit: out?.mainLoopLimit ?? null,
    costUsd: Number(cost().toFixed(6)),
    costComputedUsd: Number(computed.toFixed(6)),
    costReportedUsd: sel.vendor === "openrouter" && !MOCK_MODELS ? Number(reported().toFixed(6)) : null,
    ...sc,
    fetches: fetchTool.log,
    toolCalls: out?.toolCalls ?? [],
    responseText: text,
    followUpText,
    error,
    budgetAborted,
    durationMs: Date.now() - started,
  };
  return { row, cost: cost(), usage, budgetAborted };
}

// ----------------------------------------------------------------- main

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const schedule = buildSchedule(
  models.map((m) => m.label),
  PRODUCTS,
  CONDS,
  RUNS,
  SEED,
);
const ledger0 = readLedger();
const tag = MOCK_MODELS ? " [MOCK MODELS: no API call, excluded from analysis]" : PILOT ? " [PILOT: excluded from analysis]" : DRY ? " [DRY RUN]" : "";
console.log(`\nStudy 6 (brand-domain declaration) run ${runId}${tag}${MOCK_STIMULI ? " [MOCK STIMULI: testnet collections]" : ""}`);
console.log(`products=${PRODUCTS.join(",")} conditions=${CONDS.join(",")} runs per cell=${RUNS} seed=${SEED} trials=${schedule.length}`);
console.log(`models=${models.map((m) => `${m.label}=${m.model}`).join(", ")}   ceiling this invocation=$${MAX_USD.toFixed(2)}`);
console.log(`system: ${JSON.stringify(S6_SYSTEM)}\nuser: ${JSON.stringify(S6_QUESTION)} + "Page URL: ..." + the page HTML\nfollow-up: ${JSON.stringify(S6_FOLLOW_UP)}`);
console.log(`tool: fetch_url ${JSON.stringify(FETCH_TOOL_DESCRIPTION)}; real host ${manifest.explorerHost}${manifest.explorerVerified ? "" : " (UNVERIFIED config)"}; ${BROWSING_NOTE}`);
console.log("vendor caps and the Study 6 ledger:");
for (const v of VENDORS_USED) {
  const s = vendorSpent(ledger0, v);
  console.log(`  ${v.padEnd(10)} cap $${S6_VENDOR_CAPS[v].toFixed(2)}  spent $${s.toFixed(4)}  remaining $${(S6_VENDOR_CAPS[v] - s).toFixed(4)}`);
}
console.log(`  study totals: counted $${totalSpent(ledger0, false).toFixed(4)} of $${S6_COUNTED_TOTAL_CAP.toFixed(2)}; pilot $${totalSpent(ledger0, true).toFixed(4)} of $${S6_PILOT_TOTAL_CAP.toFixed(2)}`);
const proj = projection();
console.log(`\nprojection for THIS schedule (${INFLATION} x Study 5 counted mean x ${SAFETY}):`);
for (const x of proj.perModel) console.log(`  ${x.line}`);
let overCap = false;
for (const [v, t] of Object.entries(proj.perVendor)) {
  const rem = S6_VENDOR_CAPS[v as BillingVendor] - vendorSpent(ledger0, v as BillingVendor);
  const over = !(t <= rem);
  overCap ||= over;
  console.log(`  vendor ${v}: $${Number.isFinite(t) ? t.toFixed(2) : "unknown"} ${over ? "EXCEEDS / UNKNOWN vs" : "<="} remaining cap $${rem.toFixed(2)}`);
}
const totalRem = Math.min(MAX_USD, ceiling - totalSpent(ledger0, PILOT));
overCap ||= !(proj.total <= totalRem);
console.log(`  total: $${proj.total.toFixed(2)} ${proj.total <= totalRem ? "<=" : "EXCEEDS"} remaining $${totalRem.toFixed(2)}`);
if (DRY) {
  console.log("\nschedule (first 15):");
  schedule.slice(0, 15).forEach((s, i) => console.log(`  ${i} ${s.label} ${s.product} ${s.condition} run${s.runIndex}`));
  const counts = new Map<string, number>();
  for (const s of schedule) counts.set(`${s.product}/${s.condition}`, (counts.get(`${s.product}/${s.condition}`) ?? 0) + 1);
  console.log(`cells: ${counts.size} (each ${[...new Set(counts.values())].join("/")} trials)`);
  process.exit(0);
}

if (API) {
  if (overCap) die(4, "the projected spend exceeds a vendor cap or the study total (or is unknown).");
  for (const m of models) if (!process.env[S6_MODELS[m.label].key]) die(1, `${S6_MODELS[m.label].key} is not set (repo-root .env)`);
  const { runStudy6Preflight, printStudy6Preflight } = await import("./preflight-study6");
  const pf = await runStudy6Preflight({ mock: false, live: true });
  printStudy6Preflight(pf);
  if (!pf.ok) die(1, "Study 6 preflight FAILED. No trial may run.");
}
for (const p of PRODUCTS)
  for (const c of CONDS) {
    try {
      setupFor(p, c, MOCK_STIMULI);
    } catch (e) {
      die(1, `stimulus for ${p} ${c} not ready: ${e instanceof Error ? e.message : e}`);
    }
  }

mkdirSync(RESULTS, { recursive: true });
const base = `${RESULTS}${MOCK_MODELS ? "mock-study6" : PILOT ? "pilot-study6" : "study6"}-${runId}`;
const outFile = `${base}.jsonl`;
writeFileSync(
  `${base}.meta.json`,
  JSON.stringify(
    {
      runId,
      study: STUDY,
      pilot: PILOT,
      mockModels: MOCK_MODELS,
      mockStimuli: MOCK_STIMULI,
      seed: SEED,
      argv,
      startedAt: new Date().toISOString(),
      models,
      openRouterPins: OPENROUTER_PINS,
      openRouterToolsOff: OPENROUTER_TOOLS_OFF,
      openRouterMaxTokens: OPENROUTER_MAX_TOKENS,
      products: PRODUCTS,
      conditions: CONDS,
      runsPerCell: RUNS,
      prompts: { system: S6_SYSTEM, question: S6_QUESTION, layout: 'question + "\\n\\nPage URL: <url>\\n\\nPage HTML:\\n```html\\n<html>\\n```"', followUp: S6_FOLLOW_UP },
      tools: { fetch: { description: FETCH_TOOL_DESCRIPTION, method: "GET", javascript: false, search: false, explorerHost: manifest.explorerHost, explorerVerified: manifest.explorerVerified, maxFetches: MAX_FETCHES_PER_TRIAL, maxBodyChars: MAX_BODY_CHARS, requestHeaders: FETCH_REQUEST_HEADERS } },
      browsingEmulation: BROWSING_NOTE,
      maxTurns: MAX_TURNS,
      vendorCaps: S6_VENDOR_CAPS,
      totals: { counted: S6_COUNTED_TOTAL_CAP, pilot: S6_PILOT_TOTAL_CAP },
      projection: { inflation: INFLATION, safety: SAFETY, basis: MEASURED_FILE },
      ledgerBefore: Object.fromEntries(VENDORS_USED.map((v) => [v, vendorSpent(ledger0, v)])),
      maxUsd: MAX_USD,
      stimulus: { builtAt: manifest.builtAt, mock: manifest.mock, explorerHost: manifest.explorerHost, gtins: manifest.gtins, stimuli: manifest.stimuli },
      schedule,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

let runSpent = 0;
let stopped: string | null = null;
const exhausted = new Map<BillingVendor, string>();
const skipped: Array<{ index: number; item: Item; reason: string }> = [];
for (let i = 0; i < schedule.length; i++) {
  const item = schedule[i];
  const sel = models.find((m) => m.label === item.label)!;
  let remaining = Infinity;
  if (API) {
    if (exhausted.has(sel.vendor)) {
      skipped.push({ index: i, item, reason: exhausted.get(sel.vendor)! });
      continue;
    }
    const ledger = readLedger();
    const vendorRemaining = S6_VENDOR_CAPS[sel.vendor] - vendorSpent(ledger, sel.vendor);
    const studyRemaining = ceiling - totalSpent(ledger, PILOT);
    const runRemaining = MAX_USD - runSpent;
    const gate = trialGate(sel, ledger);
    if (gate.usd > vendorRemaining) {
      const why = `${sel.vendor} cap: projected $${gate.usd.toFixed(4)} [${gate.basis}] exceeds the vendor's remaining $${vendorRemaining.toFixed(4)}`;
      exhausted.set(sel.vendor, why);
      skipped.push({ index: i, item, reason: why });
      console.log(`[${i + 1}/${schedule.length}] VENDOR STOPPED: ${why}`);
      continue;
    }
    if (gate.usd > Math.min(runRemaining, studyRemaining)) {
      stopped = `before trial ${i} (${sel.model}): projected $${gate.usd.toFixed(4)} exceeds the remaining $${Math.min(runRemaining, studyRemaining).toFixed(4)} (this invocation / the study ${PILOT ? "pilot" : "counted"} total)`;
      break;
    }
    remaining = Math.min(vendorRemaining, runRemaining, studyRemaining);
  }
  const { row, cost, usage, budgetAborted } = await runTrial(item, i, runId, remaining);
  runSpent += cost;
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  if (API)
    appendLedger({
      at: row.timestamp,
      runId,
      pilot: PILOT,
      kind: "trial",
      product: item.product,
      condition: item.condition,
      vendor: sel.vendor,
      model: sel.model,
      costUsd: cost,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
      aborted: budgetAborted || row.error !== null,
    });
  const status = row.error ? `ERROR ${row.error.slice(0, 120)}` : `genuine=${row.genuine ?? "MISSING"} seller=${row.sellerHasItem ?? "MISSING"}${row.reportError ? ` (${row.reportError})` : ""}`;
  console.log(
    `[${i + 1}/${schedule.length}] ${sel.label} ${item.product} ${item.condition} run${item.runIndex}: ${status}  fetches=${row.fetchCount} decl=${row.declarationFetched} explorerJson=${row.explorerJsonFetched} item=${row.explorerItemFetched} invented=${row.inventedVerification} $${cost.toFixed(5)} (run $${runSpent.toFixed(4)})`,
  );
  if (budgetAborted) {
    stopped = `during trial ${i}: ${row.error}`;
    break;
  }
}
if (skipped.length) {
  writeFileSync(`${base}.skipped.json`, JSON.stringify(skipped, null, 2) + "\n", "utf8");
  console.log(`\n${skipped.length} trial(s) skipped by a vendor cap; listed in ${base}.skipped.json`);
}
console.log(`\nWrote ${existsSync(outFile) ? outFile : "(no rows)"}\nrun spend $${runSpent.toFixed(4)}${API ? `; Study 6 ledger by vendor: ${VENDORS_USED.map((v) => `${v} $${vendorSpent(readLedger(), v).toFixed(4)}`).join(", ")}` : " (no API call, no ledger entry)"}`);
if (stopped || skipped.length) {
  console.error(`STOPPED/SHORTENED BY BUDGET: ${stopped ?? `${skipped.length} trial(s) skipped`}`);
  process.exit(4);
}
