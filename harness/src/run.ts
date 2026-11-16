/**
 * Agent DPP Verification Study — trial runner.
 *
 * Usage:
 *   bun run src/run.ts --agents claude,chatgpt --runs 5
 *   bun run src/run.ts --all
 *   bun run src/run.ts --agents claude --modes naive,tool_available --framings compliance
 *
 * One JSONL log file per invocation in ../results/.
 */
import { appendFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "node:url";
import { RUNS_PER_CELL, UG_API_BASE, fixtureFor } from "./config";
import {
  assertGroundTruth,
  observedStatusFor,
  servedBytesRecord,
  BYPASSED_EXIT_CODE,
  type PreflightResult,
} from "./preflight";
import { buildUserPrompt, SYSTEM_BASE } from "./prompts";
import { buildVerifyTool, fetchPassportJsonLd } from "./rails";
import { claudeAdapter } from "./agents/anthropic";
import { chatgptAdapter } from "./agents/openai";
import { geminiAdapter } from "./agents/gemini";
import { perplexityAdapter } from "./agents/perplexity";
import { kimiAdapter } from "./agents/kimi";
import type {
  AgentAdapter,
  AgentName,
  CapabilityMode,
  Cell,
  Condition,
  Framing,
  TrialLog,
  VerdictSelfReport,
} from "./types";

const ALL_AGENTS: Record<AgentName, () => AgentAdapter> = {
  claude: claudeAdapter,
  chatgpt: chatgptAdapter,
  gemini: geminiAdapter,
  perplexity: perplexityAdapter,
  kimi: kimiAdapter,
};
const ALL_CONDITIONS: Condition[] = ["A", "B", "C"];
const ALL_MODES: CapabilityMode[] = ["naive", "tool_available", "tool_instructed"];
const ALL_FRAMINGS: Framing[] = ["compliance", "shopping"];

function die(message: string): never {
  console.error(`\nARGUMENT ERROR: ${message}\n`);
  process.exit(2);
}

/** The four flags that narrow the grid. --runs is orthogonal (it sets depth, not breadth). */
const NARROWING_FLAGS = ["--agents", "--conditions", "--modes", "--framings"] as const;

// `--all` used to SILENTLY win over every explicit flag: `--agents claude --all`
// ran the full 300-trial grid, not 90, with no indication. Combining them is now
// a hard error — the caller must say which one they meant.
const usedNarrowing = NARROWING_FLAGS.filter((f) => process.argv.includes(f));
if (process.argv.includes("--all") && usedNarrowing.length > 0) {
  die(
    `--all cannot be combined with narrowing flag(s): ${usedNarrowing.join(", ")}.\n` +
      `  --all means the FULL grid (every agent x condition x mode x framing) and would\n` +
      `  silently override ${usedNarrowing.length === 1 ? "that flag" : "those flags"}.\n` +
      `  Drop --all to honour the explicit flags, or drop ${usedNarrowing.join("/")} to run the full grid.`,
  );
}

function argList<T extends string>(flag: string, all: readonly T[]): T[] {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || process.argv.includes("--all")) return [...all];
  const value = process.argv[idx + 1];
  if (value === undefined) {
    die(`${flag} was the last token — it needs a comma-separated value, e.g. ${flag} ${all.slice(0, 2).join(",")}`);
  }
  if (value.startsWith("--")) {
    die(`${flag} was followed by another flag (${value}) instead of a value, e.g. ${flag} ${all.slice(0, 2).join(",")}`);
  }
  const parsed = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0) as T[];
  if (parsed.length === 0) {
    die(`${flag} was given an empty value — expected one or more of: ${all.join(", ")}`);
  }
  const unknown = parsed.filter((p) => !all.includes(p));
  if (unknown.length > 0) {
    die(`${flag} got unknown value(s): ${unknown.join(", ")}. Valid values: ${all.join(", ")}`);
  }
  return parsed;
}

const agents = argList<AgentName>("--agents", Object.keys(ALL_AGENTS) as AgentName[]);
const conditions = argList<Condition>("--conditions", ALL_CONDITIONS);
const modes = argList<CapabilityMode>("--modes", ALL_MODES);
const framings = argList<Framing>("--framings", ALL_FRAMINGS);

const runsIdx = process.argv.indexOf("--runs");
let runs = RUNS_PER_CELL;
if (runsIdx !== -1) {
  const raw = process.argv[runsIdx + 1];
  if (raw === undefined) {
    die("--runs was the last token — it needs a positive integer, e.g. --runs 5");
  }
  runs = Number(raw);
  // NaN is the dangerous case: `for (i = 0; i < NaN; i++)` runs ZERO times, so
  // the harness would print "Wrote <file>" over an empty JSONL and announce nothing.
  if (!Number.isFinite(runs) || !Number.isInteger(runs) || runs < 1) {
    die(`--runs got "${raw}", which is not a positive integer. A non-numeric --runs would silently write an EMPTY results file.`);
  }
} else if (!Number.isInteger(RUNS_PER_CELL) || RUNS_PER_CELL < 1) {
  die(`RUNS_PER_CELL env var resolved to "${process.env.RUNS_PER_CELL}", which is not a positive integer.`);
}

/** The two keys the study MEASURES. Neither may ever be defaulted. */
const REQUIRED_SELF_REPORT_KEYS = ["verification_status", "decision"] as const;

/**
 * Extract the self-report.
 *
 * A9 pre-commits that a response whose self-report cannot be read is MISSING
 * DATA and "under no circumstances may a null self-report be scored as
 * incorrect". This function used to defeat that rule while appearing to honour
 * it: it wrote `parsed.verification_status ?? "unknown"` and
 * `parsed.decision ?? "unknown"`. Because `"unknown"` is a LEGAL value of both
 * enums (types.ts:16-17), a JSON block missing those keys produced a non-null
 * `selfReport` with NO `parseError` — so analyze.py's A9 exclusion passed it
 * through, compared the manufactured `"unknown"` against `groundTruth`, and
 * scored the row WRONG. Missing data was reported as 0% accuracy, per agent,
 * silently.
 *
 * The information needed to tell "the model said unknown" from "the model said
 * nothing" exists only here. So it is recorded here: a missing required key
 * yields `report: null`, a `parseError`, and the names of the absent keys.
 */
function parseSelfReport(text: string): {
  report: VerdictSelfReport | null;
  error?: string;
  missingKeys?: string[];
} {
  const matches = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const raw = matches.length
    ? matches[matches.length - 1][1]
    : text.match(/\{[\s\S]*"verification_status"[\s\S]*\}/)?.[0];
  if (!raw) return { report: null, error: "no JSON block found" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { report: null, error: `JSON parse failed: ${e}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { report: null, error: `self-report JSON is not an object (got ${Array.isArray(parsed) ? "array" : typeof parsed})` };
  }
  const obj = parsed as Record<string, unknown>;
  // NOTE: absent and explicit-null are treated alike; both mean "the model did
  // not answer". They are NOT coerced to "unknown".
  const missingKeys = REQUIRED_SELF_REPORT_KEYS.filter(
    (k) => obj[k] === undefined || obj[k] === null,
  );
  if (missingKeys.length > 0) {
    return {
      report: null,
      error: `self-report JSON missing required key(s): ${missingKeys.join(", ")}`,
      missingKeys: [...missingKeys],
    };
  }
  return {
    report: {
      // Values are NOT validated against the enum here — an out-of-enum value is
      // real agent output and analyze.py reports it as a coding failure. Only
      // ABSENCE is treated as missing data.
      verification_status: obj.verification_status as VerdictSelfReport["verification_status"],
      decision: obj.decision as VerdictSelfReport["decision"],
      // reasoning_summary is free text, carries no pre-registered numerator, and
      // its absence is not missing data for any measured quantity.
      reasoning_summary: String(obj.reasoning_summary ?? ""),
    },
  };
}

/**
 * Preflight provenance for one condition, stamped into every row this run
 * writes. A reader of the JSONL must be able to tell a clean run from a
 * bypassed one, and a declared ground truth from what the stack actually
 * served, without access to the console output.
 */
function provenanceFor(
  preflight: PreflightResult,
  condition: Condition,
): Pick<
  TrialLog,
  | "preflightPassed"
  | "preflightBypassed"
  | "observedLiveStatus"
  | "preflightMatchednessPassed"
  | "servedPassportBytes"
> {
  return {
    preflightPassed: preflight.ok,
    preflightBypassed: preflight.bypassed,
    observedLiveStatus: observedStatusFor(preflight, condition),
    // Matchedness (preflight part 5) and the three served payload sizes. Without
    // these, a JSONL written over unmatched fixtures is indistinguishable from
    // one written over matched ones, and the confound is unrecoverable after
    // the fact — the served payloads are not otherwise retained anywhere.
    preflightMatchednessPassed: preflight.matchedness.ok,
    servedPassportBytes: servedBytesRecord(preflight),
  };
}

async function runTrial(
  adapter: AgentAdapter,
  cell: Cell,
  runIndex: number,
  preflight: PreflightResult,
): Promise<TrialLog> {
  const fixture = fixtureFor(cell.condition);
  const started = Date.now();
  const base: Omit<TrialLog, "responseText" | "selfReport" | "calledVerifier" | "toolCalls" | "durationMs"> = {
    ...cell,
    runIndex,
    timestamp: new Date().toISOString(),
    modelId: adapter.modelId,
    productId: fixture.productId,
    groundTruth: fixture.groundTruth,
    apiBase: UG_API_BASE,
    ...provenanceFor(preflight, cell.condition),
  };

  try {
    const passportJsonLd = await fetchPassportJsonLd(fixture.productId);
    const tools = cell.mode === "naive" ? null : [buildVerifyTool()];
    const { text, toolCalls } = await adapter.run({
      system: SYSTEM_BASE,
      user: buildUserPrompt({ framing: cell.framing, mode: cell.mode, passportJsonLd }),
      tools,
    });
    const { report, error: parseError, missingKeys } = parseSelfReport(text);
    return {
      ...base,
      calledVerifier: toolCalls.some((t) => t.name === "verify_dpp"),
      toolCalls,
      responseText: text,
      selfReport: report,
      ...(parseError ? { parseError } : {}),
      ...(missingKeys && missingKeys.length ? { selfReportMissingKeys: missingKeys } : {}),
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ...base,
      calledVerifier: false,
      toolCalls: [],
      responseText: "",
      selfReport: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}

// Ground-truth preflight: after argument parsing, before the first trial. It
// always checks ALL THREE conditions (not just the selected subset) and asserts
// they are mutually distinct both as declared and as observed live. Aborts with
// exit 1 unless SKIP_PREFLIGHT=1, which returns a result marked `bypassed`.
const preflight = await assertGroundTruth(conditions);

const resultsDir = fileURLToPath(new URL("../results/", import.meta.url));
mkdirSync(resultsDir, { recursive: true });
const outFile = `${resultsDir}trials-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;

let done = 0;
for (const agentName of agents) {
  const adapter = ALL_AGENTS[agentName]();
  for (const framing of framings) {
    for (const condition of conditions) {
      for (const mode of modes) {
        if (mode !== "naive" && !adapter.supportsTools) {
          // Rail-unsupported — record once per cell as a structural fact.
          const fixture = fixtureFor(condition);
          const log: TrialLog = {
            agent: agentName, condition, mode, framing, rail: "http_verify_tool",
            runIndex: 0,
            timestamp: new Date().toISOString(),
            modelId: adapter.modelId,
            productId: fixture.productId,
            groundTruth: fixture.groundTruth,
            apiBase: UG_API_BASE,
            ...provenanceFor(preflight, condition),
            calledVerifier: false,
            toolCalls: [],
            responseText: "",
            selfReport: null,
            error: "rail_unsupported: agent API has no custom tool support",
            durationMs: 0,
          };
          appendFileSync(outFile, JSON.stringify(log) + "\n");
          continue;
        }
        for (let i = 0; i < runs; i++) {
          const cell: Cell = {
            agent: agentName, condition, mode, framing,
            rail: mode === "naive" ? "inline_jsonld" : "http_verify_tool",
          };
          const log = await runTrial(adapter, cell, i, preflight);
          appendFileSync(outFile, JSON.stringify(log) + "\n");
          done++;
          const status = log.error
            ? `ERROR ${log.error.slice(0, 60)}`
            : log.selfReport === null
              // MISSING DATA, not a verdict. Printing "unknown / unknown" here
              // would repeat in the console the same conflation A9 forbids in
              // the data.
              ? `NO SELF-REPORT (excluded, A9): ${log.parseError ?? "unknown reason"}`
              : `${log.selfReport.verification_status} / ${log.selfReport.decision}${log.calledVerifier ? " [verified via tool]" : ""}`;
          console.log(
            `[${done}] ${agentName} ${condition} ${mode} ${framing} run${i}: ${status}`,
          );
        }
      }
    }
  }
}
console.log(`\nWrote ${outFile}`);

// Distinct exit path. A clean completed run exits 0. A run that completed over
// a BYPASSED, FAILED preflight exits BYPASSED_EXIT_CODE so orchestration gating
// on exit status cannot mistake it for a clean one — the two used to be
// indistinguishable in both the exit code and the artifact.
if (preflight.bypassed || !preflight.ok) {
  console.log(
    [
      "",
      "######################################################################",
      "#  BYPASSED RUN COMPLETE — THIS IS NOT A CLEAN RESULT.               #",
      `#  The ground-truth preflight FAILED and was bypassed; exiting ${BYPASSED_EXIT_CODE}.     #`,
      "#  Every row above carries preflightPassed=false, preflightBypassed=  #",
      "#  true, and the observed live status alongside declared groundTruth. #",
      "######################################################################",
      "",
    ].join("\n"),
  );
  console.error(`BYPASSED: exiting ${BYPASSED_EXIT_CODE}, not 0 — preflight failed and was bypassed.`);
  process.exit(BYPASSED_EXIT_CODE);
}
