/**
 * Study 5: write the two OpenRouter models' prices into harness/pricing.json from OpenRouter's
 * LIVE public listing (no key needed), with the retrieval date. The price used is the PINNED
 * endpoint's own price (GET /api/v1/models/{id}/endpoints, matched by the pin's provider tag or
 * name); the model-level list price is recorded beside it. Refuses if the pinned endpoint is
 * not listed. Only the two entries below are added or replaced; every other entry is untouched.
 *
 * Usage (from harness/):  bun run src/pricing-openrouter.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { OPENROUTER_PINS } from "./study5-models";

const PRICING = fileURLToPath(new URL("../pricing.json", import.meta.url));
const perM = (s: string | undefined) => (s === undefined ? NaN : Number((Number(s) * 1e6).toFixed(6)));

const list = (await (await fetch("https://openrouter.ai/api/v1/models")).json()) as { data: Array<{ id: string; pricing: Record<string, string> }> };
let text = readFileSync(PRICING, "utf8");
const pricing = JSON.parse(text);
const today = new Date().toISOString().slice(0, 10);
const entries: Record<string, unknown> = {};
for (const [model, pin] of Object.entries(OPENROUTER_PINS)) {
  const m = list.data.find((x) => x.id === model);
  if (!m) throw new Error(`${model} is not in OpenRouter's live /api/v1/models`);
  const ep = (await (await fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`)).json()) as {
    data: { endpoints: Array<{ provider_name: string; tag: string; quantization: string; pricing: Record<string, string>; supported_parameters: string[] }> };
  };
  const want = pin.order[0].toLowerCase();
  const e = ep.data.endpoints.find((x) => x.tag.toLowerCase() === want || x.provider_name.toLowerCase() === want);
  if (!e) throw new Error(`${model}: the pinned endpoint "${pin.order[0]}" is not listed (${ep.data.endpoints.map((x) => x.tag).join(", ")})`);
  if (!e.supported_parameters.includes("tools")) throw new Error(`${model} @ ${e.tag} does not list tool support`);
  entries[model] = {
    vendor: "openrouter",
    inputPerMTok: perM(e.pricing.prompt),
    cachedInputPerMTok: perM(e.pricing.input_cache_read ?? e.pricing.prompt),
    outputPerMTok: perM(e.pricing.completion),
    retrieved: today,
    pinnedEndpoint: { provider: e.provider_name, tag: e.tag, quantization: e.quantization },
    listPricePerToken: m.pricing,
    note: "Study 5 (added 2026-10-15): the pinned endpoint's price from OpenRouter's live /api/v1/models/{id}/endpoints, USD per token x 1e6. OpenRouter also returns usage.cost per call; the harness logs it and budgets on the larger of it and this computed cost.",
    source: `https://openrouter.ai/api/v1/models/${model}/endpoints`,
  };
  const x = entries[model] as { inputPerMTok: number; cachedInputPerMTok: number; outputPerMTok: number };
  console.log(`${model} @ ${e.tag} (${e.quantization}): in ${x.inputPerMTok} cached ${x.cachedInputPerMTok} out ${x.outputPerMTok} per MTok`);
}
// Text splice so no other entry's bytes change: drop an earlier copy of these entries, then
// insert them as the last members of "models".
const NL = text.includes("\r\n") ? "\r\n" : "\n";
for (const model of Object.keys(entries)) {
  const start = text.indexOf(`    ${JSON.stringify(model)}: {`);
  if (start < 0) continue;
  const close = `${NL}    }`;
  const end = text.indexOf(close, start) + close.length;
  let before = text.slice(0, start);
  let after = text.slice(end);
  if (after.startsWith(",")) after = after.slice(1 + NL.length);
  else before = before.replace(new RegExp(`,${NL}$`), "");
  text = before + after;
}
const anchor = `${NL}  },${NL}  "notFound"`;
const at = text.indexOf(anchor);
if (at < 0) throw new Error("pricing.json layout changed: cannot find the end of models");
const block = Object.entries(entries)
  .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).split(String.fromCharCode(10)).join(`${NL}    `)}`)
  .join(`,${NL}`);
text = text.slice(0, at) + `,${NL}` + block + text.slice(at);
const parsed = JSON.parse(text);
for (const k of Object.keys(pricing.models)) if (!(k in parsed.models)) throw new Error(`lost ${k}`);
writeFileSync(PRICING, text, "utf8");
console.log(`Wrote ${PRICING} (retrieved ${today})`);
