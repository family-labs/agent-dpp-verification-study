/**
 * Study 5's OWN spend ledger (results/study5-spend-ledger.json, git-ignored), separate from the
 * Study 2, 3 and 4 ledgers. One entry per trial (smoke, aborted and errored included) and per
 * OpenRouter pin check. Never edit by hand.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CallUsage } from "./types";
import { S5_VENDOR_CAPS, type BillingVendor } from "./study5-models";

export const HARNESS = fileURLToPath(new URL("../", import.meta.url));
export const RESULTS = `${HARNESS}results/`;
export const S5_LEDGER = `${RESULTS}study5-spend-ledger.json`;

export interface Tier {
  inputPerMTok: number;
  cachedInputPerMTok: number;
  outputPerMTok: number;
  cacheWritePerMTok?: number;
}
export interface Price extends Tier {
  longContext?: Tier & { aboveInputTokens: number };
  vendor: string;
  source: string;
  retrieved?: string;
}
export function readPricing(): { retrieved: string; models: Record<string, Price> } {
  return JSON.parse(readFileSync(`${HARNESS}pricing.json`, "utf8"));
}
/** Study 3/4's formula. `inputTokens` includes cached and cache-written tokens. */
export function callCost(p: Price, u: CallUsage): number {
  const t: Tier = p.longContext && u.inputTokens > p.longContext.aboveInputTokens ? p.longContext : p;
  const write = u.cacheWriteInputTokens ?? 0;
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens - write);
  return (uncached * t.inputPerMTok + u.cachedInputTokens * t.cachedInputPerMTok + write * (t.cacheWritePerMTok ?? t.inputPerMTok) + u.outputTokens * t.outputPerMTok) / 1e6;
}

export interface S5LedgerEntry {
  at: string;
  runId: string;
  pilot: boolean;
  kind: "trial" | "pin-check";
  condition: string;
  vendor: BillingVendor;
  model: string;
  costUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  aborted: boolean;
}
export interface S5Ledger {
  _comment: string;
  caps: Record<BillingVendor, number>;
  entries: S5LedgerEntry[];
}
export function readLedger(): S5Ledger {
  if (!existsSync(S5_LEDGER))
    return {
      _comment:
        "Study 5 API spend, one entry per trial (smoke, aborted and errored included) and per OpenRouter pin check. SEPARATE from the Study 2-4 ledgers. Git-ignored. run-study5.ts refuses any trial that would take a vendor past its cap (James 2026-10-15). Never edit by hand.",
      caps: S5_VENDOR_CAPS,
      entries: [],
    };
  return JSON.parse(readFileSync(S5_LEDGER, "utf8")) as S5Ledger;
}
export function appendLedger(e: S5LedgerEntry): void {
  const l = readLedger();
  l.entries.push(e);
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(`${S5_LEDGER}.tmp`, JSON.stringify(l, null, 2) + "\n", "utf8");
  renameSync(`${S5_LEDGER}.tmp`, S5_LEDGER);
}
export const vendorSpent = (l: S5Ledger, v: BillingVendor) => l.entries.filter((e) => e.vendor === v).reduce((s, e) => s + e.costUsd, 0);
