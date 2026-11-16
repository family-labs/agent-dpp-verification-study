/**
 * Study 6, LIVE-SITE version (James, 23 Oct 2026): the same six models as Studies 5 and 6
 * (study5-models.ts, not edited), each with its OWN vendor's web tool instead of our fetch_url,
 * the per-call tool fees, and the live study's caps. Prices read from each vendor's pricing page on
 * 23 Oct 2026 (STUDY6-LIVE-PLAN.md section 2, with sources).
 *
 *   openai     Responses API, built-in tool `web_search` (search, open_page, find_in_page)
 *   gemini     generateContent, built-in tools `url_context` + `google_search`
 *   anthropic  Messages API, server tools `web_fetch` (cache off) + `web_search`
 *   kimi       Kimi's official tools `moonshot/fetch` + `moonshot/web-search` (Formula API: the model
 *              calls them as functions, Kimi's servers run them through /fibers)
 *   glimmer,   no tool of Meta's own: OpenRouter's server tool `openrouter:web_fetch` (engine
 *   spark      "openrouter", direct HTTP); reported SEPARATELY from the pooled result
 *
 * Fees are counted CONSERVATIVELY (every call that could be billed is billed), so the ledger can only
 * overstate spend: OpenAI USD 10 per 1,000 web_search calls of any action type; Gemini USD 14 per
 * 1,000 Google Search queries (the first 5,000 a month are free, ignored here); URL context free;
 * Anthropic USD 10 per 1,000 searches, fetch free; Kimi USD 0.005 per web-search and USD 0.002 per
 * fetch (fetch is free "for a limited time"); OpenRouter fetch engine "openrouter" free (OpenRouter's
 * own reported cost, which includes any tool fee, is used when it is higher).
 */
export { OPENROUTER_PINS, type BillingVendor } from "./study5-models";
import { S5_MODELS, type BillingVendor, type ModelLabel } from "./study5-models";

/**
 * Labels of the live study. "geminifetch" = gemini-3.8-flash with a generic live fetch tool that the
 * harness runs (fetch_url, GET, no JavaScript), because Gemini's own URL tool refused the brand-new
 * domains at the tool check (23 Oct 2026; evidence/study6-tool-check-2026-10-23.md). "gemini" = Gemini
 * with its OWN tools, POSTPONED: it runs as its own later block only once its URL tool reads the
 * domains (src/gemini-domain-probe.ts passes).
 */
/** Study 8 Claude ladder (A42, James 26 Oct 2026: "trials ... on multiple claude models like sonnet, opus and others"). */
export type ClaudeLadderLabel = "sonnet" | "opus" | "fable";
export type LiveLabel = ModelLabel | "geminifetch" | ClaudeLadderLabel;
export const S6_MODELS: Record<LiveLabel, (typeof S5_MODELS)[ModelLabel]> = {
  ...S5_MODELS,
  geminifetch: { ...S5_MODELS.gemini },
  sonnet: { vendor: "anthropic", env: "STUDY8_SONNET_MODEL", fallback: "claude-sonnet-5-5", key: "ANTHROPIC_API_KEY" },
  opus: { vendor: "anthropic", env: "STUDY8_OPUS_MODEL", fallback: "claude-opus-5-5", key: "ANTHROPIC_API_KEY" },
  fable: { vendor: "anthropic", env: "STUDY8_FABLE_MODEL", fallback: "claude-fable-5-1", key: "ANTHROPIC_API_KEY" },
};
export const CLAUDE_LADDER_LABELS: readonly ClaudeLadderLabel[] = ["sonnet", "opus", "fable"];
/**
 * The five labels of the counted schedule. James, 23 Oct 2026: "just wait for gemini to recognise our
 * new websites until then, dont run any trials for gemini". So Gemini runs ONLY in the postponed
 * own-tool block, and the generic-fetch arm "geminifetch" is built and tool-checked but NOT scheduled.
 */
export const ALL_LABELS: readonly LiveLabel[] = ["openai", "kimi", "anthropic", "glimmer", "spark"];
/** Pooled primary result: the vendors' OWN tools that read the shops at the tool check (OpenAI, Kimi, Anthropic). */
export const POOLED_LABELS: readonly LiveLabel[] = ["openai", "kimi", "anthropic"];
/** Reported separately: Meta's two models with OpenRouter's fetch tool. */
export const SEPARATE_LABELS: readonly LiveLabel[] = ["glimmer", "spark"];
/** Gemini with its own tools: a later block of its own (seed S6_SEED + 2), only once its URL tool reads the domains. */
export const POSTPONED_LABELS: readonly LiveLabel[] = ["gemini"];
export type { ModelLabel };

export const TOOL_FEES_USD = {
  openaiWebSearchCall: 0.01,
  geminiSearchQuery: 0.014,
  anthropicWebSearch: 0.01,
  kimiWebSearch: 0.005,
  kimiFetch: 0.002,
  openrouterFetch: 0,
} as const;
export const TOOL_FEE_SOURCES = {
  openai: "https://developers.openai.com/api/docs/pricing (web search USD 10.00 / 1k calls + search content tokens at model rates), read 2026-10-23",
  gemini: "https://ai.google.dev/gemini-api/docs/pricing (Grounding with Google Search: 5,000 free/month, then USD 14 / 1,000; URL context: tokens only), read 2026-10-23",
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing (web search USD 10 / 1,000; web fetch no additional charge), read 2026-10-23",
  kimi: "https://platform.kimi.ai/docs/pricing/tools ($web_search USD 0.005 / call; /v1/tools/fetch USD 0.002 / call; official tools free for a limited time except web-search), read 2026-10-23",
  openrouter: "https://openrouter.ai/docs/guides/features/server-tools/web-fetch (engine openrouter: free; Exa USD 1 / 1,000), read 2026-10-23",
} as const;

/** Per-tool limits in each request (the vendor enforces them server-side where it can). */
export const LIVE_TOOL_LIMITS = { maxFetches: 8, maxSearches: 3, maxTurns: 12 } as const;

/**
 * Caps (USD). Counted total 25 (450 counted trials + the drift-check W trials), pilot 2, tool check 0.5:
 * 27.5 of James's USD 30, leaving 2.5 in reserve. Vendor caps add to more than 25 on purpose (the
 * study total binds first); each is about 1.15 x that vendor's worst-case projection (plan section 3).
 * Kimi raised 5.0 -> 6.5 by A39 (24 Oct 2026): the caps are shared by Studies 6 and 7, and Kimi reached
 * 5.0 after 89 of 180 Study 7 trials. A40 (the format test): Kimi 6.5 -> 7.5, OpenRouter 9.0 -> 10.5.
 * A41 (Study 8): Kimi 7.5 -> 8.5, OpenRouter 10.5 -> 11.5. A42 (the Claude ladder, ~USD 10 of Anthropic credit
 * from James, 26 Oct 2026): Anthropic 3.5 -> 13.0.
 */
export const LIVE_VENDOR_CAPS: Record<BillingVendor, number> = { openai: 8.0, gemini: 4.0, kimi: 8.5, anthropic: 13.0, openrouter: 12.5 };
export const LIVE_COUNTED_TOTAL_CAP = 25.0;
export const LIVE_PILOT_TOTAL_CAP = 2.0;
export const LIVE_CHECK_TOTAL_CAP = 0.5;

/** Worst-case cost per trial used by the per-trial gate until a model has a measured Study 6 live trial (plan section 3). */
export const LIVE_WORST_CASE_USD: Record<LiveLabel, number> = { openai: 0.095, gemini: 0.037, geminifetch: 0.05, kimi: 0.051, anthropic: 0.03, glimmer: 0.018, spark: 0.076, sonnet: 0.35, opus: 0.7, fable: 1.4 };
