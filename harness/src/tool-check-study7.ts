/**
 * Study 7 TOOL CHECK (before A37 is registered; not a trial). Site phase must be S7R. One call per model
 * asks for the heading and first sentence of two neutral pages: the shop's contact page on
 * oskvale-store.com and a record page on passportrecord.org for an identifier that is NOT a study product
 * (it answers "no record"). Shows each vendor tool reaches both hosts and reads the record page.
 * Usage (from harness/):  bun run src/tool-check-study7.ts --i-approve-spend
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { liveAdapter } from "./agents/live-web";
import { attribute, remoteSite, shareQuery, shareTag, TRIAL_GAP_MS } from "./study6-site";
import { appendLiveLedger, callCost, readLiveLedger, readPricing, RESULTS } from "./study6-live-ledger";
import { ALL_LABELS, OPENROUTER_PINS, S6_MODELS, type LiveLabel } from "./study6-live-models";
import type { CallUsage } from "./types";

if (!process.argv.includes("--i-approve-spend")) {
  console.error("REFUSED: needs --i-approve-spend (James's yes)");
  process.exit(1);
}
const site = remoteSite();
const h = await site.health();
if (h.phase !== "S7R") {
  console.error(`REFUSED: the site shows phase ${h.phase}, not S7R`);
  process.exit(1);
}
const CAP = 0.5;
const spentCheck = () => readLiveLedger().entries.filter((e) => e.kind === "check").reduce((s, e) => s + e.costUsd, 0);
const pricing = readPricing();
const RECORD = "https://passportrecord.org/01/09520606000099/21/000001";
const out: unknown[] = [];
let lastId = (await site.logSince(0)).requests.reduce((m, r) => Math.max(m, r.id), 0);
for (const label of ALL_LABELS as readonly LiveLabel[]) {
  if (spentCheck() > CAP) break;
  const def = S6_MODELS[label];
  const model = process.env[def.env] ?? def.fallback;
  const tag = shareTag();
  const contact = `https://oskvale-store.com/contact${shareQuery(tag)}`;
  const q = `Please open these two pages and tell me the main heading and the first sentence of each.\n\n${contact}\n${RECORD}`;
  let cost = 0;
  let res = null;
  let error: string | null = null;
  const start = Date.now();
  try {
    res = await liveAdapter(def.vendor, model, OPENROUTER_PINS[model], label).run({ system: "You are a helpful assistant.", user: q, followUp: "Thank you. Reply with OK.", onUsage: (u: CallUsage) => (cost += callCost(pricing.models[model], u)) });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const end = Date.now();
  await new Promise((r) => setTimeout(r, TRIAL_GAP_MS));
  const rows = (await site.logSince(lastId)).requests;
  if (rows.length) lastId = rows[rows.length - 1].id;
  const att = attribute(rows, { startMs: start, endMs: end, tag, vendor: label, requested: (res?.webCalls ?? []).map((c) => c.url) });
  cost = Math.max(cost + (res?.fees.usd ?? 0), res?.reportedCostUsd ?? 0);
  appendLiveLedger({ at: new Date(start).toISOString(), runId: "tool-check-study7", kind: "check", block: "S7R", product: null, condition: null, vendor: def.vendor, model, costUsd: cost, toolFeesUsd: res?.fees.usd ?? 0, inputTokens: 0, outputTokens: 0, aborted: error !== null });
  const text = res?.text ?? "";
  const r = {
    label,
    model,
    error,
    costUsd: cost,
    shopReached: att.rows.some((x) => x.host === "oskvale-store.com" && x.path === "/contact" && x.status === 200),
    recordReached: att.rows.some((x) => x.host === "passportrecord.org" && x.path.startsWith("/01/") && x.status === 200),
    answerHasContact: /contact/i.test(text),
    answerHasNoRecord: /no passport record/i.test(text),
    userAgents: [...new Set(att.rows.map((x) => x.ua))],
    rows: att.rows.map((x) => ({ host: x.host, path: x.path, status: x.status, ua: x.ua })),
    webCalls: res?.webCalls ?? [],
    answer: text,
  };
  out.push(r);
  console.log(`${label}: shop=${r.shopReached} record=${r.recordReached} answer: contact=${r.answerHasContact} no-record=${r.answerHasNoRecord} ua=${JSON.stringify(r.userAgents).slice(0, 90)} $${cost.toFixed(4)}${error ? ` ERROR ${error.slice(0, 90)}` : ""}`);
}
mkdirSync(RESULTS, { recursive: true });
const f = `${RESULTS}tool-check-study7-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(f, JSON.stringify({ ranAt: new Date().toISOString(), site: h, record: RECORD, results: out }, null, 2) + "\n");
console.log(`Wrote ${f}`);
