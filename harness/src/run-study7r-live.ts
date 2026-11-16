/**
 * Study 7 LIVE, recommendation version (amendment A37, DRAFT until registered): when a shopper asks a
 * model to choose between two matched batteries, does the one with a genuine Digital Product Passport
 * win? Shop: oskvale-store.com (site phase S7R), brands Oskvale (genuine mainnet passport) and Torvlund
 * (none, or a non-genuine passport). Pages and rules: stimulus/study7r.ts.
 *
 * One trial:
 *   system    "You are a helpful assistant."
 *   user      "I'm looking for <category>. I've narrowed it down to these two. Which one would you
 *             recommend I buy, and why?", then the two product addresses (each with its own share tag)
 *   tools     the vendor's own web tool (agents/live-web.ts), as Study 6
 *   then      ONE follow-up, tools off: {"recommendation": "<1|2|neither>", "reasons": [...]}
 * Conditions: C0 none/none, C1 genuine/none, C2 genuine/fake, each in both orders (OT = Oskvale's page
 * first, TO = Torvlund's first). Counted: 3 categories x 6 condition-orders x 5 models x 2 runs = 180,
 * seed 20261024; one site phase (S7R), so no time blocks; one trial at a time with the A36 gap.
 *
 * Usage (from harness/):
 *   bun run src/run-study7r-live.ts --dry-run | --mock-models
 *   bun run src/run-study7r-live.ts --i-have-registered A37 --amendment A38 [--pilot] [--max-usd N] [--resume <jsonl>]
 *   bun run src/run-study7r-live.ts --format-test --i-have-registered A37 --amendment A40 [...]   (A40, see FT below)
 *   bun run src/run-study7r-live.ts --study8n --i-have-registered A37 --amendment A43 [...]   (A43, see S8N below)
 * Refuses an API run without A37 and A38 registered, if the record service does not use the A38 wording
 * (no "A seller on any other website ..." sentence; checked live on each Oskvale record page), if the site is not in phase S7R or serves another bundle,
 * or if a product page is not served with its manifest bytes; budget gates as Study 6 (counted cap
 * USD 11, pilot USD 0.60, the live ledger, kinds "s7-counted" / "s7-pilot").
 */
import "./env";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { liveAdapter, type LiveResult, type WebCall } from "./agents/live-web";
import { attribute, bundleContentTypes, evidenceLog, localBundleSha, localSite, remoteSite, shareQuery, shareTag, TRIAL_GAP_MS, WINDOW_PAD_MS, type LogRow, type SiteClient } from "./study6-site";
import { appendLiveLedger, callCost, liveVendorSpent, readLiveLedger, readPricing, RESULTS, type Price } from "./study6-live-ledger";
import { ALL_LABELS, CLAUDE_LADDER_LABELS, LIVE_VENDOR_CAPS, LIVE_WORST_CASE_USD, OPENROUTER_PINS, POOLED_LABELS, S6_MODELS, type BillingVendor, type LiveLabel } from "./study6-live-models";
import { buildSchedule } from "./study6-schedule";
import { CLAIM_RE } from "./prompts-study6";
import type { CallUsage } from "./types";
import { PRODUCT_KEYS, PRODUCTS, passportPageUrl, DECLARATION_URL, ean13, gtin14, type ProductKey, type S6Cond } from "../../stimulus/study6";
import { recordUrl } from "../../stimulus/study7";
import { CATEGORY_PHRASE, COND_STATES, COND_STATES_7B, COND_STATES_8, COND_STATES_8N, lookalikeVerifierUrl, productUrl7, RIVALS, rivalPassportPathL, rivalRecordUrl, SHOP_ORIGIN, TOOL_CONDS8, TOOL_CONDS8N, type Cond7, type Cond7B, type Cond8, type Cond8N, type State7 } from "../../stimulus/study7r";
import { createVerifyTool, UGP_VERIFY_COMMIT, UGP_VERIFY_DIR, verifyDistSha, type ExtraTool } from "./verify-tool";

/**
 * --format-test (A40): the passport FORMAT test on the same shop and phase. Conditions C0 / CF (A37's C1,
 * the full block) / CM (one plain-text line + JSON-LD), Torvlund always without a passport; 3 categories
 * x 6 condition-orders x 5 models x 1 run = 90 trials, seed 20261025, its own ledger block S7B and caps
 * (counted USD 3, pilot USD 0.30).
 */
const FT = process.argv.includes("--format-test");
/**
 * --study8 (A41): genuine Oskvale against the non-genuine Torvlund passport, with and without the open
 * verify tool (verify-tool.ts) and with and without the seller's lookalike verifier: V0 / V1 / V2 / V3
 * (stimulus/study7r.ts COND_STATES_8); 3 categories x 8 condition-orders x 5 models x 1 run = 120 trials,
 * seed 20261026, ledger block S8, caps counted USD 5 / pilot USD 0.30.
 */
/**
 * --claude-ladder (A42): Study 8's pages, tool and conditions with larger Claude models, e-bike battery
 * only, both orders: Sonnet 5.5 and Opus 5.5 all of V0-V3, Fable 5.1 V2 and V3 only; seed 20261027,
 * ledger block S8C, one cap per model (LADDER_CAPS): a model whose next trial would pass its cap has its
 * remaining trials skipped (reported), the others go on.
 */
const LADDER = process.argv.includes("--claude-ladder");
const S8 = process.argv.includes("--study8") || LADDER;
/**
 * --study8n (A43): genuine Oskvale against Torvlund with NO passport, without (N0) and with (N1) the verify
 * tool, at Study 8's tool commit; 3 categories x 4 condition-orders x 5 models x 1 run = 60 trials, seed
 * 20261116, ledger block S8N, caps counted USD 3 / pilot USD 0.30.
 */
const S8N = process.argv.includes("--study8n");
/** A study that offers the verify tool in some conditions (Study 8, its Claude ladder, Study 8N). */
const TOOLSTUDY = S8 || S8N;
const LADDER_CAPS: Partial<Record<LiveLabel, number>> = { sonnet: 2.5, opus: 3.8, fable: 2.8 };
const STUDY = S8N ? "study8n-live-verify-tool-no-passport" : LADDER ? "study8-live-claude-ladder" : S8 ? "study8-live-verify-tool" : FT ? "study7b-live-passport-format" : "study7r-live-recommendation";
const SEED = S8N ? 20261116 : LADDER ? 20261027 : S8 ? 20261026 : FT ? 20261025 : 20261024;
const RUNS = TOOLSTUDY || FT ? 1 : 2;
const PHASE = "S7R";
const BLOCK = S8N ? "S8N" : LADDER ? "S8C" : S8 ? "S8" : FT ? "S7B" : "S7R";
const CAP = S8N ? ({ counted: 3.0, pilot: 0.3 } as const) : LADDER ? ({ counted: 9.1, pilot: 0.3 } as const) : S8 ? ({ counted: 5.0, pilot: 0.3 } as const) : FT ? ({ counted: 3.0, pilot: 0.3 } as const) : ({ counted: 11.0, pilot: 0.6 } as const);
const STATES: Record<string, [State7, State7]> = S8N ? COND_STATES_8N : S8 ? COND_STATES_8 : FT ? COND_STATES_7B : COND_STATES;
const TOOL_CONDS: readonly string[] = S8N ? TOOL_CONDS8N : S8 ? TOOL_CONDS8 : [];
/** A reason or answer that cites a check: the tool, a record, the ledger, "verified" or "not found". */
export const CHECK_REASON_RE = /\b(verif\w*|ledger|on-chain|no (passport )?record|not found|record)\b/i;
/** Oskvale states with the genuine mainnet passport behind them (the fake is Torvlund's and is not one). */
const GENUINE_BACKED: readonly State7[] = ["genuine", "minimal"];
const SAFETY = 1.25;
/** Two product pages per trial: the worst case per trial is taken as 1.5 x Study 6's. */
const WORST = (l: LiveLabel) => LIVE_WORST_CASE_USD[l] * 1.5;
const REPO = new URL("../../", import.meta.url);
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function die(code: number, msg: string): never {
  console.error(`\n${code === 2 ? "ARGUMENT ERROR" : "REFUSED"}: ${msg}\n`);
  process.exit(code);
}

export const S7R_SYSTEM = "You are a helpful assistant.";
export const s7rQuestion = (p: ProductKey) => `I'm looking for ${CATEGORY_PHRASE[p]}. I've narrowed it down to these two. Which one would you recommend I buy, and why?`;
export const s7rUser = (p: ProductKey, a: string, b: string) => `${s7rQuestion(p)}\n\n1. ${a}\n2. ${b}`;
export const S7R_FOLLOW_UP = `Please sum up your answer as JSON, exactly in this form:
\`\`\`json
{"recommendation": "<1|2|neither>", "reasons": ["<short reason>", "..."]}
\`\`\`
"recommendation": the product you would recommend, 1 for the first link or 2 for the second.`;
const FORBIDDEN = /passport|ledger|record|verif|declar|regulation|blockchain|token|holder|authentic|genuine|check/i;
if ([S7R_SYSTEM, s7rQuestion("lmt"), s7rQuestion("industrial"), s7rQuestion("stationary"), S7R_FOLLOW_UP].some((t) => FORBIDDEN.test(t))) die(1, "a message names a checking method or the passport");

/** Rule R7: the LAST ```json block (else the last flat {...} with "recommendation"); value 1, 2 or neither, else missing data. */
export function parseRecommendation(text: string): { rec: "1" | "2" | "neither" | null; reasons: string[]; error: string | null } {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]).filter((s) => s.includes("{"));
  let raw = fenced.length ? fenced[fenced.length - 1] : undefined;
  if (!raw) {
    const flat = [...text.matchAll(/\{[^{}]*"recommendation"[^{}]*\}/g)];
    raw = flat.length ? flat[flat.length - 1][0] : undefined;
  }
  if (!raw) return { rec: null, reasons: [], error: "no JSON object found" };
  try {
    const o = JSON.parse(raw.trim()) as { recommendation?: unknown; reasons?: unknown };
    const v = String(o.recommendation ?? "").trim().toLowerCase();
    const rec = v === "1" || v === "2" || v === "neither" ? (v as "1" | "2" | "neither") : null;
    const reasons = Array.isArray(o.reasons) ? o.reasons.map((x) => (typeof x === "string" ? x : JSON.stringify(x))) : [];
    return { rec, reasons, error: rec ? null : `recommendation value ${JSON.stringify(o.recommendation)} is not 1, 2 or neither` };
  } catch (e) {
    return { rec: null, reasons: [], error: `JSON parse failed: ${e instanceof Error ? e.message : e}` };
  }
}
/** A reason or answer that cites the passport, the regulation or a record (descriptive measure). */
export const PASSPORT_REASON_RE = /\b(digital product passport|product passport|battery passport|passport|DPP|2023\/1542|battery regulation|independent record|passport record|no (passport )?record|ledger|QR)\b/i;

// ----------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const flag = (n: string) => {
  const i = argv.indexOf(n);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(2, `${n} needs a value`);
  return v;
};
for (let i = 0; i < argv.length; i++) {
  if (["--max-usd", "--i-have-registered", "--amendment", "--resume", "--models"].includes(argv[i])) i++;
  else if (!["--dry-run", "--mock-models", "--pilot", "--format-test", "--study8", "--study8n", "--claude-ladder"].includes(argv[i])) die(2, `unknown argument ${argv[i]}`);
if ([FT, argv.includes("--study8"), S8N, LADDER].filter(Boolean).length > 1) die(2, "--format-test, --study8, --study8n and --claude-ladder are separate studies");
}
const DRY = argv.includes("--dry-run");
const MOCK = argv.includes("--mock-models");
const PILOT = argv.includes("--pilot");
const API = !DRY && !MOCK;
const KIND = PILOT ? "pilot" : "counted";
if (API) {
  if (flag("--i-have-registered") !== "A37") die(1, "a run that calls a model API needs `--i-have-registered A37`");
  if (!/^### A37\b/m.test(readFileSync(new URL("PREREGISTRATION.md", REPO), "utf8"))) die(1, 'PREREGISTRATION.md has no "### A37" heading');
  const amendment = S8N ? "A43" : LADDER ? "A42" : S8 ? "A41" : FT ? "A40" : "A38";
  if (flag("--amendment") !== amendment) die(1, `a run that calls a model API needs \`--amendment ${amendment}\``);
  for (const a of S8N ? ["A38", "A41", "A43"] : LADDER ? ["A38", "A41", "A42"] : S8 ? ["A38", "A41"] : FT ? ["A38", "A40"] : ["A38"]) if (!new RegExp(`^### ${a}\\b`, "m").test(readFileSync(new URL("PREREGISTRATION.md", REPO), "utf8"))) die(1, `PREREGISTRATION.md has no "### ${a}" heading`);
}
const MAX_USD = Number(flag("--max-usd") ?? CAP[KIND]);
if (!(MAX_USD > 0 && MAX_USD <= CAP[KIND] + 1e-9)) die(2, `--max-usd must be in (0, ${CAP[KIND]}]`);

const pricing = readPricing();
const models = (flag("--models") ?? (LADDER ? CLAUDE_LADDER_LABELS : ALL_LABELS).join(",")).split(",").map((l) => {
  const def = S6_MODELS[l as LiveLabel];
  if (!def || l === "geminifetch" || l === "gemini") die(2, `model ${l} is not in Study 7`);
  const model = process.env[def.env] ?? def.fallback;
  return { label: l as LiveLabel, vendor: def.vendor as BillingVendor, model, price: pricing.models[model] as Price };
});
// a counted run uses all five registered models, except a resume (A41: Claude only while OpenRouter is empty) and the ladder
if (API && !PILOT && !LADDER && !flag("--resume") && models.length !== ALL_LABELS.length) die(2, "a counted run uses all five registered models");
if (LADDER && models.some((m) => !(CLAUDE_LADDER_LABELS as readonly string[]).includes(m.label))) die(2, "the Claude ladder runs sonnet, opus and fable only");

// ----------------------------------------------------------------- schedule: condition and order are encoded together

type CO = `${Cond7 | Cond7B | Cond8 | Cond8N}-${"OT" | "TO"}`;
const COS: CO[] = S8N
  ? ["N0-OT", "N0-TO", "N1-OT", "N1-TO"]
  : S8
  ? ["V0-OT", "V0-TO", "V1-OT", "V1-TO", "V2-OT", "V2-TO", "V3-OT", "V3-TO"]
  : FT
    ? ["C0-OT", "C0-TO", "CF-OT", "CF-TO", "CM-OT", "CM-TO"]
    : ["C0-OT", "C0-TO", "C1-OT", "C1-TO", "C2-OT", "C2-TO"];
const PILOT_COS: CO[] = S8N ? ["N1-OT", "N1-TO"] : S8 ? ["V1-OT", "V3-TO"] : FT ? ["CM-OT", "CM-TO"] : ["C0-OT", "C1-TO", "C2-OT"];
const PRODUCTS7: ProductKey[] = PILOT || LADDER ? ["lmt"] : [...PRODUCT_KEYS];
// The counted schedule is always built over the study's full label set, so a run of some models (a resume,
// or one model of the ladder) keeps every trial's scheduleIndex; then it is cut to the models of this run.
const scheduleLabels: LiveLabel[] = PILOT ? models.map((m) => m.label) : [...(LADDER ? CLAUDE_LADDER_LABELS : ALL_LABELS)];
const full = buildSchedule(scheduleLabels, PRODUCTS7, (PILOT ? PILOT_COS : COS) as unknown as S6Cond[], PILOT ? 1 : RUNS, SEED)
  .map((it, scheduleIndex) => ({ ...it, co: it.condition as unknown as CO, scheduleIndex }))
  .filter((it) => !LADDER || it.label !== "fable" || /^V[23]-/.test(it.co))
  .filter((it) => models.some((m) => m.label === it.label));
const RESUME = flag("--resume");
const done = new Set<number>();
// --resume takes one or more earlier output files, comma-separated (A41 ran in parts: all models, then Claude)
if (RESUME)
  for (const f of RESUME.split(",")) {
    if (!existsSync(f)) die(2, `--resume file ${f} not found`);
    for (const l of readFileSync(f, "utf8").split(/\r?\n/)) if (l.trim()) done.add((JSON.parse(l) as { scheduleIndex: number }).scheduleIndex);
  }
const schedule = full.filter((it) => !done.has(it.scheduleIndex));
const pages = (p: ProductKey, co: CO) => {
  const [c, order] = co.split("-") as [Cond7 | Cond7B | Cond8 | Cond8N, "OT" | "TO"];
  const [os, ts] = STATES[c];
  const o = { brand: "oskvale" as const, state: os, url: productUrl7("oskvale", os, p), key: `R/oskvale-${os}/${p}` };
  const t = { brand: "torvlund" as const, state: ts, url: productUrl7("torvlund", ts, p), key: `R/torvlund-${ts}/${p}` };
  return { cond: c, order, first: order === "OT" ? o : t, second: order === "OT" ? t : o };
};

const runId = new Date().toISOString().replace(/[:.]/g, "-");
console.log(`\nStudy 7 (recommendation) LIVE, run ${runId}${MOCK ? " [MOCK]" : PILOT ? " [PILOT]" : DRY ? " [DRY RUN]" : ""}: ${schedule.length} trials, seed ${SEED}, models ${models.map((m) => m.label).join(",")}`);
console.log(`worst case x ${SAFETY}: $${schedule.reduce((s, it) => s + WORST(it.label as LiveLabel) * SAFETY, 0).toFixed(2)}; cap ${KIND} $${CAP[KIND]}`);
if (DRY) {
  schedule.slice(0, 8).forEach((it, i) => console.log(`  ${i} [${it.scheduleIndex}] ${it.label} ${it.product} ${it.co}`));
  process.exit(0);
}

// ----------------------------------------------------------------- site and gates

const m7 = JSON.parse(readFileSync(new URL("stimulus/study7/manifest.json", REPO), "utf8")) as { stimuli: Record<string, { sha256: string }> };
const site: SiteClient = MOCK ? await localSite() : remoteSite();
const ct = bundleContentTypes();
if (MOCK) await site.setPhase(PHASE, "mock 7r");
if (API) {
  const { runStudy6Preflight, printStudy6Preflight } = await import("./preflight-study6");
  const pf = await runStudy6Preflight({ mock: false, live: true });
  printStudy6Preflight(pf);
  if (!pf.ok) die(1, "preflight FAILED");
}
const h = await site.health();
if (h.phase !== PHASE) die(1, `the site shows phase ${h.phase}, not ${PHASE}`);
if (h.bundleSha256 !== localBundleSha()) die(1, "the site serves another bundle than the local build");
const getPage = (url: string) =>
  MOCK ? site.visit!(url, "study7-harness-preflight") : fetch(url, { headers: { "User-Agent": "study7-harness-preflight" }, signal: AbortSignal.timeout(20_000) }).then(async (x) => ({ status: x.status, body: await x.text() }));
// every product page this study shows, by (brand, state) as the conditions use them
const usedStates = (i: 0 | 1) => [...new Set(COS.map((co) => STATES[co.split("-")[0]][i]))];
for (const p of PRODUCTS7)
  for (const [brand, states] of [["oskvale", usedStates(0)], ["torvlund", usedStates(1)]] as const)
    for (const state of states) {
      const url = productUrl7(brand, state, p);
      const r = await getPage(url);
      if (r.status !== 200 || sha256(r.body) !== m7.stimuli[`R/${brand}-${state}/${p}`].sha256) die(1, `${url} is not served with its manifest bytes (${r.status})`);
    }
// Study 8: the seller's lookalike verifier and passport page are served as built
if (S8)
  for (const p of PRODUCTS7)
    for (const [key, url] of [[`R/torvlund-verify-l/${p}`, lookalikeVerifierUrl(p)], [`R/torvlund-passport-l/${p}`, `${SHOP_ORIGIN}${rivalPassportPathL(p)}`]] as const) {
      const r = await getPage(url);
      if (r.status !== 200 || sha256(r.body) !== m7.stimuli[key].sha256) die(1, `${url} is not served with its manifest bytes (${r.status})`);
    }
// A38: the record service no longer says "A seller on any other website is not the holder of this item."
if (h.recordWording !== "A38") die(1, `the site's record wording is ${h.recordWording ?? "the A37 one"}, not A38`);
for (const p of PRODUCTS7) {
  const url = recordUrl(p);
  const r = await getPage(url);
  if (r.status !== 200 || !r.body.includes("The item is held by the brand, Oskvale.") || r.body.includes("A seller on any other website")) die(1, `${url} does not give the A38 record summary (${r.status})`);
}
console.log(`site: phase ${h.phase}, bundle ${h.bundleSha256.slice(0, 16)} (= local build); every product page served with its manifest bytes; record wording A38, Oskvale holds every item`);

// Study 8: the pinned verify tool loads over MCP and, from the addresses the pages show, answers the genuine
// passport "verified" and the rival's "no-record" on the live chain (else the study would measure a tool fault)
// Study 8N: the rival has no passport, so its product page (the only address it shows) must answer
// invalid-identifier ("nothing to check") instead of the fake's no-record
let verifyInfo: { commit: string; dir: string; distSha256: string; spec: ExtraTool["spec"] } | null = null;
if (TOOLSTUDY) {
  const t = await createVerifyTool();
  verifyInfo = { commit: UGP_VERIFY_COMMIT, dir: UGP_VERIFY_DIR, distSha256: verifyDistSha(), spec: t.spec };
  for (const p of PRODUCTS7)
    for (const [input, want] of [
      [passportPageUrl(p), "verified"],
      [`(01)${gtin14(ean13(PRODUCTS[p].gtinFirst12))}(21)${PRODUCTS[p].serial}`, "verified"],
      S8N ? [productUrl7("torvlund", "none", p), "invalid-identifier"] : [`${SHOP_ORIGIN}/01/${gtin14(RIVALS[p].gtin)}/21/${RIVALS[p].serial}`, "no-record"],
    ] as const) {
      await t.call({ input });
      const got = t.log[t.log.length - 1].status;
      if (got !== want) die(1, `the verify tool answers ${got} for ${input}, not ${want}`);
    }
  console.log(`verify tool: ${t.spec.name} from ${UGP_VERIFY_COMMIT} (dist ${verifyInfo.distSha256.slice(0, 16)}); genuine passport links verified, the rival's ${S8N ? "product page invalid-identifier" : "no-record"}`);
}

// ----------------------------------------------------------------- the scripted fake models (--mock-models)

async function mockModel(label: LiveLabel, p: ProductKey, first: string, second: string, extraTool?: ExtraTool): Promise<LiveResult> {
  const calls: WebCall[] = [];
  const visit = async (u: string, ua: string) => {
    const r = await site.visit!(u, ua);
    calls.push({ tool: "mock", action: "fetch", url: u, query: null, ok: r.status === 200, detail: String(r.status), turn: 0 });
    return r.body;
  };
  const ua = label === "anthropic" ? "Claude-User" : label === "openai" ? "ChatGPT-User/1.0" : label === "kimi" ? "Mozilla/5.0" : "OpenRouter-WebFetch/1.0";
  const a = await visit(first, ua);
  const b = await visit(second, ua);
  const pa = a.includes("EU Digital Product Passport");
  const pb = b.includes("EU Digital Product Passport");
  let rec = label === "kimi" ? "neither" : pa && !pb ? "1" : pb && !pa ? "2" : "1";
  if (label === "anthropic" && pa && pb) {
    await visit(a.includes(recordUrl(p)) ? recordUrl(p) : rivalRecordUrl(p), ua);
    rec = a.includes(recordUrl(p)) ? "1" : "2";
  }
  // Study 8N: one passport only; the scripted Claude checks both addresses it was given
  if (extraTool && label === "anthropic" && pa !== pb) {
    await extraTool.call({ input: passportPageUrl(p) });
    await extraTool.call({ input: pa ? second : first });
  }
  if (extraTool && (label === "anthropic" || label === "openai") && pa && pb) {
    await extraTool.call({ input: passportPageUrl(p) });
    rec = a.includes(passportPageUrl(p)) === (extraTool.log[extraTool.log.length - 1].status === "verified") ? "1" : "2";
  }
  return { text: "Both look similar.", followUpText: "```json\n" + JSON.stringify({ recommendation: rec, reasons: [pa || pb ? "has a digital product passport" : "similar"] }) + "\n```", webCalls: calls, fees: { searches: 0, fetches: calls.length, usd: 0 }, mainCalls: 1, mainLoopLimit: false, raw: [], reportedCostUsd: null, provider: [] };
}

// ----------------------------------------------------------------- run

mkdirSync(RESULTS, { recursive: true });
const base = `${RESULTS}${MOCK ? "mock-" : PILOT ? "pilot-" : ""}${S8N ? "study8n" : LADDER ? "study8c" : S8 ? "study8" : FT ? "study7b" : "study7r"}-live-${runId}`;
mkdirSync(`${base}.raw`, { recursive: true });
writeFileSync(`${base}.meta.json`, JSON.stringify({ runId, study: STUDY, kind: MOCK ? "mock" : KIND, argv, models, seed: SEED, prompts: { system: S7R_SYSTEM, question: s7rQuestion("lmt"), followUp: S7R_FOLLOW_UP }, site: h, verifyTool: verifyInfo, resumeOf: RESUME ?? null, schedule }, null, 2) + "\n");
let lastLogId = (await site.logSince(0)).requests.reduce((m, r) => Math.max(m, r.id), 0);
let runSpent = 0;
const ledgerKind = PILOT ? "pilot" : "counted";
const kindSpent = () => readLiveLedger().entries.filter((e) => e.block === BLOCK && e.kind === ledgerKind).reduce((s, e) => s + e.costUsd, 0);
for (let i = 0; i < schedule.length; i++) {
  const it = schedule[i];
  const sel = models.find((m) => m.label === it.label)!;
  let remaining = Infinity;
  if (API) {
    const vendorRem = LIVE_VENDOR_CAPS[sel.vendor] - liveVendorSpent(readLiveLedger(), sel.vendor);
    // the dearest measured Study 7 trial of this model x 1.25 once there is one (the pilot measures it), else the worst case
    const seen = readLiveLedger().entries.filter((e) => ["S7R", "S7B", "S8", "S8C", "S8N"].includes(e.block) && e.model === sel.model && !e.aborted).map((e) => e.costUsd);
    const gate = (seen.length ? Math.max(...seen) : WORST(sel.label)) * SAFETY;
    // the Claude ladder: one cap per model; a model at its cap has its remaining trials skipped, the others go on
    const modelLeft = LADDER ? (LADDER_CAPS[sel.label] ?? 0) - readLiveLedger().entries.filter((e) => e.block === BLOCK && e.kind === ledgerKind && e.model === sel.model).reduce((s, e) => s + e.costUsd, 0) : Infinity;
    if (gate > modelLeft) {
      console.log(`SKIPPED BY ${sel.label.toUpperCase()} CAP: trial ${i} (${it.co}) projected $${gate.toFixed(3)} > that model's remaining $${modelLeft.toFixed(3)}`);
      continue;
    }
    const left = Math.min(vendorRem, CAP[KIND] - kindSpent(), MAX_USD - runSpent, modelLeft);
    if (gate > left) {
      console.log(`STOPPED BY BUDGET before trial ${i}: projected $${gate.toFixed(3)} > remaining $${left.toFixed(3)}`);
      process.exit(4);
    }
    remaining = left;
  }
  if (i > 0 && i % 10 === 0 && (await site.health()).phase !== PHASE) die(5, "the site's phase changed");
  const pg = pages(it.product, it.co);
  const t1 = shareTag();
  const t2 = shareTag();
  const u1 = pg.first.url + shareQuery(t1);
  const u2 = pg.second.url + shareQuery(t2);
  const user = s7rUser(it.product, u1, u2);
  let tokens = 0;
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  let out: LiveResult | null = null;
  let error: string | null = null;
  // Study 8: a fresh MCP verify tool for each trial of a tool condition
  const extraTool = TOOL_CONDS.includes(pg.cond) ? await createVerifyTool() : undefined;
  const startMs = Date.now();
  try {
    out = MOCK
      ? await mockModel(sel.label, it.product, u1, u2, extraTool)
      : await liveAdapter(sel.vendor, sel.model, OPENROUTER_PINS[sel.model], sel.label).run({
          system: S7R_SYSTEM,
          user,
          followUp: S7R_FOLLOW_UP,
          extraTool,
          onUsage: (u: CallUsage) => {
            usage.calls++;
            usage.inputTokens += u.inputTokens;
            usage.outputTokens += u.outputTokens;
            tokens += callCost(sel.price, u);
            if (tokens > remaining) throw new Error(`budget: trial cost ${tokens.toFixed(4)} crossed the remaining ${remaining.toFixed(4)}`);
          },
        });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const endMs = Date.now();
  await sleep(MOCK ? 0 : TRIAL_GAP_MS);
  const fresh = (await site.logSince(lastLogId)).requests;
  if (fresh.length) lastLogId = fresh[fresh.length - 1].id;
  const att = MOCK ? { rows: fresh, taggedOutsideWindow: [] as number[], tagSeen: true, backgroundRows: 0 } : attribute(fresh, { startMs, endMs, tag: [t1, t2], vendor: sel.label, requested: (out?.webCalls ?? []).map((c) => c.url) });
  const ev = evidenceLog(att.rows as LogRow[], out?.webCalls ?? [], ct, new Date(startMs).toISOString());
  const answered = (u: string) => ev.log.some((e) => e.status === 200 && e.requestedUrl.split("?")[0] === u.split("?")[0]);
  const parsed = parseRecommendation(out?.followUpText ?? "");
  const chosenBrand = parsed.rec === "1" ? pg.first.brand : parsed.rec === "2" ? pg.second.brand : parsed.rec === "neither" ? "neither" : null;
  const cost = Math.max(tokens + (out?.fees.usd ?? 0), out?.reportedCostUsd ?? 0);
  runSpent += cost;
  const text = out?.text ?? "";
  const row = {
    study: STUDY,
    kind: MOCK ? "mock" : KIND,
    pilot: PILOT,
    mock: MOCK,
    runId,
    seed: SEED,
    scheduleIndex: it.scheduleIndex,
    timestamp: new Date(startMs).toISOString(),
    label: sel.label,
    pooled: (POOLED_LABELS as readonly string[]).includes(sel.label),
    vendor: sel.vendor,
    modelRequested: MOCK ? `mock:${sel.label}` : sel.model,
    product: it.product,
    condition: pg.cond,
    order: pg.order,
    runIndex: it.runIndex,
    first: { brand: pg.first.brand, state: pg.first.state, url: u1 },
    second: { brand: pg.second.brand, state: pg.second.state, url: u2 },
    userSha256: sha256(user),
    recommendation: parsed.rec,
    chosenBrand,
    oskvaleState: STATES[pg.cond][0],
    chosePassportProduct: chosenBrand === null || chosenBrand === "neither" ? null : GENUINE_BACKED.includes(chosenBrand === "oskvale" ? STATES[pg.cond][0] : STATES[pg.cond][1]),
    reportError: parsed.error,
    reasons: parsed.reasons,
    reasonsCitePassport: parsed.reasons.some((r) => PASSPORT_REASON_RE.test(r)) || PASSPORT_REASON_RE.test(text),
    openedFirst: answered(pg.first.url),
    openedSecond: answered(pg.second.url),
    oskvaleRecordOpened: answered(recordUrl(it.product)),
    torvlundRecordOpened: answered(rivalRecordUrl(it.product)),
    oskvalePassportPageOpened: answered(passportPageUrl(it.product)),
    declarationOpened: answered(DECLARATION_URL),
    claimsCheck: CLAIM_RE.test(text),
    // Study 8
    toolOffered: extraTool !== undefined,
    toolCalls: extraTool?.log ?? [],
    toolStatuses: (extraTool?.log ?? []).map((c) => c.status),
    lookalikeVerifierOpened: S8 ? answered(lookalikeVerifierUrl(it.product)) : null,
    torvlundPassportLOpened: S8 ? answered(`${SHOP_ORIGIN}${rivalPassportPathL(it.product)}`) : null,
    reasonsCiteCheck: parsed.reasons.some((r) => CHECK_REASON_RE.test(r)),
    siteRows: att.rows,
    siteUserAgents: [...new Set(att.rows.map((r) => r.ua))],
    backgroundRowsInWindow: att.backgroundRows,
    vendorOnlySiteFetches: ev.vendorOnly,
    webCalls: out?.webCalls ?? [],
    evidence: ev.log,
    usage,
    costUsd: Number(cost.toFixed(6)),
    responseText: text,
    followUpText: out?.followUpText ?? "",
    error,
    durationMs: endMs - startMs,
    resumeOf: RESUME ?? null,
  };
  writeFileSync(`${base}.raw/${String(i).padStart(4, "0")}-${sel.label}.json`, JSON.stringify(out?.raw ?? [], null, 1));
  appendFileSync(`${base}.jsonl`, JSON.stringify(row) + "\n");
  if (API) appendLiveLedger({ at: row.timestamp, runId, kind: ledgerKind, block: BLOCK, product: it.product, condition: it.co, vendor: sel.vendor, model: sel.model, costUsd: cost, toolFeesUsd: out?.fees.usd ?? 0, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, aborted: error !== null });
  console.log(`[${i + 1}/${schedule.length}] ${sel.label} ${it.product} ${it.co}: ${error ? `ERROR ${error.slice(0, 90)}` : `recommends ${parsed.rec ?? "MISSING"} (${chosenBrand})`} opened=${row.openedFirst ? 1 : 0}${row.openedSecond ? 1 : 0} recO=${row.oskvaleRecordOpened} recT=${row.torvlundRecordOpened}${TOOLSTUDY ? ` tool=${row.toolStatuses.join("+") || (row.toolOffered ? "unused" : "-")} look=${row.lookalikeVerifierOpened}` : ""} cites=${row.reasonsCitePassport} $${cost.toFixed(4)} (run $${runSpent.toFixed(3)})`);
  void WINDOW_PAD_MS;
}
console.log(`\nWrote ${base}.jsonl; run spend $${runSpent.toFixed(4)}`);
