/**
 * Study 6 LIVE: does Gemini's OWN URL tool read the two shop domains yet?
 *
 * At the tool check (23 Oct 2026) Gemini's url_context fetched our pages (HTTP 200 to
 * "GoogleAgent-URLContext") but reported URL_RETRIEVAL_STATUS_ERROR, while it read our older domains
 * (universalgoods.org, ugpdpp.org, familylabs.xyz) and large public sites: it appears to refuse
 * brand-new domains. The Gemini own-tool block is POSTPONED until this probe passes.
 *
 * The probe asks for each domain's home page, which shows the same thing in every phase except
 * "closed" (then the holding page): nothing about a product or a passport is read. One call per
 * domain, about USD 0.002 each.
 *
 * Usage (from harness/, keys from the study .env):  bun run src/gemini-domain-probe.ts
 * Exit 0 only if both domains read with URL_RETRIEVAL_STATUS_SUCCESS.
 */
import "./env";
import { BRAND_ORIGIN, LOOKALIKE_ORIGIN } from "../../stimulus/study6";

export async function geminiReadsDomains(model = process.env.NATIVE_GEMINI_MODEL ?? "gemini-3.8-flash"): Promise<{ ok: boolean; statuses: Record<string, string> }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const statuses: Record<string, string> = {};
  for (const origin of [BRAND_ORIGIN, LOOKALIKE_ORIGIN]) {
    const url = `${origin}/`;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Quote the first sentence of the page at ${url}` }] }], tools: [{ url_context: {} }] }),
      signal: AbortSignal.timeout(60_000),
    });
    const j = (await r.json()) as { candidates?: Array<{ urlContextMetadata?: { urlMetadata?: Array<{ urlRetrievalStatus?: string }> } }> };
    const s = j.candidates?.[0]?.urlContextMetadata?.urlMetadata?.map((m) => m.urlRetrievalStatus ?? "?") ?? [`HTTP ${r.status}`];
    statuses[url] = s.join(",");
  }
  return { ok: Object.values(statuses).every((s) => /SUCCESS/.test(s) && !/ERROR/.test(s)), statuses };
}

if (import.meta.main) {
  const r = await geminiReadsDomains();
  console.log(`${new Date().toISOString()} Gemini url_context: ${JSON.stringify(r.statuses)} -> ${r.ok ? "READS BOTH DOMAINS" : "still refused"}`);
  process.exit(r.ok ? 0 : 1);
}
