/**
 * Study 5: the six models (six vendors), their billing vendor (for the per-vendor caps) and the
 * OpenRouter provider pins. The four direct vendors use Study 4's adapters unchanged
 * (agents/conversation.ts); the two OpenRouter models use agents/openrouter.ts.
 */
import type { ProviderPin, ToolsOffMode } from "./agents/openrouter";

export type BillingVendor = "openai" | "gemini" | "kimi" | "anthropic" | "openrouter";
export type ModelLabel = "openai" | "gemini" | "kimi" | "anthropic" | "glimmer" | "spark";

/**
 * Provider pins, sent on every call: no fallback to another provider, and only endpoints that do
 * not collect prompts (data_collection "deny"). `order[0]` is the endpoint tag or provider name
 * as OpenRouter's /api/v1/models/{id}/endpoints lists it (checked live by pricing-openrouter.ts
 * and by openrouter-pin-check.ts, which records the provider that actually answered).
 */
export const OPENROUTER_PINS: Record<string, ProviderPin> = {
  "meta/muse-glimmer-30b": { order: ["deepinfra/bf16"], only: ["deepinfra/bf16"], allow_fallbacks: false, data_collection: "deny" },
  "meta/muse-spark-1.3": { order: ["meta"], only: ["meta"], allow_fallbacks: false, data_collection: "deny" },
};

/**
 * How "tools off" (the follow-up turn, and the main loop after the 8-fetch cap) is sent per
 * OpenRouter model: Meta's endpoint accepts only tool_choice "auto", so muse-spark gets the
 * tools left out of those calls instead (measured 2026-10-15).
 */
export const OPENROUTER_TOOLS_OFF: Record<string, ToolsOffMode> = {
  "meta/muse-glimmer-30b": "tool_choice_none",
  "meta/muse-spark-1.3": "omit_tools",
};

export const S5_MODELS: Record<ModelLabel, { vendor: BillingVendor; env: string; fallback: string; key: string }> = {
  openai: { vendor: "openai", env: "NATIVE_OPENAI_MODEL", fallback: "gpt-5.4-mini", key: "OPENAI_API_KEY" },
  gemini: { vendor: "gemini", env: "NATIVE_GEMINI_MODEL", fallback: "gemini-3.8-flash", key: "GEMINI_API_KEY" },
  kimi: { vendor: "kimi", env: "NATIVE_KIMI_MODEL", fallback: "kimi-k2.6", key: "KIMI_API_KEY" },
  anthropic: { vendor: "anthropic", env: "NATIVE_ANTHROPIC_MODEL", fallback: "claude-haiku-5-5", key: "ANTHROPIC_API_KEY" },
  glimmer: { vendor: "openrouter", env: "STUDY5_GLIMMER_MODEL", fallback: "meta/muse-glimmer-30b", key: "OPENROUTER_API_KEY" },
  spark: { vendor: "openrouter", env: "STUDY5_SPARK_MODEL", fallback: "meta/muse-spark-1.3", key: "OPENROUTER_API_KEY" },
};
export const ALL_LABELS = Object.keys(S5_MODELS) as ModelLabel[];

/** Separate Study 5 caps (USD), James 2026-10-15. OpenRouter's cap covers both of its models. */
export const S5_VENDOR_CAPS: Record<BillingVendor, number> = { openai: 11.0, gemini: 3.4, kimi: 12.0, anthropic: 8.0, openrouter: 8.0 };  // James 2026-10-16: Meta models capped at USD 8 (asked for 7-10) to leave credit for a later study
