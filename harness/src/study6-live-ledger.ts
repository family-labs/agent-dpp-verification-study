/**
 * Study 6 LIVE spend ledger (results/study6-live-spend-ledger.json, git-ignored), separate from every
 * earlier ledger, the text-page Study 6 ledger included. One entry per API trial or tool-check call
 * (pilot, aborted and errored included). Mock runs write nothing. Never edit by hand.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { RESULTS } from "./study5-ledger";
import { LIVE_CHECK_TOTAL_CAP, LIVE_COUNTED_TOTAL_CAP, LIVE_PILOT_TOTAL_CAP, LIVE_VENDOR_CAPS, type BillingVendor } from "./study6-live-models";

export { callCost, readPricing, RESULTS, type Price } from "./study5-ledger";
export const LIVE_LEDGER = `${RESULTS}study6-live-spend-ledger.json`;
export type LiveKind = "counted" | "pilot" | "check";

export interface LiveLedgerEntry {
  at: string;
  runId: string;
  kind: LiveKind;
  block: string;
  product: string | null;
  condition: string | null;
  vendor: BillingVendor;
  model: string;
  costUsd: number;
  toolFeesUsd: number;
  inputTokens: number;
  outputTokens: number;
  aborted: boolean;
}
export interface LiveLedger {
  _comment: string;
  caps: { vendor: Record<BillingVendor, number>; counted: number; pilot: number; check: number };
  entries: LiveLedgerEntry[];
}
export function readLiveLedger(file = LIVE_LEDGER): LiveLedger {
  if (!existsSync(file))
    return {
      _comment:
        "Study 6 LIVE API spend (vendor web tools on the live sites), one entry per trial or tool-check call. SEPARATE from every other ledger. Git-ignored. The runners refuse any call that would take a vendor past its cap or a kind (counted / pilot / check) past its total. Never edit by hand.",
      caps: { vendor: LIVE_VENDOR_CAPS, counted: LIVE_COUNTED_TOTAL_CAP, pilot: LIVE_PILOT_TOTAL_CAP, check: LIVE_CHECK_TOTAL_CAP },
      entries: [],
    };
  return JSON.parse(readFileSync(file, "utf8")) as LiveLedger;
}
export function appendLiveLedger(e: LiveLedgerEntry, file = LIVE_LEDGER): void {
  const l = readLiveLedger(file);
  l.entries.push(e);
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(l, null, 2) + "\n", "utf8");
  renameSync(`${file}.tmp`, file);
}
export const liveVendorSpent = (l: LiveLedger, v: BillingVendor) => l.entries.filter((e) => e.vendor === v).reduce((s, e) => s + e.costUsd, 0);
export const liveKindSpent = (l: LiveLedger, k: LiveKind) => l.entries.filter((e) => e.kind === k).reduce((s, e) => s + e.costUsd, 0);
export const KIND_CAP: Record<LiveKind, number> = { counted: LIVE_COUNTED_TOTAL_CAP, pilot: LIVE_PILOT_TOTAL_CAP, check: LIVE_CHECK_TOTAL_CAP };
