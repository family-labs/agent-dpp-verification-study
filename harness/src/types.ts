export type Condition = "A" | "B" | "C";
export type CapabilityMode = "naive" | "tool_available" | "tool_instructed";
export type Framing = "compliance" | "shopping";
export type AgentName = "claude" | "chatgpt" | "gemini" | "perplexity" | "kimi";
export type Rail = "inline_jsonld" | "http_verify_tool";

export interface Cell {
  agent: AgentName;
  condition: Condition;
  mode: CapabilityMode;
  framing: Framing;
  rail: Rail;
}

export interface VerdictSelfReport {
  verification_status: "verified" | "unverified" | "invalid" | "unknown";
  decision: "approve" | "approve_with_caveats" | "withhold" | "reject";
  reasoning_summary: string;
}

export interface TrialLog extends Cell {
  runIndex: number;
  timestamp: string;
  modelId: string;
  productId: string;
  /**
   * The DECLARED ground truth from fixtures/conditions.json. This is what the
   * experiment requires to be true, not necessarily what the live stack showed
   * the agent — compare `observedLiveStatus`. analysis/analyze.py reads this
   * field; do not remove or rename it.
   */
  groundTruth: "verified" | "unverified" | "invalid";
  /**
   * The resolved UG_API_BASE this trial was actually run against. A JSONL that
   * cannot be attributed to a network is not reproducible — testnet and mainnet
   * return different verdicts for the same productId.
   */
  apiBase: string;
  /**
   * Preflight provenance. Without these three fields a SKIP_PREFLIGHT=1 run
   * produced a JSONL byte-for-byte indistinguishable from a clean one, while
   * the preflight's own banner instructed that any analysis "must state the
   * bypass explicitly" — an instruction the data format made impossible to
   * follow. Every log site populates them, including structural rows.
   */
  /** True only if the ground-truth preflight passed all three conditions. */
  preflightPassed: boolean;
  /** True if the preflight FAILED and SKIP_PREFLIGHT=1 let this run proceed. */
  preflightBypassed: boolean;
  /**
   * The status the live verifier actually returned for THIS trial's condition
   * at preflight time. null when it could not be observed (unreachable, non-200,
   * malformed, or unresolvable fixture). On a clean run this equals groundTruth;
   * where it differs, the agent was shown something other than what the
   * condition label claims.
   */
  observedLiveStatus: string | null;
  /**
   * True only if the served passports for all three conditions were identical
   * once ids, per-unit identifiers, the product name and the verification
   * blocks were stripped (preflight part 5). False means the conditions
   * differed in MORE than their verification state, so the A-vs-B contrast in
   * this row is confounded with payload size and content: any difference could
   * be explained by "A had less data" rather than "A was verifiable".
   */
  preflightMatchednessPassed: boolean;
  /**
   * Bytes each condition's passport endpoint actually served at preflight
   * time — the payload the agent reads in naive mode. null where it could not
   * be read. All three are stamped on every row (not just this row's
   * condition) so a reader of a single line can see the fixtures drifting:
   * the 2026-07-23 confound was visible as 1,473 B against 4,858 B.
   */
  servedPassportBytes: Record<Condition, number | null>;
  calledVerifier: boolean;
  toolCalls: Array<{ name: string; input: unknown; result?: string }>;
  responseText: string;
  selfReport: VerdictSelfReport | null;
  parseError?: string;
  /**
   * Names of the REQUIRED self-report keys that were absent (or null) in the
   * model's JSON block. Present only when at least one was missing.
   *
   * This field exists because the previous parser wrote
   * `verification_status: parsed.verification_status ?? "unknown"` — and
   * `"unknown"` is a LEGAL enum value. A model that emitted a JSON block with
   * the key missing therefore produced a NON-NULL selfReport with NO
   * parseError, indistinguishable from an agent that genuinely answered
   * "unknown". analysis/analyze.py would then score it against groundTruth and
   * report missing data as 0% accuracy — exactly what A9 forbids ("under no
   * circumstances may a null self-report be scored as incorrect").
   *
   * The distinction only exists HERE, at parse time; it is unrecoverable from
   * the JSONL afterwards. So the parser now sets `selfReport: null` plus a
   * `parseError`, and names the missing keys here so the reason survives.
   */
  selfReportMissingKeys?: string[];
  error?: string;
  durationMs: number;
}

/**
 * Token usage of ONE API call, as the vendor reported it. Added for Study 2
 * (A28 §4: per-trial cost logging). `inputTokens` INCLUDES `cachedInputTokens`;
 * `outputTokens` INCLUDES `reasoningTokens` (every vendor here bills reasoning
 * at the output rate).
 */
export interface CallUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /**
   * Study 3 (Anthropic only; optional, absent for every other vendor): input tokens written
   * to the prompt cache on this call, a SUBSET of `inputTokens` billed at the cache-write rate.
   */
  cacheWriteInputTokens?: number;
  /** The model id exactly as the API returned it on this call, or null if absent. */
  modelReturned: string | null;
}

export interface AgentAdapter {
  name: AgentName;
  modelId: string;
  supportsTools: boolean;
  run(opts: {
    system: string;
    user: string;
    tools: ToolSpec[] | null;
    /**
     * Study 2 only (optional; Study 1 never passes these). Called after EVERY
     * API call with that call's usage, so spend is recorded even when a later
     * call in the same trial throws. The callback may throw to abort the trial
     * (the budget ceiling does this).
     */
    onUsage?: (usage: CallUsage) => void;
    /**
     * Study 2 only. When this returns true the adapter tells the API that no
     * further tool calls are allowed (tool_choice none / mode NONE), so the
     * model must answer. Used for the 8-fetch cap.
     */
    toolsExhausted?: () => boolean;
    /** Maximum API round-trips (default 8, Study 1's value). */
    maxTurns?: number;
  }): Promise<{
    text: string;
    toolCalls: Array<{ name: string; input: unknown; result?: string }>;
  }>;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<string>;
}
