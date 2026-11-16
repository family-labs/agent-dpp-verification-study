/**
 * Study 8 tool check (A41 draft): can each model use the open verify tool (MCP, verify-tool.ts) BESIDE its
 * vendor's own web tool in one conversation? One call per model; the site is not needed (the web part
 * reads example.com). Records, per model: did the vendor accept the tool, did the model call it, what it
 * answered, did it also use its web tool, errors, cost. Spend goes to the live ledger as kind "check".
 *
 *   bun run src/tool-check-study8.ts --i-understand-this-costs-money [--models openai,kimi,...] [--cap USD (default 0.30, max 1.50)]
 */
import "./env";
import { writeFileSync, mkdirSync } from "node:fs";
import { liveAdapter } from "./agents/live-web";
import { appendLiveLedger, callCost, readPricing, RESULTS, type Price } from "./study6-live-ledger";
import { ALL_LABELS, OPENROUTER_PINS, S6_MODELS, type BillingVendor, type LiveLabel } from "./study6-live-models";
import { createVerifyTool, UGP_VERIFY_COMMIT, verifyDistSha } from "./verify-tool";
import type { CallUsage } from "./types";

if (!process.argv.includes("--i-understand-this-costs-money")) {
  console.error("REFUSED: the tool check calls paid APIs; add --i-understand-this-costs-money");
  process.exit(1);
}
const ci = process.argv.indexOf("--cap");
const CAP = ci > 0 ? Number(process.argv[ci + 1]) : 0.3;
if (!(CAP > 0 && CAP <= 1.5)) {
  console.error("REFUSED: --cap must be in (0, 1.5]");
  process.exit(2);
}
const i = process.argv.indexOf("--models");
const labels = (i > 0 ? process.argv[i + 1] : ALL_LABELS.join(",")).split(",") as LiveLabel[];
const pricing = readPricing();
const SYSTEM = "You are a helpful assistant.";
const USER =
  "Two quick things, using your tools. First, check the product passport https://ugpdpp.org/01/09520606000019/21/000001 and tell me what the check says. Second, open https://example.com and tell me its heading.";
const FOLLOW_UP = 'Reply with JSON only: {"passportCheck": "<what the check said, or none>", "heading": "<heading, or none>"}';

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const out: unknown[] = [];
let spent = 0;
for (const label of labels) {
  const def = S6_MODELS[label];
  const model = process.env[def.env] ?? def.fallback;
  const price = pricing.models[model] as Price;
  const tool = await createVerifyTool();
  let cost = 0;
  let error: string | null = null;
  let r = null;
  try {
    r = await liveAdapter(def.vendor as BillingVendor, model, OPENROUTER_PINS[model], label).run({
      system: SYSTEM,
      user: USER,
      followUp: FOLLOW_UP,
      extraTool: tool,
      onUsage: (u: CallUsage) => {
        cost += callCost(price, u);
        if (spent + cost > CAP) throw new Error(`cap USD ${CAP} reached`);
      },
    });
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : String(e);
  }
  cost = Math.max(cost + (r?.fees.usd ?? 0), r?.reportedCostUsd ?? 0);
  spent += cost;
  appendLiveLedger({ at: new Date().toISOString(), runId, kind: "check", block: "S8", product: "-", condition: "tool-check", vendor: def.vendor as BillingVendor, model, costUsd: cost, toolFeesUsd: r?.fees.usd ?? 0, inputTokens: 0, outputTokens: 0, aborted: error !== null });
  const row = { label, model, error, toolCalls: tool.log.map((c) => ({ args: c.args, status: c.status })), webCalls: (r?.webCalls ?? []).map((w) => ({ tool: w.tool, action: w.action, url: w.url, query: w.query })), text: r?.text ?? "", followUpText: r?.followUpText ?? "", costUsd: cost };
  out.push(row);
  console.log(`${label}: ${error ? `ERROR ${error}` : `tool calls ${tool.log.length} [${tool.log.map((c) => c.status).join(",")}], web calls ${row.webCalls.length}`} $${cost.toFixed(4)}`);
  console.log(`   follow-up: ${(r?.followUpText ?? "").replace(/\s+/g, " ").slice(0, 220)}`);
}
mkdirSync(RESULTS, { recursive: true });
const file = `${RESULTS}tool-check-study8-${runId}.json`;
writeFileSync(file, JSON.stringify({ runId, verifyTool: { commit: UGP_VERIFY_COMMIT, distSha256: verifyDistSha() }, user: USER, followUp: FOLLOW_UP, rows: out, spentUsd: spent }, null, 2) + "\n");
console.log(`\nWrote ${file}; spent $${spent.toFixed(4)}`);
