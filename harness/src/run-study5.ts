/**
 * Study 5 trial runner: interoperability unique to smart contracts. Can an ordinary AI model,
 * with only the ability to open web pages, (1) catch a lying passport using an independent
 * public record, and (2) tell a genuine unit from a counterfeit using on-chain provenance?
 *
 * Studies 2-4's runners, adapters and stimuli are NOT edited. Reused: fetch_url (fetch-tool.ts,
 * with a Study 5 allow-list passed in), the Study 4 conversation adapters with their ONE
 * follow-up (agents/conversation.ts). Added: an OpenRouter adapter (agents/openrouter.ts), the
 * stimuli (stimulus/study5*.ts), scoring (study5-score.ts) and a separate ledger.
 *
 * FREE CONSUMER APP EMULATION (James, 2026-10-15): the model gets NO special tool. Its only tool
 * is Study 2's `fetch_url` ("Fetch a web page or file over HTTPS and return its status, content
 * type and body."): GET only, no JavaScript, no search. Allow-list (design fixes 2026-10-16): the
 * fictional stimulus hosts (stored pages; 404 elsewhere), among them the ONE mirror
 * passport-viewer.example that serves H/L (same URL) and G/F (same URL), and the public LUKSO
 * testnet explorer explorer.execution.testnet.lukso.network on every path. Our own hosts are NOT
 * reachable (stimulus/study5.ts S5_OUR_HOSTS_REACHABLE), and every passport copy is neutralised
 * (no /verify link, evidence.recheck_url null): the public record is the only route to the truth. 8 fetches per trial, bodies cut at
 * 30,000 characters. Real apps may render JavaScript or search; this one cannot (in the metadata).
 *
 * One trial:
 *   system    "You are a helpful assistant."
 *   Test 1    user: "I'm thinking of buying this power station. Can I trust its battery passport?"
 *             + "Page URL: ..." + the S1 page HTML. Conditions H (honest), L (lying), W (web2).
 *   Test 2    user: "I found this power station second-hand. The label has this code: <URL>. Is it
 *             genuine, and who made it?" Conditions G (genuine), F (counterfeit), W2 (web2 seller
 *             page). Every stimulus is stored and hashed; only the explorer is live.
 *   then      ONE fixed follow-up, same conversation, tools declared but off:
 *             T1 "In one word: can I trust it — yes, no, or unsure?"
 *             T2 "In one word: genuine, counterfeit, or unsure?"
 *
 * Usage (from harness/):
 *   bun run src/run-study5.ts --max-usd <n> [--runs 8] [--models openai,gemini,kimi,anthropic,glimmer,spark]
 *        [--conditions H,L,W,G,F,W2] [--seed N] [--dry-run]
 *   (smoke) [--smoke-test 1|2]   all smoke trials of this invocation on one test
 *   bun run src/run-study5.ts --smoke --max-usd 0.80 [--models ...]
 *
 * --dry-run  schedule, projected cost PER VENDOR and the allocation that fits every cap (runs
 *            reduced uniformly, never below 5). No API call, no network.
 * --smoke    ONE pilot trial per selected model on the SMOKE stimuli (stimulus/study5/pilot: the
 *            current live passports with a synthetic contract block on a pilot host); models
 *            alternate Test 1 / Test 2 in the order given. pilot=true, results/smoke-study5-*.jsonl,
 *            excluded from every analysis. Hard ceiling USD 0.80 in total.
 *
 * Budget (James, 2026-10-15): a SEPARATE Study 5 ledger (results/study5-spend-ledger.json). Caps:
 * OpenAI 11.0, Gemini 3.4, Kimi 12.0, Anthropic 8.0, OpenRouter 8.0 USD (James, 16 Oct; both OpenRouter models
 * share one cap). Before each trial its projected cost must fit what remains of the vendor's cap
 * AND of --max-usd; the live cost is checked after every API call. OpenRouter trials are costed at
 * the larger of the computed cost and OpenRouter's reported usage.cost.
 *
 * Exit codes: 0 complete, 1 precondition failed, 2 bad arguments, 4 stopped/shortened by budget.
 */
import "./env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomInt } from "node:crypto";
import { conversationAdapter } from "./agents/conversation";
import { OPENROUTER_MAX_TOKENS, openRouterConversation, type OrCallMeta } from "./agents/openrouter";
import { FETCH_REQUEST_HEADERS, FETCH_TOOL_DESCRIPTION, MAX_BODY_CHARS, MAX_FETCHES_PER_TRIAL } from "./fetch-tool";
import { S5_SYSTEM, T1_FOLLOW_UP, T1_QUESTION, T2_FOLLOW_UP, t2User } from "./prompts-study5";
import { printStudy5Preflight, runStudy5Preflight } from "./preflight-study5";
import { scoreTrial } from "./study5-score";
import { fetchToolFor, pilotSetup, S5_ALLOW, setupFor, type TrialSetup } from "./study5-stimulus";
import { appendLedger, callCost, readLedger, readPricing, RESULTS, vendorSpent, type Price, type S5Ledger } from "./study5-ledger";
import { ALL_LABELS, OPENROUTER_PINS, OPENROUTER_TOOLS_OFF, S5_MODELS, S5_VENDOR_CAPS, type BillingVendor, type ModelLabel } from "./study5-models";
import type { CallUsage } from "./types";
import { passportCheckOf, readS5Manifest, S5_CONDS, S5_FICTIONAL_HOSTS, S5_PILOT_MANIFEST, TRUTH, type S5Cond } from "../../stimulus/study5";

const STUDY = "study5-interop";
const SMOKE_STUDY = "study5-interop-smoke";
const PREFERRED_RUNS = 8;
const MIN_RUNS = 5;
const SMOKE_MAX_USD = 0.8;
const MAX_TURNS = 12;
/**
 * Projection, fixed a priori (before the smoke trials): a Study 5 trial carries one fetched
 * passport (~9 KB, ~3k tokens) and possibly several explorer JSON bodies (1-26 KB) in every later
 * call, where a Study 4 trial rarely fetched anything. Per-trial projection = the dearer of
 * INFLATION x the model's Study 4 mean and SMOKE_FACTOR x its Study 5 smoke trial, x 1.25.
 * The OpenRouter models have no Study 4 data: their smoke trial is the only basis.
 */
export const INFLATION = 4.0;
export const SMOKE_FACTOR = 3.0;
const PROJECTION_SAFETY = 1.25;
const MEASURED_FILE = "results-archive/study4-2026-10-15T05-39-42-094Z.jsonl";
export const BROWSING_NOTE =
  "fetch_url is GET-only with no JavaScript and no search: it emulates the simplest browsing of a free consumer AI app. Real consumer apps may render JavaScript (the explorer's HTML pages are JavaScript-rendered and hold no data in a plain fetch; its JSON API answers a plain GET) or search the web; this instrument does neither. Every passport is a stored copy on one neutral mirror host (no host cue), with no link to the issuer's checker; the only live host is the public explorer.";

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
const KNOWN = new Set(["--models", "--conditions", "--runs", "--max-usd", "--seed", "--dry-run", "--smoke", "--smoke-test"]);
for (const a of argv) if (a.startsWith("--") && !KNOWN.has(a)) die(2, `unknown flag ${a}`);
const DRY = argv.includes("--dry-run");
const SMOKE = argv.includes("--smoke");
/** --smoke-test 1|2: put every smoke trial of this invocation on one test (default: alternate by model order). */
const SMOKE_TEST = argv.includes("--smoke-test") ? Number(argv[argv.indexOf("--smoke-test") + 1]) : null;
if (SMOKE_TEST !== null && SMOKE_TEST !== 1 && SMOKE_TEST !== 2) die(2, "--smoke-test must be 1 or 2");
const maxUsdRaw = flag("--max-usd");
if (maxUsdRaw === undefined) die(2, "--max-usd is required (hard spend ceiling for this invocation, USD)");
const MAX_USD = Number(maxUsdRaw);
if (!Number.isFinite(MAX_USD) || MAX_USD <= 0) die(2, `--max-usd "${maxUsdRaw}" is not a positive number`);
if (SMOKE && MAX_USD > SMOKE_MAX_USD) die(2, `--smoke is capped at USD ${SMOKE_MAX_USD.toFixed(2)} in total`);
const seedRaw = flag("--seed");
const SEED = seedRaw === undefined ? randomInt(0, 2 ** 31) : Number(seedRaw);
if (!Number.isInteger(SEED)) die(2, `--seed "${seedRaw}" is not an integer`);
const CONDS = (flag("--conditions") ?? S5_CONDS.join(",")).split(",").map((x) => x.trim().toUpperCase()) as S5Cond[];
if (CONDS.some((c) => !S5_CONDS.includes(c)) || new Set(CONDS).size !== CONDS.length) die(2, `--conditions must be drawn from ${S5_CONDS.join(",")}`);
const runsRaw = flag("--runs");
const RUNS = runsRaw === undefined ? PREFERRED_RUNS : Number(runsRaw);
if (!Number.isInteger(RUNS) || RUNS < 1) die(2, `--runs "${runsRaw}" is not a positive integer`);
if (!SMOKE && RUNS < MIN_RUNS) die(2, `runs per cell may never be below ${MIN_RUNS}`);

const pricing = readPricing();
interface ModelSel {
  label: ModelLabel;
  vendor: BillingVendor;
  model: string;
  price: Price;
}
const models: ModelSel[] = (flag("--models") ?? ALL_LABELS.join(",")).split(",").map((s) => {
  const [l, m] = s.trim().split(/:(.+)/) as [ModelLabel, string | undefined];
  const def = S5_MODELS[l];
  if (!def) die(2, `unknown model label "${l}" (${ALL_LABELS.join(", ")})`);
  const model = m ?? process.env[def.env] ?? def.fallback;
  const price = pricing.models[model];
  if (!price) die(1, `no price for "${model}" in harness/pricing.json`);
  if (price.vendor !== def.vendor) die(2, `"${model}" is priced as a ${price.vendor} model, not ${def.vendor}`);
  if (def.vendor === "openrouter" && !OPENROUTER_PINS[model]) die(2, `no provider pin for ${model}`);
  return { label: l, vendor: def.vendor, model, price };
});
if (new Set(models.map((m) => m.label)).size !== models.length) die(2, "each model label once");
const VENDORS_USED = [...new Set(models.map((m) => m.vendor))];

// ----------------------------------------------------------------- measured per-trial costs

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function study4(model: string): number[] {
  const p = new URL(MEASURED_FILE, REPO);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { modelRequested: string; costUsd: number; pilot?: boolean })
    .filter((r) => r.modelRequested === model && !r.pilot)
    .map((r) => r.costUsd);
}
function measured(sel: ModelSel, ledger: S5Ledger): { each: number; max: number; basis: string } | null {
  const s4 = study4(sel.model);
  const smoke = ledger.entries.filter((e) => e.model === sel.model && e.pilot && e.kind === "trial" && !e.aborted).map((e) => e.costUsd);
  if (!s4.length && !smoke.length) {
    // Proxy (no trial of this model completed, e.g. its smoke trial was refused): every other
    // model's completed smoke trial, its tokens priced at THIS model's rates; the dearest.
    const others = ledger.entries.filter((e) => e.pilot && e.kind === "trial" && !e.aborted && e.inputTokens > 0);
    if (!others.length) return null;
    const px = Math.max(...others.map((e) => callCost(sel.price, { inputTokens: e.inputTokens, cachedInputTokens: 0, outputTokens: e.outputTokens, reasoningTokens: 0, modelReturned: null })));
    return { each: px * SMOKE_FACTOR, max: px * SMOKE_FACTOR, basis: `PROXY: dearest of ${others.length} other models' smoke trials re-priced at this model's rates $${px.toFixed(5)} x ${SMOKE_FACTOR}` };
  }
  const a = s4.length ? mean(s4) * INFLATION : 0;
  const aMax = s4.length ? Math.max(...s4) * INFLATION : 0;
  const b = smoke.length ? Math.max(...smoke) * SMOKE_FACTOR : 0;
  return {
    each: Math.max(a, b),
    max: Math.max(aMax, b),
    basis: `Study 4 mean ${s4.length ? `$${mean(s4).toFixed(5)} (n=${s4.length}) x ${INFLATION} = $${a.toFixed(5)}` : "none"}; Study 5 smoke ${smoke.length ? `$${Math.max(...smoke).toFixed(5)} x ${SMOKE_FACTOR} = $${b.toFixed(5)}` : "none"}; using the dearer`,
  };
}
function trialGate(sel: ModelSel, ledger: S5Ledger): { usd: number; basis: string } {
  const seen = ledger.entries.filter((e) => e.model === sel.model && e.kind === "trial" && !e.aborted && !e.pilot).map((e) => e.costUsd);
  if (seen.length) return { usd: Math.max(...seen) * PROJECTION_SAFETY, basis: `${PROJECTION_SAFETY} x dearest of ${seen.length} Study 5 trial(s)` };
  const m = measured(sel, ledger);
  if (!m) return { usd: SMOKE ? 0.1 : Infinity, basis: SMOKE ? "smoke: no measurement yet, USD 0.10 assumed per trial" : "no measurement" };
  return { usd: m.max * PROJECTION_SAFETY, basis: `${PROJECTION_SAFETY} x max(Study 4 max x ${INFLATION}, smoke x ${SMOKE_FACTOR})` };
}

// ----------------------------------------------------------------- schedule

interface Item {
  label: ModelLabel;
  condition: S5Cond | "smoke-T1" | "smoke-T2";
  runIndex: number;
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
function buildSchedule(runs: number): Item[] {
  if (SMOKE) return models.map((m, i) => ({ label: m.label, condition: SMOKE_TEST ? (`smoke-T${SMOKE_TEST}` as Item["condition"]) : i % 2 === 0 ? "smoke-T1" : "smoke-T2", runIndex: 0 }));
  const out: Item[] = [];
  for (const m of models) for (const c of CONDS) for (let r = 0; r < runs; r++) out.push({ label: m.label, condition: c, runIndex: r });
  const rand = mulberry(SEED);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function projection(runs: number, ledger: S5Ledger) {
  const perModel = models.map((m) => {
    const n = SMOKE ? 1 : runs * CONDS.length;
    const c = measured(m, ledger);
    const each = c ? c.each * PROJECTION_SAFETY : NaN;
    return { m, n, total: each * n, line: c ? `${m.label} ${m.model}: ${n} x $${each.toFixed(5)} (${PROJECTION_SAFETY} x [${c.basis}]) = $${(each * n).toFixed(2)}` : `${m.label} ${m.model}: NO MEASUREMENT (run --smoke first)` };
  });
  const perVendor = Object.fromEntries(VENDORS_USED.map((v) => [v, perModel.filter((x) => x.m.vendor === v).reduce((s, x) => s + x.total, 0)])) as Record<BillingVendor, number>;
  return { perModel, perVendor };
}
function allocate(ledger: S5Ledger): { runs: number; fits: boolean; known: boolean } {
  let runs = PREFERRED_RUNS;
  const p0 = projection(runs, ledger);
  const known = p0.perModel.every((x) => Number.isFinite(x.total));
  if (!known) return { runs, fits: false, known };
  const fits = () => Object.entries(projection(runs, ledger).perVendor).every(([v, t]) => t <= S5_VENDOR_CAPS[v as BillingVendor] - vendorSpent(ledger, v as BillingVendor));
  while (!fits() && runs > MIN_RUNS) runs--;
  return { runs, fits: fits(), known };
}

// ----------------------------------------------------------------- per-trial setup

const manifest = readS5Manifest();
function setupOf(c: Item["condition"]): TrialSetup {
  if (c === "smoke-T1") return pilotSetup(1);
  if (c === "smoke-T2") return pilotSetup(2);
  return setupFor(c);
}
/** The document a condition serves, for scoring (since the design fixes every one is stored). */
function servedDoc(s: TrialSetup): string | null {
  return s.storedPassportText;
}

class BudgetAbort extends Error {}

async function runTrial(item: Item, idx: number, runId: string, remaining: number) {
  const sel = models.find((m) => m.label === item.label)!;
  const setup = setupOf(item.condition);
  const fetchTool = fetchToolFor(setup);
  const orCalls: OrCallMeta[] = [];
  const adapter =
    sel.vendor === "openrouter"
      ? openRouterConversation(sel.model, OPENROUTER_PINS[sel.model], (m) => orCalls.push(m), OPENROUTER_TOOLS_OFF[sel.model])
      : conversationAdapter(sel.vendor as Exclude<BillingVendor, "openrouter">, sel.model);
  const usage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  const returned = new Set<string>();
  let computed = 0;
  const reported = () => orCalls.reduce((s, c) => s + (c.reportedCostUsd ?? 0), 0);
  const cost = () => Math.max(computed, reported());
  const started = Date.now();
  let out: Awaited<ReturnType<typeof adapter.run>> | null = null;
  let error: string | null = null;
  let budgetAborted = false;
  try {
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
  } catch (e) {
    budgetAborted = e instanceof BudgetAbort;
    error = e instanceof Error ? e.message : String(e);
  }
  const text = out?.text ?? "";
  const followUpText = out?.followUpText ?? "";
  const doc = servedDoc(setup);
  const sc = scoreTrial(setup, fetchTool.log, text, followUpText, doc);
  // Instrument validity (live conditions): what the live passport said when the model read it.
  const liveStatuses: string[] = [];
  if (setup.passportLive)
    for (const tc of out?.toolCalls ?? []) {
      const r = tc.result ?? "";
      if (!r.includes("\nStatus: 200")) continue;
      try {
        const body = JSON.parse(r.slice(r.indexOf("\n\n") + 2));
        const st = passportCheckOf(body)?.status;
        if (typeof st === "string") liveStatuses.push(st);
      } catch {
        /* not JSON */
      }
    }
  const instrumentInvalid = liveStatuses.some((s) => s !== "verified");
  const row = {
    study: SMOKE ? SMOKE_STUDY : STUDY,
    pilot: setup.pilot,
    runId,
    seed: SEED,
    scheduleIndex: idx,
    timestamp: new Date(started).toISOString(),
    label: sel.label,
    vendor: sel.vendor,
    modelRequested: sel.model,
    modelIdsReturned: [...returned],
    provider: sel.vendor === "openrouter" ? { pin: OPENROUTER_PINS[sel.model], toolsOff: OPENROUTER_TOOLS_OFF[sel.model], maxTokens: OPENROUTER_MAX_TOKENS, perCall: orCalls.map((c) => ({ provider: c.provider, model: c.modelReturned, generationId: c.generationId, reportedCostUsd: c.reportedCostUsd })), providersSeen: [...new Set(orCalls.map((c) => c.provider))] } : null,
    price: { inputPerMTok: sel.price.inputPerMTok, cachedInputPerMTok: sel.price.cachedInputPerMTok, outputPerMTok: sel.price.outputPerMTok, cacheWritePerMTok: sel.price.cacheWritePerMTok ?? null, source: sel.price.source, retrieved: sel.price.retrieved ?? pricing.retrieved },
    test: setup.test,
    condition: item.condition,
    truth: setup.pilot ? null : TRUTH[item.condition as S5Cond],
    runIndex: item.runIndex,
    systemSha256: sha256(setup.system),
    userSha256: sha256(setup.user),
    followUpSha256: sha256(setup.followUp),
    givenUrl: setup.givenUrl,
    passportUrl: setup.passportUrl,
    passportLive: setup.passportLive,
    stimulusFiles: setup.stimulusFiles,
    servedDocSha256: doc ? sha256(doc) : null,
    livePassportStatusSeen: liveStatuses,
    instrumentInvalid,
    usage,
    mainCalls: out?.mainCalls ?? null,
    mainLoopLimit: out?.mainLoopLimit ?? null,
    costUsd: Number(cost().toFixed(6)),
    costComputedUsd: Number(computed.toFixed(6)),
    costReportedUsd: sel.vendor === "openrouter" ? Number(reported().toFixed(6)) : null,
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
const ledger0 = readLedger();
const alloc = allocate(ledger0);
const schedule = buildSchedule(RUNS);
console.log(`\nStudy 5 (interoperability unique to smart contracts) run ${runId}${SMOKE ? " [SMOKE — pilot, excluded from analysis]" : ""}${DRY ? " [DRY RUN]" : ""}`);
console.log(`conditions=${SMOKE ? "smoke-T1/smoke-T2 alternating" : CONDS.join(",")}  runs per cell=${SMOKE ? 1 : RUNS}  seed=${SEED}  trials=${schedule.length}`);
console.log(`models=${models.map((m) => `${m.label}=${m.model}`).join(", ")}   ceiling this invocation=$${MAX_USD.toFixed(2)}`);
console.log(`system: ${JSON.stringify(S5_SYSTEM)}\nT1 user: ${JSON.stringify(T1_QUESTION)} + "Page URL: ..." + the page HTML\nT2 user: ${JSON.stringify(t2User("<URL>"))}\nfollow-ups: ${JSON.stringify(T1_FOLLOW_UP)} / ${JSON.stringify(T2_FOLLOW_UP)}`);
console.log(`tool: fetch_url ${JSON.stringify(FETCH_TOOL_DESCRIPTION)}; real hosts ${S5_ALLOW.realHosts.join(", ")}; ${BROWSING_NOTE}`);
console.log("OpenRouter pins: " + Object.entries(OPENROUTER_PINS).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join("; "));
console.log("vendor caps and the Study 5 ledger:");
for (const v of VENDORS_USED) {
  const s = vendorSpent(ledger0, v);
  console.log(`  ${v.padEnd(10)} cap $${S5_VENDOR_CAPS[v].toFixed(2)}  spent $${s.toFixed(4)}  remaining $${(S5_VENDOR_CAPS[v] - s).toFixed(4)}`);
}
const proj = projection(RUNS, ledger0);
console.log(`\nprojection for THIS schedule (dearer of ${INFLATION} x Study 4 mean and ${SMOKE_FACTOR} x the Study 5 smoke trial; x ${PROJECTION_SAFETY}):`);
for (const x of proj.perModel) console.log(`  ${x.line}`);
let overCap = false;
for (const [v, t] of Object.entries(proj.perVendor)) {
  const rem = S5_VENDOR_CAPS[v as BillingVendor] - vendorSpent(ledger0, v as BillingVendor);
  const over = !(t <= rem);
  overCap ||= over;
  console.log(`  vendor ${v}: $${Number.isFinite(t) ? t.toFixed(2) : "unknown"} ${over ? "EXCEEDS / UNKNOWN vs" : "<="} remaining cap $${rem.toFixed(2)}`);
}
if (!SMOKE) {
  if (!alloc.known) console.log(`\nPROPOSED ALLOCATION: not computable until every model has a measured cost (run --smoke first).`);
  else {
    console.log(`\nPROPOSED ALLOCATION (start ${PREFERRED_RUNS} runs per model x condition; reduce all cells by 1 until every vendor fits; never below ${MIN_RUNS}): runs=${alloc.runs} -> ${models.length * CONDS.length * alloc.runs} trials, ${alloc.fits ? "fits every vendor cap" : "DOES NOT FIT even at the floor"}`);
    const pa = projection(alloc.runs, ledger0);
    for (const [v, t] of Object.entries(pa.perVendor)) console.log(`  at runs=${alloc.runs}: ${v} $${t.toFixed(2)} of remaining cap $${(S5_VENDOR_CAPS[v as BillingVendor] - vendorSpent(ledger0, v as BillingVendor)).toFixed(2)}`);
    if (runsRaw === undefined && alloc.runs !== RUNS) console.log("  (the default does not fit: pass --runs and register the choice)");
  }
}
if (DRY) {
  console.log(`\nstimulus: manifest ${manifest ? `built ${manifest.builtAt}, contractLive=${manifest.contractLive}${manifest.contractLive ? "" : ` (${manifest.contractProblems.join("; ")})`}` : "MISSING"}`);
  console.log(`stimuli present: ${manifest ? Object.keys(manifest.stimuli).join(", ") : "-"}`);
  console.log("\nschedule (first 12):");
  schedule.slice(0, 12).forEach((s, i) => console.log(`  ${i} ${s.label} ${s.condition} run${s.runIndex}`));
  process.exit(0);
}

if (!SMOKE && overCap) die(4, "the projected spend of at least one vendor exceeds what remains of its Study 5 cap (or is unknown). Reduce --runs (never below 5) and register the choice first.");
for (const m of models) if (!process.env[S5_MODELS[m.label].key]) die(1, `${S5_MODELS[m.label].key} is not set (repo-root .env)`);

let preflightSummary: unknown = { smoke: true, note: "smoke trials use the pilot stimuli; the Study 5 preflight is not required for them" };
if (!SMOKE) {
  const pf = await runStudy5Preflight();
  printStudy5Preflight(pf);
  if (!pf.ok) die(1, "Study 5 preflight gates V0-V8 FAILED. No counted trial may run.");
  preflightSummary = { ok: pf.ok, ranAt: pf.ranAt, gates: pf.gates.map((g) => ({ gate: g.gate, ok: g.ok })) };
}
// Every condition's stimulus must load (hash-checked) before the first trial.
for (const c of new Set(schedule.map((s) => s.condition))) {
  try {
    setupOf(c);
  } catch (e) {
    die(1, `stimulus for ${c} not ready: ${e instanceof Error ? e.message : e}`);
  }
}

mkdirSync(RESULTS, { recursive: true });
const base = `${RESULTS}${SMOKE ? "smoke-study5" : "study5"}-${runId}`;
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
      openRouterPins: OPENROUTER_PINS,
      openRouterToolsOff: OPENROUTER_TOOLS_OFF,
      openRouterMaxTokens: OPENROUTER_MAX_TOKENS,
      conditions: SMOKE ? ["smoke-T1", "smoke-T2"] : CONDS,
      runsPerCell: SMOKE ? 1 : RUNS,
      prompts: { system: S5_SYSTEM, t1Question: T1_QUESTION, t1Layout: 'question + "\\n\\nPage URL: <url>\\n\\nPage HTML:\\n```html\\n<html>\\n```"', t2: t2User("<URL>"), t1FollowUp: T1_FOLLOW_UP, t2FollowUp: T2_FOLLOW_UP },
      tools: {
        fetch: { description: FETCH_TOOL_DESCRIPTION, method: "GET", javascript: false, search: false, allow: S5_ALLOW, fictionalHosts: S5_FICTIONAL_HOSTS, maxFetches: MAX_FETCHES_PER_TRIAL, maxBodyChars: MAX_BODY_CHARS, requestHeaders: FETCH_REQUEST_HEADERS },
      },
      browsingEmulation: BROWSING_NOTE,
      maxTurns: MAX_TURNS,
      vendorCaps: S5_VENDOR_CAPS,
      projection: { inflation: INFLATION, smokeFactor: SMOKE_FACTOR, safety: PROJECTION_SAFETY },
      ledgerBefore: Object.fromEntries(VENDORS_USED.map((v) => [v, vendorSpent(ledger0, v)])),
      maxUsd: MAX_USD,
      stimulus: SMOKE ? JSON.parse(readFileSync(S5_PILOT_MANIFEST, "utf8")) : manifest,
      preflight: preflightSummary,
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
  if (exhausted.has(sel.vendor)) {
    skipped.push({ index: i, item, reason: exhausted.get(sel.vendor)! });
    continue;
  }
  const ledger = readLedger();
  const vendorRemaining = S5_VENDOR_CAPS[sel.vendor] - vendorSpent(ledger, sel.vendor);
  const runRemaining = MAX_USD - runSpent;
  const gate = trialGate(sel, ledger);
  if (gate.usd > vendorRemaining) {
    const why = `${sel.vendor} cap: projected $${gate.usd.toFixed(4)} [${gate.basis}] exceeds the vendor's remaining $${vendorRemaining.toFixed(4)}`;
    exhausted.set(sel.vendor, why);
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
    kind: "trial",
    condition: item.condition,
    vendor: sel.vendor,
    model: sel.model,
    costUsd: cost,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    outputTokens: usage.outputTokens,
    aborted: budgetAborted || row.error !== null,
  });
  const status = row.error ? `ERROR ${row.error.slice(0, 120)}` : `word=${row.followUpWord ?? `NONE(${JSON.stringify(row.followUpText.slice(0, 40))})`} aligned=${row.finalAligned}`;
  console.log(
    `[${i + 1}/${schedule.length}] ${sel.label} ${item.condition} run${item.runIndex}: ${status}  fetches=${row.fetchCount} passport=${row.openedPassport} explorer=${row.openedIndependentRecord}(${row.explorerFetches}) recordData=${row.openedRecordData} provenance=${row.openedProvenance} ` +
      `caughtLie=${row.caughtLie} caughtCounterfeit=${row.caughtCounterfeit}${row.instrumentInvalid ? " INSTRUMENT_INVALID" : ""}${row.provider ? ` provider=${row.provider.providersSeen.join("/")}` : ""} ids=${row.modelIdsReturned.join(",")} tok=${usage.inputTokens}/${usage.outputTokens} $${cost.toFixed(5)} (run $${runSpent.toFixed(4)})`,
  );
  if (budgetAborted) {
    if (cost > runRemaining - 1e-9) {
      stopped = `during trial ${i}: ${row.error}`;
      break;
    }
    exhausted.set(sel.vendor, `during trial ${i}: ${row.error}`);
  }
}
if (skipped.length) {
  writeFileSync(`${base}.skipped.json`, JSON.stringify(skipped, null, 2) + "\n", "utf8");
  console.log(`\n${skipped.length} trial(s) skipped by a vendor cap; listed in ${base}.skipped.json`);
}
const l1 = readLedger();
console.log(`\nWrote ${existsSync(outFile) ? outFile : "(no rows)"}\nrun spend $${runSpent.toFixed(4)}; Study 5 ledger by vendor: ${VENDORS_USED.map((v) => `${v} $${vendorSpent(l1, v).toFixed(4)}`).join(", ")}`);
if (stopped || skipped.length) {
  console.error(`STOPPED/SHORTENED BY BUDGET: ${stopped ?? `${skipped.length} trial(s) skipped`}`);
  process.exit(4);
}
