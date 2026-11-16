/**
 * Study 5: confirm each OpenRouter provider pin is ACCEPTED and which provider ANSWERS, with one
 * minimal call per model ("Reply with the single word OK.", max_tokens 64, no tools). Each call
 * is entered in the Study 5 ledger (kind "pin-check", pilot). Not a trial.
 *
 * Usage (from harness/):  bun run src/openrouter-pin-check.ts
 * Exit 0 only if every pin is accepted AND the answering provider is the pinned one.
 */
import "./env";
import { pingPin } from "./agents/openrouter";
import { appendLedger, callCost, readPricing } from "./study5-ledger";
import { OPENROUTER_PINS } from "./study5-models";

const pricing = readPricing();
const runId = `pin-check-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let ok = true;
for (const [model, pin] of Object.entries(OPENROUTER_PINS)) {
  const r = await pingPin(model, pin);
  const price = pricing.models[model];
  const cost = r.usage && price ? Math.max(callCost(price, r.usage), r.meta?.reportedCostUsd ?? 0) : 0;
  const expected = pin.order[0].split("/")[0].toLowerCase();
  const answered = (r.meta?.provider ?? "").toLowerCase();
  const pinned = r.ok && answered.replace(/\s+/g, "") === expected.replace(/\s+/g, "");
  ok &&= pinned;
  console.log(
    `${model}  pin=${JSON.stringify(pin)}\n  accepted=${r.ok} status=${r.status.slice(0, 200)} provider=${r.meta?.provider ?? "-"} model=${r.meta?.modelReturned ?? "-"} ` +
      `tokens=${r.usage?.inputTokens ?? 0}/${r.usage?.outputTokens ?? 0} cost=$${cost.toFixed(6)} (reported ${r.meta?.reportedCostUsd ?? "-"})  ${pinned ? "PINNED-OK" : "NOT CONFIRMED"}`,
  );
  if (r.usage)
    appendLedger({
      at: new Date().toISOString(),
      runId,
      pilot: true,
      kind: "pin-check",
      condition: "pin-check",
      vendor: "openrouter",
      model,
      costUsd: cost,
      inputTokens: r.usage.inputTokens,
      cachedInputTokens: 0,
      outputTokens: r.usage.outputTokens,
      aborted: false,
    });
}
process.exit(ok ? 0 : 1);
