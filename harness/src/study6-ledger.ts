/**
 * Study 6's OWN spend ledger (results/study6-spend-ledger.json, git-ignored), separate from the
 * Study 2-5 ledgers. One entry per API trial (pilot, aborted and errored included). Mock-model
 * runs make no API call and write NO ledger entry. Never edit by hand. Pricing and the cost formula
 * are Study 5's (study5-ledger.ts, not edited).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { RESULTS } from "./study5-ledger";
import { S6_COUNTED_TOTAL_CAP, S6_PILOT_TOTAL_CAP, S6_VENDOR_CAPS, type BillingVendor } from "./study6-models";

export { callCost, readPricing, RESULTS, type Price } from "./study5-ledger";
export const S6_LEDGER = `${RESULTS}study6-spend-ledger.json`;

export interface S6LedgerEntry {
  at: string;
  runId: string;
  pilot: boolean;
  kind: "trial";
  product: string;
  condition: string;
  vendor: BillingVendor;
  model: string;
  costUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  aborted: boolean;
}
export interface S6Ledger {
  _comment: string;
  caps: { vendor: Record<BillingVendor, number>; countedTotal: number; pilotTotal: number };
  entries: S6LedgerEntry[];
}
export function readLedger(file = S6_LEDGER): S6Ledger {
  if (!existsSync(file))
    return {
      _comment:
        "Study 6 API spend, one entry per trial (pilot, aborted and errored included). SEPARATE from the Study 2-5 ledgers. Git-ignored. run-study6.ts refuses any trial that would take a vendor past its cap, the counted total past USD 10.00 or the pilot total past USD 1.00. Never edit by hand.",
      caps: { vendor: S6_VENDOR_CAPS, countedTotal: S6_COUNTED_TOTAL_CAP, pilotTotal: S6_PILOT_TOTAL_CAP },
      entries: [],
    };
  return JSON.parse(readFileSync(file, "utf8")) as S6Ledger;
}
export function appendLedger(e: S6LedgerEntry, file = S6_LEDGER): void {
  const l = readLedger(file);
  l.entries.push(e);
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(l, null, 2) + "\n", "utf8");
  renameSync(`${file}.tmp`, file);
}
export const vendorSpent = (l: S6Ledger, v: BillingVendor) => l.entries.filter((e) => e.vendor === v).reduce((s, e) => s + e.costUsd, 0);
export const totalSpent = (l: S6Ledger, pilot: boolean) => l.entries.filter((e) => e.pilot === pilot).reduce((s, e) => s + e.costUsd, 0);
