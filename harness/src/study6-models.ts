/**
 * Study 6: the SAME six models, adapters and OpenRouter pins as Study 5 (study5-models.ts, not
 * edited), with Study 6's own caps.
 *
 * Budget (James, 2026-10-20): USD 20 in total for all mainnet study work; Study 6 is capped at
 * USD 10.00 counted plus USD 1.00 pilot, the rest in reserve. Per-vendor caps (DRAFT, to be fixed
 * in A36) are sized from Study 5's measured counted cost per trial (results-archive/study5-*.jsonl):
 * mean x 60 trials per model x 1.5 x 1.25, rounded up. They add to more than USD 10 on purpose:
 * the USD 10 study total binds first, the vendor caps stop one dear vendor from eating the rest.
 */
export { ALL_LABELS, OPENROUTER_PINS, OPENROUTER_TOOLS_OFF, S5_MODELS as S6_MODELS, type BillingVendor, type ModelLabel } from "./study5-models";
import type { BillingVendor } from "./study5-models";

export const S6_VENDOR_CAPS: Record<BillingVendor, number> = { openai: 1.0, gemini: 2.5, kimi: 2.5, anthropic: 1.0, openrouter: 4.5 };
/** Study totals (USD), across every invocation, read from the Study 6 ledger. */
export const S6_COUNTED_TOTAL_CAP = 10.0;
export const S6_PILOT_TOTAL_CAP = 1.0;
