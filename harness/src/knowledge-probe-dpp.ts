/**
 * Knowledge probe (exploratory, NOT a registered study; James, 24 Oct 2026: "Models should be somewhat
 * trained on this upcoming regulation, lets see what their current understanding are"). Three plain
 * questions about EU Digital Product Passports, asked of the five Study 6 models WITHOUT any tool, one
 * question per call, vendor-default reasoning. Gemini is left out (James: no Gemini runs for now).
 * Writes results/knowledge-probe-dpp-<time>.json. Spend is booked in the live ledger as kind "check".
 * Usage (from harness/):  bun run src/knowledge-probe-dpp.ts
 */
import "./env";
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { postJsonWithRetry } from "./agents/http";
import { appendLiveLedger, callCost, readPricing, RESULTS } from "./study6-live-ledger";
import { OPENROUTER_PINS, S6_MODELS, type LiveLabel } from "./study6-live-models";
import type { CallUsage } from "./types";

export const QUESTIONS = [
  "What is an EU Digital Product Passport? Which products must have one, under which EU law, and from what date?",
  "A shop's product page shows a battery passport for the item it sells. How would you tell whether the passport is genuine, and whether this seller actually has that item?",
  "What would you look for on a product web page, in its visible text or in its code, to recognise that the product has an EU Digital Product Passport?",
];
const LABELS: LiveLabel[] = ["openai", "kimi", "anthropic", "glimmer", "spark"];
const CAP_USD = 0.2;

async function ask(label: LiveLabel, q: string, onUsage: (u: CallUsage) => void): Promise<string> {
  const def = S6_MODELS[label];
  const model = process.env[def.env] ?? def.fallback;
  if (label === "openai") {
    const r = (await postJsonWithRetry("OpenAI", "https://api.openai.com/v1/responses", { model, instructions: "You are a helpful assistant.", input: [{ role: "user", content: q }] }, { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` })) as {
      model?: string;
      output: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
      usage?: { input_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
    };
    onUsage({ inputTokens: r.usage?.input_tokens ?? 0, cachedInputTokens: r.usage?.input_tokens_details?.cached_tokens ?? 0, outputTokens: r.usage?.output_tokens ?? 0, reasoningTokens: r.usage?.output_tokens_details?.reasoning_tokens ?? 0, modelReturned: r.model ?? null });
    return r.output.filter((o) => o.type === "message").flatMap((o) => o.content ?? []).map((c) => c.text ?? "").join("\n");
  }
  if (label === "anthropic") {
    const res = await new Anthropic({ maxRetries: 2 }).messages.create({ model, max_tokens: 8000, system: "You are a helpful assistant.", messages: [{ role: "user", content: q }] });
    onUsage({ inputTokens: res.usage.input_tokens, cachedInputTokens: 0, outputTokens: res.usage.output_tokens, reasoningTokens: 0, modelReturned: res.model });
    return res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  }
  const kimi = label === "kimi";
  const url = kimi ? `${process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1"}/chat/completions` : "https://openrouter.ai/api/v1/chat/completions";
  const body: Record<string, unknown> = { model, messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: q }] };
  if (!kimi) Object.assign(body, { provider: OPENROUTER_PINS[model], max_tokens: 8000 });
  const d = (await postJsonWithRetry(kimi ? "Kimi" : "OpenRouter", url, body, { Authorization: `Bearer ${kimi ? process.env.KIMI_API_KEY : process.env.OPENROUTER_API_KEY}` })) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
    choices: Array<{ message: { content: string | null } }>;
  };
  onUsage({ inputTokens: d.usage?.prompt_tokens ?? 0, cachedInputTokens: 0, outputTokens: d.usage?.completion_tokens ?? 0, reasoningTokens: d.usage?.completion_tokens_details?.reasoning_tokens ?? 0, modelReturned: d.model ?? null });
  return d.choices?.[0]?.message?.content ?? "";
}

const pricing = readPricing();
const out: Array<{ label: string; model: string; question: number; answer: string; costUsd: number; error: string | null }> = [];
let spent = 0;
for (const label of LABELS) {
  const def = S6_MODELS[label];
  const model = process.env[def.env] ?? def.fallback;
  for (let qi = 0; qi < QUESTIONS.length; qi++) {
    if (spent > CAP_USD) break;
    let cost = 0;
    let answer = "";
    let error: string | null = null;
    try {
      answer = await ask(label, QUESTIONS[qi], (u) => (cost += callCost(pricing.models[model], u)));
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 300) : String(e);
    }
    spent += cost;
    out.push({ label, model, question: qi + 1, answer, costUsd: Number(cost.toFixed(6)), error });
    appendLiveLedger({ at: new Date().toISOString(), runId: "knowledge-probe-dpp", kind: "check", block: "knowledge", product: null, condition: null, vendor: def.vendor, model, costUsd: cost, toolFeesUsd: 0, inputTokens: 0, outputTokens: 0, aborted: error !== null });
    console.log(`${label} Q${qi + 1}: ${error ? `ERROR ${error.slice(0, 80)}` : `${answer.length} chars`} $${cost.toFixed(4)}`);
  }
}
mkdirSync(RESULTS, { recursive: true });
const f = `${RESULTS}knowledge-probe-dpp-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(f, JSON.stringify({ ranAt: new Date().toISOString(), questions: QUESTIONS, tools: "none", results: out }, null, 2) + "\n");
console.log(`\nWrote ${f}; spend $${spent.toFixed(4)}`);
