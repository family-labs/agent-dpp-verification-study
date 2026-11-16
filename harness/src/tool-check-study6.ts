/**
 * Study 6 LIVE: the TOOL CHECK, run once before A36 is fixed and registered (plan section 5, step 5).
 * It is NOT a trial: no product, no shop page and nothing about passports is shown. It answers, per
 * vendor tool, the questions the live design depends on:
 *   - does the tool reach our live site at all (an access-log row), and with which user agent?
 *   - does it follow a link it finds on a page (the second page's row)?
 *   - does it read a JSON file on our host (the declaration is JSON)?
 *   - does it reach the public explorer's JSON API (the ledger record)?
 *   - does its answer carry the code words, i.e. did the model really read what was fetched?
 * The site must be in phase "check" (src/site-admin.ts phase check), which shows only the neutral
 * pages of site/assets.ts CHECK_PAGES; every other path shows the closed shop.
 *
 * Usage (from harness/):  bun run src/tool-check-study6.ts --i-approve-spend [--models openai,gemini,...]
 * One call per model (two API calls each with the follow-up omitted). Spend goes to the live ledger as
 * kind "check", capped at USD 0.50 in all. Writes results/tool-check-study6-<time>.json.
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { liveAdapter } from "./agents/live-web";
import { remoteSite, shareQuery, shareTag, TRIAL_GAP_MS, attribute } from "./study6-site";
import { appendLiveLedger, callCost, KIND_CAP, liveKindSpent, liveVendorSpent, readLiveLedger, readPricing, RESULTS } from "./study6-live-ledger";
import { ALL_LABELS, LIVE_VENDOR_CAPS, OPENROUTER_PINS, S6_MODELS, type LiveLabel } from "./study6-live-models";
import { CHECK_CODE_WORDS, CHECK_EXPLORER_URL, CHECK_PATHS } from "../../site/assets";
import type { CallUsage } from "./types";

const argv = process.argv.slice(2);
if (!argv.includes("--i-approve-spend")) {
  console.error("REFUSED: the tool check calls six paid APIs (at most USD 0.50 in all). Run it only after James approves, with --i-approve-spend.");
  process.exit(1);
}
const mi = argv.indexOf("--models");
const labels = (mi >= 0 ? argv[mi + 1] : ALL_LABELS.join(",")).split(",") as LiveLabel[];
const PER_CALL_GATE = 0.08;
const site = remoteSite();
const h = await site.health();
if (h.phase !== "check") {
  console.error(`REFUSED: the site shows phase ${h.phase}, not "check" (src/site-admin.ts phase check)`);
  process.exit(1);
}
const pricing = readPricing();
const QUESTION = "What is the code word on this page? Please also open the page it links to and tell me that page's code word, the code word in the data file that page links to, and the value of total_blocks in the network statistics it links to.";
const out: unknown[] = [];
let lastId = (await site.logSince(0)).requests.reduce((m, r) => Math.max(m, r.id), 0);
for (const label of labels) {
  const def = S6_MODELS[label];
  const model = process.env[def.env] ?? def.fallback;
  const l = readLiveLedger();
  if (liveKindSpent(l, "check") + PER_CALL_GATE > KIND_CAP.check || liveVendorSpent(l, def.vendor) + PER_CALL_GATE > LIVE_VENDOR_CAPS[def.vendor]) {
    console.log(`${label}: skipped (check budget)`);
    continue;
  }
  const tag = shareTag();
  const url = `https://oskvale.com${CHECK_PATHS.first}${shareQuery(tag)}`;
  let tokens = 0;
  const usage = { inputTokens: 0, outputTokens: 0 };
  const start = Date.now();
  let res = null;
  let error: string | null = null;
  try {
    res = await liveAdapter(def.vendor, model, OPENROUTER_PINS[model], label).run({
      system: "You are a helpful assistant.",
      user: `${QUESTION}\n\n${url}`,
      followUp: "Thank you. Reply with OK.",
      onUsage: (u: CallUsage) => {
        usage.inputTokens += u.inputTokens;
        usage.outputTokens += u.outputTokens;
        tokens += callCost(pricing.models[model], u);
      },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const end = Date.now();
  await new Promise((r) => setTimeout(r, TRIAL_GAP_MS));
  const rows = (await site.logSince(lastId)).requests;
  if (rows.length) lastId = rows[rows.length - 1].id;
  const att = attribute(rows, { startMs: start, endMs: end, tag, vendor: label, requested: (res?.webCalls ?? []).map((c) => c.url) });
  const cost = Math.max(tokens + (res?.fees.usd ?? 0), res?.reportedCostUsd ?? 0);
  appendLiveLedger({ at: new Date(start).toISOString(), runId: "tool-check", kind: "check", block: "check", product: null, condition: null, vendor: def.vendor, model, costUsd: cost, toolFeesUsd: res?.fees.usd ?? 0, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, aborted: error !== null });
  const text = res?.text ?? "";
  const words = Object.fromEntries(Object.entries(CHECK_CODE_WORDS).map(([k, w]) => [k, text.toLowerCase().includes(w)]));
  const r = {
    label,
    model,
    error,
    costUsd: cost,
    userAgents: [...new Set(att.rows.map((x) => x.ua))],
    rows: att.rows.map((x) => ({ ts: x.ts, path: x.path, query: x.query, status: x.status, ua: x.ua, asn: x.asn, as_org: x.as_org, verified_bot: x.verified_bot, verified_bot_category: x.verified_bot_category })),
    backgroundRowsInWindow: att.backgroundRows,
    reachedSite: att.rows.length > 0,
    followedLink: att.rows.some((x) => x.path === CHECK_PATHS.second),
    readJsonOnOurHost: att.rows.some((x) => x.path === CHECK_PATHS.json && x.status === 200),
    explorerReported: (res?.webCalls ?? []).some((c) => c.url?.startsWith(CHECK_EXPLORER_URL.slice(0, 40))),
    codeWordsInAnswer: words,
    webCalls: res?.webCalls ?? [],
    answer: text,
  };
  out.push(r);
  console.log(`${label}: site=${r.reachedSite} link=${r.followedLink} json=${r.readJsonOnOurHost} explorer=${r.explorerReported} words=${JSON.stringify(words)} ua=${JSON.stringify(r.userAgents)} $${cost.toFixed(4)}${error ? ` ERROR ${error.slice(0, 100)}` : ""}`);
}
mkdirSync(RESULTS, { recursive: true });
const f = `${RESULTS}tool-check-study6-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(f, JSON.stringify({ ranAt: new Date().toISOString(), site: h, question: QUESTION, results: out }, null, 2) + "\n");
console.log(`\nWrote ${f}`);
