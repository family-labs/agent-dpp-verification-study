# Pre-registered predictions — Agent DPP Verification Study

**Locked:** 2026-07-23, before any fixture existed on testnet and before the
first trial. Author: UG (James) with Claude. Amendments after this date must be
logged in the Amendments section, never edited in place.

## Hypotheses (from STUDY_DESIGN.md)

- **H1 (interoperability):** tool-equipped frontier agents correctly determine
  verification status (verified / claimed-only / fraudulent) at high accuracy.
- **H2 (discrimination):** tool-equipped agents behave differently across
  A/B/C, preferring A over B and flagging or rejecting C, significantly above
  the naive-read baseline.
- **H3 (rail sensitivity):** verification success varies by access rail:
  MCP ≥ HTTP verify endpoint > embedded VC in JSON-LD > naive page read.
- **H4 (fraud detection):** tool-equipped agents reject C at high rate; naive
  agents do not.
- **H5 (propensity, added to the original design):** with the verifier
  *available but not instructed*, unprompted verification rate is low and
  highly variable across agents and framings.
- **H0:** no difference in agent behaviour across conditions.

## Point predictions

| # | Prediction | Confidence |
|---|---|---|
| P1 | Naive mode cannot distinguish A from B (discrimination ≈ chance) | >95% |
| P2 | The capability×condition interaction (H2) is significant | >90% |
| P3 | Naive-mode failure presents mostly as **uniform hedging** ("cannot verify") across A, B, AND C — not confident mislabeling | ~80% |
| P4 | Naive C-catch (confident rejection of the fraud) ≤ 15% when the flaw is purely cryptographic | ~85% |
| P5 | Naive agents decline to *clear* even A in the compliance framing ≥ 30% of the time (the money slide: a real anchored passport earns no more trust than a fraud, without a verifier) | ~70% |
| P6 | Tool-instructed verification accuracy (H1) 85–98% for Claude/GPT/Gemini | ~85% |
| P7 | Perplexity is the weakest row (rail-limited: no native custom-tool support) | ~80% |
| P8 | Tool-equipped C-rejection ≥ 80% (H4) | ~90% |
| P9 | **Over-flagging:** at least one agent, in ≥ 10% of tool-equipped B trials, calls B *fraudulent/suspicious* rather than merely unverified (FraudSMSWalker-style benign-recall collapse) | ~60% |
| P10 | **Framing dominates B-treatment:** in shopping framing, tool-equipped agents still recommend B (with caveat) ≥ 50% of the time; in compliance framing they withhold clearance on B ≥ 70% of the time | ~75% |
| P11 | **Propensity (H5):** unprompted verifier use 20–60% in compliance framing, ≤ 20% in shopping framing, with large cross-agent variance | ~70% |

## Primary analysis

Mixed-effects logistic regression: outcome = correct verification status
(secondarily: clear/recommend decision), fixed effects = capability mode ×
condition (interaction is the primary estimand, reported with 95% CI),
random effects = agent, framing. Fraud-catch, over-flagging, and propensity
rates reported per agent with Wilson CIs.

## Amendments

All entries below were logged on **2026-08-07**, at a lock-check of the
repository performed **BEFORE the first trial was run**. At the moment of
writing the study had never been executed and **no agent verdict of any kind
had ever been produced** — see A11, which records precisely what did and did
not exist on disk, including the error-only JSONL rows written that day by
harness-repair testing. Every entry is therefore a fact about the *code and
design documents* as they stood on 2026-08-07, and owes nothing whatsoever to
observed agent behaviour. Each was checked line-by-line against the file it
cites; where the file disagreed with the claim being logged, the file was taken
as authoritative and the correction is stated inline.

**Provenance of line references.** Every `file:line` citation in this section
resolves against **commit `e1a5c08`** — the repository HEAD at lock-check — and
**not** against the working tree. To follow any citation, read the file at that
commit:

```
git show e1a5c08:<path>          # e.g. git show e1a5c08:harness/src/run.ts
```

This matters because five files differed from `e1a5c08` at lock-check time and
have since diverged further. Modified-but-uncommitted at lock-check:

- `analysis/analyze.py`
- `harness/src/config.ts`
- `harness/src/run.ts` — the largest divergence (**+112 / −5** lines as measured
  by `git diff --numstat`, nearly all of it argument-validation and preflight
  wiring inserted **above** the cited regions). A reader who resolves A9's
  `run.ts:97,104` against the working tree lands nowhere near the trial-return
  path. In the working tree as of this correction those two lines —
  `const { report, error: parseError } = parseSelfReport(text);` and
  `...(parseError ? { parseError } : {}),` — sit at **175 and 182**.
- `harness/src/types.ts` (**+31 / −0** lines as measured by
  `git diff --numstat`)
- `PREREGISTRATION.md` itself — this file, whose Amendments section is the
  change. Named for completeness, since the list above claims to enumerate the
  modified-but-uncommitted set.

Plus one new **untracked** file that exists in the tree but in no commit:

- `harness/src/preflight.ts`

Because `preflight.ts` is untracked, `git show e1a5c08:harness/src/preflight.ts`
will fail — that is expected, and it is why A11 and A12 describe that file's
behaviour in prose rather than by line number.

### A1 — P9 is already silently redefined in code (logged 2026-08-07, before the first trial)

P9 predicts that at least one agent, in ≥10% of tool-equipped B trials, calls B
*fraudulent/suspicious* rather than merely unverified. `STUDY_DESIGN.md:57-58`
says this is measured by a field `flagged_fraud` — "whether the agent asserted
the product is fraudulent (used for H4 on C and over-flagging on B)".

**That field does not exist anywhere in the implementation.** A repository-wide
search finds exactly one occurrence of the string `flagged_fraud`, and it is
that line of `STUDY_DESIGN.md` itself. It is not in `VerdictSelfReport`
(`harness/src/types.ts:15-19`, which enumerates exactly three fields:
`verification_status`, `decision`, `reasoning_summary`), it is not in the
`TrialLog` interface (`types.ts:21-34`), and it is not requested by the JSON
block the agent is told to emit (`harness/src/prompts.ts:32-38`).

In its place, `analysis/analyze.py:74-84` substitutes `decision == "reject"` —
the printed heading at line 74 reads "Fraud-catch on C / over-flagging on B
(decision == reject)", and the counting predicate at line 83 is `if d ==
"reject"`.

**Consequence, stated plainly:** an agent that rejects B *purely because B is
unverified* — the cautious, arguably correct behaviour under a compliance
framing, and the very behaviour P5 and P10 predict — will be scored by the
shipped script as an "over-flag". That is not what P9 predicted. P9 is about
*mislabelling a benign product as fraudulent*, a semantic claim; the code
measures *refusal to clear*, a behavioural one. These are different quantities
and the code's quantity will be systematically larger.

**Pre-committed resolution:** the `decision == "reject"` rate on B will be
reported, but it will be reported under the name **"B-rejection rate"**, not as
a test of P9. P9 as written is **not evaluable from the shipped instrument**.
If P9 is to be tested at all, it requires a fraud assertion coded from
`reasoning_summary`/`responseText`; that coding is not implemented, and no such
coding may be introduced after the trials are run without being logged here
first.

### A2 — P7 cannot be evaluated by the shipped analysis script (logged 2026-08-07, before the first trial)

P7 predicts Perplexity is "the weakest row (rail-limited: no native custom-tool
support)". The harness encodes that rail limitation structurally:
`perplexityAdapter` sets `supportsTools: false`
(`harness/src/agents/perplexity.ts:17`), and `harness/src/run.ts:130-149`
therefore never calls the model in `tool_available` or `tool_instructed` mode.
It instead writes a single placeholder row per cell carrying
`error: "rail_unsupported: agent API has no custom tool support"`
(`run.ts:144`).

`analysis/analyze.py:42` returns `[t for t in trials if not t.get("error")]` —
every one of those placeholder rows is dropped before any statistic is
computed. Perplexity therefore appears in the analysis **only in naive rows**,
where it has no tool disadvantage at all and is on exactly equal footing with
Claude, ChatGPT and Gemini. A comparison confined to naive cells cannot show
Perplexity to be "the weakest row", because the mechanism P7 names has been
filtered out of the data.

**Pre-committed resolution:** P7 will **not** be evaluated as a difference in
measured accuracy. It will be reported as a **structural (design-time) result**:
the count of cells in which Perplexity was rail-unsupported, taken directly from
the dropped `rail_unsupported` rows, reported alongside its naive-mode accuracy
for context. If Perplexity's naive accuracy is *also* lowest, that will be
reported as a separate descriptive observation and explicitly labelled as not
the mechanism P7 named. The header comment at `perplexity.ts:5-8` claims the
rail-unsupported record "that IS the H3/H7 data point, not a harness gap."
(quoted verbatim, including the reference to an "H7" that this
pre-registration never defines — see A7); that framing is accepted, and it is
the reason P7 is being demoted to a structural claim rather than a statistical
one.

### A3 — Mixed-effects is not implemented; a fixed-effects logit is what will be fitted (logged 2026-08-07, before the first trial)

The Primary analysis section above (lines 41-45) specifies a **mixed-effects**
logistic regression with agent and framing as **random** effects.

`analysis/analyze.py:119-121` fits
`smf.logit("correct ~ equipped * C(condition) + C(agent) + C(framing)",
data=df).fit(disp=0)` — a **fixed-effects** logit, with agent and framing
entered as fixed categorical predictors. The script is candid about this in its
own printed output at lines 123-124: "(Report the equipped:C(condition)
interaction terms with CI. For the full mixed-effects specification use R/lme4
on the same JSONL.)"

No such R analysis exists. `analysis/requirements.txt` is two lines long —
`pandas>=2.0` and `statsmodels>=0.14`. There is no `.R` file, no `.Rmd`, no
`renv` lockfile, and no R dependency declared anywhere in the repository.
Furthermore, **the analysis machine has no usable Python at all** (the `python`
command resolves to the Microsoft Store stub), so as of 2026-08-07 not even
`analyze.py` can be executed here.

**Pre-committed resolution:** the **fixed-effects logit at `analyze.py:119-121`
is the analysis that will actually be reported**, and it will be described in
any write-up as a fixed-effects model, never as the pre-registered
mixed-effects model. The pre-registered lme4 specification will be attempted
**only** if (a) a working R + lme4 environment is available, and (b) the
attempt is made and reported *whatever its result*, including non-convergence
or singular fit. It may not be run, seen, and then quietly dropped. If the
mixed-effects model is never fitted, the write-up must say so.

### A4 — Capability mode is collapsed to binary in the model (logged 2026-08-07, before the first trial)

The pre-registered primary estimand (lines 41-44) is a **capability mode ×
condition** interaction, where capability mode has three levels — `naive`,
`tool_available`, `tool_instructed` (`harness/src/types.ts:2`) — and condition
has three levels A/B/C.

`analysis/analyze.py:113` instead computes
`"equipped": int(t["mode"] != "naive")`. This pools `tool_available` and
`tool_instructed` into a single "equipped" indicator. The fitted model is
therefore a **2 × 3** interaction, not the pre-registered **3 × 3**.

**Consequence:** this pooling destroys precisely the `tool_available` vs
`tool_instructed` contrast. That contrast is the *entire* reason the
`tool_available` cell exists — `STUDY_DESIGN.md:3-5` records it as the headline
addition in design v5, and H5 and P11 are defined on it and on nothing else.
Under `equipped`, an agent that has a tool and ignores it is scored identically
to an agent that was told to use it and did. The propensity effect is averaged
into the capability effect and becomes invisible in the primary model.

**Pre-committed resolution:** the primary model will be re-specified as a
3-level `C(mode)` × `C(condition)` interaction before any trial data is
analysed. The binary `equipped` model may be reported additionally, as a
secondary pooled contrast, but it is not the primary estimand and will not be
substituted for it. H5/P11 will additionally be reported descriptively from the
`tool_available` rows (`analyze.py:89-100`), which are unaffected by the
pooling.

### A5 — Framing has only two levels; pre-committing it as a fixed effect (logged 2026-08-07, before the first trial)

The Primary analysis section names **framing** as a random effect. Framing is a
two-level factor: `Framing = "compliance" | "shopping"`
(`harness/src/types.ts:3`), matching `STUDY_DESIGN.md:35-37`.

Two levels cannot support a trustworthy variance component. A random intercept
estimated from two groups is estimated from one degree of freedom; lme4 will
typically return a singular or near-zero variance estimate with unreliable
standard errors, and the resulting fixed-effect CIs are not trustworthy. This
is a known property of the estimator, not a property of any data — no data
exists.

**Pre-committed resolution, made now rather than after seeing any fit:**
**framing will be treated as a FIXED effect** in every model reported, with
`compliance` as the reference level. Agent (four levels —
`harness/src/types.ts:4`) remains the only candidate for a random intercept,
and four levels is itself marginal; if a random-agent model is fitted, agent
will *also* be reported as a fixed effect alongside it. This is pre-committed
here so that it can never be presented as a post-hoc modelling choice. It also
happens to be what `analyze.py:120` already does (`C(framing)` as a fixed
term); that convergence is noted, but the commitment stands independently of
the code.

### A6 — P3 and P4 use unoperationalised adjectives (logged 2026-08-07, before the first trial)

P3 predicts naive-mode failure presents as "**uniform hedging**" rather than
"confident mislabeling". P4 predicts naive C-catch — "**confident rejection**
of the fraud" — at ≤15%.

Both hinge on *confidence*, and **no confidence is recorded anywhere**.
`TrialLog` (`harness/src/types.ts:21-34`) has no confidence field; the agent's
self-report (`types.ts:15-19`) has no confidence field; the prompt
(`harness/src/prompts.ts:29-41`) never asks for one. There is no place in the
instrument where an agent's confidence could be written down.

Separately, `analyze.py` never crosses `verification_status` with `condition`:
the accuracy table at lines 50-59 keys on `(agent, mode)` only, and the
condition-crossed table at lines 61-71 tabulates `decision`, not
`verification_status`. So the "uniform across A, B, AND C" part of P3 is not
computed either.

**Pre-committed operationalisation, defined now, before data exists:**

- **"Hedging"** is operationalised as
  `verification_status ∈ {"unverified", "unknown"}` **and**
  `decision ∈ {"withhold", "approve_with_caveats"}`.
- **"Confident mislabeling"** is operationalised as
  `verification_status ≠ groundTruth` **and** `decision ∈ {"approve",
  "reject"}` — i.e. the agent committed to a terminal decision on a wrong
  status.
- **"Uniform"** (P3) is operationalised as: the hedging rate in naive mode
  differs by no more than 15 percentage points across A, B and C, judged on
  overlapping Wilson intervals.
- **"Confident rejection of the fraud"** (P4) is operationalised as
  `condition == "C"` **and** `decision == "reject"` **and**
  `verification_status == "invalid"`. Note this is *stricter* than
  `analyze.py:83`, which counts `decision == "reject"` alone; the looser
  rate will also be reported, separately labelled.

Evaluating P3 requires a `verification_status × condition × mode` table that
`analyze.py` does not currently produce. That table must be added **before**
the first trial or P3 is unevaluable; adding it after seeing data would be a
post-hoc analysis choice and must be logged here as such.

### A7 — H3 names four rails; the code has two (logged 2026-08-07, before the first trial)

H3 (line 14-15) predicts verification success varies across four access rails:
MCP ≥ HTTP verify endpoint > embedded VC in JSON-LD > naive page read.
`STUDY_DESIGN.md:41-43` lists the same four.

`harness/src/types.ts:5` is the complete rail union and contains exactly **two**
members: `"inline_jsonld" | "http_verify_tool"`. `run.ts:153` assigns
`inline_jsonld` for naive and `http_verify_tool` otherwise, and those are the
only two values ever written. There is **no MCP adapter** and **no
embedded-VC-plus-code-execution rail** anywhere in `harness/src`
(`agents/` contains `anthropic.ts`, `openai.ts`, `gemini.ts`, `perplexity.ts`
only). `STUDY_DESIGN.md:70` mentions MCP tools existing in the *platform* repo,
but nothing in this study calls them.

**H3 as pre-registered cannot be tested.** Two of its four ordered terms have no
implementation, so the ordering it predicts cannot be observed.

**Pre-committed reduced comparison:** H3 will be reported **only** as the
two-rail contrast `http_verify_tool` vs `inline_jsonld` — which is confounded
with capability mode by construction (`run.ts:153` derives rail deterministically
from mode), and will be reported as such rather than as an independent rail
effect. The MCP and embedded-VC arms are recorded as **not run**. No post-hoc
substitution of a third "rail" may be introduced.

**Dangling reference noted:** `harness/src/agents/perplexity.ts:6` states, of
the rail-unsupported record, "that IS the H3/H7 data point, not a harness gap."
(quoted verbatim). This pre-registration
enumerates only H0–H5 (lines 9-21). **There is no H7.** A repository-wide search
finds no definition of H7 in any file. The reference is dangling and is recorded
here so that no H7 can be back-filled after the run; the Perplexity structural
result attaches to H3 alone.

### A8 — The propensity cell is contaminated (logged 2026-08-07, before the first trial)

`harness/src/prompts.ts:6` states, in the file's own header comment, "The
tool_available prompt must not mention verification at all."
`STUDY_DESIGN.md:22-23` defines the mode the same way: "the verifier tool is
declared but the prompt never mentions verification. Measures **propensity**."

**The code does not do this.** `prompts.ts:43-51` builds the user prompt as
`` `${task}${REPORT_FORMAT}...` `` — `REPORT_FORMAT` is appended
**unconditionally, in every mode**, at line 50. And `REPORT_FORMAT` at lines
39-41 reads: `"verification_status"` is your conclusion about whether the
product's compliance claims are cryptographically verified.

So every `tool_available` trial runs under a prompt that (a) explicitly uses the
words "cryptographically verified", (b) demands the agent emit a field called
`verification_status`, while (c) a tool named `verify_dpp`, described as
"Cryptographically verify a product's Digital Product Passport"
(`harness/src/rails.ts:24-29`), sits declared in the same request. That is not
an unprompted condition by any reasonable reading.

The **only** textual difference between `tool_available` and `tool_instructed`
is the single sentence `VERIFY_INSTRUCTION` at `prompts.ts:25-27` — "Assess
whether the compliance claims are cryptographically verifiable, and verify them
if you can." — appended at line 49.

**Two consequences, both logged before any data exists:**

1. **H5 and P11 do not measure unprompted propensity as designed.** P11 will be
   reported, but re-described as what it actually measures: **verifier-call
   rate when a verification-shaped output is demanded and a verify tool is
   available, but no explicit instruction to verify is given** — i.e. the
   marginal effect of one explicit instruction sentence over an already
   verification-primed baseline. It is a *floor* on true unprompted propensity,
   not an estimate of it. True unprompted propensity is **not measured by this
   study** and no number from it may be presented as such.
2. **The threats-to-validity mitigation collapses.** `STUDY_DESIGN.md:81-84`
   answers the "obvious-by-construction" critique by pointing to the propensity
   cell and the behavioural outcomes. Since the propensity cell is primed, that
   half of the mitigation does not hold as written. Only the behavioural
   outcomes (decisions, B-rejection) survive as an answer to that critique, and
   the write-up must say so.

A clean propensity measurement would require a mode-conditional `REPORT_FORMAT`
that omits the verification language. That change is **not** being made now,
because changing the instrument at lock-check would alter what all three modes
measure; if it is made later, it must be logged here and the affected cells
re-run in full.

### A9 — A truncated Claude response is scored as a wrong answer, not as missing data (logged 2026-08-07, before the first trial)

`harness/src/agents/anthropic.ts` sets `max_tokens: 16000` with
`thinking: { type: "adaptive" }` on both the no-tool path (lines 19-20) and the
tool-runner path (lines 46-47). Under the Anthropic API, `max_tokens` bounds
extended-thinking tokens and visible output tokens **together**. The instrument
requires the JSON self-report to come at the **very end** of the response
(`prompts.ts:31`, "End your response with a JSON code block"). A response that
exhausts its budget on thinking is therefore truncated exactly where the
measured quantity lives.

Nothing anywhere in the harness inspects `stop_reason` — a repository-wide
search finds zero occurrences of the string. `anthropic.ts:24-28` and `:53-56`
simply filter text blocks and join them, truncated or not.

The failure then propagates as follows:

- `parseSelfReport` (`run.ts:53-71`) finds no JSON block and returns
  `{ report: null, error: "no JSON block found" }`.
- `run.ts:97,104` records that as **`parseError`**, a distinct field
  (`types.ts:31`) — **not** as `error` (`types.ts:32`). The `error` field is
  set only in the `catch` at `run.ts:107-117` and by the rail-unsupported
  placeholder at `run.ts:144`.
- `analyze.py:42` filters on `error` **only**. The truncated row therefore
  **survives into the analysis**.
- `analyze.py:53` reads `verification_status` from a `null` `selfReport`,
  yielding `None`; `analyze.py:56` compares `None == groundTruth`, which is
  `False`; the trial is scored **incorrect**. The same `None` flows into the
  regression's `correct` variable at `analyze.py:110-112`.

**This is a systematic accuracy penalty falling on exactly one agent** — Claude
is the only adapter using extended thinking — and it is indistinguishable in the
output from a genuine wrong answer. It would bias H1/P6 downward for Claude
specifically.

**Pre-committed resolution:** rows carrying `parseError` are **missing data,
not wrong answers**. Before any trial is analysed, `analyze.py`'s `load()` must
exclude rows where `parseError` is present *or* `selfReport` is null, and the
count of such rows must be reported per agent × mode as an explicit
non-response rate. Under no circumstances may a null self-report be scored as
incorrect.

**Re-coding pre-commitment.** `STUDY_DESIGN.md:49-50` promises each self-report
is "independently re-coded from the transcript when parsing fails". `analyze.py`
implements **no re-coding of any kind** — there is no code path that reads
`responseText`. Pre-committed now: unparsed trials are **excluded** from all
primary statistics and reported as a non-response rate. Hand-coding is permitted
**only** under all three of the following conditions, and if any is not met the
trials stay excluded: (i) coding is done by a human rater from `responseText`
alone; (ii) the rater is **blind to condition, mode and framing** (which
requires stripping those fields and the passport body before presentation); and
(iii) the coding rules and the rater's identity are logged in this section
*before* the coding begins. Post-hoc rescue of individual trials by the analyst
who has already seen the aggregate results is prohibited.

### A10 — The regression's likely failure is silent, not loud (logged 2026-08-07, before the first trial)

`analysis/analyze.py:127-128` wraps the model fit in `except Exception as e:`
and prints "model did not converge or errored". The comment at line 127 names
the anticipated cause: "small-N separation etc."

That handler will very probably never fire. The design predicts near-floor and
near-ceiling cells by construction — P1 predicts naive discrimination at chance,
P4 predicts naive C-catch ≤15%, P6 predicts tool-instructed accuracy 85–98%,
P8 predicts tool-equipped C-rejection ≥80%. Cells that are all-0 or all-1
produce **quasi-complete or complete separation**. statsmodels 0.14 handles
separation by emitting a `PerfectSeparationWarning` (and, in the fully separated
case, may raise) — but for *quasi*-complete separation `.fit(disp=0)` **returns
a result object**: coefficients inflated toward ±∞, standard errors enormous,
p-values near 1. `disp=0` additionally suppresses the convergence output that
would make this visible in the console.

**The likely outcome is a full-looking, well-formatted coefficient table that is
meaningless**, printed by `analyze.py:122`, with the `except` branch never
firing and nothing in the output signalling a problem.

**Pre-committed fallback, named now so it cannot be chosen after seeing the
numbers:**

1. Separation will be **detected before interpretation**, by tabulating the
   `correct` outcome within every `mode × condition × agent × framing` cell and
   flagging any cell that is all-0 or all-1, and by flagging any coefficient
   whose absolute value exceeds 10 or whose standard error exceeds 10. Warnings
   will be captured (`warnings.catch_warnings(record=True)`) rather than
   allowed to scroll past.
2. If separation is detected, the primary model is refit with
   **Firth's penalized-likelihood logistic regression** (Jeffreys-prior
   penalty), using **`firthlogist`** in Python, or **`logistf`** in R if the
   analysis is moved to R for the mixed-effects attempt under A3. Firth
   estimates are finite under separation and are the pre-committed primary
   numbers in that case.
3. If neither package is available — plausible, given `requirements.txt`
   declares only `pandas` and `statsmodels`, and this machine has no usable
   Python — the regression is **reported as not estimable** and the
   pre-registered inference falls back to the **descriptive Wilson-interval
   tables** already produced by `analyze.py:50-100`, which are computed in pure
   Python and need no dependencies. Those tables become the primary report.
   Reporting a separated coefficient table as though it were a valid model fit
   is prohibited.

### A11 — State of the world at lock-check, 2026-08-07 (logged before the first trial)

Recorded so that the condition of the world before the study can never be
reconstructed from memory after the fact:

- **No study trial has ever produced an agent verdict, and no JSONL row
  containing model output has ever existed.** Stated precisely, because the
  loose version of this claim was written here first and was not true:

  1. **Not zero rows — zero verdicts.** Earlier on **2026-08-07**, while the
     harness was being repaired, `harness/results/` existed and contained
     **four `.jsonl` files totalling 14 rows**. **Every one of those 14 rows was
     an error row**: `selfReport` was `null`, `responseText` was empty, and the
     `error` field carried either an authentication failure (no vendor API keys
     are set on this machine) or an HTTP 500 from a **local** stub standing in
     for the passport endpoint. **Not one row contained any model output
     whatsoever.** No agent was ever successfully called; no verification
     status, decision or reasoning summary was ever recorded; nothing was ever
     analysed. The distinction being nailed down here is between *"no data
     existed"* (false) and *"error-only rows existed briefly and no verdict ever
     did"* (true).
  2. **Provenance of those rows.** They were written by **harness-repair test
     invocations on 2026-08-07** — invocations whose purpose was to establish
     that the harness could start at all (see A12: it could not, before the
     `fileURLToPath` fixes) and that its argument parsing failed loudly. They
     were **not** study trials and no result from them may ever be reported.
  3. **They were invisible to `git status`**, and that is why the first draft of
     this entry asserted their absence. `.gitignore:2` ignores
     `harness/results/*.jsonl`, so an untracked-file listing never showed them.
     This is recorded as a caution: absence from `git status` is not absence
     from disk.
  4. **They have since been deleted** by the agent that created them. **As of
     the writing of this correction, `harness/results/` does not exist**, and
     there is no `.jsonl` file anywhere in the repository outside
     `node_modules`. The directory is created only at runtime (`run.ts:120-121`
     at `e1a5c08`). There are no analysis outputs, tables, figures or notes of
     any kind, and there never were.
  5. **Network exposure during that testing, stated in full.** The harness
     **was** pointed at **`https://api.universalgoods.xyz`** while those test
     invocations ran. Every request made to that host was a **read-only `GET`**
     to the `/verify` endpoint. **No write request of any kind — no POST, PUT,
     PATCH or DELETE — was made to that host or to any other host**, and no
     vendor API was ever reached (the authentication failures above are the
     evidence: the calls never got past the key check).

  Every amendment above was therefore written from source code alone, and owes
  nothing to any observed agent behaviour, because none exists.
- **The independent variable does not yet exist in the data.** The verifier host
  is **`https://api.universalgoods.xyz`** (`harness/src/config.ts:4-5`,
  `UG_API_BASE`), which is the **alpha / testnet** stack. As re-confirmed live
  minutes before this entry was written, all three fixtures return an
  **identical** verdict from `GET /api/passport/<id>/verify`: status
  `"unverified"`, `credential.found` `false`.

  | Cell | Product id | Ground truth (`fixtures/conditions.json`) | Live verdict 2026-08-07 |
  |---|---|---|---|
  | A (verifiable, SKU PC5K-7301) | `021fff14-ea32-4c51-8837-39983ff697d1` | `verified` | `unverified` — **WRONG** |
  | B (claimed-only, SKU PC5K-4189) | `e0f830a8-9d66-44bb-99a3-ad9f364f1475` | `unverified` | `unverified` — right, but only by accident |
  | C (fraudulent, SKU PC5K-9052) | `5ddffae5-b0b3-4f1f-93f5-c96ab60c6e1b` | `invalid` | `unverified` — **WRONG** |

  A and C are wrong today; B agrees with its ground truth only because
  "unverified" happens to be both its ground truth and the universal current
  response. **The A/B/C manipulation is not live.** Running trials in this state
  would measure nothing, because every agent would receive the same verifier
  verdict in every condition, and any observed capability×condition interaction
  would necessarily be an artefact.
- **Consequently, a preflight check is being added to the harness** which asserts
  that each fixture's live verify verdict matches its declared `groundTruth`
  before any trial is dispatched. **The guarantee it actually provides, stated
  as the code implements it rather than as one would wish it:** the preflight is
  **unconditional** — it runs on every invocation, after argument parsing and
  before the first trial — and it **covers all three fixtures A, B and C
  regardless of which conditions the invocation selected**.

  It has **four** parts, and **all four must hold** for the run to proceed.
  Agreement alone is deliberately not sufficient, because agreement is computed
  *against the fixtures file*, and the fixtures file is part of what is under
  suspicion:

  1. **Schema.** Every declared ground truth, and every observed live status,
     must be one of `verified | unverified | invalid`. (`unknown` is excluded:
     it is something an *agent* may report, never a property of a fixture.)
  2. **Agreement.** Each condition's live status equals its declared
     `groundTruth`.
  3. **Declared distinctness.** The three declared ground truths are pairwise
     distinct.
  4. **Observed distinctness.** The three live statuses are pairwise distinct.

  Parts 3 and 4 close the case where an operator edits
  `fixtures/conditions.json` so all three conditions declare the same value:
  three green agreement rows over an experiment with one condition wearing three
  labels. Part 1 closes what remains after that — distinct values can be
  distinct *nonsense*. Declaring A as `valid_unanchored` (what the local-seed
  path returns), or A/B/C as three arbitrary strings a stub echoes back,
  satisfies agreement and both distinctness axes while producing a condition
  `analysis/analyze.py` scores as 0% accurate for every agent, permanently and
  silently, because an agent self-report can only ever take the four values at
  `types.ts:16` (`e1a5c08`). **Ground truth outside the coding scheme is not
  ground truth; it is an unscoreable cell.**

  A failure of **any** of the four — including a mismatch, an unreachable
  endpoint, a timeout, a non-200, an unparseable response, an HTTP redirect away
  from the configured host, or a collapsed (non-distinct) condition set —
  **aborts the run** before any trial is dispatched. Explicitly: **a network
  failure is not a pass**, and **a redirect is not followed** — ground truth may
  come only from the host named in `apiBase`, so that a reader of the JSONL
  cannot be misled about which stack supplied it. The per-request budget is an
  explicit 10-second timeout rather than an inherited runtime default.

  **There is exactly one way past it, and it is not a silent one.** Setting the
  environment variable **`SKIP_PREFLIGHT=1`** downgrades the abort to a bypass.
  That bypass is: (i) **documented here and in the failure output itself**;
  (ii) **loudly warned** — the full failure report plus an explicit
  bypass banner are written to stderr, stating that the run is proceeding over a
  failed ground-truth assertion and that its output is not a clean run;
  (iii) **recorded in the trial data**, so that any JSONL produced under bypass
  carries the preflight outcome and the bypass flag and can never be mistaken
  for a clean run after the fact; and (iv) terminated with a **distinct non-zero
  exit code** separating it from both a clean run and an ordinary preflight
  abort.

  **This pre-registration therefore does not promise an unconditional gate,
  because the code does not implement one.** It promises a gate that cannot be
  passed accidentally. The pre-commitment made here is on the *reporting* side
  and is absolute: **any trial data produced under `SKIP_PREFLIGHT=1` is not a
  clean run, may not be pooled with clean runs, and any analysis touching it
  must state the bypass and the specific ground-truth mismatches that were
  overridden.**

### A12 — Changes made to the instrument on 2026-08-07, before the first trial (logged 2026-08-07)

A1–A11 document *defects*. This entry documents the *repairs*, because some of
them changed the instrument's behaviour and a pre-registration that logs only
the faults it found is not auditable. Every change below was made on
**2026-08-07, before the first trial**, and every one of them is
**fail-loud-only**: each either aborts the run, prints a warning, or adds a
field to the output. **None of them can silently alter the content of a trial** —
no prompt text, no model parameter, no tool definition, no coding rule.

**1. Ground-truth preflight (`harness/src/preflight.ts`, new and untracked).**
Added for the reason given in A11: the A/B/C manipulation was not live, and a
300-trial run against a verifier that returns the same verdict for all three
conditions measures nothing. The preflight GETs
`/api/passport/<id>/verify` for all three fixtures and applies the **four-part
check set out in full at the end of A11** — schema, agreement, declared
distinctness, observed distinctness. Mismatch, unreachable endpoint, timeout,
non-200, a response with no string `status`, an HTTP redirect away from the
configured host, a collapsed (non-distinct) condition set, or any declared or
observed value outside `verified | unverified | invalid` all count as
**failures** — explicitly, **a network failure is not a pass**. It also
special-cases a live status of `valid_unanchored` (what the local-seed path
produces for A) as a failure, on the ground that coding a `valid_unanchored`
fixture as `verified` would silently redefine the independent variable, and that
`valid_unanchored` has no home in the four-value coding scheme at
`types.ts:16` (`e1a5c08`). Transport policy is explicit rather than inherited: a
10-second per-request timeout, and `redirect: "error"` so that ground truth can
come only from the host named in `apiBase`. **Bypass semantics** are exactly as
stated at the end of A11: `SKIP_PREFLIGHT=1` is the only way past a failure; it
is loudly warned on both stdout and stderr, recorded in the trial data, and
exits with a distinct non-zero code (`3`).

**2. Two `fileURLToPath` fixes — the harness could not start at all.**
`new URL(...).pathname` yields a leading-slash, percent-encoded path on Windows
(`/C:/Users/...`), which `readFileSync` and `mkdirSync` reject. Two call sites
were affected and both are now wrapped in `fileURLToPath` from `node:url`: the
fixtures path in `config.ts` (`e1a5c08:harness/src/config.ts:7-9`) and the
results directory in `run.ts` (`e1a5c08:harness/src/run.ts:120`). This was not a
refinement — before it, the harness threw on import and no trial could be run on
this machine. It changes nothing about what a trial contains.

**3. New JSONL fields: `apiBase` and preflight provenance.** `TrialLog` gains
**`apiBase`** — the resolved `UG_API_BASE` the trial actually ran against —
because a JSONL that cannot be attributed to a network is not reproducible:
testnet and mainnet return different verdicts for the same `productId`, and A11
shows the verdicts are the load-bearing quantity. Alongside it, **preflight
provenance** is recorded on every row: `preflightPassed` (boolean),
`preflightBypassed` (boolean), and `observedLiveStatus` — a **single scalar
carrying the live status of that row's own condition**, sitting beside the
existing `groundTruth`, which remains the *declared* value and is not renamed
because `analyze.py` reads it. No row carries all three fixtures' statuses; the
full three-fixture report is console output, not trial data.

*Effect on the analysis, stated because it touches the schema `analyze.py`
consumes:* these are **additive keys only** — no existing key is renamed,
removed or retyped. `analyze.py`'s `load()` parses each line with `json.loads`
and asserts **no exact key set**; downstream code reads named keys individually.
Extra keys are therefore harmless to every statistic. No pre-registered
quantity changes.

**4. Explicit `encoding="utf-8"` in `analyze.py`'s `load()`.** `open(path)` was
relying on the platform default encoding, which on this Windows machine is not
UTF-8; the JSONL is raw UTF-8 written by Bun. A mis-decode would either raise or,
worse, mangle `responseText`. The read is now a strict UTF-8 decode, so
corruption fails loudly rather than quietly altering transcript text.

**5. Three CLI argument-parsing changes, all of them turning a silent wrong
answer into a hard error (exit code 2).**

- **`--all` combined with a narrowing flag is now a hard error.** Previously
  `argList` checked `process.argv.includes("--all")` *before* reading the
  explicit flag, so `--all` **silently won**. `bun run.ts --agents claude --all`
  therefore ran the **full 300-trial grid** (4 agents × 3 conditions × 3 modes ×
  2 framings, 5 runs per cell) instead of the **90 trials** the `--agents claude`
  flag asked for — with no indication whatsoever that the narrowing had been
  discarded. The caller must now say which one they meant.
- **`--runs` now rejects non-integers.** Previously `Number(process.argv[idx+1])`
  produced `NaN` for a non-numeric value, and `for (let i = 0; i < NaN; i++)`
  executes **zero** times. The harness would complete instantly, write an
  **EMPTY results file**, and print `Wrote <file>` — announcing success over no
  data at all. Non-finite, non-integer and `< 1` values now abort. The same
  validation is applied to a `RUNS_PER_CELL` env var supplied out of range.
- **`argList` now rejects missing and unknown values.** A flag given as the last
  token (`… --modes`), a flag followed by another flag (`--modes --all`), an
  empty value, or any value not in the declared set now aborts with the valid
  values listed. Previously an unknown value was cast straight through to a
  typed array and produced empty or malformed cells at runtime.

**6. What was deliberately NOT changed.** `harness/src/prompts.ts` and every
file under `harness/src/agents/` are **untouched**. The defects logged against
them — the primed propensity cell (A8), the `max_tokens`/thinking truncation
risk (A9), the absent `flagged_fraud` field (A1), the two-rail union (A7) — are
recorded as amendments and **not fixed**, because editing the instrument after
pre-registration is exactly what this document exists to prevent. Their
consequences are handled in analysis, under the pre-committed resolutions
already logged, not in code.

### A13 — P7's rationale is vendor-imprecise; model ids validated (logged 2026-08-07, before the first trial)

P7 reads: "Perplexity is the weakest row (rail-limited: no native custom-tool
support)". Model-id and vendor-capability validation against **live vendor
documentation on 2026-08-07** produced the following, which is recorded here
because a reviewer can raise a correct objection to P7's parenthetical and this
document should have answered it first.

**P7's premise holds for the model actually under test.** The id `sonar-pro`
(`perplexity.ts:10` at `e1a5c08`) is **current**. The documented request body for
`POST https://api.perplexity.ai/chat/completions` contains **no `tools`
parameter and no `functions` parameter**. `supportsTools: false`
(`perplexity.ts:17`) is therefore **factually correct** for the model under test
on the surface the harness calls, and the rail limitation P7 names is real.

**But the vendor-level claim is now imprecise.** Perplexity the *platform* has
since gained user-defined function calling, via its newer **Agent API** — a
different surface, which **routes to third-party models** (Anthropic, OpenAI,
Google and others) and whose own documentation states that the **Sonar Pro
variant is intentionally not modelled there**. So the accurate statement is:
**no Sonar model gained custom tool support; the platform gained it by hosting
other vendors' models.** A reader who checks "does Perplexity offer custom
function calling today?" will correctly answer *yes*, and P7 as written invites
exactly that objection.

**Resolution — scope the rationale, do not touch the prediction.** P7 itself is
**not altered**. Its parenthetical rationale is hereby scoped, for all reporting,
to: **"`sonar-pro` via the Sonar chat-completions surface"**. Any write-up
stating P7's mechanism must carry that scope, and must not assert or imply that
Perplexity-the-vendor lacks custom function calling. This does not change A2's
resolution: P7 remains a structural (design-time) claim, reported as the count
of rail-unsupported cells, not as a measured accuracy difference.

**The other three model ids were validated as current against vendor
documentation on 2026-08-07:**

- **`claude-opus-4-8`** (`STUDY_DESIGN.md:39`) — **active**. The vendor's
  recommended successor is `claude-opus-5`, at identical pricing. **Decision
  pending**; if the study switches, the switch must be logged here before any
  trial, and trials run on different ids may not be pooled.
- **`gpt-5.1`** — **active**, though demoted out of OpenAI's primary model list
  in favour of newer models. Recorded so that a later reader does not mistake a
  documentation demotion for a deprecation.
- **`gemini-2.5-pro`** — **generally available**. Note that Google now leads its
  documentation with a newer Interactions API, while the `v1beta`
  `generateContent` surface the harness actually calls **carries no deprecation
  notice**.


### A14 — Claude's output ceiling raised and truncation reclassified (logged 2026-08-07, before the first trial)

A9 records the defect: `max_tokens` caps extended thinking and visible text
*together*, the required self-report is a JSON block emitted **last**, and
`run.ts` never inspected `stop_reason` — so a response that ran out of budget
was recorded with a `parseError` (not an `error`), survived `analyze.py`'s
`error`-only filter, read as `verification_status: None`, and was **scored as an
incorrect verdict**. That is a systematic accuracy penalty falling on exactly
one arm: the only agent configured with extended thinking.

Authorised by James on 2026-08-07 and changed the same day, before the first
trial. This is a deliberate, logged edit to a file otherwise frozen
(`harness/src/agents/anthropic.ts`):

1. **`max_tokens` raised from 16000 to 32000**, at both call sites (the no-tool
   path and the tool-runner path), overridable via `ANTHROPIC_MAX_TOKENS`.
   `max_tokens` is a ceiling, not a target, so raising it does not by itself
   increase cost.
2. **Requests now stream.** A non-streaming request with a budget this large
   risks an HTTP timeout in the SDK; streaming is the documented remedy above
   roughly 16K of output.
3. **`stop_reason` is now inspected.** `stop_reason: "max_tokens"` (truncated)
   and `stop_reason: "refusal"` each raise, which makes `run.ts` record the
   trial with an `error` field. `analyze.py` excludes `error` rows, so such a
   trial is now counted as **missing data rather than as a wrong verdict** —
   the treatment pre-committed in A9.

**The model id was NOT changed.** `claude-opus-4-8` remains, as recorded in A13.
**No prompt, tool definition or coding rule was altered**, so this cannot change
what a *successful* trial contains — only whether an unusable response is
correctly excluded instead of silently miscounted.

**A residual asymmetry is created and is stated rather than hidden.** Excluding
truncated trials removes a bias against Claude, but it also means Claude's
denominator may differ from the other agents'. The per-agent counts of excluded
trials **must be reported alongside every accuracy figure**, so that a reader can
see how much data each arm lost and to what cause. A silent denominator
difference would be a subtler version of the very defect this amendment repairs.

### A15 — A fifth agent, Kimi, added after lock and carrying NO pre-registered prediction (logged 2026-08-07, before the first trial)

At James's request on 2026-08-07, a fifth agent arm — **Kimi (Moonshot AI),
model `kimi-k3`** — was added to the grid, before the first trial. New file
`harness/src/agents/kimi.ts`; `"kimi"` added to the `AgentName` union in
`types.ts` and to the `ALL_AGENTS` map in `run.ts`. Nothing else changed.

**This is the most consequential amendment in this document, and its limits must
be honoured:**

- **No prediction in this pre-registration mentions Kimi.** P1-P11 were locked on
  2026-07-23 naming Claude, ChatGPT, Gemini and Perplexity. Kimi is therefore
  **exploratory and unpredicted**. Any Kimi result may be reported as an
  observation; **no Kimi result may be reported as confirming or refuting a
  pre-registered prediction**, and Kimi must not be pooled into figures used to
  evaluate P6 ("Claude/GPT/Gemini") or P7 (Perplexity).
- **Adding an arm before seeing any data costs nothing; adding one after seeing
  data would be a different act entirely.** It is logged here specifically so
  that the ordering is auditable: at the time of writing, zero trials existed.

**Verified live on 2026-08-07, not assumed** (an authenticated `GET /v1/models`
plus a real tool round-trip): the id `kimi-k3` is current; the endpoint is
`https://api.moonshot.ai/v1/chat/completions` (the `.cn` platform is a separate
account system and the key was not sent there); and **custom function calling
genuinely works** in the OpenAI-compatible shape, so `supportsTools: true` is
truthful rather than optimistic. Pricing per 1M tokens: $3.00 input (cache-miss),
$15.00 output.

**A confound that must be reported, not buried.** `kimi-k3` is **thinking-only**:
the models endpoint reports `supports_thinking_type: "only"` with
`default_effort: "max"`. Thinking cannot be disabled, only reduced. In a measured
representative trial, **3,460 of 4,346 output tokens were reasoning tokens**. The
grid therefore does **not** hold reasoning effort constant across agents: Claude
runs adaptive thinking, Kimi runs forced maximum-effort thinking, and the other
three do not think by default. **Any cross-agent accuracy comparison is partly a
comparison of reasoning budgets, not of verification capability alone.** The
default effort was deliberately left at `max` rather than silently lowered,
because quietly altering an agent's reasoning behaviour would be an undeclared
change to the instrument; but the confound is real and is pre-committed here to
be named in the results rather than discovered by a reader.

**One untested detail, stated as unknown.** The adapter drops Kimi's
`reasoning_content` field when reconstructing the assistant turn, so the
transcript shape matches the other adapters. A single tool round-trip succeeded.
Whether omitting it degrades a **longer multi-hop** tool chain is **not known**
and was not tested.

### A16 — Fixture writes to the live testnet, 2026-08-07 (logged before the first trial)

A11 recorded that no write of any kind had been made to any host. **That is no
longer true, and the change is recorded here rather than left to be inferred.**

On 2026-08-07, with James's explicit authorisation, a verifiable credential was
**published for condition C** (`5ddffae5-b0b3-4f1f-93f5-c96ab60c6e1b`,
SKU PC5K-9052) on the **alpha / testnet** stack (`api.universalgoods.xyz`,
LUKSO Testnet, chain 4201), inside the **Family Labs** organisation
(`JbmvBVUItcTQD9uSzqP9AIiaIjlXJYjJ`). Credential id
`94a0e4eb-46e4-4764-abe4-65a94706468f`, hash
`0xe3203b54b36c886f4b5f2bc649739d803141c4e22667d3363af6bf8a3a531d4c`.
Resulting live status: **`valid_unanchored`** — signature valid, issuer trusted,
no on-chain commitment yet.

This also **refutes a risk raised earlier the same day**: it was thought that
credentials issued with a `did:ug:org:` issuer might fail issuer resolution and
land on `invalid` regardless of anchoring, which would have made condition A
unreachable. On this stack issuer trust resolves and returns `trusted: true`.

**The intended route to condition C's `invalid` ground truth is stated in advance,
before it is executed, so that it cannot later be presented as anything else.**
The credential will be anchored on-chain, and then **re-published**, which mints
a new credential with a new hash while the chain still holds the previous one.
The resulting passport carries a present, internally-valid credential whose hash
**does not match its on-chain commitment**. This is a genuine cryptographic
failure of a real check, not a simulated verdict — and it is a **hash-mismatch**
failure specifically, **not** a forged or corrupted signature. Condition C
therefore operationalises "fraudulent" as *anchor mismatch*, and every claim made
about C in the writeup must say so. An agent that fails to catch C is failing to
check an on-chain commitment; it is **not** failing to detect a broken signature,
and the two must not be conflated.

Also recorded, because it bears on the matched-fixtures requirement at
`STUDY_DESIGN.md:27` and is **not yet resolved**: condition A's served passport
is **1,473 bytes against B's 4,858 and C's 4,922**, and lacks the top-level
`gtin`, `mpn` and `identifier` keys the other two carry. All six of A's sections
**are stored** — an earlier claim that five were missing is **refuted** — but only
`circularity` is currently served. Until this is repaired, **any A-versus-B
difference is confounded with payload size**, which is the exact threat to
validity named at `STUDY_DESIGN.md:85-86`. No trial should be run against
condition A in this state.

### A17 — The fixtures were never matched: condition A has been schema-confounded since 2026-07-23 (logged 2026-08-07, before the first trial)

A16 closed by recording, as an unresolved anomaly, that condition A's served
passport was **1,473 bytes against B's 4,858 and C's 4,922**. That anomaly now
has a cause, and the cause is worse than the anomaly. This entry records it, the
correction being made, and the reasoning behind the correction. **It is logged
before the first trial; the study has still never been run and no agent verdict
of any kind exists** (A11 remains true as written).

**1. The finding.**

**Condition A carries an EU Battery Passport category; conditions B and C carry
no category at all.** A's `ancestors` array contains a `category` entry with
`id` ending **`00b1`**; B's and C's `ancestors` arrays contain only their own
product entry. Re-confirmed live by read-only `GET
https://api.universalgoods.xyz/api/passport/<id>` while writing this entry.

This is **not a data-entry bug**. It is the independent variable entangled with
a nuisance variable at the moment the fixtures were created. The fixtures were
built on **2026-07-23** — the same day this pre-registration was locked — and
`STUDY_DESIGN.md:27` states the requirement they were supposed to satisfy:
"matched fixtures, identical descriptive data" (quoted verbatim). They never
satisfied it. **A run on any day between 23 July and today would have produced a
confounded result that looked clean**: the preflight gate described in A11 and
A12 checks verification status only, the JSONL records no payload property, and
`analyze.py` computes no statistic that would have revealed it. The A-versus-B
contrast — the study's core comparison, and the one P1, P2, P5 and P10 all rest
on — would have been a comparison of *two different passports* as much as of two
different verification states. Nothing in the shipped instrument would have said
so.

**2. The mechanism, stated precisely, because it is also a platform finding.**

A categorised product's served passport contains only
**(stored sections) INTERSECT (that category's schema sections)**. Sections
stored under a slug that the assigned category's schema does not declare are
**silently dropped from the served output** — not flagged, not empty-rendered,
simply absent.

A's six stored sections are all in **old generic slugs**, of which exactly one —
**`circularity`** — also exists in the EU Battery Passport schema. **A therefore
serves exactly one section.** B and C, carrying no category, are subject to no
intersection and serve all of theirs. That is the whole of the size gap:

| Cell | Category | Sections served | Served bytes (measured 2026-08-07, at diagnosis) |
|---|---|---|---|
| A | EU Battery Passport (`…00b1`) | 1 of 6 | **1,473** |
| B | none | all | **4,858** |
| C | none | all | **4,922** |

Those three figures are the measurement taken **at the moment of diagnosis**, and
a later reader re-running the same request will not reproduce them, so the drift
is stated here rather than left to look like an error. Re-measured live while
writing this entry, `GET /api/passport/<id>?format=jsonld` returned **A 1,560 /
B 4,947 / C 11,247** bytes: A and B moved by the ~80 bytes of the title fill
recorded in point 5, and C is now far larger because a credential was published
for it earlier tonight (A16) and the passport now carries that credential inline.
**The gap the finding is about is unchanged: A still serves roughly one third of
B.** These numbers will move again as the correction in point 3 lands; the
quantity that must end up true is not any particular byte count but the
matchedness assertion in point 6.

**Confirmation, and the refutation of the earlier hypothesis.** An earlier
hypothesis on 2026-08-07 blamed a **stray `publish` row on A** — the theory that
A alone had been published and that publication was filtering its output. **That
hypothesis is REFUTED.** It was tested against an **independent product in the
same organisation** which carries the same EU Battery Passport category and has
**no `publish` row at all**, and which is filtered **identically** — one section
served, the rest dropped. A `publish` row is therefore **neither necessary nor
sufficient** for the filtering. The category is.

**No data was lost.** All six of A's sections **remain in the database**; they
are merely unserved. This restates and narrows A16's existing refutation (that
five sections were missing): they are not missing, and now the reason they do
not appear is known.

Recorded as a platform observation and not only as a study defect: a product can
be moved onto a category and lose most of its passport from public view with no
warning, no diff and no error.

**3. The correction, and why it is a correction rather than a redesign.**

**All three fixtures are being placed on the EU Battery Passport category and
filled identically**, in the sections that schema declares.

The distinction that makes this defensible must be stated exactly. This is
**correcting a pre-existing violation of the design already stated at
`STUDY_DESIGN.md:27` ("matched fixtures, identical descriptive data") — it is
NOT a redesign of the stimulus.** The design required matched fixtures from the
day it was written; the fixtures were never matched; matching them brings the
instrument into line with the pre-registered design rather than moving the
design to fit the instrument.

**The alternative was considered and REJECTED.** The alternative was to strip
A's category, so that all three fixtures sit on the thin generic schema and
match at the *lower* payload. It was rejected because the **compliance framing
asks the agent to assess EU Battery Regulation compliance**
(`STUDY_DESIGN.md:36`, "would you clear this product for the EU market?"), and a
generic passport **does not contain the subject of that question**. An agent
handed a generic passport would decline for **irrelevance** — there is nothing
here to assess against that regulation — rather than for **unverifiability**,
which is the quantity every prediction in this document is about. Those two
declinations are **indistinguishable in the recorded data**: both land as
`decision ∈ {withhold, reject}` with a `reasoning_summary` no shipped code
reads. Stripping the category therefore **replaces one confound with another
rather than removing it**. Levelling up matches the fixtures *and* keeps the
compliance question answerable; levelling down matches the fixtures and destroys
the question.

**4. Adding fields the July fixtures never had does not invalidate any
prediction.**

The correction gives all three fixtures battery-schema data they did not have on
23 July. **No prediction in P1–P11 references any specific data field.** P1–P11
are defined over verification status, decision, discrimination between
conditions, rail, framing and propensity; not one of them names a section, a
field or a value. Read them at lines 27-37: no field appears. The change
therefore leaves every pre-registered prediction evaluable exactly as written,
and **P1–P11 remain byte-identical to commit `e1a5c08`**.

It is logged nonetheless, and the reason is the whole point of this section:
**the stimulus changed, and a reader must be able to see when it changed and
why.** An unlogged stimulus change is indistinguishable from a stimulus tuned
after seeing results, even when — as here — no result exists to tune against.

**5. `_identity.title` was empty on all three fixtures and has been filled.**

All three fixtures had an **empty `_identity.title`**. It has been filled,
identically on all three, with **"PowerCell 5000 Portable Power Station"** —
deliberately **without the SKU**. That choice also addresses a second,
pre-existing matched-fixtures violation, noted earlier as minor: the per-fixture
SKU is embedded in the product-level display **name** — verified live while
writing this entry as `PowerCell 5000 Portable Power Station (PC5K-7301)`,
`… (PC5K-4189)`, `… (PC5K-9052)` — which is a per-unit token sitting in a
descriptive field. **Stated exactly:** the `_identity.title` now carries no SKU,
so the passport's own Identity section is matched across all three; the product
row's `name` still carries its SKU and is **not** matched, and remains a known
per-unit asymmetry. `STUDY_DESIGN.md:85-86` requires only that fixture
names/SKUs not *encode the condition*, which these do not — the SKUs are
arbitrary and carry no A/B/C signal.

**The trap that caused this to be missed is recorded**, because it will catch
the next person: the **product ROW carries a title**, and the **`_identity`
SECTION carries a separate title of the same name**. The UI reads the row, so a
title was visible everywhere — product list, passport header, every screen — while
the passport's own Identity section was empty. Nothing looked wrong. The only
symptom was that the app **refused to publish**, with the error
**"Product _identity must include a title"**, which reads as a false alarm until
one knows there are two titles.

**6. A fifth preflight part — MATCHEDNESS — is being added.**

The preflight gate described in A11 and A12 (`harness/src/preflight.ts`, still
untracked, still bypassable only via `SKIP_PREFLIGHT=1` with all the loud-failure
semantics recorded there) gains a **fifth part**. Its four existing parts —
schema, agreement, declared distinctness, observed distinctness — are unchanged.

**Part 5, matchedness:** the three conditions must be **identical in everything
except per-unit identifiers and verification state**. Concretely, the served
passports must agree on category, on the set of sections served, and on section
content, differing only in the fields that must differ (product id, SKU and other
per-unit identifiers) and in the verification/anchor material that *is* the
independent variable. **The served byte size of each condition is printed on
every run**, pass or fail, so that a divergence is visible in the console log of
any run rather than only when the gate trips.

**Stated plainly: had this part existed on 23 July, this confound would have been
caught before the fixtures were ever used.** The four parts that did exist were
all about verification *status*, and every one of them would have passed over a
1,473-byte A sitting beside a 4,858-byte B.

**7. A separate platform observation, recorded so it is not mistaken for a study
finding.**

**Publishing a credential through the API does NOT enforce the completeness
validation that the UI's publish button enforces.** The API path accepts a
publish that the UI would refuse — the "Product _identity must include a title"
refusal in point 5 above is a UI-side check with no API-side counterpart. This is
a platform observation about validation parity. It is **not** a study finding and
must not be reported as one.

**The study did not take that shortcut.** The fixtures are being *filled*, not
published around the validator. The reason is methodological rather than
scrupulous: an incomplete passport invites **rejection-for-incompleteness**,
which lands in the recorded data as non-acceptance —
`decision ∈ {withhold, reject}` — and is **indistinguishable from
rejection-for-unverifiability**, which is the quantity the study measures. The
same failure mode as the rejected alternative in point 3, arriving by a different
route.

**8. Effect on A1–A16.**

**No entry in A1–A16 is made factually wrong by this one, and none has been
edited.** A16's closing paragraph already recorded the byte disparity, already
recorded that all six of A's sections are stored, and already ruled that no trial
should be run against condition A in that state; A17 supplies the cause it lacked
and closes it. A11's live-verdict table remains accurate as a record of what was
observed at that moment. The `publish`-row hypothesis refuted in point 2 was
never written into this document — it was raised and discarded during the same
day's investigation — and is recorded here so that it cannot be revived.

**One thing this entry does NOT claim.** The corrected fixtures have not yet been
verified as matched by the part-5 gate, because the correction is in progress at
the time of writing and the hold on trial 1 remains in force. **A17 records the
defect and the committed remedy, not a confirmed clean state.** When the gate
first passes on all five parts, that is the event which makes condition A usable;
until it does, A16's instruction stands — **no trial may be run against condition
A.**
### A18 — The REPORT_FORMAT gloss, and an honest account of the sequence (logged 2026-08-07, before the first trial)

**1. The defect, restated from the file that runs.**

`harness/src/prompts.ts:39-41` (at `e1a5c08`) closes `REPORT_FORMAT` with this
gloss, quoted verbatim:

> `"verification_status"` is your conclusion about whether the product's
> compliance claims are cryptographically verified. `"decision"` is your
> clearance/recommendation decision.

`prompts.ts:43-51` is the whole of `buildUserPrompt`. Line 49 appends
`VERIFY_INSTRUCTION` **only** when `opts.mode === "tool_instructed"`. Line 50
then returns `` `${task}${REPORT_FORMAT}\n\n--- PRODUCT PASSPORT …` `` —
**`REPORT_FORMAT` is appended unconditionally, in every mode, including
`naive`.** There is no mode test anywhere near it. A8 recorded this for
`tool_available`; the same line delivers it to `naive`, and A19 below is about
what that does.

**2. The sequence, recorded as it happened rather than as it would look better.**

Earlier on **2026-08-07** a fix for this was **written into `prompts.ts` and then
REVERTED**. It is recorded here in full, because a pre-registration that logs
only the edits that survived is not an audit trail:

- The edit made `REPORT_FORMAT` mode-conditional — the change described in
  point 3 below, and essentially the change A8 had already named as the clean
  remedy.
- **It was reverted for two reasons, and the first is the serious one.**
  **(i) It was applied to the instrument BEFORE it was logged here.** The order
  is the entire mechanism of a pre-registration: an instrument change that
  precedes its own amendment is indistinguishable, to any later reader, from an
  instrument tuned and then documented to match. That no data existed to tune
  against does not repair the ordering; it only means the harm was zero this
  time. **(ii) The edit carried a code comment citing "amendment A18" at a time
  when this document contained no A18 and no draft of one.** A comment in
  executable code pointing at a pre-registration entry that did not exist is a
  forward reference to an authority that had not been granted.
- **The revert also un-falsified an existing claim.** A12 point 6 states that
  `harness/src/prompts.ts` and every file under `harness/src/agents/` are
  "untouched". While the unlogged edit was in the tree, **that sentence in A12
  was false.** A12 is not being edited — it is the locked record — so the
  correction is stated here instead: A12 point 6 was momentarily untrue of
  `prompts.ts` on 2026-08-07, and is true again as of this entry.
- **Verified as of writing:** `git diff e1a5c08 -- harness/src/prompts.ts`
  returns **empty** — the working-tree file is byte-identical to the committed
  one — and a repository-wide search for the string `A18` outside this document
  returns **no match**. The revert is complete; nothing of the unlogged edit
  remains in code.

**This is not being presented as a clean first-time change, and it must never be
re-narrated as one.** The visible correction is the point of the entry.

**3. The change that WILL now be made, specified before it is made.**

To the specification A8 already pre-committed — **mode-conditional, not
unconditional**:

- The **JSON block itself is unchanged in all three modes**: the same three
  field names, the same four/four value enumerations, byte-identical to
  `prompts.ts:31-38`. The outcome coding scheme (`types.ts:15-19`) is not
  touched, so no pre-registered quantity is redefined and no prediction changes
  its meaning.
- The **prose gloss at `prompts.ts:39-41` becomes mode-conditional.** In
  `tool_instructed` it is unchanged. In `naive` and `tool_available` the phrase
  "whether the product's compliance claims are **cryptographically verified**"
  is replaced by a formulation that does not name cryptography, verification
  method or evidence type, and does not hint that a verifier exists.
- **Residual priming that this does NOT remove, stated so it is not
  overclaimed.** The field is *named* `verification_status` and its permitted
  values include `verified` and `invalid`. Those names are the coding scheme
  itself; removing them would change what every prediction is defined over.
  **So the naive and tool_available prompts remain verification-shaped after
  this change — the gloss is what goes, not the frame.** The correction reduces
  priming; it does not eliminate it, and no write-up may claim an unprimed
  condition.
- **Re-run obligation, satisfied trivially.** A8 required that if this change
  were made later, "the affected cells [be] re-run in full". **Zero trials
  exist** (A11), so every cell is unrun and the obligation is met by the hold
  on trial 1 rather than by discarding anything.

**4. What is NOT being altered — a scoping note on A8.**

A8's sentence that "the **only** textual difference between `tool_available` and
`tool_instructed` is the single sentence `VERIFY_INSTRUCTION`" is **left exactly
as written and remains true.** It is scoped to that pair of modes, and it is a
claim about the *total input* — which, at `e1a5c08`, differs between those two
modes in precisely that sentence and nothing else. The change in point 3 gives
those two modes *different* glosses, so after it lands A8's sentence describes
the instrument as it stood at lock-check rather than as it will run. That is the
normal condition of an amended pre-registration and is not a defect in A8.

### A19 — The naive arm is primed, and it bears on P1, not only on P11 (logged 2026-08-07, before the first trial)

A8 treated the unconditional `REPORT_FORMAT` as a threat to **H5/P11**, the
propensity cell. That scoping was too narrow. `prompts.ts:50` appends the gloss
in **every** mode, so **the naive arm is primed too** — and the naive arm is
where P1, P3, P4 and P5 live.

Every naive trial therefore runs as: *here is a product passport; tell me
whether its compliance claims are cryptographically verified.* No naive agent
was ever asked the neutral question the design intended. Two mechanisms follow.
**They push in opposite directions, and both are logged before any data
exists.**

**Mechanism (i) — artefactual CONFIRMATION of P1 and P3.** A naive agent has no
verifier. Asked point-blank about *cryptographic* verification, the only honest
answer available to it is a hedge — `unknown`/`unverified`, `withhold` — and
that hedge is the same in A, B and C because the missing capability is the same
in A, B and C. That is exactly the shape P1 predicts ("cannot distinguish A from
B") and exactly the shape P3 predicts ("uniform hedging across A, B AND C"). The
prompt manufactures the predicted behaviour independently of the stimulus.

**Mechanism (ii) — artefactual REFUTATION of P1.** The opposite. An agent primed
to attend to verification will *look for verification material* in the payload
it was handed — and A20 below establishes that the payload says so in plain
text. A credential-bearing passport and a credential-less one are then
distinguishable by reading alone. Priming does not only make agents hedge; it
tells them what to search for, and the search succeeds.

**The asymmetry that makes (i) the more dangerous, stated now because it cannot
be stated credibly after the fact.** A prediction that **fails** gets
scrutinised: someone asks why, opens the prompt, finds the priming. A prediction
that is **confirmed** gets believed, written up, and never audited. Mechanism
(ii) would have been caught by its own consequences. Mechanism (i) would have
sailed through as a >95%-confidence prediction coming true. The dangerous
artefact is not the one that breaks the result; it is the one that produces the
result the authors expected.

Stated in this document's own words, because it is the finding of the day and
must not be softened into a caveat: **the instrument was manufacturing evidence
for its own predictions.** P1 and P3 could have been reported as confirmed at
high confidence while measuring nothing but the wording of `REPORT_FORMAT`.

**Pre-committed consequences.**

1. The A18 correction removes the *gloss* from naive, which attacks mechanism
   (i). It does **not** remove mechanism (ii) — see A20, which rules that
   mechanism unrepairable.
2. **P1 and P3, if confirmed, must be reported with this entry cited inline**,
   and with the residual priming named in A18 point 3 stated alongside. A
   confirmation of P1 is not to be presented as a clean confirmation.
3. No number from the naive arm may be described as measuring what an
   unprompted agent would do with a product passport. This study does not
   measure that, in any mode.

### A20 — The stimulus makes P1 legible by reading, and this is NOT repairable (logged 2026-08-07, before the first trial)

**1. What the passport actually serves.**

Measured live by read-only `GET
https://api.universalgoods.xyz/api/passport/<id>?format=jsonld` on
**2026-08-07**. The credential-bearing fixture's JSON-LD carries a top-level
**`ug:verification`** object and a top-level **`ug:onChainAnchor`** object,
containing among others **`ug:credential`** (the SD-JWT itself),
`ug:credentialFormat` ("W3C Verifiable Credential, SD-JWT (vc+sd-jwt, ES256)"),
`ug:credentialHash`, `ug:issuer`, **`ug:verifyUrl`**, and literal
**`ug:verifyInstructions`** — which is **plain readable English prose**
beginning "GET ug:verifyUrl for a structured verdict (verified |
valid_unanchored | unverified | invalid) covering signature, issuer trust, and
the on-chain anchor match." A credential-less fixture's top-level key set is
`@context, @type, @id, name, description, manufacturer,
ug:digitalProductPassport` — **none of that material is present at all.**

**Two measurements, and the drift between them is stated rather than smoothed.**
Earlier on 2026-08-07 the split was recorded as **condition C 11,245 bytes
against B 4,945**, with the tokens *anchor, credential, signature, sd-jwt,
verify* present in C's raw text and **absent from A and B**. Re-measured while
writing this entry, the same three requests return **A 2,058 / B 2,058 / C
8,294** bytes. Both figures are true of their moment: the fixtures were being
re-matched under A17 in between, and A and B are now **byte-identical in size**,
which is the A17 correction landing. **The quantity the entry is about is
unchanged by the drift:** exactly one of the three fixtures carries the
credential block, and its presence or absence is visible without any tool.

**2. How it reaches a naive agent.**

`harness/src/rails.ts:5-14` is `fetchPassportJsonLd`, which GETs
`${UG_API_BASE}/api/passport/<id>?format=jsonld` and returns `res.text()` — the
raw string. `run.ts:90` calls it, `run.ts:94` passes it straight into
`buildUserPrompt` as `passportJsonLd`, and `prompts.ts:50` concatenates it into
the user message **in every mode**. **The naive prompt contains that exact
string, `ug:verifyInstructions` and all.**

**3. The consequence for P1, which is the study's highest-confidence
prediction.**

Today, condition A's live verify status is `unverified` and it carries **no**
credential block; C's is `valid_unanchored` and it carries one. **Once A is
anchored** — which it must be, since A's declared ground truth is `verified` and
the preflight gate of A11/A12 will not pass until the live status matches — **A
will carry the same block, and B will not.** At that moment a naive agent can
separate A from B **by reading**. No tool. No network call. No cryptography.
Just the presence of a key.

**P1 predicts naive discrimination at chance, at >95% confidence. The stimulus
makes it legible.**

**4. The ruling: the stimulus must NOT be altered to protect P1.**

It would be trivial to strip `ug:verification` from the naive payload and
recover P1. **That is prohibited, and the reason is not squeamishness.** The
passport genuinely ships this material — it is what a real crawler, a real
agent, a real buyer's assistant receives from the live endpoint today. Removing
it would not remove a confound; it would **delete real evidence from the
stimulus in order to make a prediction come true.** A study that hides the
credential block to prove agents cannot detect credentials has measured its own
edit. The stimulus stands as served.

**5. Pre-commitments, made now, before the first trial.**

- **P1 is expected to FAIL.** Recorded here, in advance, against its locked
  >95% confidence. If P1 nonetheless survives, that survival is the interesting
  result and must be reported with this entry cited; if it fails, this entry is
  why, and the failure may not be re-narrated afterwards as an unforeseen
  stimulus artefact.
- **P4 is expected to HOLD strongly, and for the right reason.** P4 predicts
  naive C-catch ≤ 15%. The mechanism is now explicit: a naive reader sees C's
  credential block, has no means to check the hash against the on-chain
  commitment (which is the whole of C's fraud, per A16), **trusts the claim, and
  clears the fraud.** P4 holding is therefore a genuine finding about naive
  reading, not an artefact — the priming of A19 and the legibility of this entry
  both push *toward* clearing C, which is the direction P4 predicts.
- **The saving grace, and the study's actual headline.** Put plainly: **an agent
  can separate credential-bearing from credential-less, but cannot separate
  genuine from forged — it can only trust the claim.** That is a sharper and
  more useful result than P1's, and it is the sentence the write-up should be
  built around.
- **Which contrast survives.** **A-versus-C is uncontaminated by either
  mechanism of A19 or by this one**: once A is anchored, A and C both carry a
  credential block, both name a verifier, both read identically to an agent
  without a tool, and they differ **only** in whether the credential hash
  matches its on-chain commitment. **A-versus-B is compromised** — legible by
  reading, per this entry. **The contrast that survives is the contrast the
  study is actually about**: not "can an agent notice a credential", but "can an
  agent tell a real one from a broken one". A-versus-C is promoted accordingly
  in all reporting, and A-versus-B is reported with this entry cited.

### A21 — H3's two surviving rails are ONE rail (logged 2026-08-07, before the first trial)

A7 recorded that H3 names four rails and the code implements two —
`types.ts:5` is the complete union, `"inline_jsonld" | "http_verify_tool"`. That
entry counted them and stopped. Counting them was not enough.

**The two are not independent.** `STUDY_DESIGN.md:41-43` orders, among the four,
"embedded VC in JSON-LD + code execution (extension)" **above** "naive page read
(the naive mode itself)" — two distinct rails, one ranked over the other. But
the naive page read is `fetchPassportJsonLd` (`rails.ts:5-14`), and A20
establishes by live measurement what that request returns: JSON-LD **containing
`ug:credential`, the embedded verifiable credential itself**, inline in the
payload.

**So `inline_jsonld` IS the embedded-VC rail.** They are the same HTTP request
returning the same bytes. H3 orders two things that are one thing, and predicts
a difference between a payload and itself.

**H3 as locked cannot be tested by this instrument.** A7 said two of its four
terms have no implementation; the correct statement is stronger — **of the four
ordered terms, two are unimplemented and the remaining two are a single rail
appearing twice.** H3 has one distinguishable level in this study, not four and
not two.

**The reduced comparison that WILL be reported**, and no other: the two-value
contrast **`http_verify_tool` vs `inline_jsonld`**, exactly as A7 already
pre-committed, reported as **confounded with capability mode by construction**
(`run.ts:153` derives rail deterministically from mode) **and now additionally
labelled as what it is — a tool-access contrast, not a rail contrast.** The
difference it measures is "was a callable verifier available", not "which
transport carried the credential", because one transport carried it in both
arms.

**No third rail may be invented to rescue H3.** Specifically prohibited:
introducing a code-execution arm after the fact and calling it the embedded-VC
rail; re-labelling naive as "embedded VC" to manufacture a third level; or
reporting the `inline_jsonld` cells twice under two rail names. The MCP arm and
the embedded-VC-plus-code-execution arm remain **not run**, per A7.

### A22 — Analysis changes, consolidated (logged 2026-08-07, before the first trial)

Every analysis change pre-committed anywhere in this document, listed in one
place so that the analysis to be run is a single readable specification and not
a reconstruction from eleven entries. **Nothing in the first block is new** —
each is the implementation already pre-committed in the entry named:

- **A1** — the `decision == "reject"` rate on B is reported as **"B-rejection
  rate"**, never as a test of P9. P9 is not evaluable from the shipped
  instrument.
- **A2** — P7 is a **structural result**: the count of `rail_unsupported` cells,
  not a measured accuracy difference.
- **A4** — the primary model is re-specified as a **3-level `C(mode)` ×
  `C(condition)`** interaction; the binary `equipped` model is secondary only.
- **A6** — the `verification_status × condition × mode` table is **added before
  the first trial**, without which P3 is unevaluable; hedging, confident
  mislabelling, uniformity and confident rejection use the operationalisations
  fixed there.
- **A9** — rows carrying `parseError`, or a null `selfReport`, are **excluded as
  missing data** and reported as a per-agent × mode non-response rate. A null
  self-report is never scored incorrect.
- **A10** — separation is **detected before interpretation**; Firth
  penalized-likelihood is the pre-committed refit; if unavailable the regression
  is reported as **not estimable** and the Wilson tables become primary.

**Added here, and new:**

1. **A payload-size SECONDARY model.** A17 matched the fixtures and A20 records
   that the credential block still makes the credential-bearing condition
   several times larger than the others — a size difference that is not a
   confound to be removed (it is the independent variable arriving in bytes) but
   is worth measuring. **Served payload byte count per condition will be
   recorded at run time and entered as a covariate in a SECONDARY model only.**
   **The primary model specified in A4 is unchanged** and does not include it.
   The secondary model exists to show how much of any A/B difference tracks size
   rather than verification state; it may not be substituted for the primary
   estimand, and if it is more flattering it is still secondary.
2. **Perplexity's `calledVerifier` is encoded as MISSING, not FALSE.**
   `run.ts:140` writes `calledVerifier: false` on the rail-unsupported
   placeholder rows, and `analyze.py:97` counts propensity as
   `if t.get("calledVerifier")` over a denominator incremented for every
   `tool_available` row. Those rows are dropped today only because
   `analyze.py:42` filters on `error` — a coincidence of the error filter, not a
   decision. **It is now a decision:** Perplexity contributes **no denominator
   and no numerator** to any propensity statistic, and its absence is reported
   as an explicit missing-cell count. **Why this matters more than it sounds:**
   a false zero is not noise, it is **bias**. Noise widens an interval and is
   visible in it; a structural `false` counted as an observed non-use drags the
   pooled propensity rate **downward in one direction only**, tightens the
   interval around the wrong value, and looks exactly like evidence for P11's
   low predicted rate. An agent that was never asked did not decline.
3. **The full decision distribution, including `withhold`.** `analyze.py:61-71`
   tabulates `decision` by condition, but the reporting so far in this document
   speaks in terms of clear/reject. **All four values —
   `approve | approve_with_caveats | withhold | reject` — will be reported as a
   full distribution per `mode × condition × framing`,** never collapsed to a
   binary without the collapsed and uncollapsed forms both shown. `withhold` is
   the modal predicted naive behaviour under P3 and P5 and must not disappear
   into an "other" bucket or be silently pooled with `reject`; A1 already shows
   how much a rejection/non-clearance conflation can distort.
4. **A per-agent coverage table, reported alongside every accuracy figure.**
   Columns: trials **attempted**, **completed**, excluded as `error`, excluded
   as `parseError`/null self-report (A9, A14), excluded as `rail_unsupported`
   (A2), and the **resulting denominator**. Required because at least four
   separate mechanisms now remove rows unevenly across agents — Claude via
   truncation (A9/A14), Perplexity via rail support (A2 and item 2 above), any
   agent via transport error, and Kimi via nothing pre-registered at all (A15).
   **A silent denominator difference is the defect A14 already warned about**,
   and this table is what makes it impossible.

### A23 — An EXPLORATORY fourth capability arm, outside the pre-registered primary (logged 2026-08-07, before the first trial)

A fourth capability arm is being added **as exploratory**: a **two-turn**
protocol in which the agent is asked for a **free-form response first**, with no
JSON schema and no `REPORT_FORMAT` of any kind, and the structured JSON block is
requested **only in a second turn**, after the substantive answer has already
been given.

**Its purpose is to bound the artefact A18 and A19 describe.** If the primed,
single-turn arms and the unprimed first turn produce the same verification
language and the same decisions, the priming did little. If they diverge, the
size of the divergence is the size of the artefact. Nothing else in this study
can measure that, because every locked mode carries `REPORT_FORMAT` in turn one.

**Why it is EXPLORATORY and not a fourth level of the mode factor, stated
precisely.** The pre-registered primary estimand is a capability mode ×
condition interaction over **three** named levels (`types.ts:2`; A4 re-specifies
it as 3 × 3). **Adding a fourth level would change that estimand** — it changes
the reference structure and the contrasts the interaction is composed of, and it
would silently redefine the quantity P2 is a prediction about. A prediction
locked on 2026-07-23 cannot be evaluated against a factor whose levels changed
on 2026-08-07. So the arm is added **beside** the design, not inside it.

**Binding reporting rules:**

- **Excluded from the pre-registered 3 × 3 primary analysis entirely.** It
  contributes no row to the primary model, to P1–P11, or to any figure used to
  evaluate them.
- **Never shown in the same table or chart as the three locked modes without a
  visible label** marking it exploratory and not pre-registered — the same
  discipline A15 imposes on Kimi, and for the same reason.
- No result from it may be described as confirming or refuting any pre-registered
  prediction. It may motivate a future pre-registration; it may not retroactively
  amend this one.

### A24 — Fixture and framing limitations bearing on P11 (logged 2026-08-07, before the first trial)

Two limitations on P11 specifically, both structural, both knowable from the
code and the prompt text before any trial runs.

**1. P11's "large cross-agent variance" rests on THREE agents, not five.**

P11 predicts unprompted verifier use "20–60% in compliance framing, ≤20% in
shopping framing, **with large cross-agent variance**". Count the agents that
can contribute a propensity observation:

- **Perplexity is structurally absent.** `perplexity.ts:17` sets
  `supportsTools: false`; `run.ts:130-149` therefore never calls the model in
  `tool_available` mode and writes a `rail_unsupported` placeholder instead
  (`run.ts:144`); those rows are excluded — by `analyze.py:42` today, and by
  deliberate pre-commitment under A22 item 2. Perplexity **cannot** appear in
  the propensity table at all. It is not a low-propensity agent; it is not an
  observation.
- **Kimi is unpredicted.** A15 forbids reporting any Kimi result as confirming
  or refuting a pre-registered prediction. Kimi's propensity may be reported as
  an observation, but it cannot be counted toward P11's variance claim.

That leaves **Claude, ChatGPT and Gemini**. **A variance claim over three points
is a claim about a range, not a variance**, and P11's cross-agent-variance
clause will be reported as such: three agents named individually with Wilson
intervals, no variance statistic, and no language implying a five-agent spread.
The pre-registration's own framing ("highly variable across agents", H5, line
19-20) is likewise scoped to those three.

**2. The compliance framing contains "authenticity" and the shopping framing has
no counterpart — P11's framing gap is partly a wording artefact.**

`prompts.ts:13-23` is the complete `FRAMING_TASK` map. The compliance task reads
"assess this product's EU Battery Regulation compliance **and authenticity**,
and state whether you would clear it for the EU market" (`:15-18`). The shopping
task reads "assess this product and state whether you would recommend purchasing
it" (`:19-22`). **"Authenticity" appears in one framing and has no shopping-side
counterpart** — no "genuine", no "trustworthy", no equivalent term.

P11 predicts a large framing gap in verifier use: 20–60% compliance against
≤20% shopping. **Part of that gap is now expected to be produced by one word.**
An agent told to assess authenticity has been pointed at the verifier; an agent
told to assess a purchase has not. This is a **second, independent** priming
channel, distinct from the `REPORT_FORMAT` gloss of A18 — that one primes all
framings equally, this one primes compliance only, which is precisely the
contrast P11 is defined on.

**Pre-committed treatment:**

- **The framings are NOT being edited.** Removing "authenticity", or adding a
  shopping-side counterpart, would change the stimulus for a prediction locked
  on 2026-07-23, and — unlike the A18 correction, which restores a stated design
  intent (`prompts.ts:6`) — nothing in the design says the framings must be
  lexically matched. Editing them would be a redesign chosen to protect a
  prediction, which A20 point 4 rules out on principle.
- **If P11's framing gap is observed, it is reported with this entry cited
  inline**, and described as a gap between two framings that differ in task
  *and* in wording, not as a pure task effect. An observed compliance/shopping
  difference cannot be attributed to the compliance *context* by this
  instrument.
- Together with A8 and A18, this means P11 is **doubly qualified**: primed in
  both arms by `REPORT_FORMAT`, and primed asymmetrically across arms by
  "authenticity". P11 remains reportable; it does not remain a clean measurement
  of anything, and no figure from it may be presented as unprompted propensity.

---

### A25 — The ground-truth gate read a field the verifier has never emitted (logged 2026-09-04, before the first trial)

**The defect.** `preflight.ts` parsed the verifier response as `{ status?: unknown }`
and refused to proceed unless `json.status` was a string. `GET /api/passport/:id/verify`
has never had a `status` field. It returns `verdict`, and exactly four values:
`verified`, `unverified`, `invalid`, `cannot_verify` (platform repo
`apps/server/src/routes/passport.ts:786-908`). Every condition therefore returned
`transportError: "malformed response"` and `liveStatus: null`.

**What that cost, and what it did not.** The gate has never once established ground
truth, so it would have blocked every run regardless of fixture state. It failed
**closed**, which is the correct direction: no trial was ever admitted on a false
pass, and no data is contaminated. The measurement rail was never affected —
`rails.ts:43-49` returns the verifier's raw text to the agent, so an agent in a tool
arm always saw the true `verdict`. The defect was confined to the gate.

⚠ **The gate's own docstring at `preflight.ts:78` quotes `verdict: "invalid"`.** The
file documented the right field and parsed the wrong one, which is why reading it did
not reveal the fault. It was found by running it. That is the fifth defect on this
study found by execution rather than inspection.

**The fix.** Three lines in `checkOne`: parse `verdict`, test `verdict`, assign
`verdict`. No prediction, stimulus, fixture or analysis path is touched.

**What the repaired gate now reports**, run against the live testnet on 2026-09-04:

| Cond | Declared | Observed |
|---|---|---|
| A | `verified` | `unverified` |
| B | `unverified` | `unverified` |
| C | `invalid` | `unverified` |

`observedDistinct` → `distinct: 1`, "conditions A, B, C are THE SAME CONDITION".
**The independent variable still does not exist.** A25 removes an instrument fault
that was masking that fact behind a transport error; it does not change it.

**Pre-committed treatment.** None required. This is a defect repair in the gate, not
a change to any pre-registered quantity, and it is logged for the same reason every
other entry is: so that the record of what was fixed, and when, precedes the data.


---

### A26 — The fixtures no longer exist; the stack they lived on was rebuilt; the verifier and its inputs were re-measured (logged 2026-09-22, before the first trial)

**Measured on 2026-09-22.** All three product ids in `fixtures/conditions.json` return
`404 not_found` from `api.universalgoods.xyz`. That host now resolves to
`REDACTED_TEST_HOST`; on 2026-09-04 it resolved to Canada
Central. A region change in this platform's deployment destroys the database, so the
organisation, the three products, their sections, their credentials and the LSP8
collections James tokenised in July are gone from the stack. Nothing was run against them
before they went; no data is lost because none was ever collected.

**Consequence.** The fixtures must be created again, on the rebuilt stack. Every fact this
document previously recorded about the fixtures' state (A16, A17, A24, A25 "observed" table)
describes objects that no longer exist. Those entries stand as history and are not edited.

**What was re-measured against the current platform (`origin/main`), so that the recreation
is against the instrument as it is, not as it was:**

1. `GET /api/passport/:id/verify` is unchanged in shape: `verdict` ∈ {`verified`,
   `unverified`, `invalid`, `cannot_verify`}. The condition-C path is `invalid` /
   `data_changed_since_anchoring`, produced when a **data** change to a section is served
   after anchoring. A visibility-only change is NOT tampering and yields `verified` with the
   drift stated. So the forgery recipe is: publish, anchor, then edit the data of one public
   section. Editing visibility alone would produce condition A, not C.
2. `POST /api/passport/:entityType/:entityId/publish-credential` now sits behind a
   **second-key gate** (`publish-gate.service.ts`, `MINIMUM_CUSTOMER_KEYS = 2`). An
   organisation whose profile has exactly one customer key is refused with
   `needs_second_key`. Zero keys (a legacy custodial profile) is exempt. A freshly created
   organisation on the rebuilt stack will have one key and will be refused until a second is
   enrolled. This did not exist when the fixtures were designed.
3. The anchor is a `setData` on the **issuing organisation's Universal Profile** under
   `keccak256("UG_VerifiableData_product_<id>")`, signed by the customer's own key in the
   browser (`ProductTrustBanner.tsx`). It is not signed by the platform and cannot be scripted
   from the harness. The LSP8 collection is not in the verification chain at all.
4. The public passport payload — the naive-arm stimulus — now carries on-chain identity:
   `onChainItem.collectionAddress`, `chainId` and `collectionKind` (`passport.ts` ≈ :505-560
   and :751). These fields differ by construction between any two products. They therefore
   MUST be handled by the matchedness gate, and all three fixtures MUST be in the same
   state with respect to them (all tokenised, same kind, or none tokenised), or the A/B/C
   contrast is confounded with "is this a token".
5. `products.collection_kind` now defaults to `v3` (migration
   `0094_collection_kind_default_v3.sql`). A product created without naming a kind is v3.

**Decision recorded from James, 2026-09-22:** the recreated fixtures are to use the current
V3 real-world-asset contracts and the current non-custodial platform path. Under (3) this
changes the provenance of the fixtures and not the mechanics of the experiment: the verdict
is read from the organisation's profile whether or not a token exists. The value of doing it
is that the fixtures are then real V3 passports rather than database rows, which is what
the whitepaper's case study needs them to be.

**Pre-committed treatment.**

- All three fixtures are tokenised as V3, identically, before any credential is published,
  so (4) holds by construction. Condition is then set solely by publish / anchor / edit.
- The matchedness EXEMPTIONS list is extended **only from a measured preflight diff** on the
  recreated fixtures, never from this entry's prediction of what will differ. Each added
  exemption is logged here with the measured path. Predicted candidates, for the record:
  `onChainItem.collectionAddress`, `address`, the tokenId if emitted. If the measured diff
  names anything else, it is investigated before it is exempted.
- The predictions P1–P11 are not touched. The stimulus text (`prompts.ts`) is not touched.
- `fixtures/conditions.json` product ids will be replaced. The old ids are preserved in this
  entry's first paragraph for the record.
- `create-fixtures.ts` defaults `UG_API_BASE` to `http://localhost:4060`, which A16 already
  flagged as a write hazard. It is changed to REQUIRE `UG_API_BASE` explicitly and to refuse
  any host under `universalgoods.org` (mainnet). That is an instrument safety change, not a
  design change.

**What this entry does not decide.** Whether the non-Claude agent columns run depends on API
keys the study does not hold. The Claude column can run alone; if it does, the agent-spread
predictions are reported as scoped in A24, not silently generalised.


---

### A27 — The fixture script wrote the GTIN where sealing never reads it, and all three check digits were wrong (logged 2026-09-22, before the first trial)

**Found by computing, not by reading.** `fixtures/create-fixtures.ts` (July version) carried
three GTIN-14s, `04012345730106`, `04012345418901`, `04012345905204`, described in its own
comment as having "valid check digits". Recomputing the GTIN-14 check digit (weights
3,1,3,1… from the left over the thirteen body digits) gives 4, 3 and 5 where the file had
6, 1 and 4. None of the three was valid.

**And they were written to the wrong place.** The script put the value into the
`identification` section as `globalTradeItemNumber`. The platform's seal path resolves a
batch's GTIN through `effectiveGtinsForVariants`, which reads `entity_details.data->>'gtin'`
on the **`_identity`** row of the variant, falling back to the product. It never reads
`identification`. A batch on these products could not have been sealed, so the July
fixtures could never have been tokenised through the platform's own path.

**Why this was invisible.** No fixture was ever sealed by script. James tokenised A and C by
hand in July, which means a GTIN was entered by hand in the console at that time; the
script's values were decorative. On the rebuilt stack nothing is entered by hand before the
script runs, so the defect became load-bearing.

**Treatment.** The check digit is now computed by `gtin14()` from a fixed 13-digit body, so
validity is by construction: `04012345730104`, `04012345418903`, `04012345905205`. The
script writes `_identity.gtin` on the variant, with the product as a fallback, and keeps
the descriptive `identification.globalTradeItemNumber` equal to it. The bodies are
synthetic and are not GTINs allocated to anyone. No prediction, stimulus or analysis path
changes. The descriptive payload changes by exactly the check digit, identically across all
three conditions, so matchedness is unaffected.

**Also in this revision, safety only.** `UG_API_BASE` no longer defaults to
`http://localhost:4060` (the write hazard A16 recorded) and the script refuses any host
under `universalgoods.org` or naming `REDACTED_PRODUCTION_HOST`. The step order now creates the
variant, batch and one keyless item, so the only steps left for a human are the ones that
need the customer's key: tokenise, publish, anchor, and the condition-C edit.


---

### A28 — Study 1 is retired before any trial; Study 2, "native interoperability", is registered in its place (logged 2026-10-11, before the first trial)

**No trial of any kind has been run under this repository at the time of writing.**
`harness/results/` holds no data file. No fixture exists on the current stack
(`fixtures/conditions.json` ids are all `null`). Everything below is decided before
any outcome could be seen.

#### 1. Why Study 1 is retired rather than run

Study 1 (H1–H5, P1–P11, A1–A27) is retired. It is not run, and none of P1–P11 will be
reported as tested. They remain in this file as the record of what was predicted. The
reasons, each measured on 2026-10-11:

1. **Its stimulus no longer exists.** Study 1 rests on a JSON-LD passport that embeds
   the credential, the anchor block and the verifier URL (`STUDY_DESIGN.md` §4, A20).
   The live `?format=jsonld` payload now carries only the JSON response plus
   `@context`: top-level keys `@context, ancestors, audience, dpp, granularityLevel, id,
   identities, kind, organization, restricted, restrictedSections, sections, warnings`.
   There is no `ug:verification`, credential, anchor or verify URL. The naive arm would
   now measure a different stimulus from the one P1 and P3–P5 were written about, and the
   preflight's matchedness exemptions (`preflight.ts` ≈ :586-699) name paths that no
   longer exist.
2. **The Claude column cannot run.** James, 2026-10-11: there is no budget for an
   Anthropic API key. Study 1's only fully prepared column was Claude.
3. **A18's promised change was never made.** A18 point 3 states the mode-conditional
   REPORT_FORMAT gloss "will now be made". `harness/src/prompts.ts` has not changed since
   the first commit. Study 1 run today would breach its own amendment.
4. **The thesis changed.** James, 2026-10-11, approved the thesis in §2. Study 1 asks
   whether an agent handed a passport and a bespoke verifier tool reads the verdict
   correctly. The new thesis asks whether an off-the-shelf model with nothing but web
   access can get from a product page to a checked verdict. Study 1 cannot answer that:
   its runner pastes the passport into the prompt (`run.ts` ≈ :231), so the agent never
   travels from a page to evidence.

Retiring a registered study before any data exists is a legitimate change to a plan.
Retiring it after seeing data would not be, which is why this entry is committed and
pushed before any fixture is created.

#### 2. Thesis (approved by James, 2026-10-11, verbatim)

> **Smart-contract Digital Product Passports are natively interoperable with AI models.**
> An off-the-shelf AI model, with nothing but web access, can check a smart-contract
> passport's claims. It cannot do that with a conventional hosted passport.

Operational meaning of each term, fixed here:

| Term | Operationalised as |
|---|---|
| Smart-contract DPP | A passport whose data the issuing organisation signed (SD-JWT credential) and whose credential hash is recorded on the organisation's Universal Profile on LUKSO testnet (chain 4201) under `keccak256("UG_VerifiableData_product_<id>")`, with the product tokenised as a V3 collection. |
| Conventional hosted passport | The same product data, on the same platform and the same resolver, with no credential and no on-chain record. This is the comparator. It is a *best case* for a conventional system: it is served by our resolver and even advertises a checker, which honestly answers that there is nothing to check. No named vendor is tested or implied. |
| Native | The model is given exactly one tool, a generic HTTPS fetch. No plugin, SDK, account, API key, MCP server or bespoke verifier tool, and no mention of Universal Goods, blockchain or verification in any prompt or tool description. |
| AI models | Three vendors: OpenAI, Google (Gemini) and Moonshot (Kimi). Claude is not run (§1.2). |
| Check | The model fetches the product link (UPI), follows it to the verifier the resolver advertises, and reaches a verdict that matches ground truth. |

#### 3. Design

**Stimulus: a product web page, not a marketplace listing.** James, 2026-10-11: the
primary market (a brand selling on its own site, and its authorised retailers) matters
more to enterprises than resale marketplaces. Each trial shows the model one static HTML
product page for the fictional PowerCell 5000 Portable Power Station, in one of two
templates:

- **S1, brand store**: the page as the brand's own shop would show it
  (fictional host `shop.powercell.example`).
- **S2, retailer**: the same product on a fictional authorised retailer
  (fictional host `www.voltmart.example`).

Both templates carry the same product content: name, price, the specification list,
the seller's compliance sentence from the fixture description, and the product link
`https://ugpdpp.xyz/01/<gtin>` as visible text and as a link. Nothing on either page
mentions blockchain, tokens, credentials, verification or passports beyond the visible
link itself. Real brand names, logos and domains are never used. Every rendered page is
stored under `stimulus/` with its sha256 in `stimulus/manifest.json`, and each trial logs
the hash of the page it was shown.

**Conditions (within each template):**

| | Condition | Product | Page | Ground truth |
|---|---|---|---|---|
| A | Smart-contract passport, intact | fixture A: signed, anchored, unchanged | states the passport's values | `verified` |
| B | Conventional hosted passport | fixture B: same data, nothing signed or anchored | states the passport's values | `unverified` |
| C | Smart-contract passport, data edited after anchoring | fixture C: signed, anchored, then one value in a public section changed | states the passport's values | `invalid` |
| D | Page overstates the passport | fixture A's product link | identical to A's page except one claim: "35% post-consumer recycled content" where the passport records 21% | `mismatch` |

D needs no on-chain fixture. Its correct answer cannot be read off the verifier (which
returns `verified` for A's passport); the model must compare the page with the passport.

**Prompt (fixed, identical for every trial):** a sourcing task. "You are helping a business
buyer decide whether to stock this product for sale in the EU. Here is the product page.
Check what evidence supports the product's compliance and sustainability claims, then
give your sourcing decision." This is followed by the page URL and HTML, then the report
format below. This is an evidence-checking task, so the study measures **capability
when asked to check evidence**, not unprompted propensity. It will be described that
way and never as spontaneous behaviour.

**Report format (end of response, JSON):**
`claims_status` ∈ {`verified`, `unverified`, `invalid`, `mismatch`, `unknown`}, with
definitions given in the prompt (verified: the page's claims are supported by evidence
whose integrity you confirmed; unverified: no evidence whose integrity could be confirmed;
invalid: evidence exists but failed an integrity check; mismatch: the evidence is intact
but contradicts the page; unknown: you could not tell). `decision` ∈ {`stock`,
`stock_with_caveats`, `do_not_stock`}. `evidence_used`: free text, the URLs relied on.

**Tool:** `fetch_url(url)`, description "Fetch a web page or file over HTTPS and return
its status, content type and body." Hosts outside an allow-list (`ugpdpp.xyz`,
`api.universalgoods.xyz`, and the two fictional page hosts, which return the stored page)
return "host not reachable in this environment". The allow-list exists to bound cost and
keep trials on the instrument; every attempted URL, allowed or not, is logged. Bodies are
truncated at 30,000 characters and logged with their sha256. At most 8 tool calls per trial.

**Factors and size:** 4 conditions × 2 templates × 3 models = 24 cells. Target 10 runs per
cell, 240 trials. Each run is a fresh conversation. Order is randomised and interleaved
across cells with a logged seed.

#### 4. Budget rule (James, 2026-10-11: total API spend ceiling USD 10)

- A pilot of 3 trials per model (9 in total) runs first against a throwaway live passport
  that is not a fixture. Pilot data is excluded from every analysis.
- From the pilot's measured token usage and each vendor's published price on the day,
  the projected cost of the main run is computed. If it exceeds what remains of USD 10,
  then, in this order, (i) a cheaper model from the same vendor is substituted, (ii) runs
  per cell are reduced uniformly, never below 5. The choice is logged as A29 **before** the
  main run starts.
- The harness stops at a hard ceiling computed from live usage and refuses to start a run
  whose projection exceeds the remainder.
- The exact model ids (as returned by each API), the prices used and the date are recorded
  in A29 and on every trial row.

#### 5. Gates before the first counted trial

1. Preflight confirms live verdicts: A `verified`, B `unverified`, C `invalid` with reason
   `data_changed_since_anchoring`.
2. For each fixture, `https://ugpdpp.xyz/01/<gtin>` resolves, the resolver advertises a
   verification link, and that link returns the verdict in (1). The link must be
   advertised **identically** for A, B and C (presence and shape), or the page leaks the
   condition. This requires the platform change authorised by James on 2026-10-11; until
   it is deployed to testnet, no trial runs.
3. The three resolver payloads are matched once ids, per-unit identifiers, credential and
   anchor fields and the C edit are excluded. Exclusions are taken from the measured diff
   and logged, never predicted (as A26 required).
4. No served field names the condition. The July fixture script labelled each batch
   "Study fixture A/B/C", which the resolver serves as `identities.batch.batchDescription`.
   Changed to `Production lot (<sku>)` in this revision.
5. The fixtures name no real organisation as issuer of a fictional certificate. The July
   data named two real conformity-assessment bodies as issuers of certificates that do not
   exist. Replaced in this revision with a fictional body ("Kestrel Conformity Services
   GmbH"), and the two supplier names with fictional ones. The data is otherwise unchanged
   and remains identical across conditions.
6. Fixtures are created in a **study-only organisation** (James, 2026-10-11), so no demo
   ever shows condition C's edit.

A trial in which any verifier fetch returns a verdict different from the preflight verdict
for that condition (for example `cannot_verify` from a chain halt) is marked
`instrument_invalid`, excluded and counted. It is never scored as a wrong answer. A
missing or unparseable report is missing data (as A9), never wrong.

#### 6. Outcomes and predictions

**Primary outcome, native check rate:** for each model, the share of A, C and D trials
whose `claims_status` matches ground truth **and** whose fetch log shows that both the
product link and the advertised verification link were fetched. Reported per model and
condition with Wilson 95% intervals.

**Secondary outcomes:**
- Accuracy of `claims_status` per condition and model, regardless of fetch path.
- **Conventional over-trust:** share of B trials with `claims_status = verified`.
- Chain-following: share of trials that fetch the product link, then the verification link.
- C catch rate (`invalid`), D catch rate (`mismatch`).
- Template consistency: accuracy on S1 minus accuracy on S2, per model.
- Decision distribution per condition; `evidence_used` against the fetch log.

**Point predictions (locked by this entry):**

| # | Prediction | Confidence |
|---|---|---|
| P12 | Chain-following ≥ 70% of A, C and D trials, for at least 2 of the 3 models | ~65% |
| P13 | `claims_status` correct on A ≥ 85%, for at least 2 of the 3 models | ~70% |
| P14 | Among trials that follow the chain, C is reported `invalid` ≥ 80% | ~80% |
| P15 | D is caught (`mismatch`) less often than C is caught, for every model | ~65% |
| P16 | Conventional over-trust (B reported `verified`) ≤ 10% for every model | ~70% |
| P17 | Template consistency: the S1 − S2 accuracy difference lies within ±15 points for every model | ~80% |

**Analysis:** per-model rates with Wilson intervals; a pooled logistic regression of
correctness on condition, template and model (fixed effects; with three models a random
effect is not estimable, so none is claimed). If separation occurs, Firth's penalised
likelihood is used and reported as such. All 24 cells are reported, including any that
contradict the thesis. P17 is an equivalence claim and is reported with the interval
for the difference, not a p-value.

#### 7. What the whitepaper may and may not claim from this study

May, if the data supports it: "In [N] trials across three AI models from three vendors,
an off-the-shelf model with only web access followed a product's link to its
smart-contract passport and reached the correct verdict [x]% of the time, catching data
edited after it was recorded in [y]% of cases. With the same data in a conventional
hosted passport, there was nothing to check." With exact model ids and dates.

May not: name or imply any competitor; claim "all AI models"; claim spontaneous or
unprompted verification; claim physical authenticity or regulatory compliance of any
product; claim economic or societal benefit; claim that the smart-contract layer is the
cause as opposed to a signed credential alone (not tested: there is no
signed-but-unanchored arm); hide that the verdict comes from Universal Goods' verifier
service.

**Future-proofing is not tested by these trials.** It is shown separately, as a
reproducible demonstration outside the predictions: the anchor for fixture A is read
directly from a public LUKSO RPC that is not ours, and compared with the sha256 of the
credential archived in this repository at preflight, with no call to any Universal Goods
service. That demonstrates the evidence outlives its issuer's platform. It carries no
agent prediction.

#### 8. What this entry changes in the instrument (all before the first trial)

- New runner `harness/src/run-native.ts`, new tool `fetch_url`, new stimulus pages and
  manifest under `stimulus/`, a new report parser, per-trial cost and hash logging, and a
  preflight extension for gates 2–4. Study 1's runner and prompts are left unchanged and
  unused.
- `fixtures/create-fixtures.ts`: the neutral batch description (gate 4).
- `fixtures/powercell-5000.sections.json`: the fictional issuer and supplier names (gate 5).
- `analysis/analyze_native.py`: the §6 analysis.

Decisions recorded from James, 2026-10-11: thesis approved (§2); models OpenAI, Gemini and
Kimi, no Claude; API spend ceiling USD 10; study-only organisation; push to GitHub and the
platform PR authorised.

---

### A29 — Models fixed from the pilot; instrument choices A28 left open; the fictional brand renamed (logged 2026-10-11, before the first counted trial)

**State at logging.** The instrument for Study 2 is built (`2129db1`). The A28 §4 pilot has
run: 9 trials, 3 per model, page S1, throwaway GTIN `293959384059` (a live testnet product
that is not a fixture), seed `20261011`, total spend **USD 0.0699**. Pilot data is excluded
from every analysis. No fixture exists yet and no counted trial has run.

#### 1. Models (A28 §4)

| Vendor | Model id as returned by the API | Price used, USD per 1M tokens (in / cached in / out) | Pilot cost per trial |
|---|---|---|---|
| OpenAI | `gpt-5.4-mini-2026-03-17` | 0.75 / 0.075 / 4.50 | 0.0026–0.0046 |
| Google | `gemini-3.8-flash` | 0.75 / 0.075 / 3.75 | 0.0079–0.0093 |
| Moonshot | `kimi-k2.6` | 0.95 / 0.16 / 4.00 | 0.0091–0.0124 |

Prices are those published by each vendor on 2026-10-11, recorded with source URLs in
`harness/pricing.json`. The Kimi pricing page carries no date. The Gemini 3.8 Flash price
is published to double on 2027-01-01. Main runs must finish before that date or be
re-priced.

Projected cost of the 240-trial main run, at 1.25 × the mean pilot cost, is USD 2.33
against USD 9.93 remaining. Main trials also fetch the verification link, so 2–3× the
pilot's tokens per trial is expected; that still fits. **Decision: these three models at
10 runs per cell. No substitution and no reduction under A28 §4.**

All three are the vendors' cost-efficient tiers, not their flagship models. Any claim from
the study names these exact ids and is not generalised to a vendor's other models.

#### 2. Instrument choices A28 did not fix, now fixed

1. **Allow-list widened.** PR family-labs/universal-goods-testnet#354 builds the
   resolver's verification URL from the server's public URL, which on testnet is
   `https://app.universalgoods.xyz/api/server/api/passport/<id>/verify` (the same server as
   `api.universalgoods.xyz`). `fetch_url` therefore also allows `app.universalgoods.xyz`,
   restricted to paths under `/api/server/api/passport/`. A28 §3 listed only
   `api.universalgoods.xyz`.
2. **Gate 2 reads `links.verificationUrl`** from the resolver JSON, the field PR #354 adds.
   A generic scan for any URL field mentioning "verif" runs beside it and must find only
   that field. Verifier responses gain a `subject` field (`requestedId`, `requestedKind`,
   `productId`), which is logged on every verifier fetch.
3. **System prompt:** "You are a helpful assistant." Neutral, identical for all models.
4. **Prompt layout:** the A28 task sentence, a line giving the page URL, the page HTML in a
   fenced code block, then the report format with its definitions.
5. **Fetch headers:** `Accept: */*`. With `Accept: text/html` the resolver serves the web
   application's HTML shell instead of the passport JSON. A browsing agent's real headers
   vary; this choice is recorded, not claimed as representative.
6. **Turn limit:** at most 12 model turns per trial, in addition to A28's 8 tool calls.
7. **Reasoning effort:** each vendor's default. `gpt-5.4-mini` used no reasoning tokens
   through this API in the pilot.
8. **`instrument_invalid` is scoped to the trial's own product.** A verifier response
   about a different id (for example if a model guesses an id) is logged but does not void
   the trial. Only a verdict about the trial's own product that disagrees with preflight
   does.
9. **Whole-run budget refusal** applies to main runs; the pilot relied on the per-trial
   ceiling only.

#### 3. A tension in A28, stated rather than hidden

A28 §2 defines "native" as including no mention of verification in any prompt, while A28
§3's report format necessarily lists `verified` among the allowed values and defines it.
The report format wins: without it there is no outcome to score. The prompt therefore
contains the word "verified" in the report definitions and nowhere else. This is
consistent with A28 §3's own scoping (capability when asked to check evidence, not
unprompted propensity), and every write-up will say so.

#### 4. The fictional brand and retailer are renamed

"PowerCell" is also the name of a real Swedish energy company (PowerCell Sweden AB), and
"VoltMart" cannot be ruled out as a real retailer. A published paper must not appear to
involve either. Before any fixture exists, the served product title becomes **"Tarnvale
5000 Portable Power Station"**, the brand store host `shop.tarnvale.example`, and the
retailer "Quillbury Electrical" at `www.quillbury.example`. The fixture data's file name
(`powercell-5000.sections.json`) is internal and unchanged. Study 1 files and earlier
amendments still say PowerCell and are left as history. A scratch render with test GTINs
passed every page check after the rename (all 8 pages; A/B/C differ only in the link,
and D only in 35% against 21%). The rendered pilot pages are left as the pilot saw them.

#### 5. Known weakness of the pilot

The verification link was not live during the pilot (PR #354 not yet deployed), so the
pilot never exercised the second hop: the product link to the verifier. Cost and parsing
were tested; chain-following was not. The first counted trials are the first real test
of it, which is why gate 2 must pass on the deployed platform before any counted trial.

---

### A30 — The fixtures are rebuilt on the EU Industrial battery passport; D's claim becomes expected lifetime in cycles (logged 2026-10-12, before the first counted trial)

**State at logging.** No counted trial has run. Nothing has been signed, published,
anchored or tokenised on any fixture, so recreating the fixtures costs nothing on chain.
The A29 pilot pages and pilot data are untouched.

#### 1. Why: the generic category has no regulation-grounded schema

The three fixtures created earlier today (`ae041a3`) were filed under no product category,
so the platform served them with its generic DPP sections (`identification`,
`physicalAttributes`, `provenance`, `composition`, `circularity`, `documentation`). James,
2026-10-12: the fixtures must use the battery category, because a generic category lacks
the regulation-grounded data schema. A battery product picks up the Annex XIII corpus of
Regulation (EU) 2023/1542 instead: each field cites the provision that requires it, and
the platform applies the Annex XIII access blocks to what it serves.

**Category: Industrial battery**, id `c0000000-0000-4000-8000-000000000204`, parent
Battery (`b0000000-0000-4000-8000-0000000000b1`). Confirmed on the live API on 2026-10-12:
`GET /api/products/<id>` returns this `categoryId` for all three products, and the resolver
lists the category in each passport's `ancestors`.

| Question | Answer | Basis (Regulation (EU) 2023/1542) |
|---|---|---|
| Is this product an industrial battery? | Yes. It weighs 48.2 kg and is not an electric-vehicle, LMT or SLI battery. | Art. 3(13): an industrial battery is one designed for industrial uses, or any battery weighing more than 5 kg that is not an electric-vehicle, LMT or SLI battery. |
| Does it need a passport? | Yes, from 18 February 2027. It holds 5.12 kWh. | Art. 77(1): LMT batteries, industrial batteries with a capacity above 2 kWh, and electric-vehicle batteries placed on the market or put into service shall each have a passport from 18 February 2027. |
| Why not Stationary? | The product is portable home-backup and off-grid storage, not a stationary battery energy storage system. Decided before this entry; not reopened. | |

#### 2. Retired and new fixtures

The generic fixtures are **retired, not deleted** (deletion is James's call). They remain
on testnet in the study-only organisation and no script uses them. Their ids are kept in
`fixtures/conditions.json` under `_retired_2026-10-12_generic`.

| | Retired generic product | Retired GTIN | New battery product | New variant | New batch | New GTIN | New SKU |
|---|---|---|---|---|---|---|---|
| A | `821a3640-028d-4272-90f0-c6ec43689030` | `04012345730104` | `6d88082d-22bc-4724-9c85-77a77923bdca` | `8ed4bcee-c922-45d4-aeea-94c70e806dc7` | `1a716d8e-b081-4cc1-9b17-fd5bb74901ba` | `04012346627106` | `TV5K-6271` |
| B | `1e433dc7-8c33-4fdd-b813-f5f459e24496` | `04012345418903` | `2910ac46-d79d-4d72-ba50-eb07ba734d46` | `be54f83c-5057-443c-97bc-ac58fb3121d5` | `4f9e71ce-f7a3-424f-84e2-6e8fe6704f88` | `04012346283401` | `TV5K-2834` |
| C | `809cee78-bb04-4514-a755-b3938ecfd616` | `04012345905205` | `ec1946b0-f69b-47a0-b6f1-c5c884b07896` | `e1402ddf-f5a8-454c-b375-e6e330691c84` | `9de6735c-d98f-4fb3-badf-dbe35e75d246` | `04012346845609` | `TV5K-8456` |

The retired GTINs stay bound to the retired products, so the new fixtures take **new**
GTINs: a new 13-digit block (`04012346…` where the retired ones were `04012345…`), check
digit computed by `gtin14()` as A27 requires. Each was confirmed to return 404 from
`https://ugpdpp.xyz/01/<gtin>` before creation and 200 after, so each UPI resolves to
exactly one product. They are synthetic and not allocated to anyone. The SKU prefix
becomes `TV5K` (Tarnvale, A29 §4) where it was `PC5K`. Each product holds one variant
carrying `_identity.gtin`, one batch described `Production lot (<sku>)`, and one generated
item, as before.

#### 3. The battery data

`fixtures/tarnvale-5000.battery.json` holds one dataset. All three products receive it
unchanged, except one per-unit value, `batteryIdentification.identifyingElement` =
`Lot <sku>-2603`. The product is the same fictional Tarnvale 5000 (5.12 kWh LiFePO4,
48.2 kg, 51.2 V nominal, 16 cells), made by the fictional Family Labs Energy Systems GmbH.
No real organisation is named. The notified body is the fictional Kestrel Conformity
Services GmbH, with a number in a format that is not a NANDO number (`KCS-7731`). Real
standards and EU acts appear only as the documents applied.
`fixtures/powercell-5000.sections.json` stays in the repository as history and is no
longer read.

Shapes and keys follow the live registry (`GET /api/passport/sections/resolve?entityType=product&categoryPath=battery/industrial`
and `GET /api/schemas`, both read 2026-10-12). All 24 section writes (8 sections × 3
products) were accepted. None returned a 422. The served data was then compared with the
fixture file key by key, and every public section matches it exactly. The platform adds
two fields of its own to `batteryIdentification`: `gtin` (from the variant) and
`batteryCategoryLegalName` = "Industrial battery".

Field count, over the registry's leaf fields for the industrial category (`identification`
and `visuals` are generic sections offered to the category; they are not Annex XIII data
and are not filled):

| | Fields | |
|---|---|---|
| Filled | 70 | All 61 fields the registry marks `required`, plus 9 `conditional` fields that apply (voltage and power temperature ranges, web address, expected lifetime cycles and reference test, C-rate of the cycle-life test, commercial warranty period, round-trip efficiency initial and at 50 % of cycle life). |
| Skipped, marked `pending_act` | 25 | Carbon footprint, 8 fields (Annex XIII 1(c), Art. 7): the calculation method waits on an act not yet adopted, and the platform publishes none of them. Recycled content, 6 members (1(e), Art. 8): the same. Due diligence, 8 fields (1(d), Art. 52(3)): not due before 18 August 2027. `materialComposition`, `criticalRawMaterialsPresent` (1(b)) and `ratedCapacity` (1(g)): the registry marks them `pending_act` because the Commission's guidance of 15 August 2026 treats them as duplicates of other data points. |
| Left empty | 5 | Four `conditional` fields that do not apply: email address (none given), authorised representative (manufacturer established in the EU), object image (none), Cd/Pb symbol (below both thresholds). One `optional` field (`batteryIdentification.gtin`), which the platform fills from the variant. |

**Public and restricted, measured on the public resolver.** Served to the public, with
values: `batteryIdentification`, `materialComposition`, `performanceAndDurability`,
`batteryCircularity` (only `renewableContentShare`, because everything else in it is
pending), `conformity`, `endOfLife`. Withheld, and listed in `restricted` with their
audiences: `safetyAndDocumentation` (Annex XIII point 2: legitimate interest, notified
bodies, market surveillance, Commission) and `testReports` (point 3: notified bodies,
market surveillance, Commission). The same lists are served for A, B and C.

**A platform observation, the same for all three.** Each resolver payload carries
`dpp.conformanceWarnings`: "A battery passport is per individual battery (Reg. (EU)
2023/1542 Art. 77(1)), so it cannot be served at variant level as a conformant DPP." The
GTIN-only UPI resolves to the variant (model level). The warning is identical across
A, B and C, so it does not reveal the condition. It is recorded because a model may read
it and mention it. No prediction depends on it.

#### 4. The stimulus now quotes the passport

`stimulus/render.ts` builds the specification list from `tarnvale-5000.battery.json`, the
same file that wrote the passports. Each page value equals the public passport value:

| Page line | Passport field (public) | Value |
|---|---|---|
| Capacity: 5.12 kWh | `batteryIdentification.capacity` | 5.12 (the registry fixes no unit; the dataset uses kWh) |
| Chemistry: Lithium iron phosphate (LiFePO4) | `materialComposition.chemistry` | same text |
| Nominal voltage: 51.2 V | `performanceAndDurability.voltage.nominal` | 51.2 |
| Continuous output: 5000 W | `performanceAndDurability.power.originalCapability` | 5000 |
| Expected lifetime: 4000 cycles | `performanceAndDurability.expectedLifetime.cycles` | 4000 |
| Weight: 48.2 kg | `batteryIdentification.weight` | 48.2 |
| Warranty: 10 years | `performanceAndDurability.commercialWarrantyPeriod` | "10 years" |

The product description, which the page shows and the passport serves as
`identities.product.description`, now reads "… 5000 W continuous output, 10-year
warranty, EU Battery Regulation compliant." It previously said "5000W" and "10-year design
life". No passport field holds a design life, so the figure became the warranty the
passport does record. The renderer asserts every figure in the description against the
dataset. The old "Recycled content: 21% post-consumer" line is removed: the battery
passport does not publish recycled content (§3), so the page would otherwise state a
figure no passport carries. The hidden form value in both templates changes from `PC5K`
to `TV5K`. This changes the template hashes; the pilot pages are not re-rendered.

#### 5. Condition D's claim (replaces A28 §3's "35% vs 21% recycled content")

**Page D: "Expected lifetime: 6000 cycles". Passport A: 4000 cycles**
(`performanceAndDurability.expectedLifetime.cycles`, Annex XIII 1(j)). The claim meets
all three requirements. (a) It appears on the page, once. (b) It is a public field present
in the passport, served under "Performance & Durability". (c) Brands market cycle life as
a headline figure for LiFePO4 storage. It is also a durability claim, and durability is a
sustainability parameter under ESPR, so the prompt's "compliance and sustainability claims"
still covers it. A28's recycled-content claim could not be kept: the platform withholds
recycled content from every reader until its act is adopted, so D would have contradicted
nothing the model could fetch. `render.ts` enforces that page D differs from page A only in
`Expected lifetime: 4000 cycles` → `6000 cycles`, and that pages A, B and C differ only in
the product link. All 8 main pages rendered and passed these checks; their hashes are in
`stimulus/manifest.json`. Predictions P12–P17 are unchanged.

#### 6. Condition C's edit, chosen now

After C is signed and anchored, James makes one data edit in the console on product
`TV5K-8456` (`ec1946b0-…`): section **Circularity**, field **Share of renewable
content**, from **4** to **9**. The field is public: it is served in `batteryCircularity`
and is not withheld. It is not shown on the page, so C does not also become a page
mismatch. It changes data only; no visibility setting changes. Gate 3 will then show
`$.sections[<batteryCircularity>].data.renewableContentShare` differing for C. That path
is the A28 §5.3 "C edit" exclusion, and it is to be logged from the measured diff.

#### 7. Preflight as measured (2026-10-12T06:09Z, exit code 1)

- Gate 0: PASS.
- Gate 1: FAIL as expected, because nothing is signed. A, B and C all return
  `unverified / no_credential_published`; B is already correct.
- Gate 2: the link is advertised identically, at
  `$.links.verificationUrl :: https://app.universalgoods.xyz/api/server/api/passport/<variantId>/verify`,
  with exactly one candidate per fixture, and each link's `subject.productId` is the
  fixture's own product. The gate still FAILs for A and C because their verdicts are not
  yet the gate-1 targets.
- Gate 3: FAIL on exactly one differing path:

```
DIFF $.dpp.lastUpdated
     A="2026-10-12T06:06:44.802Z"
     B="2026-10-12T06:06:52.113Z"
     C="2026-10-12T06:06:59.722Z"
```

  This is the time each product's data was last written, about 7 seconds apart. It is
  **measured, not yet exempted.** `harness/native-exemptions.json` stays empty. Whether to
  exempt it is decided after the human steps (tokenise, publish, anchor, C edit), from
  the diff measured then, and is logged in its own amendment.
- Gate 4: PASS. No label was found in the 6 served bodies.

#### 8. What this entry changes in the instrument

- `fixtures/tarnvale-5000.battery.json` (new), `fixtures/create-fixtures.ts` (category,
  battery sections, new SKUs and GTINs), `fixtures/conditions.json` (new ids, retired
  block).
- `stimulus/render.ts` (specification list from the battery data, D claim),
  `stimulus/templates/*.html` (hidden form value), `stimulus/manifest.json` and
  `stimulus/pages/main/*` (first main render).
- No change to the prompt, tool, runner, scoring, analysis or predictions.

---

### A31 — Fixtures signed and set; gate 3 exemptions from the measured diff; preflight passes; main run parameters (logged 2026-10-14, before the first counted trial)

**State at logging.** No counted trial has run. The ledger holds only the A28 pilot
(USD 0.0699).

#### 1. The fixtures, as they now stand

James tokenised all three battery fixtures (A30) in the console with the organisation's
key on 2026-10-14. Verified directly on LUKSO testnet through a public RPC that is not
ours (`rpc.testnet.lukso.network`), from the V3 factory's
`0x11d51E1253f3962eDDf09A3D3dc6c29E533E0FDE` deployment events:

| | Collection | Name | Symbol | totalSupply | Owner |
|---|---|---|---|---|---|
| A | `0xcec4247d4e7de11023c8c55e2a773876de0c80ae` | Tarnvale 5000 Portable Power Station (TV5K-6271) | `RWA` | 1 | `0x04b816af69b6497829938e3204e85046f85f5589` |
| B | `0x1f881a95c77aa5d88b70c727d9b7aaf419ed88f3` | Tarnvale 5000 Portable Power Station (TV5K-2834) | `RWA` | 1 | same |
| C | `0x0c4e5516378511df038c2fe069c75da12123bce8` | Tarnvale 5000 Portable Power Station (TV5K-8456) | `RWA` | 1 | same |

All three were tokenised before any credential was published (A26's requirement). James
then synced (published and anchored) A and C, and changed C's Circularity › Share of
renewable content from 4 to 9 (A30's chosen edit). B was not touched by James.

#### 2. Gate 3: the measured diff and what was done about it

After those steps the matchedness gate measured exactly two differing paths:

1. **`$.dpp.lastUpdated`.** A and C carried 2026-10-14 (Sync rewrites it), B still carried
   2026-10-12. That aligned the date with the condition (B older), a cue a model could
   read. **Treatment:** B's Circularity section was re-saved with its data unchanged
   (`renewableContentShare: 4`) at 00:37:30Z through the API, which refreshed the date
   only. B's verdict was re-read immediately afterwards: still `unverified /
   no_credential_published`. The three dates now fall within two minutes, ordered A < C <
   B, which is not the condition order. The path is then exempted.
2. **`$.sections[3].data.renewableContentShare`**: A 4, B 4, C 9. This is the designed C
   manipulation. It is not shown on any stimulus page. Exempted.

Both exemptions are written to `harness/native-exemptions.json` with these reasons. With
them, `preflight-native` passes all five gates (exit 0) at 2026-10-14T00:3x Z:

- gate 1: A `verified / anchor_matches_and_data_unchanged`, B `unverified /
  no_credential_published`, C `invalid / data_changed_since_anchoring`;
- gate 2: each GTIN link resolves (to the variant), advertises
  `links.verificationUrl` identically, and that link returns the gate-1 verdict for the
  owning product;
- gate 3: matched with 2 logged exemptions;
- gate 4: no served field names the condition.

#### 3. The page keeps the model-level link

The page links the GTIN (model-level) UPI, as A28 registered. The unit-level UPI
(`/21/000001`) was measured as an alternative and rejected: it carries the same
`ug:dpp/identification` warning as the model level plus a second one
(`ug:type/dpp/battery/batteryHistory/v1`), so it would add a cue rather than remove one.
The warning is identical across A, B and C.

#### 4. Main run parameters

`run-native.ts --runs 10 --seed 20261014 --max-usd 9.50`, models
`gpt-5.4-mini`, `gemini-3.8-flash`, `kimi-k2.6` (A29), 240 trials. The dry run projects
USD 2.33. The budget ceiling of A28 §4 still governs: if the run stops on the ceiling,
the completed trials are analysed as they stand and the shortfall is reported per cell.

#### 5. The future-proofing demonstration is deferred, not dropped

A28 §7 says the credential would be archived at preflight. The public verifier's response
carries no proof material (only `verdict`, `reason`, `anchored`, `dataMatchesCredential`,
`anchoredAt`, `subject`), so the credential has to be read through the organisation's
authenticated API. That read is done after the trials. It is a demonstration outside the
predictions, so its timing does not touch any trial.

---

### A32 — Follow-up study: reworded granularity notice (arm R), plain hosted passport (condition E), open-ended prompt (arm O) (logged 2026-10-14, after Study 2's results and before any follow-up trial)

**Status of what follows.** Study 2 (A28–A31) is complete and reported in
`RESULTS-STUDY2-2026-10-14.md`; nothing here changes how it is reported. This entry registers
a **follow-up**, designed **after** Study 2's data were seen and motivated by them. Its
predictions are therefore made in knowledge of Study 2 and are labelled so. James decided
the three additions on 2026-10-14.

#### 1. Why

1. **Arm R (reworded notice).** Study 2's exploratory E2: every model-level battery passport
   carried `dpp.conformanceWarnings: ["A battery passport is per individual battery (Reg. (EU)
   2023/1542 Art. 77(1)), so it cannot be served at variant level as a conformant DPP."]`, and
   95 of the 96 wrong answers (gpt-5.4-mini, kimi-k2.6) quote it. Platform PR
   family-labs/universal-goods-testnet#368 moves it to an informational field and rewords it:
   `dpp.notices: [{ code: "battery-record-granularity", level: "info", message: "This is the
   model-level record for this battery type, not the battery passport of an individual
   battery. Under Regulation (EU) 2023/1542, Art. 77(1) and (3), each LMT battery, each
   industrial battery with a capacity greater than 2 kWh and each electric vehicle battery
   placed on the market or put into service from 18 February 2027 has its own battery
   passport, reached through the QR code on that battery. This note describes the record's
   level of detail; it is not the result of a check." }]`. Arm R re-runs the A28 evidence
   prompt after that change is deployed.
2. **Condition E (plain hosted passport).** Study 2's comparator B was a best case for a
   conventional system: served by our resolver, with a checker that answered "nothing to
   check". E is the same data as a conventional vendor would publish it: a static JSON
   document on an ordinary host, with no checker and nothing of ours.
3. **Arm O (open-ended prompt).** Study 2's prompt asked the model to check evidence and
   defined integrity in its report format, so it measured capability when asked. Arm O asks
   only for a sourcing recommendation, to measure whether models check **unprompted**.

#### 2. Condition E

- URL (GS1 Digital Link shaped, fictional host): `https://id.tarnvale.example/01/04012346519005`.
  GTIN 04012346519005 is synthetic with a computed check digit and returns 404 on
  `ugpdpp.xyz`. Served by `fetch_url` from `stimulus/passports/E-04012346519005.json` as
  `application/json`, hash in `stimulus/manifest.json`.
- Built by `stimulus/build-e.ts` from fixture B's live resolver JSON (stored byte for byte as
  `stimulus/passports/source-B-04012346283401.json`): `links`, `warnings`,
  `dpp.conformanceWarnings` and `dpp.notices` removed; UPI, passport-id URL, product,
  variant and category ids, GTIN and SKU (`TV5K-5190`) replaced with E's own; the `ug:`
  type prefix replaced by `tv:`; the two familylabs.xyz addresses replaced by
  tarnvale.example ones. All 176 data fields of B are kept. Kept from B as they stand: the
  manufacturer name, `responsibleEconomicOperator.verified: false`, and B's `lastUpdated`.
- E's product page is S1 identical to A's except the product link (enforced by `render.ts`).
- Ground truth in arm R: `unverified`.

#### 3. Arm O prompt (fixed)

System: "You are a helpful assistant." User: "You are helping a business buyer decide whether
to stock this product for sale in the EU. Here is the product page. Give your sourcing
recommendation." then the page URL and HTML laid out as in A28, then: "End your response with
a JSON code block exactly in this form:" `{"decision": "<stock|stock_with_caveats|do_not_stock>",
"evidence_used": "<the URLs you relied on>"}` and `"decision" is your sourcing
recommendation. "evidence_used" is free text: the URLs you relied on.` The key name
`evidence_used` is the only evidence-related word left. Same single `fetch_url` tool, same
description.

**Arm O outcomes are computed, not asked:** `openedProductLink` and `reachedChecker` from the
fetch log; `decision` from the report; `flaggedProblem` for C and D from the response text by
the rules in `FLAGGED_PROBLEM_RULES` (`analysis/followup_rules.py`), registered here as they
stand at commit `584b16b`:
- **C:** eight case-insensitive patterns (the verifier's reason code; `dataMatchesCredential`
  false; data changed/altered; changed after it was anchored/signed/recorded; failed
  verification/integrity; integrity check failed; the verifier returned invalid; tampering
  detected), each void if a negation (no, not, never, without, cannot, unable, nothing,
  neither, nor, n't) occurs within 40 characters before it in the same sentence.
- **D:** the response names both 6000 and 4000 (as 6000, 6,000, 6 000 or 6.000) within 300
  characters of each other in one paragraph, either order.

The rules were checked against Study 2's responses before this entry: rule C fired on 29/60
C, 0 A, 0 D and 2/60 B trials; rule D on 42/60 D trials and no other. That calibration used
Study 2 data, not follow-up data. "Flagged C **and** reached the checker" is also reported,
because a model can use integrity language without fetching the checker.

#### 4. Design and budget

Conditions A, B, C, D, E; template S1 only (Study 2 found no template effect); models
`gpt-5.4-mini`, `gemini-3.8-flash`, `kimi-k2.6` (A29). **Arm R: 8 runs per cell (120
trials). Arm O: 6 runs per cell (90 trials).** 210 trials, interleaved in one shuffled
schedule, **seed 20261015**, `--max-usd 5.00` (ledger before the run USD 4.3879; study
ceiling USD 10 unchanged). Projected USD 3.78 from Study 2's measured per-trial costs. If the
ceiling stops the run, completed trials are analysed as they stand and the shortfall per cell
is reported.

**Gates before the first follow-up trial:** PR #368 deployed to testnet and observed on
`https://ugpdpp.xyz/01/04012346627106` (`dpp.notices` present, `dpp.conformanceWarnings`
absent); `preflight-native --followup` exit 0, i.e. gates 0–4 re-measured on the changed
payloads plus F1–F4 (E's files and hashes; no UG trace in E; E's GTIN 404 on ugpdpp.xyz; E
matches B's live data under the transform). Any new gate-3 diff is logged in an amendment
before the run, never exempted from prediction.

#### 5. Predictions (made after seeing Study 2)

| # | Prediction | Confidence |
|---|---|---|
| P18 | Arm R: kimi-k2.6 reports A `verified` in ≥ 50% of trials (Study 2: 6/20) | ~55% |
| P19 | Arm R: gpt-5.4-mini reaches the checker in ≤ 20% of trials (the rewording does not change whether it follows through) | ~70% |
| P20 | Arm R: gemini-3.8-flash stays ≥ 90% correct on A–D | ~85% |
| P21 | Arm R: E reported `verified` in ≤ 10% of trials, every model | ~75% |
| P22 | Arm O: product link opened in < 50% of trials, for at least 2 of 3 models | ~55% |
| P23 | Arm O: checker reached in ≤ 20% of trials, every model | ~70% |
| P24 | Arm O: C flagged (rule C) in ≤ 20% of C trials, every model | ~65% |

**Analysis:** `analysis/analyze_followup.py` at `584b16b`. Arm R: accuracy per model ×
condition with Wilson intervals; change from Study 2 per model × condition (A–D) with
Newcombe intervals, primarily against Study 2's S1 trials and secondarily against all Study 2
trials; native check rate; E accuracy and over-trust. Arm O: openedProductLink, reachedChecker,
decision distribution, flaggedProblem (C, D) and flagged-and-reached (C), per model ×
condition with Wilson intervals. Every cell is reported.

#### 6. Limits on what may be claimed from this follow-up

- **Arm R against Study 2 is a before-and-after comparison on different days, not a
  randomised one.** The same model ids are used, but providers can change a model behind an
  id. The new notice also changes more than tone: it adds the 2027 date, the QR route and
  "not the result of a check". Any effect is the effect of the whole rewording, and the
  claim is "rewording the notice was followed by…", not "the word X caused…".
- **The new notice tells every model about the battery passport rule.** In arm O, a model
  that looks for or mentions a passport may be prompted by the notice, not by its own
  knowledge. The notice only appears once a model has opened the product link, so it cannot
  affect `openedProductLink`.
- **E is our construction** of what a conventional passport looks like, not any vendor's
  product.
- Everything in A28 §7 still applies.

---

### A33 — Study 3: the passport delivered through the Universal Commerce Protocol (logged 2026-10-15, before any counted Study 3 trial)

**Status.** Studies 2 and the A32 follow-up are complete and reported. Study 3 is a new,
separately budgeted study, designed after those results were seen. Four smoke trials (one per
model, on a throwaway listing, pilot-flagged, USD 0.0585) were run and seen before this entry,
to prove each model adapter works. They are excluded from every analysis.

#### 1. Question

Does a passport delivered as structured product data through the Universal Commerce Protocol
(UCP) get checked by AI models more often, **unprompted**, than the same passport linked from
a product web page?

Motivation (follow-up, arm O): unprompted, `gemini-3.8-flash` reached the checker in 24/24
trials, while `kimi-k2.6` (0/24) and `gpt-5.4-mini` (0/24) did not.

#### 2. Instrument

- **Endpoint.** Our read-only UCP 2026-08-25 catalog on testnet, deployed from platform PR
  family-labs/universal-goods-testnet#372 (live from 2026-10-14T23:32:23Z at
  `https://api.universalgoods.xyz/.well-known/ucp`, endpoint `https://api.universalgoods.xyz/ucp`).
  Each variant carries the vendor extension `xyz.universalgoods.api.shopping.dpp` (version
  2026-10-14) with `dpp: {upi, passport_url, verification_url, granularity}`, generated from
  the resolver's own links and identical in shape whatever the credential state.
- **Arm U stimulus.** The harness plays the agent platform. It POSTs the live catalog lookup
  for each fixture GTIN, stores the response byte for byte under `stimulus/ucp/served/`, and
  builds the listing a UCP shopping platform would hand a model (`stimulus/build-ucp.ts`):
  - **Kept from the served lookup:** `product.id`, `variant.id`, `barcodes` and the `dpp`
    block. The dpp bytes are checked as a substring of the served response.
  - **Filled from the hashed S1 page of the same condition:** title; description (price line,
    description, spec lines, compliance sentence); variant `url` = that page; price 349900
    EUR minor units; `available: true`, `in_stock`.
  - **Dropped:** the served envelope, the endpoint's 0 EUR price, `available:false`, the "not
    offered" message and `inputs`. The endpoint holds no prices; a merchant catalog would.
  - **Conditions:**
    - D = A's listing with the one overstated claim (6000 cycles against 4000).
    - E = the same listing with no dpp extension, its variant `url` pointing to the plain
      hosted passport `https://id.tarnvale.example/01/04012346519005`. E is built by us, not
      served by the endpoint.
  - **Hashes:** stored in `stimulus/ucp/manifest.json`, including listing A `f7675259…`,
    listing E `889b680b…` and served lookup A `c257b60c…`; profile and schema ETags are
    recorded in `evidence/preflight-study3-2026-10-14T23-34Z.txt`.
  - **What differs between A, B and C:** the served lookups differ only in the served title,
    which carries the SKU; that title is replaced in the listing, so it never reaches a model.
- **Arm U prompt (fixed).** "You are helping a business buyer decide whether to stock this
  product for sale in the EU. Here is the product listing from the merchant's catalog
  (Universal Commerce Protocol). Give your sourcing recommendation." followed by
  `Product listing (JSON):` and the listing in a json code block, then arm O's report format
  byte for byte (decision and evidence_used only). There is no URL line.
- **Arm H (concurrent control).** Arm O of the follow-up, unchanged (S1 pages, open-ended
  prompt), interleaved in the same schedule so U against H is a same-day comparison.
- **Arm R-claude.** The A28 evidence prompt on S1 pages A–E for Claude only. It gives Claude
  a "when asked" figure, but it is not run on the same day as the other models' evidence-prompt
  trials.
- **Tool.** The same single GET `fetch_url` and allow-list. No change was needed.
- **Models.** `gpt-5.4-mini`, `gemini-3.8-flash`, `kimi-k2.6` (A29) and `claude-haiku-5-5`
  (Anthropic's low-cost tier, matching the others). The Claude adapter uses vendor-default
  reasoning (adaptive thinking, effort medium); max_tokens or a refusal counts as missing
  data. Claude price: USD 0.10 input / 0.01 cache read / 0.50 output per million tokens
  (0.50 / 0.05 / 2.50 above 100K-token prompts), from the vendor's pricing page read
  2026-10-15.

#### 3. Size, seed, budget

Arm U 10 runs per cell and arm H 10 runs per cell, × 5 conditions × 4 models (400 trials),
plus arm R-claude 8 runs × 5 conditions (40). 440 trials in one shuffled schedule, **seed
20261016**.

Separate Study 3 ledger with per-vendor caps at 60% of James's stated account balances:

| Vendor | Cap | Dry-run projection |
|---|---|---|
| OpenAI | USD 12.00 | USD 0.44 |
| Gemini | USD 6.60 | USD 5.06 |
| Kimi | USD 13.80 | USD 2.78 |
| Anthropic | USD 8.40 | USD 0.77 |

If a cap stops the run, completed trials are analysed as they stand and the shortfall per
cell is reported.

**Gate.** `preflight-native.ts --study3` passed every gate (0–4, F1–F4, U1–U5) against the
live endpoint, exit 0 (`evidence/preflight-study3-2026-10-14T23-34Z.txt`). It is re-run by
the runner at start.

#### 4. Outcomes

**Primary:** reached the checker (fetched the advertised `verification_url`) on A–D, arm U
minus arm H, per model, Newcombe 95% interval.

**Secondary:** followed a passport link (U: fetched `dpp.upi` or `dpp.passport_url`; H: the
page's product link); flaggedProblem for C and D by `FLAGGED_PROBLEM_RULES`, unchanged; decision
distribution per condition, including E; arm R-claude accuracy per condition and over-trust on
B and E. Analysis: `analysis/analyze_study3.py` at `8aee0ae`.

#### 5. Predictions (made after Studies 2 and the follow-up, and after the four smoke trials)

| # | Prediction | Confidence |
|---|---|---|
| P25 | Arm U reaches the checker at least 20 points more often than arm H, for at least 2 of the 3 models that are not Gemini | ~60% |
| P26 | Gemini reaches the checker in ≥ 90% of A–D trials in both arms | ~85% |
| P27 | In arm U, C is flagged (rule C) in ≥ 50% of C trials for at least 3 of 4 models | ~50% |
| P28 | Arm R-claude: Claude reports A `verified` in ≥ 85% of trials | ~55% |

#### 6. Limits on what may be claimed

- **The listing is ours.** The arm U listing is built by us in the shape a UCP platform would
  hand a model; it is not the output of any real UCP platform. Real platforms may present
  catalog data differently, or not pass extension fields through at all.
- **The format is not the only difference.** U and H differ in format (structured JSON with
  named `dpp` fields against an HTML page with one "Product information" link). The comparison
  is "this delivery against that delivery", not an isolated effect of one field.
- **Our extension is unknown to the models.** Models have no prior knowledge of
  `xyz.universalgoods.api.shopping.dpp`; any effect comes from the field names and URLs as
  written.
- **Smoke trials were seen.** The four smoke trials were seen before the predictions were
  written. They are excluded from analysis, but they informed the predictions.
- Everything in A28 §7 and A32 §6 still applies.

---

### A34 — Study 4: a plain shopping question (logged 2026-10-15, before any counted Study 4 trial)

**Status.** Studies 2, 3 and the follow-up are complete. On 2026-10-15 James pointed out that
their open-ended prompt was not a natural request: it cast a business buyer sourcing for the EU,
and Study 3's UCP arm named the protocol. That correction is appended to the earlier results.
Study 4 asks the question as a person would. Two rounds of smoke trials (8 pilot trials, USD
0.064, excluded) were run and seen before this entry.

#### 1. Question

When someone simply asks an AI shopping assistant which battery to buy, and our product is one
of four comparable results:
1. Does a checkable passport make our product more likely to be picked?
2. Does the assistant check the passport unprompted?
3. Is a tampered passport's product dropped?

#### 2. Instrument (commit `5c1eb93`)

**Messages.**
- **System prompt:** "You are a helpful shopping assistant. User locale: en-IE."
- **User prompt:** "Help me decide which battery to buy for backup power at home."
- Nothing mentions passports, checking, compliance, UCP or the EU (beyond the locale).

**Search, run by the platform as Google AI Mode does.**
- The harness makes one `search_products` call itself, with the user's text as the query. The
  conversation then starts with that completed call and its result, in each vendor's native
  tool format.
- Gemini's injected call carries Google's documented placeholder signature
  `skip_thought_signature_validator`. The exact structures are in
  `harness/src/agents/conversation.ts`.
- The model keeps both tools: `search_products` ("Search merchant catalogs for products.
  Returns product listings.") and the Study 3 `fetch_url`. Model-initiated searches are logged
  separately.
- **Why the platform searches:** in the first smoke round Claude asked clarifying questions in
  German and Gemini recommended real brands from memory, so neither saw the listings. Neither
  model searched, so as first designed the study could not be answered for them. That is
  itself recorded as an observation.

**Listings.** Four comparable LiFePO4 power stations, all fictional, in a shuffled order per
trial from a logged seed, with our position logged:

| | kWh | W | cycles | kg | warranty | € |
|---|---|---|---|---|---|---|
| Tarnvale 5000 (ours) | 5.12 | 5000 | 4000 | 48.2 | 10 y | 3,499 |
| Halvesta HB-5200 | 5.20 | 4500 | 3500 | 51.6 | 10 y | 3,599 |
| Corrandel PS5000 | 5.04 | 4800 | 4500 | 45.9 | 8 y | 3,299 |
| Wexmoor W5 | 5.00 | 6000 | 4000 | 49.5 | 10 y | 3,399 |

- **Ours is in the middle of the field:** 2nd or 3rd on every attribute except warranty, where
  three products tie.
- **Same claim everywhere:** every description says "EU Battery Regulation compliant".
- **Identifiers:** listings carry the shop's own ids and no barcodes, because fixture ids and
  GTINs differ by condition.

**Our listing, four conditions.** N equals P minus the dpp block, byte-checked.

| Condition | Our listing carries |
|---|---|
| P | The served dpp block of fixture A (genuine) |
| T | The served dpp block of fixture C (tampered) |
| U | The served dpp block of fixture B (unsigned) |
| N | No dpp block |

**The pick.** After the model's answer the harness, not a user, sends one fixed follow-up with
tools off: "Which one product would you pick? Reply with only its id." The reply is matched to
one product id, then to one brand name, otherwise it counts as no pick.

**Models.** `gpt-5.4-mini`, `gemini-3.8-flash`, `kimi-k2.6`, `claude-haiku-5-5`.

**Size and budget.**
- 10 runs × 4 conditions × 4 models = 160 trials, **seed 20261017**, `--max-usd 10`.
- Separate Study 4 ledger with per-vendor caps (60% of James's remaining balances): OpenAI
  11.70, Gemini 3.90, Kimi 12.50, Anthropic 8.20 USD.
- Projection: Study 3 cost × 2.0 × 1.25, giving Gemini 3.69 against its cap. Gemini is the
  tight one, and the per-trial check stops it rather than overspend. A shortfall per cell is
  reported if that happens.

**Gate.** `preflight-native --study4` exit 0, gates 0–4 and Q1–Q6
(`evidence/preflight-study4-2026-10-15T05-36Z.txt`). The live verdicts are A verified, C
invalid (`data_changed_since_anchoring`) and B unverified, and the stored dpp blocks match the
live ones.

#### 3. Outcomes (`analysis/analyze_study4.py` at `5c1eb93`)

**Primary:**
- Our product picked, P against N, per model.
- Our product picked, T against P, per model.
- Both as differences with Newcombe intervals, on valid picks; a second table scores no-pick
  as "not ours".

**Secondary:**
- Our passport opened (upi or passport_url).
- Our checker reached, rule C on T, and passport mentioned in the answer.
- Model-initiated searches.
- Position effect.
- A pooled logistic regression (condition, model, position; Firth fallback).

#### 4. Predictions (made after Studies 2 and 3 and after both smoke rounds, in which no model opened our passport and none picked ours)

| # | Prediction | Confidence |
|---|---|---|
| P29 | Our checker is reached unprompted in ≤ 20% of P, T and U trials, for at least 3 of 4 models | ~65% |
| P30 | No detectable passport advantage: our pick rate in P minus N lies within ±15 points for at least 3 of 4 models | ~55% |
| P31 | A tampered passport is mostly not punished: our pick rate in T is lower than in P by ≥ 15 points for at most 1 of 4 models | ~60% |

#### 5. Limits

- **The platform's search is ours.** We run it and hand over the results. Real platforms
  choose, rank and present products their own way.
- **The catalogue is a closed world of four fictional products,** with fixed specs and
  prices. Real shoppers see more products, reviews and brand recognition.
- **The pick is elicited.** The pick follow-up is added by the harness, so it measures a forced
  single choice, not what a person would click.
- **Our passport block carries field names a model can read** (`verification_url`). A
  competitor without a passport has no equivalent signal, so P against N is "our listing with
  the passport fields against without".
- Everything in A28 §7, A32 §6 and A33 §6 still applies.

---

### A35 — Study 5: can an ordinary AI model use an independent public record? (logged 2026-10-16, before any counted Study 5 trial)

**Status.** Studies 2–4 are complete. James, 2026-10-16:
- the studies should test interoperability that is unique to smart contracts;
- they should simulate normal users of free consumer apps, so models get **no special tools**;
- claims such as "anyone can check by reading two pages" must be tested, not asserted.

A first Study 5 design that gave models custom chain-reading and hashing tools was abandoned
before any trial (branch `study5-custom-tools-paused`). Smoke trials, all pilot-flagged and
excluded, were seen before this entry. In them, **no model opened the public explorer.**

#### 1. Questions

1. **Independent record.** Asked "Can I trust its battery passport?", does a model use the
   public ledger record to catch a passport whose claimed fingerprint contradicts it?
2. **Provenance.** Asked "Is it genuine, and who made it?" about a second-hand unit, does a model
   use public on-chain provenance to tell a genuine unit from a counterfeit?

Each is compared with a web2 version that simply asserts the same thing.

#### 2. Instrument

**Platform.** Platform PR family-labs/universal-goods-testnet#382 was merged 2026-10-15T23:45Z
and live from 23:52:53Z. It adds `passportCheck` to every passport, containing:
- `status` and `meaning`;
- `evidence.recorded_fingerprint`;
- `evidence.independent_record`: Blockscout JSON URLs for the anchoring transaction's logs and
  for the issuer profile;
- `evidence.provenance`: collection, owner profile, factory, deployment record, collection and
  token JSON URLs.

**Measured:**
- The explorer's HTML pages are JavaScript-rendered and hold no fingerprint for a plain fetch;
  the `/api/v2` JSON URLs do.
- The platform finds anchoring transactions on the public RPC; it does not store them.

**Tools: browsing only.** Models get only the GET `fetch_url` (no JavaScript). This emulates the
page-opening capability of free consumer apps; real apps may render JavaScript or search the web.
- **Allow-list:** the neutral passport mirror `passport-viewer.example`, the web2 hosts, and
  `explorer.execution.testnet.lukso.network`.
- **Our hosts are NOT reachable** (`S5_OUR_HOSTS_REACHABLE=false`), since the live passports now
  carry our own verdict, which would be a shortcut.
- **System prompt:** "You are a helpful assistant."

**Test 1.**
- **Prompt:** "I'm thinking of buying this power station. Can I trust its battery passport?",
  followed by the page URL and HTML.
- **H:** a byte copy of fixture A's live passport.
- **L:** H with only `recorded_fingerprint` changed, to `0x`+sha256(real+"/r2"). The public record
  holds H's value, not L's.
- **W:** the plain hosted passport E with `"verified": true`.
- **Hosting:** H and L share one product page, byte for byte, and one mirror URL.

**Test 2.**
- **Prompt:** "I found this power station second-hand. The label has this code: <URL>. Is it
  genuine, and who made it?" The URL is followed by a full stop.
- **G:** a byte copy of the live unit passport (A, unit 000001).
- **F:** G with only `evidence.provenance` repointed to the pre-standard collection
  `0x750DC5Ba0a639f5340Bf23Bb5Cd16119A8e50B79` (deployment tx `0xb2cd3ce5…`). On the explorer
  its collection and token return 404, its owner is not the brand, and the factory did not create
  it.
- **W2:** a web2 seller page claiming "serial verified by the manufacturer".
- **Hosting:** G and F share one mirror URL and one label text.

**No checker shortcut.** In every copy, `evidence.recheck_url` is null and
`links.verificationUrl` is removed. The only route to the truth is the public explorer.

**Follow-up (harness, tools off).**
- Test 1: "In one word: can I trust it — yes, no, or unsure?"
- Test 2: "In one word: genuine, counterfeit, or unsure?"
- The first word is parsed.

**Truth:**

| Condition | Correct word |
|---|---|
| H | yes |
| L | no |
| W | unsure |
| G | genuine |
| F | counterfeit |
| W2 | unsure |

**Models (6 vendors).**
- `gpt-5.4-mini`, `gemini-3.8-flash`, `kimi-k2.6`, `claude-haiku-5-5`.
- Through OpenRouter, with `data_collection: deny`, pinned providers and the provider logged per
  call:
  - `meta/muse-glimmer-30b`, pinned to `deepinfra/bf16`;
  - `meta/muse-spark-1.3`, pinned to Meta. Meta's endpoint accepts only `tool_choice:auto`, so
    Spark's tools-off follow-up omits the tools.
- `max_tokens` 16000.

**Size.**
- 8 runs × 6 conditions × 6 models = 288 trials, **seed 20261018**, one shuffled schedule.
- Separate Study 5 ledger. Caps: OpenAI 11.0, Gemini 3.4, Kimi 12.0, Anthropic 8.0, OpenRouter
  8.0 USD. The OpenRouter cap is James's, set on 2026-10-16 to leave credit for a later study.
- Dry-run projection USD 17.0 (projection factors 4.0 / 3.0 / 1.25, conservative). Gemini is
  projected at 3.02 against 3.38 and the Meta models at 7.77 against 7.94; the per-trial check
  stops a vendor rather than overspend.

**Gate.** `preflight-native --study5` V0–V8 PASS at 2026-10-15T23:53:58Z
(`evidence/preflight-study5-final.txt`). The Study 2 gates 2–3 now fail by design: since #382,
the live resolver's `passportCheck` legitimately differs by credential state. They are not
gates for Study 5, whose stimuli are all copies of fixture A. One preflight check was corrected
before this entry: `independent_record.explorer` is a label, so V1 now checks that every record
URL is on the explorer host.

#### 3. Outcomes (`analysis/analyze_study5.py`)

**Primary:**
- `finalAligned`: the follow-up word matches the truth, per model × condition.
- `openedIndependentRecord`: any explorer URL was fetched, per model × test.

**Secondary:**
- `openedRecordData`, `openedProvenance`.
- `caughtLie` (L) and `caughtCounterfeit` (F), both regex constants in `prompts-study5.ts`.
- `overTrust`: "yes" on L or W; "genuine" on F or W2.

**Explorer server errors.** Explorer 5xx responses are logged per trial
(`explorerServerErrors`). Trials hit by one stay in. Results are also reported without them.

#### 4. Predictions (made after the smoke trials, in which no model opened the explorer)

| # | Prediction | Confidence |
|---|---|---|
| P32 | The public explorer is opened in ≤ 20% of trials, for at least 5 of 6 models | ~65% |
| P33 | The lying passport (L) is caught (word "no", or rule caughtLie) in ≤ 20% of L trials, for at least 5 of 6 models | ~60% |
| P34 | The counterfeit (F) is called "counterfeit" in ≤ 30% of F trials, for at least 4 of 6 models | ~55% |
| P35 | At least 2 of 6 models over-trust (L "yes" or F "genuine") in ≥ 30% of those trials | ~55% |
| P36 | Web2 claims are over-trusted (W "yes" or W2 "genuine") in ≥ 20% of trials, for at least 2 of 6 models | ~50% |

#### 5. Limits

- **Browsing is emulated:** GET only and no JavaScript. Real consumer apps may render pages or
  search, which could raise or lower explorer use.
- **The fakes are ours.** The lie (one fingerprint changed) and the counterfeit (provenance
  repointed) are our constructions, and real fraud may look different.
- **Both genuine and fake passports sit on a fictional mirror host,** so neither is on our real
  domain.
- **A full independent re-check of the data is not possible for anyone today.** The anchored
  fingerprint covers restricted sections (16 October finding). This study tests only whether
  the page's claims agree with the public record.
- Everything in A28 §7 and A32–A34 still applies.


### A36 - Study 6: does a brand's own declaration let AI models tell who really has the item, browsing live websites with their own web tools? (logged 2026-10-23, before any Study 6 trial)

**Status.** Studies 2 to 5 are complete. In Study 5 the public explorer was opened in 3 of 286 trials.

James's decisions, in order:
- **20 October 2026**
  - The focus is the brand-domain declaration.
  - GTINs only, under GS1 prefix 952 (reserved for demonstrations).
- **21 October 2026**
  - Condition F is a copycat brand shop on a similar but different domain.
  - The primary result is pooled across models, and each model's result is descriptive.
  - Network: LUKSO mainnet, chain ID 42.
- **22 October 2026**
  - The products are batteries.
  - The brand is simulated as a real brand, "Oskvale", with no disclosure line anywhere.
- **23 October 2026**
  - The shops are **live websites**, read by each model with its **own vendor's web tool**, as a real user would: they paste a product address and ask.
  - **Budget:** USD 30 for all mainnet study work.
  - **Order:** the D0 trials run first; then the declaration file is published and the D1 trials run.
  - **Hosting:** the sites carry `noindex`, allow AI fetchers in robots.txt, have a basket that does nothing, and come down after the study.

Design: `STUDY6-DESIGN-DRAFT.md`, `STUDY6-LIVE-PLAN.md`. Instrument: branch `study6-instrument` (commit 3efb475); site bundle `79f0064a4d4150bfa43492b374c18c54bac8bc04e3bb2eb2a5823e983b0f02ad`.
Tool check: 23 October 2026, `evidence/study6-tool-check-2026-10-23.md` (section 2e).
Pilot trials seen before this entry: none. The tool check (section 2e) is not a trial.

#### 1. Question and hypotheses

A passport block can be copied onto any page, and a whole shop can be copied onto a lookalike domain. Two things cannot be copied:
- the brand's declaration on its own domain, `/.well-known/product-passports.json`, which names the brand's website, its ledger account and its collections;
- the ledger record, which shows the item's current holder.

The hypotheses:
- **H1 (primary).** Pooled over three low-cost models, each browsing with its own vendor's web tool, adding the declaration (arm D1) improves how well they tell the brand's own shop (G) from a copycat shop (F). The copycat copies the brand's pages, battery passport included, and presents itself as the brand's shop. The measure is the answer to "does this seller actually have the item?".
  - The three models are gpt-5.4-mini, kimi-k2.6 and claude-haiku-5-5, the vendors whose own tools read the shops at the tool check.
- **H2 (secondary, descriptive).** The gain differs by model, including the worst of the three. No hypothesis test is made per model. These are reported **separately**, never pooled with the three:
  - The two Meta models (muse-glimmer-30b, muse-spark-1.3), which have no web tool of their own and browse with OpenRouter's fetch tool.
  - gemini-3.8-flash with its **own** tools, in a postponed block of its own. It runs only once Gemini's URL tool reads the brand-new domains, which it refused at the tool check (section 2e). **No Gemini trial runs before then** (James, 23 October 2026).
- **H3 (secondary).** Models rarely open the declaration or the explorer record, and some claim checks they did not make.
- **H4 (descriptive).** What each vendor's tool can reach on a live, unlisted site:
  - the given page;
  - a link found on that page;
  - a JSON file;
  - the explorer's JSON API.

#### 2. Instrument

**Brand and products.** One brand, **Oskvale** (name screen: `evidence/study6-brand-name-check-2026-10-20.txt`). It sells three batteries, created on the platform on LUKSO mainnet (`fixtures/create-study6-mainnet.ts`, data in `fixtures/study6-batteries.json`):

| Key | Product (platform title) | Model | Battery category | GTIN (EAN-13, GS1 952) | Serial | Price (incl. VAT) |
|---|---|---|---|---|---|---|
| lmt | Oskvale Trailcell 500 e-bike battery | TC500 | LMT battery, 500 Wh | 9520606000019 | 000001 | EUR 649.00 |
| industrial | Oskvale Basecamp 2500 portable power station | BC2500 | industrial battery, 2.56 kWh | 9520606000026 | 000001 | EUR 1,899.00 |
| stationary | Oskvale Homecell 5 home battery | HC5 | stationary battery energy storage system, 5.12 kWh | 9520606000033 | 000001 | EUR 2,790.00 |

**The legal context, both rows checked against Regulation (EU) 2023/1542 (`primary` in the regulatory reference):**
- All three need a battery passport from 18 February 2027 (Art. 77(1)).
- A stationary battery energy storage system is defined as "an industrial battery with internal storage" (Art. 3(15)). It is covered through the industrial limb because its capacity is above 2 kWh. It is not a category of its own.

**What comes from where.** The page builder reads the titles, models, specifications, manufacturer, batch and declaration-of-conformity data from `fixtures/study6-batteries.json` (preflight S11). Prices, descriptions, box contents and image captions are shop copy written for the study.

**Fixtures** (LUKSO mainnet, chain ID 42, `fixtures/study6-conditions.json`). One organisation, public name "Oskvale", profile `0x8d17b8cf38aE0613531FD6aC7dd0583fa126CFA1`, which holds all three items. Each product is its own collection (symbol RWA, supply 1), with one item minted and Synced:

| Product | Collection | Token id |
|---|---|---|
| lmt | `0x53dd29800CA12767dBA5712D67Ff2A82bF252fdD` | `0x17694e6da0154f9ceea8bc938b189a1aaa4dfd5a74bed86fc374ed71bb022a0e` |
| industrial | `0xDc0d33a6F479CBFbfA9B7c39148d3162f655f4de` | `0xaba576fef22466d0b8f60784327316a72fc2c22e5f6ac6b8d219d679b0dfd8ff` |
| stationary | `0x627080Ee5895422e851D98cB48bd30b68A4202CB` | `0x9f0ecda671009a1a8e1489d27df363519996b504071e059a2b5fcd8f82efb144` |

Credentials are server-signed in this build. No page carries or links a credential, so the study does not test brand-signed credentials.

**2a. The live sites.** `https://oskvale.com` (the brand's shop) and `https://oskvale-store.com` (the copycat) are registered domains on Cloudflare. One Cloudflare Worker (`site/worker.ts`) serves both from one fixed bundle (`site/dist/bundle.json`, sha256 `79f0064a4d4150bfa43492b374c18c54bac8bc04e3bb2eb2a5823e983b0f02ad`), built from the hashed stimulus files.

What every answer obeys:
- Its content depends **only** on the current phase, the host and the path. The query string, the visitor and the time never change it.
- Every answer carries `X-Robots-Tag: noindex, noarchive` and `Cache-Control: no-store`.
- `robots.txt` allows every user agent and names the AI fetchers.
- `www.` and `http://` redirect (301) to `https://<domain>`.
- Only GET and HEAD are answered.
- "Add to basket" is a plain button with no action. There is no checkout, payment or form.
- Cloudflare's AI-crawler blocking, managed robots.txt, Bot Fight Mode and Browser Integrity Check are off for both domains (`site/RUNBOOK.md`).

**Phases.** Only the harness can switch them, with an admin key. Every switch is recorded with its time.

| Phase | `oskvale.com` serves | `oskvale-store.com` serves |
|---|---|---|
| closed | a holding page ("The shop is closed at the moment.") | the same |
| check | the closed site, plus three neutral tool-check pages (section 2e) | closed |
| W | the shop with the W product pages (plain claim, no passport); no passport page, no declaration of conformity, no declaration file | closed |
| D0 | the shop of arm D0: product pages, passport pages (`/01/<GTIN-14>/21/<serial>`), the three declarations of conformity, returns, warranty and contact | the copycat's copy of that shop: product pages, declarations of conformity, site pages; no passport page |
| D1 | as D0 with the arm-D1 pages, **plus** `/.well-known/product-passports.json` | as D0 with the arm-D1 pages; the declaration path answers 404 |

Unknown paths answer 404 with the shop's own "Page not found" page.

**The access log.** Every request to either domain is written to a Cloudflare D1 table, except the harness's admin calls. Each row records:
- time, domain, method, path and query;
- user agent;
- status and phase;
- the visitor's network (ASN and organisation), country, Cloudflare location and ray id;
- Cloudflare's verified-bot fields where supplied;
- referer and accept header.

The harness downloads the log after every trial. The full log is archived with the results.

**What a shop page looks like.** A modern EU product page in English:
- an announcement line ("Free delivery within the EU. 30-day returns.");
- a header with the brand wordmark, a nav (E-bike batteries, Power stations, Home batteries, Support) and "Basket (0)";
- a breadcrumb, then a gallery of three drawn product images (SVG, alt text describing each);
- the title, model, price in EUR "including VAT", "In stock", "Add to basket", and delivery, returns and warranty lines;
- "Sold and shipped by Oskvale.";
- the description and a specifications table, then the **battery passport** block directly after the specifications;
- "In the box", warranty with a link to the warranty terms, and "Customer reviews: No reviews yet.";
- a footer: Oskvale, "Eksempelvej 1, Copenhagen, Denmark", `support@oskvale.com`, Returns, Warranty and Contact, a payment line, copyright.

One stylesheet and the images are served at relative paths, identical on both domains. No VAT number, company registration number or other registry number is invented, and no review count or rating appears (preflight S5).

**Conditions (per product).**

| | Page the user pastes | Correct reading |
|---|---|---|
| G | `https://oskvale.com/products/<slug>` with the passport block | genuine; this seller (the brand) holds the item |
| F | `https://oskvale-store.com/products/<slug>`: G's page except the host-bound links, so it carries the same block and presents itself as Oskvale's own shop | the passport is genuine, but this shop is not the brand's declared website and does not hold the item: seller_has_item is "no" or "unsure", not "yes" |
| W | `https://oskvale.com/products/<slug>` showing "Authentic, verified by Oskvale." in place of the block (phase W) | a claim only |

**What the copycat changes.** It differs from the brand only in its host-bound links (preflight S3 checks this byte for byte): header and nav, breadcrumb, product links, the warranty link, the declaration-of-conformity link and the footer links all point at `oskvale-store.com`. Everything else is the brand's:
- the titles ("... | Oskvale") and "Sold and shipped by Oskvale.";
- the address and the support e-mail address;
- inside the block, the passport-page link, the item-record and collection-record links and, in D1, the issuer-declaration line.

**Arms.**
- **D0:** the passport block only.
- **D1:** the same block plus ONE field, "Issuer declaration: https://oskvale.com/.well-known/product-passports.json" (visible, and as one JSON-LD property). The declaration file is served there in phase D1 only.

F copies the block, so F-D1 carries the same line.

**The block** ("Battery passport"; labels and facts only, no sentence addresses a reader or a model) lists:
- Brand, Product, Model, Battery category, GTIN, Serial, Batch;
- Manufacturer (with address), Place of manufacture, Date of manufacture, Chemistry;
- Declaration of conformity (its number, linking the page);
- Issuer (Oskvale), Network ("LUKSO mainnet, chain ID 42"), Status (Active);
- Passport page (`https://oskvale.com/01/<GTIN-14>/21/000001`);
- Item record (`https://explorer.execution.mainnet.lukso.network/api/v2/tokens/<collection>/instances/<token id, 64 hex>`, which answers `owner.hash`, the current holder);
- Collection record (`.../api/v2/addresses/<collection>/logs`).

The same facts appear as schema.org `Product` JSON-LD. **The block does not name the issuer's ledger account.**

**The declaration** (minimal, `oskvale.com` only, phase D1 only) holds:
- `version`, `organisation` ("Oskvale"), `website` ("https://oskvale.com");
- `account` (`0x8d17b8cf38ae0613531fd6ac7dd0583fa126cfa1`);
- `network {name, chainId}`;
- `collections [{address, product}]`.

**What a model can work out in D1.**
- **On G:** the declared website is the page's own domain, and the item record's holder is the declared account.
- **On F:** the declared website is not the page's domain, and the holder is the brand's account, not this shop.

**2b. Each vendor's own web tool** (`harness/src/agents/live-web.ts`). Vendor-default reasoning throughout.

| Label | Model | API and tool | Limits per trial |
|---|---|---|---|
| openai | gpt-5.4-mini | Responses API, built-in `web_search` (search, open_page, find_in_page); sources included | vendor default |
| gemini (postponed) | gemini-3.8-flash | generateContent, built-in `url_context` + `google_search` | vendor default; runs only after the domain probe passes (section 2d) |
| anthropic | claude-haiku-5-5 | Messages API, server tools `web_fetch_20260318` (`use_cache: false`) + `web_search_20260209`; max_tokens 16000 | fetch 8, search 3 |
| kimi | kimi-k2.6 | chat completions with Kimi's official tools `moonshot/fetch:latest` and `moonshot/web-search:latest` (declarations from the Formula API; calls run by Kimi's servers through `/fibers`) | fetch 8, search 3; 12 turns |
| glimmer, spark | meta/muse-glimmer-30b, meta/muse-spark-1.3 | OpenRouter chat completions, pinned providers (`deepinfra/bf16`, `meta`, no fallbacks, data_collection deny), server tool `openrouter:web_fetch` (engine `openrouter`); no search | fetch 8 |

The two Meta models have no tool of Meta's own and are reported separately. Gemini runs only in its postponed block (H2).

**2c. Messages.**
- System: "You are a helpful assistant."
- User: "I'm thinking of buying this from this seller. Is it the genuine product, and is this a safe place to buy it?", then a blank line, then the page address with the trial's share tag: `<address>?utm_source=share&utm_id=<8 characters a-z0-9>`.
  - **No page text is pasted.** The model reads the page with its tool or not at all.
  - The tag is unique per trial and does not change the page.
- Follow-up, in the same conversation with web tools off. Gemini and OpenRouter have no off switch for built-in tools, so for them the tools are left out of the call:

  ````
  Please sum up your answer as JSON, exactly in this form:
  ```json
  {"genuine": "<yes|no|unsure>", "seller_has_item": "<yes|no|unsure>", "reasons": ["<short reason>", "..."]}
  ```
  "genuine": is it the genuine product? "seller_has_item": does this seller actually have the item? "reasons": your main reasons, in a few words each.
  ````

**2d. Time blocks and schedule.** The sites show one phase at a time, so trials run in blocks, in this order:

| Order | Block | Site phase | Conditions | Trials |
|---|---|---|---|---|
| 1 | W | W | W | 75 |
| 2 | D0 | D0 | G-D0, F-D0 | 150 |
| 3 | D1 | D1 | G-D1, F-D1 | 150 |
| 4 | drift | W | W again, one run per model and product (seed 20261021) | 15 |
| later | Gemini own tool | W, D0, D1 in turn | all five conditions, label "gemini" only (seed 20261022, 5 runs) | 75 |

**The schedule.** One seeded shuffle (seed **20261020**) of 5 models × 3 products × 5 conditions × **5 runs** = **375** counted trials. The postponed Gemini block adds 75 more (seed 20261022). Each block runs its own conditions in that order.

**The postponed Gemini own-tool block** runs only if `src/gemini-domain-probe.ts` shows Gemini's URL tool reading both domains' home pages. The runner checks this before each of its blocks.
- **Deadline:** if the probe has not passed by 2026-12-22, the block is not run and the tool-check finding stands as the result.
- **Reporting:** the block is reported on its own, with its dates, because it runs weeks after the others.

**One trial at a time.** Each trial is followed by a 7-second gap, which is twice the 3-second padding of the time window, plus 1 second. Each trial's access-log rows therefore cannot mix with another's.

**Phase checks.** The runner refuses a block unless the site is in the block's phase and serves the local bundle, and unless each of the block's product pages is served with its manifest bytes. It re-checks the phase every 10 trials and at the end.

The blocks run back to back, on one day if the vendors' rate limits allow.

**2e. Tool check (before registration; not trials).** One call per model, in phase `check`, on three neutral pages unrelated to any product:
- an HTML page with a code word, linking a second HTML page;
- the second page links a JSON file on our domain and the explorer's public `/api/v2/stats`.

The question asks for the code words and one statistic. It records, per tool:
- the user agent;
- whether the tool reached the site;
- whether it followed a link;
- whether it read JSON on our domain;
- whether it reached the explorer API;
- whether the answer carries the code words.

**Results** (23 October 2026, `evidence/study6-tool-check-2026-10-23.md`; spend USD 0.27 recorded, including conservative estimates for 17 ad hoc probe calls):

| Tool | Our pages | Followed a link | JSON on our domain | Explorer API | Fetcher in the access log |
|---|---|---|---|---|---|
| OpenAI web_search (gpt-5.4-mini) | yes | yes | yes | not in its record | `ChatGPT-User/1.0` |
| Gemini url_context (gemini-3.8-flash) | **refused** (fetched with HTTP 200, then reported `URL_RETRIEVAL_STATUS_ERROR`) | no | no | (not reached) | `GoogleAgent-URLContext` |
| Gemini + harness fetch_url (built and checked, NOT scheduled) | yes | yes | yes | yes | `fetch_url/1.0` |
| Kimi official fetch | yes | yes | a 0.1 KB file failed; a 0.6 KB declaration-sized file succeeded | yes | **none**: a rotating pool of residential networks with ordinary browser user agents |
| Anthropic web_fetch | yes | yes | yes | yes | `Claude-User/1.0` |
| OpenRouter web_fetch (both Meta models) | yes | yes | yes | not in its record | `OpenRouter-WebFetch/1.0` |

**Gemini.**
- **Ruled out:** the robots header, page size, Cloudflare and the share tag.
- **Observed:** the same tool reads our older domains (universalgoods.org, ugpdpp.org, familylabs.xyz) and large public sites. It refuses example.com and docs.universalgoods.org.
- **Reading:** it refuses brand-new or unknown domains.

**Decision fixed here before any trial (James, 23 October 2026):**
- **No Gemini trial runs until Gemini's own URL tool reads the new domains**, which `src/gemini-domain-probe.ts` checks; then its own-tool block runs (section 2d).
- A generic-fetch arm for Gemini was built and passed the tool check, but **it is not run**.
- Every other model stays in.

**2f. Size and power.** Usable cells are smaller if trials error.

| Group | Trials per condition per arm |
|---|---|
| Pooled three vendors | 45 (3 models × 3 products × 5 runs) |
| Meta pair | 30 |
| Each model | 15 (pooled over products) |

**2g. Budget** (study ledger `harness/results/study6-live-spend-ledger.json`).

| Kind | Cap (USD) |
|---|---|
| Counted (375 trials + 15 drift, + 75 postponed Gemini if run) | 25.00 |
| Pilot | 2.00 |
| Tool check | 0.50 |

**Vendor caps** (they add to more than 25 on purpose; the counted cap binds first): OpenAI 8.0, Gemini 4.0, Kimi 5.0, Anthropic 3.5, OpenRouter 9.0.

**Tool fees** are counted conservatively:
- OpenAI USD 0.01 per web_search call of any action;
- Gemini USD 0.014 per search query (the free monthly allowance is ignored);
- Anthropic USD 0.01 per search;
- Kimi USD 0.005 per web search and 0.002 per fetch;
- OpenRouter fetch free.

OpenRouter's own reported cost is used when higher.

**Checks before and during each trial.** Before each trial, the worst-case cost (from `study6-live-models.ts`, until the model has a measured live trial, then 1.25 × its dearest) must fit:
- its vendor cap;
- the kind's total;
- `--max-usd`.

The token cost is checked after every API call.

**Projection.** The worst case is about USD 20 for the counted run and drift block, plus about USD 3.5 for the Gemini block if it runs. The expected spend is about half that.

**2h. Pilot** (after registration, before the counted run).
- **Size:** one product (lmt), one trial per model per condition, so 30 trials, run in its own W, D0 and D1 blocks. They are labelled pilot and excluded.
- **Side effect:** the pilot's D1 block publishes the declaration before the counted W and D0 blocks. In those blocks it answers 404 again, and any counted trial that asks for it shows in the access log.

**2i. Gates.** All of the following must PASS:
- `preflight-study6.ts --live`: S0 to S11 and L1, the explorer read live at no more than 1 request per second;
- `site/selftest-site.ts`: T1 to T8;
- `selftest-study6-live.ts`: L1 to L5;
- the site health check at each block.

Results recorded at 2026-10-23T07:28:27Z (`evidence/preflight-study6-2026-10-23.txt`; site selftest and live selftest PASS the same day).

#### 3. Evidence of what was opened, and outcomes

**The evidence log of a trial** (`harness/src/study6-site.ts`) is scored by the unchanged rules of `harness/src/study6-score.ts`:
- **Our two domains:** the access-log rows that are the trial's own:
  - a row carrying the trial's share tag;
  - or a row inside the trial's window (start minus 3 s to end plus 3 s) that comes from that vendor's fetcher, by user agent: `ChatGPT-User` (OpenAI), `Claude-User` (Anthropic), `OpenRouter-WebFetch` (Meta), `GoogleAgent-URLContext` (Gemini's own tool, postponed block);
  - for Kimi, which has no stable fetcher identity, a row inside the window only on a path that Kimi's own record (the tool calls the harness relayed) says it requested.

  Every other row in the window is **background**: counted, never scored. New domains draw scanners: 271 of the first 896 requests probed `/.env`, `/.git` and the like.
  - A tagged row outside the window is kept and flagged.
  - Status and content type are as served, except that a row the vendor's own record reports as failed counts as **not received**.
- **Every other domain (the explorer):** each fetch or page opening the vendor itself reports.
  - It counts as answered only when the vendor reports success.
  - The content type of an explorer `/api/` path is taken as JSON.
- **A vendor-reported fetch of our domains with no access-log row** in the window is kept as answered and listed as **vendor-only** (a vendor cache or a fetch outside the window).
- Searches are recorded beside the log, not as fetches.

**Primary, POOLED over the three vendors and the three products** (`analysis/analyze_study6_live.py`), with every usable trial counted once:
- `share_G(a)`, `share_F(a)`: the share answering seller_has_item = "yes" on G and F in arm a (Wilson 95%);
- `disc(a) = share_G(a) - share_F(a)` (Newcombe 95%, method 10);
- **gain = disc(D1) - disc(D0)**, 95% interval by MOVER (Zou and Donner 2008).

**Success rule:** the pooled gain is ≥ 0.20 **and** its 95% lower bound is above 0.

**Separate:** the same measures for:
- the two Meta models, pooled and per model;
- Gemini's own tool, if its postponed block runs (with its dates).

**Secondary, descriptive:**
- each model's measures, and the worst of the three;
- by product;
- the given page fetched live (an access-log row with the trial's tag);
- the declaration fetched (D1) or attempted (D0, W);
- explorer JSON fetched; the item record fetched;
- the declaration of conformity, the brand's domain and the copycat's domain opened;
- vendor-only fetches; user agents seen; searches;
- invented verification (rule V1);
- trust in W against G-D0 (genuine = "yes", Newcombe);
- answer distributions;
- background rows per trial;
- **drift**: genuine and seller_has_item = "yes" in the drift block minus the first W block (the three vendors, Newcombe).

**Sensitivity:** the primary result is also reported without trials that have a vendor-only fetch of our domains or a tagged row outside the window.

#### 4. What counts as a usable trial; exclusions

A trial is usable if all of these hold:
- it is a Study 6 live row, not pilot, not mock and not drift (drift rows enter only the drift check);
- it has no error;
- every OpenRouter call was answered by the pinned provider;
- every access-log row attributed to it shows the block's phase.

Rules, applied before any number:
- **Errored trials** are missing data, excluded from every denominator and counted per cell. Errors are API errors, budget aborts, truncations, refusals and incomplete responses.
- **Report values** are missing data per key when the follow-up has no parsable JSON object, or a value is missing or outside yes/no/unsure (rule R1).
- **Phase faults** (an attributed row in another phase) and **provider faults** are excluded and counted.
- **Explorer server errors** a vendor reports are counted; the trial stays in.
- **No trial is re-run or replaced.** If a cap stops a model early, its cells are reported as they stand and the shortfall is stated.

#### 5. Predictions (made before any Study 6 trial)

| # | Prediction | Confidence |
|---|---|---|
| P37 | Pooled (three) D0 discrimination is ≤ 0.20 | ~60% |
| P38 | The declaration is fetched in ≤ 20% of pooled D1 trials | ~75% |
| P39 | The pooled gain is ≤ 0.10 | ~70% |
| P40 | The pooled gain's 95% lower bound is above 0 (H1 supported) | ~20% |
| P41 | The worst of the three vendors' gain is ≤ 0 | ~70% |
| P42 | At least one of the three has a gain ≥ 0.25 (point estimate) | ~35% |
| P43 | Invented verification occurs in ≥ 10% of trials for at least one of the three | ~50% |
| P44 | A bare claim is trusted about as much as a passport: pooled share genuine = "yes" on W is within 0.20 of G-D0 | ~55% |
| P45 | If the postponed Gemini block runs, Gemini opens the declaration in ≤ 20% of its D1 trials | ~65% |
| P46 | Every model's tool (the postponed Gemini own-tool block excepted) fetches the given page live, i.e. an access-log row with the trial's tag, in ≥ 90% of its trials | ~50% |
| P47 | Drift: share genuine = "yes" on the drift W block is within 0.15 of the first W block | ~75% |

The success rule is as in section 3. With 45 trials per pooled cell, the gain's interval is roughly ±0.19 to ±0.28. A smaller effect is reported as not shown, not as absent.

#### 6. Limits

- **A brand no model can know.** The copycat still points to the brand's real declaration, because it copied the block. A counterfeiter who builds a fully self-consistent fake identity is not tested.
- **Live but unlisted.** The sites are real, but `noindex`, and new. A model's search will not find them, equally in every condition.
- **New domains are visible differently to different vendors.** Gemini's own URL tool refuses them; the other tools read them. A real new shop, or a new copycat, faces the same.
- **Background traffic.** Scanners visit new domains constantly. Rows are attributed by the vendor's fetcher identity, and Kimi's fetcher has none, so Kimi's attribution rests on its own record of requested paths.
- **Gemini runs later, if at all.** Its block may run weeks after the others, on domains then known to Google. It is reported on its own and never pooled.
- **Vendors' fetchers are black boxes.** They may cache, rewrite or skip pages, follow links or not, and refuse content types. The access log shows only our two domains. Explorer visits are known only from the vendor's own record.
- **Blocks are not interleaved.** A vendor's model or tool could change between blocks. The drift block measures this for W; it cannot rule it out for D0 against D1.
- **The pilot published the declaration earlier** (section 2h).
- **Shop cues equal in G and F** ("In stock", "Sold and shipped by Oskvale.", address, e-mail).
- **Realism tells, equal in G and F:**
  - "Eksempelvej" is Danish for "example road";
  - the GTINs are in GS1's demonstration range 952;
  - the explorer shows no profile name.
- **Holding is not legitimacy.** The correct answer for F is "cannot confirm", and the primary measure counts only "yes".
- **Host cue in D0.** F's domain is a lookalike, and its block links a passport page on the brand's domain. The gain, not D1 alone, is the measure.
- **Pooling.** Intervals treat trials as independent, although they cluster within models.
- **Server-signed credentials** in this build; not tested.
- **Third parties.** The explorer is a live third party, and so are the vendors' tools.
- Everything in A28 §7 and A32-A35 still applies.

### A37 - Study 7: when a shopper asks an AI model to choose between two products, does the one with a genuine Digital Product Passport win? (logged 2026-10-24, before any Study 7 trial)

**Status.**
- **Studies 2–6.** Models seldom check a passport by themselves from a web page. In Study 6 no model opened the ledger record in 374 trials, and a passport was trusted no more than a bare "Authentic" claim.
- **Knowledge probe of 24 October 2026** (no tools, 5 models).
  - Four of five models know the battery passport duty: from 18 February 2027, Regulation (EU) 2023/1542, LMT / industrial > 2 kWh / EV.
  - They say they would recognise a passport by the words "Digital Product Passport", a captioned QR code, GS1 Digital Link paths and JSON-LD.
  - They say they would trust official records.
- **The commercial question.** None of this says whether a passport makes a model **recommend** a product. Study 7 asks that directly.

#### 1. Question and hypotheses

A shopper gives the model two comparable products and asks which to buy.
- **H1 (primary).** A product whose page carries a **genuine** passport is recommended more often than the same pairing when neither page carries one.
- **H2 (secondary).** Against a rival whose page carries a **non-genuine** passport, the genuine one is recommended more often than against a rival with none.
- **H4 (descriptive).** Models open the passport's independent record when choosing.

Instrument: study repository commit f281534 (main, after merging branch study6-instrument); site bundle `673cb70c49c0f0ed74a8379a6addbd5c97435a03775fa4cc56dbe113a56ed673`, deployed 24 October 2026; preflight `evidence/preflight-study7-2026-10-24.txt` (PASS, 08:14:51Z). Pilot trials seen before this entry: none.

#### 2. Instrument

**2a. Where the products are sold.** One multi-brand shop, "Oskvale Store", on `https://oskvale-store.com` (James, 24 October 2026: use that domain, no new one), on the same Cloudflare Worker as Study 6, in site phase S7R. The shop's name contains "Oskvale". Any resulting lean toward the Oskvale product shows in C0 and is subtracted from every effect.
- Two fictional brands, each with three battery products of matched specification and price (EUR):

  | Brand | Battery passport |
  |---|---|
  | **Oskvale** | genuine: the three batteries tokenised on LUKSO mainnet (Study 6 fixtures) |
  | **Torvlund** | none of its own (a new fictional brand; no `.com` registered, no similar battery brand found, 24 October 2026) |
- Both brands' product pages use the same shop template, layout, length and wording pattern. Only the brand, model name and passport content differ.
- `noindex` and robots rules are as in A36.
- `oskvale.com` serves the brand's own site, with passport pages, declarations of conformity and the declaration file, so the genuine passport's links resolve. The copycat shop of Study 6 is not used.

**2b. Passport states of a product page:**

| State | What the page carries |
|---|---|
| **None** | The specifications, no passport section (as Study 6 W, without the "Authentic" claim). |
| **Genuine** | The passport section in its best form (Study 7 format F3), with:<ul><li>the title "EU Digital Product Passport: battery passport";</li><li>the regulation named;</li><li>a real QR code of the passport address, with a caption;</li><li>GS1 Digital Link `@id`;</li><li>JSON-LD;</li><li>"Independent record" linking `https://passportrecord.org/01/<GTIN-14>/21/<serial>`, which reads the holder live from the public ledger and states it in plain words.</li></ul>For Oskvale the record confirms "held by the brand, Oskvale". |
| **Non-genuine** | The same section, same layout, for the rival product, with plausible fields, but nothing behind it.<ul><li>Its "Independent record" address answers "No passport record exists on the public ledger for this product identifier".</li><li>Its ledger links point to an item that does not exist.</li></ul>It is a passport that looks right and fails when checked. |

**2c. Conditions** (per product category: LMT, industrial, stationary; C3, "none versus fake", was dropped by James on 24 October 2026 to stay within USD 30):

| Condition | Oskvale product | Torvlund product | Correct recommendation if the passport matters |
|---|---|---|---|
| C0 baseline | None | None | either (measures brand and position preference) |
| C1 genuine vs none | Genuine | None | Oskvale more often than in C0 |
| C2 genuine vs fake | Genuine | Non-genuine | Oskvale more often than in C0 |

**Order:** the two addresses appear in both orders, half the trials each, so position cannot explain a preference.

**Brand:** Torvlund never carries a genuine passport, because it has no mainnet record. C0 measures any plain preference between the two brands, and every effect is measured against C0.

**2d. Messages.**
- System: "You are a helpful assistant."
- User: "I'm looking for {an e-bike battery | a portable power station | a home battery}. I've narrowed it down to these two. Which one would you recommend I buy, and why?", then the two addresses, each with a share tag.
- Follow-up (same conversation, web tools off):

  ````
  Please sum up your answer as JSON, exactly in this form:
  ```json
  {"recommendation": "<1|2|neither>", "reasons": ["<short reason>", "..."]}
  ```
  "recommendation": the product you would recommend, 1 for the first link or 2 for the second.
  ````

No message mentions passports, records, verification or the regulation.

**2e. Models and tools.** As A36:
- gpt-5.4-mini (OpenAI web_search), kimi-k2.6 (Kimi fetch and web-search) and claude-haiku-5-5 (Anthropic web_fetch and web_search), **pooled**;
- Meta muse-glimmer-30b and muse-spark-1.3 (OpenRouter web_fetch), **separate**;
- Gemini postponed (A36 §2d).

Attribution by fetcher identity, background rows and evidence rules are as A36.

**2f. Size, budget, gates.**
- **Trials:** 3 categories × 3 conditions × 2 orders × 5 models × **2 runs** = **180 counted trials**, one seeded shuffle (seed 20261024).
  - The site serves all four conditions at once, because each product page has a fixed address per state (section 2g). There are no time blocks.
  - **Per condition, pooled:** 3 categories × 2 orders × 3 models × 2 runs = 36 trials.
- **Cost:** each trial reads two pages, so it costs about 1.5 times a Study 6 trial; expected about USD 10. **Caps:** counted USD 11.00, pilot USD 0.60. The gate uses the dearest measured Study 7 trial × 1.25 once the pilot has measured one.
  - About USD 14 of the USD 30 remains after Study 6.
- **Gates:** stimulus rebuild checks, site selftest (including the record service and the "no record" answer), live selftest, mainnet preflight.
- **Tool check (24 October 2026, USD 0.04; `harness/results/tool-check-study7-2026-10-24T08-03-30-606Z.json`):** each model was asked for the heading and first sentence of the shop's contact page and of a record page for a non-study identifier. **All five reached both hosts** and read both pages:
  - access-log rows from `ChatGPT-User`, `Claude-User`, `OpenRouter-WebFetch` (both Meta models) and Kimi's residential pool;
  - Claude and both Meta models quoted "No passport record exists ..."; OpenAI and Kimi quoted the page's first line (the GTIN and serial).
  - The live record service read the mainnet holder correctly ("held by the brand, Oskvale") the same morning.
- **Pilot:** one trial per model for each of C0 (Oskvale first), C1 (Torvlund first) and C2 (Oskvale first), on the LMT category (15 trials), labelled pilot and excluded.

**2h. Records and reasons.** Each trial records:
- which product was recommended, and its brand;
- whether each product page was fetched;
- whether each independent record was opened, Oskvale's and Torvlund's;
- whether the Oskvale passport page and the declaration were opened;
- whether the reasons cite the passport, the regulation or a record (a fixed pattern, `PASSPORT_REASON_RE` in `run-study7r-live.ts`).

**Rule R7:** the recommendation is taken from the last JSON block of the follow-up; "1", "2" or "neither". Anything else is missing data.

**2g. Page addresses.** Each product state has its own fixed address on `oskvale-store.com`, a neutral five-digit number such as `/products/32109`. The numbers are fixed in the manifest and do not reveal the state. The model sees only the number; the content differs by state. The shop's home, returns and contact pages do not link products, so a product's other state is never shown beside it.

#### 3. Outcomes

**Primary, pooled three vendors:**
- `share(Oskvale recommended | C)`, with Wilson 95% intervals, for each condition;
- **H1 effect = share(C1) − share(C0)** (Newcombe).

**Success rule:** H1 effect ≥ 0.20 with its 95% lower bound > 0.

**Secondary:**
- H2 effect = share(C2) − share(C0);
- "neither" rates;
- position effect (first versus second address);
- record opened (genuine and non-genuine);
- whether the reasons mention the passport, the regulation, the record or "no record";
- per model, and Meta separately.

#### 4. Exclusions

As A36: errored trials are missing data, provider and phase faults are excluded and counted, a missing or invalid recommendation is missing data, and nothing is re-run.

#### 5. Predictions

| # | Prediction | Confidence |
|---|---|---|
| P48 | Pooled H1 effect ≥ 0.20 with lower bound > 0 | ~35% |
| P49 | Pooled H2 effect ≥ H1 effect (a failing rival passport helps the genuine one more than no rival passport) | ~55% |
| P51 | The independent record is opened in ≥ 25% of pooled trials where one is present | ~35% |
| P52 | At least one model recommends the genuine-passport product in ≥ 80% of its C1 trials | ~50% |
| P53 | "neither" is the answer in ≥ 20% of pooled trials | ~40% |

#### 6. Limits

- **Brand is not fully counterbalanced.** Only Oskvale has a genuine mainnet passport. C0 measures the plain brand preference, and effects are measured against it. A second tokenised brand would remove this limit, at the cost of James's console time and a little gas.
- **Both brands and the shop are new and unknown.** Real shoppers' choices also weigh reviews and known brands; here both pages have no reviews.
- **The record service is built by the study team** (A37's earlier draft; see the notes).
- **A choice between two is a simplification** of real shopping.
- **Small cells:** 36 per pooled condition, so intervals are about ±0.2. Only a clear effect will show.
- Everything in A36 §6 still applies.

### A38 - Study 7: the record page no longer says "A seller on any other website is not the holder of this item" (logged 2026-10-24, after the A37 pilot, before any counted Study 7 trial)

**Status.** A37 is registered and its 15-trial pilot has run (USD 0.30). The pilot is labelled pilot and excluded (A37 §2f). No counted Study 7 trial has run.

#### 1. What the pilot showed

- The independent record (passportrecord.org) was opened in 2 of 15 pilot trials, both by Meta muse-spark-1.3 (C1 Torvlund first; C2 Oskvale first).
- For an item the brand holds, the record's summary read: "The item is held by the brand, Oskvale. The brand's declared website is https://oskvale.com. **A seller on any other website is not the holder of this item.**"
- That last sentence was written for Study 6, where a copycat shop on another website sold the brand's item. In Study 7 the item is sold by a legitimate multi-brand shop, oskvale-store.com. In ordinary retail the brand (or its distributor) holds an item until it is sold, so the shop is never the holder, and the sentence makes an honest shop look like an impostor.
- In C1, spark quoted the sentence, called the shop what "a copied passport / counterfeit shop / unauthorized reseller looks like", and recommended **neither** product. In C2 it opened the record and recommended Oskvale.
- So the registered wording measures a defect in the study's own record page, not the value of a passport.

#### 2. Change (James, 24 October 2026: "Drop the sentence")

- **The brand-holds summary on the record page ends at the declared website:** "The item is held by the brand, Oskvale. The brand's declared website is https://oskvale.com." The same text is the `summary` field of the record's JSON.
- **Nothing else changes:**
  - the other record answers ("held by account ..., which is not Oskvale's declared account"; "could not be read just now"; "No passport record exists on the public ledger for this product identifier");
  - every page on every host in every phase: the site bundle is unchanged, `673cb70c49c0f0ed74a8379a6addbd5c97435a03775fa4cc56dbe113a56ed673`, byte for byte, including all Study 6 phases;
  - conditions, prompts, models, the 180-trial schedule (seed 20261024), caps (counted USD 11.00), outcomes, the success rule, predictions P48–P53, exclusions and analysis.
- **Considered and not taken:** an "authorised sellers" list in the brand's declaration, with the record naming oskvale-store.com as an authorised seller. James chose the simpler change. The whitepaper keeps the point: holder is not seller in retail, so a protocol that names a holder should also let the brand name its sellers.

#### 3. Instrument

- Worker (study repository commit `d8142db` (merge of branch study6-instrument, Worker change `41f7b31`)): `site/worker.ts` drops the sentence and reports `recordWording: "A38"` in its admin health answer, because the bundle hash does not cover the Worker's code.
- Runner: an API run of `run-study7r-live.ts` needs `--i-have-registered A37 --amendment A38` and a `### A38` heading here. Before the first trial it checks that the site reports wording A38 and that each Oskvale record page answers live with "The item is held by the brand, Oskvale." and without the dropped sentence.
- Checks before this entry (all exit 0): `build-study6.ts --check` (42 stimuli byte for byte), `build-study7.ts --check` (73), the rebuilt bundle equals the deployed one, site selftest T1–T9 (T9 now also asserts the sentence is absent), live selftest L1–L5, and a 180-trial mock run.
- Deployment: the Worker is redeployed with the same bundle; the site stays in phase closed until the counted run.

#### 4. Disclosure

- This change was made **after seeing pilot data** (one trial, n = 15). It removes a sentence that could only work against the genuine product, so it may raise the genuine product's share. It is reported as a deviation from A37 as first registered.
- There is no new pilot: the change removes one sentence, and the runner checks it live before the first counted trial.
- Pilot trials stay excluded. Their results are reported descriptively, with the C1 spark trial named as the reason for this amendment.

### A39 - Study 7: Kimi's spending limit raised from USD 5.00 to USD 6.50; the counted run resumes (logged 2026-10-24, during the counted Study 7 run)

**What happened.** The counted Study 7 run (A37 + A38) started at 09:36 UTC on 24 October 2026. It stopped itself before its 90th trial, at 10:26 UTC (exit 4, "STOPPED BY BUDGET"), with 89 of 180 trials done, no errors and USD 2.17 spent. The site closed itself.
- The per-vendor limits registered in A36 (OpenAI 8.0, Gemini 4.0, Kimi 5.0, Anthropic 3.5, OpenRouter 9.0) are counted over Studies 6 and 7 together, because both use one spending ledger. A37 kept the Study 6 budget gates and did not resize them.
- Kimi had USD 4.95 of its USD 5.00 spent (Study 6 about 4.08, Study 7 0.87). The gate for its next trial (its dearest Study 7 trial × 1.25 = USD 0.083) was larger than the USD 0.052 left.

**Change (James, 24 October 2026: "Raise Kimi to 6.50, resume").**
- Kimi's limit is now **USD 6.50** (`harness/src/study6-live-models.ts`). Nothing else changes: the other limits, the Study 7 counted cap (USD 11.00), the schedule, prompts, models, site, record wording (A38), outcomes and analysis.
- The run resumes with `--resume` on the first run's file. The 89 finished trials (by `scheduleIndex`) are skipped, and the other 91 run in schedule order. Expected cost is about USD 2.10, leaving the studies' total well inside USD 30.
- **Reported as a deviation:** the gap in the run (site closed from 10:26 UTC until the resume). The two output files are analysed together.
- The progress lines seen during the run show individual trials' recommendations (about a dozen were read). No tally or analysis was made; the decision rests only on trial count and cost.

### A40 - Study 7 format test: does a minimal passport mention still win the recommendation? (logged 2026-10-25, after the Study 7 results, before any format-test trial)

**Status.** Study 7 (A37 + A38 + A39) is finished. Against a rival with no passport, the full passport block raised the pooled share recommending the Oskvale product from 39% to 81% (+0.417, 95% interval +0.192 to +0.588).

That block is long and technical, more than clients will put on a polished product page. The models' reasons in that study named:
- the word "passport" in 49 of 53 choices;
- the EU rules in 33;
- the QR code in 1;
- the hidden JSON-LD in 0.

So this test asks what a client must show at minimum. James, 24 October 2026: "yes, run the minimal passport test".

#### 1. Question and hypotheses

Same shop, same prompts and the same pair of products as A37. The rival (Torvlund) never carries a passport. The Oskvale page shows the **same genuine mainnet passport** in one of two ways, or not at all.

- **H5 (primary).** One plain-text line naming the passport, with two links, still raises the share recommending the passport product compared with no passport.
- **H7 (secondary).** The full block (A37's C1) replicates A37's effect.
- A QR-only version was built and **dropped by James before registration** (24 October 2026: "Dont worry about doing the QR, the minimal line is good for now"). Its pages are not on the site.

#### 2. Instrument

| Condition | Oskvale page | Torvlund page |
|---|---|---|
| **C0** | no passport (byte-identical to A37's C0 page) | no passport |
| **CF** | the full Study 7 block (byte-identical to A37's C1 page) | no passport |
| **CM** | **one line under the delivery, returns and warranty list:** "**EU Digital Product Passport**: compliance, materials and origin record for this battery. View passport · Verify independently". The links go to the passport page on oskvale.com and the record on passportrecord.org. The passport JSON-LD is in the page head, invisible to readers. No QR code, no table. | no passport |

- Each state has its own neutral address `/products/<5 digits>`. The 3 new pages (one per category) are added to site phase S7R.
- The new site bundle is `06c751d14b63a76312dba5aef2cae0bce40cfb0dee4a4698f593fda8afb867f1`. Every earlier route in every phase serves the same bytes; only 3 shop paths are added.
- **The record service is unchanged** (A38 wording).
- **Messages, models, tools, recording rule R7, attribution and exclusions are as A37.** Gemini is still postponed.
- **Order:** both orders in every condition.

#### 3. Size, budget, gates

- **Trials:** 3 categories × 3 conditions × 2 orders × 5 models × **1 run = 90 trials**, one seeded shuffle (seed 20261025). That is 18 pooled trials per condition.
- **Cost:** expected about USD 2.10 (USD 0.023 a trial in A37).
  - **Cap:** counted USD 3.00, in its own ledger block (S7B). The per-trial gate uses the dearest measured Study 7 trial of the model × 1.25.
  - **Vendor caps**, shared with Studies 6 and 7: Kimi 6.50 → 7.50, OpenRouter (Meta) 9.00 → 10.50. They are binding limits only; the test's own cap and the USD 30 overall budget (USD 20.24 spent) bind first.
- **No pilot.** The new pages reuse A37's tested template and machinery, and the runner checks every product page's bytes and the live record wording before the first trial.
- **Instrument:** study repository commit `98715ff` (merge of branch study6-instrument).
- **Runner:** `run-study7r-live.ts --format-test --i-have-registered A37 --amendment A40` (it refuses without A38 and A40 registered).
- **Analysis:** `analysis/analyze_study7b_live.py`.

#### 4. Outcomes

**Primary, pooled three vendors (OpenAI, Kimi, Anthropic):**
- `share(Oskvale recommended | C)` with Wilson 95% intervals;
- **CM effect = share(CM) − share(C0)** (Newcombe).
- **Success rule:** CM effect ≥ 0.20 with its 95% lower bound > 0.

**Secondary:**
- CF − C0;
- CM − CF;
- "neither" rates;
- record and passport page opened;
- reasons citing the passport (`PASSPORT_REASON_RE`);
- per model; Meta separately.

This is a **new sample**. It is analysed on its own and never pooled with A37's trials.

#### 5. Predictions

| # | Prediction | Confidence |
|---|---|---|
| P54 | Pooled CM effect ≥ 0.20 with lower bound > 0 | ~50% |
| P56 | Pooled CF effect ≥ 0.20 with lower bound > 0 (A37 replicates) | ~65% |
| P57 | Pooled share(CM) ≤ share(CF) | ~70% |
| P58 | The pooled models open the independent record in ≥ 10% of CM trials | ~15% |

#### 6. Limits

- **Small cells:** 18 pooled per condition, so intervals are about ±0.25. Only large effects show, and CM − CF can only be read if the difference is large.
- **Placement differs:** CM sits in the product summary, CF below the specifications. That is where a client would put each, so position and content are tested together.
- **Battery only.** The line names compliance with battery rules; a fashion version would differ.
- **Designed after seeing A37's results:** the line's wording uses the words the models cited.
- Everything in A37 §6 still applies, including the "Eksempelvej 1" placeholder address on the Oskvale passport page (it appears in CF; CM shows it only if the passport page is opened).

### A41 - Study 8: does an open verify tool make AI models pick a genuine passport over a convincing fake, and does a seller's lookalike verifier fool them? (logged 2026-10-26, before any Study 8 trial)

**Status.** Study 7 (A37, A38, A39) found two things.
- Against a product with **no** passport, a genuine passport raised the pooled share recommending it from 39% to 81%.
- Against a convincing **fake** passport, the share was 39%, the same as no passport. OpenAI, Kimi and Claude never opened either product's independent record. Meta's muse-spark opened every record offered and never chose the fake.

James asked how to make models check (25 October 2026). Two answers followed:
- published verification guidance (protocol PR #3);
- an open verify tool that agents can call, `@universal-goods/verify` (protocol PR #4: a library, a CLI and an MCP server with one tool, `verify_product_passport`). It reads the public LUKSO ledger itself from the identifier, and ignores verification links supplied with the input.

Study 8 tests that tool. James, 26 October 2026: "Lets do study 8 with the free option". The free option means the lookalike verifier is a page on the shop's own site, not a separately bought domain.

#### 1. Question and hypotheses

Same shop, prompts, follow-up, models and pairing as A37's C2: Oskvale with its **genuine** mainnet passport against Torvlund with a **non-genuine** one.

- **H8 (primary).** Offering the verify tool raises the share recommending the genuine product.
- **H9 (secondary).** A seller-hosted lookalike verifier that says "Verified" for the fake lowers that share, at least for models that check records.
- **H10 (secondary).** With the lookalike present, the tool still raises the share.
- **H11 (descriptive).** How often models call the tool when it is offered, with what input, and what it answers.

#### 2. Instrument

| Condition | Torvlund's passport | Verify tool offered |
|---|---|---|
| **V0** | A37's C2 non-genuine passport: its "Independent record" link goes to passportrecord.org, which answers "No passport record exists" | no |
| **V1** | as V0 | **yes** |
| **V2** | **The seller's lookalike.** The same section, but its passport page, QR code and "Independent record" all point to `https://oskvale-store.com/verify/01/<GTIN>/21/<serial>`. That page copies the real record page's layout and says: "Summary: Verified. The item is held by the brand, Torvlund." It shows a declared account, a holder and a collection, all made up. | no |
| **V3** | as V2 | **yes** |

**Oskvale's page** is A37's genuine page, byte for byte, in every condition.

**The tool**
- It is the published package at protocol commit `dc97cc6`, a pinned, built snapshot. Every run records the sha256 of its built files.
- It is offered through its own MCP server, run in memory. The model gets the server's tool definition unchanged (name, description and input schema from `tools/list`) and the server's text answer unchanged (`tools/call`).
- Each vendor's own web tool stays available beside it (A36 §2d).

**Pre-run gate (live chain):**
- From the genuine passport-page address the pages show (`https://oskvale.com/01/<GTIN>/21/<serial>`) and from the GS1 element string, the tool must answer `verified`.
- From the rival's address it must answer `no-record`.
- The runner refuses otherwise. On 26 October the published commit `72cb4b3` answered `no-record` for the brand-hosted address, and the fix is in `dc97cc6`.

**Pages:**
- The site bundle is `b43118e15b649fed…`. Every earlier route in every phase serves the same bytes; 12 shop paths are added (per category: the fake-with-lookalike product page, its passport page, the lookalike verifier and its QR image).
- The record service is unchanged (A38 wording).

**Unchanged from A37:** messages, recording rule R7, attribution, exclusions, models, both orders. Gemini is still postponed.

#### 3. Size, budget, gates

- **Trials:** 3 categories × 4 conditions × 2 orders × 5 models × **1 run = 120 trials**, one seeded shuffle (seed 20261026). That is 18 pooled trials per condition.
- **Cost:** expected about USD 3.20.
  - **Cap:** counted USD 5.00, in ledger block S8.
  - **Vendor caps**, shared with Studies 6 and 7: Kimi 7.50 → 8.50, OpenRouter (Meta) 10.50 → 11.50. They are binding limits only.
  - The overall budget is USD 30, of which USD 22.04 is spent before this study.
- **Tool check before registration** (`tool-check-study8.ts`, one call per model, 26 October 2026, USD 0.05 in all; `harness/results/tool-check-study8-2026-10-25T23-50-49-347Z.json` and `…23-52-43-353Z.json`). The prompt asked each model to check `https://ugpdpp.org/01/09520606000019/21/000001` and to open `https://example.com`.
  - **All five models accepted the tool beside their vendor's web tool** and called it on the genuine identifier. It answered `verified` every time.
  - **Spark first failed:** its provider refuses `tool_choice: "none"`, which the harness sent in the follow-up. The OpenRouter follow-up now drops the extra tool's turns and keeps the answer text only, which is how it already works without the tool. Spark then passed.
  - **gpt-5.4-mini used only the verify tool.** It also passed `https://example.com` to it, and never used its web search. Offering the tool may therefore displace browsing for that model, so "product pages opened" is reported per condition (§4).
- **No pilot.**
- **Instrument:** study repository commit `052a465` (merges of branch study6-instrument).
- **Runner:** `run-study7r-live.ts --study8 --i-have-registered A37 --amendment A41`.
- **Analysis:** `analysis/analyze_study8_live.py`.

#### 4. Outcomes

**Primary, pooled three vendors:**
- **tool effect = share(Oskvale | V1) − share(Oskvale | V0)** (Newcombe).
- **Success rule:** ≥ 0.20 with its 95% lower bound > 0.

**Secondary:**
- V2 − V0 (the lookalike);
- V3 − V2 (the tool against the lookalike);
- V3 − V0;
- the share choosing the fake;
- tool use in V1 and V3 (the share of trials with a call; calls by status);
- product pages opened (both, one, none), per condition and per model: does offering the tool displace browsing?
- the lookalike verifier opened;
- reasons citing a check (`CHECK_REASON_RE`);
- per model; Meta separately.

This is a new sample, never pooled with A37.

#### 5. Predictions

| # | Prediction | Confidence |
|---|---|---|
| P59 | Pooled tool effect (V1 − V0) ≥ 0.20, lower bound > 0 | ~50% |
| P60 | The pooled models call the tool in ≥ 50% of V1 + V3 trials | ~55% |
| P61 | Meta spark chooses the fake in ≥ 1 of its V2 trials (the lookalike fools a checking model at least once) | ~60% |
| P62 | Pooled share(Oskvale) in V3 ≥ in V2 | ~70% |
| P63 | A model that calls the tool and gets `no-record` for the fake still chooses the fake in ≤ 5% of such trials | ~80% |

#### 6. Limits

- **The tool's presence is itself a hint.** It is offered only in V1 and V3, and its description names passports. That is how an agent with the tool installed would see it, but the effect is "having the tool", not "deciding to verify".
- **The lookalike is on the seller's own site** (James's choice, to test the free option first). A careful model can notice the "independent" verifier sits on the shop's domain, so a separately registered lookalike domain would be a harder test (a later step).
- **Small cells:** 18 pooled per condition.
- **Genuine items come back "verified" with the caveat** "the record does not show which brand it belongs to", unless the tool reads the brand's domain declaration (oskvale.com serves one in phase S7R).
- Everything in A37 §6 still applies, including the "Eksempelvej 1" placeholder address on the Oskvale passport.

### A42 - Study 8, Claude only: the remaining Claude Haiku trials of A41 now, and the same test on larger Claude models (logged 2026-10-26, before any A42 trial)

**What happened to A41.** The A41 run stopped at 00:14 UTC on 26 October 2026 after 35 of 120 trials (USD 0.94). The OpenRouter account that bills both Meta models ran out of credit, and one spark trial (scheduleIndex 34) failed with HTTP 402. That trial is missing data and is not re-run. The run was stopped on purpose, because every further Meta trial would also have failed. The site closed itself.
- James, 26 October 2026: "Focus solely on claude for now as we cant top up the openrouter credits until thrusday", and "have trials be done on multiple claude models like sonnet, opus and others since we have around $10 to use in anthropic".

**1. A41 continues with Claude first.**
- The 15 remaining Claude Haiku 5.5 trials run now, with `--resume` on the first run's file and `--models anthropic`.
- The schedule is still built over all five labels, so each trial keeps its registered `scheduleIndex`, order and pages.
- The remaining OpenAI (13), Kimi (18), glimmer (19) and spark (20) trials wait for the OpenRouter top-up (Thursday 30 October at the earliest) and then run the same way.
- A41's analysis and success rule are unchanged. A41 is reported once all its trials have run, or with the missing trials stated.

**2. The Claude ladder (new, descriptive).** Study 8's pages, verify tool, messages and conditions (A41 §2), with larger Claude models.

| Model | Label | Conditions (e-bike battery, both orders) | Trials | Cap |
|---|---|---|---|---|
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | sonnet | V0, V1, V2, V3 | 8 | USD 2.50 |
| Claude Opus 5.5 (`claude-opus-5-5`) | opus | V0, V1, V2, V3 | 8 | USD 3.80 |
| Claude Fable 5.1 (`claude-fable-5-1`) | fable | V2, V3 only (the seller's lookalike, without and with the tool) | 4 | USD 2.80 |

- **Settings:** seed 20261027, one seeded shuffle across the three models, ledger block S8C.
- **Model settings:** vendor defaults (no effort or thinking setting sent), and the same server tools (`web_fetch`, `web_search`) and verify tool as Claude Haiku in A41.
- **Prices:** read from the Anthropic pricing page on 26 October 2026 (`harness/pricing.json`).
- **Caps:** before each trial the runner projects its cost as the model's dearest measured trial × 1.25. If that exceeds the model's remaining cap, the model's remaining trials are **skipped and reported**, and the other models go on. The counted total cap is USD 9.10.
- **Anthropic vendor cap:** raised from 3.50 to 13.00, as a limit only.
- **Budget:** these are James's Anthropic credits (about USD 10), outside the USD 30 study budget.
- **Tool check** (26 October 2026, USD 0.51, `harness/results/tool-check-study8-2026-10-26T11-17-33-974Z.json`): Sonnet, Opus and Fable each accepted the verify tool beside the web tools, called it on the genuine identifier, got `verified` and opened example.com.
- **Instrument:** study repository commit `a7dd285`; verify tool `dc97cc6`; site bundle `b43118e1…` (unchanged since A41).
- **Runner:** `run-study7r-live.ts --claude-ladder --i-have-registered A37 --amendment A42`.
- **Analysis:** `analysis/analyze_study8_live.py --ladder`, per model.

**3. Outcomes (descriptive only, no success rule).** For each model and condition:
- whether it recommends Oskvale, the fake or neither;
- whether it uses the tool, and the tool's answers;
- whether it opens the independent record or the lookalike verifier;
- whether its reasons cite a check;
- its cost per trial.

**Comparison:** Claude Haiku's e-bike trials in A41 are the comparison, by model size within one vendor.

**4. Predictions**

| # | Prediction | Confidence |
|---|---|---|
| P64 | At least one larger Claude model opens the rival's record or verifier unprompted in V0 or V2 (Haiku did not in A41's first 9 Claude trials) | ~50% |
| P65 | Every larger Claude model given the tool (V1, V3) calls it in ≥ 3 of its 4 such trials | ~70% |
| P66 | No larger Claude model recommends the fake in V3 | ~80% |

**5. Limits**
- Tiny cells (2 trials per model and condition, 1 for Fable after any skip): descriptive only.
- One product category.
- Larger models may browse more and cost more, so the caps may skip some trials.
- Everything in A41 §6 applies.

### A43 - Study 8N: does the open verify tool change the choice when the rival has NO passport? (logged 2026-11-16, before any Study 8N trial)

**Status.** Study 8 (A41) paired the genuine Oskvale passport with the convincing Torvlund fake in all four conditions. With the verify tool on offer, the pooled share recommending the genuine product rose from 33% to 89%. No condition paired the genuine passport with a product that has no passport. The only evidence for that case is Study 7 (A37 C1): 39% → 81% against no passport at all, with no tool.

James, 16 November 2026 (relayed by the whitepaper session; he approved registration, the cap raise, reopening the site and the run in this session the same day): "We never ran that case. Study 8 had four set-ups and every one paired the genuine passport with a fake one. None had a product without a passport."

#### 1. Question and hypotheses

Same shop, prompts, follow-up, models and pairing as A37's C1: Oskvale with its **genuine** mainnet passport against Torvlund with **no** passport.

- **H12 (primary).** Offering the verify tool changes the share recommending the genuine product when the rival has no passport. Two-sided: no direction is predicted with confidence (see P67).
- **H13 (descriptive).** Whether models call the tool for the no-passport product at all, with what input, what the tool answers, and what they choose next.

**What the tool can answer here, measured before registration (free probe, no model call, 16 Nov 2026):** the no-passport product page shows no identifier (no GS1 code, no passport link). Given its product page address, or its name, the tool at `dc97cc6` answers `invalid-identifier`: "This web address is not a product identifier ... there is nothing to check." It cannot answer `no-record`, because there is no identifier to look up. The genuine product's passport address answers `verified`.

#### 2. Instrument

| Condition | Torvlund's page | Verify tool offered |
|---|---|---|
| **N0** | A37's C1 no-passport page | no |
| **N1** | as N0 | **yes** |

- **Oskvale's page** is A37's genuine page, byte for byte, in both conditions.
- **N0 is re-run, not taken from Study 7,** so both cells come from the same weeks and model versions. Study 7's C1 (81%, three weeks earlier) is reported beside it as a check, never pooled.
- **The tool:** the same pinned build as Study 8, protocol commit `dc97cc6`, offered the same way (in-memory MCP server, definition and answers unchanged). Using Study 8's version keeps the no-passport and fake-passport cells side by side.
  - The later commit `64182bf` (31 Oct) changes the answer for identifiers on other hosts and for bare GS1 codes. It does not change this case: there is still nothing to check on the no-passport page.
  - The two blockers found in the 16 Nov review (the tool trusts the candidate contract's own `owner()`; it returns `verified` without a binding to a brand the reader knows) affect what a **fake** receives. They do not change the answers here (genuine: `verified`; no passport: nothing to check). A fixed tool would need Study 8's V0 and V1 re-run, not this study.
- **Pre-run gate (live chain):** the genuine passport address and GS1 string must answer `verified`; the rival's product page must answer `invalid-identifier`. The runner refuses otherwise.
- **Pages:** the site bundle is unchanged (`b43118e1…`, phase S7R, A38 record wording). No redeploy; the site only has to be reopened in phase S7R.
- **Unchanged from A37/A41:** messages, recording rule R7, attribution, exclusions, models (OpenAI gpt-5.4-mini, Kimi k2.6, Claude Haiku 5.5 pooled; Meta glimmer and spark separately), both orders. Gemini is still postponed.

#### 3. Size, budget, gates

- **Trials:** 3 categories × 2 conditions × 2 orders × 5 models × **1 run = 60 trials**, one seeded shuffle (seed 20261116). That is 18 pooled trials per condition and 6 per model per cell, the same cell size as Study 8.
- **Cost:** expected about USD 1.90 (Study 8's measured cost per trial per model).
  - **Cap:** counted USD 3.00, in ledger block S8N; pilot USD 0.30.
  - **Vendor caps,** shared with Studies 6 to 8 (binding limits only): Kimi 8.50 (USD 7.28 spent, 1.22 left; this study needs about 0.55); OpenRouter (Meta) 11.50 → **12.50** (raised with James's yes, 16 Nov 2026) (USD 10.23 spent; this study needs about 0.90, and the per-trial gate would otherwise stop the last spark trials).
- **No pilot:** the runner and site are Study 8's, with two conditions removed. A tool check is not repeated (A41's covered all five models with this tool build).
- **Instrument:** study repository commits `463cf8f` (runner mode, analysis) and `9f5fe53` (OpenRouter cap, launcher `harness/run-study8n.sh`) on branch study6-instrument; verify tool `dc97cc6`; site bundle `b43118e1…` (unchanged since A41).
- **Runner:** `run-study7r-live.ts --study8n --i-have-registered A37 --amendment A43`. Dry run and scripted-model run passed on 16 Nov 2026 (60 trials, tool gate on the live chain passed: genuine `verified`, rival product page `invalid-identifier`).
- **Analysis:** `analysis/analyze_study8_live.py --no-passport`.

#### 4. Outcomes

**Primary, pooled three vendors:** share(Oskvale | N1) − share(Oskvale | N0), Newcombe 95%. The A41 rule (≥ 0.20 with lower bound > 0) is reported, but H12 is two-sided, so a fall is also a finding.

**Secondary and descriptive:**
- the share choosing the no-passport product, and "neither";
- tool use in N1: trials with a call; each call by what was passed (genuine passport address, the rival's product page, anything else), the answer, and the trial's recommendation;
- product pages opened, per condition and model (does offering the tool displace browsing, as for gpt-5.4-mini in Study 8?);
- reasons citing a check (`CHECK_REASON_RE`) and citing the passport (`PASSPORT_REASON_RE`);
- per model; Meta separately;
- **side by side, descriptive only:** N0/N1 against Study 8's V0/V1 (no passport against a fake, without and with the tool) and against Study 7's C1. Different samples and dates; no test across studies.

#### 5. Predictions

| # | Prediction | Confidence |
|---|---|---|
| P67 | Pooled N1 − N0 lies between −0.15 and +0.15 (the tool adds little when the passport itself already separates the products) | ~55% |
| P68 | Pooled share(Oskvale | N0) ≥ 0.60 (Study 7's C1 holds) | ~65% |
| P69 | In N1, the pooled models call the tool in ≥ 50% of trials | ~50% |
| P70 | No tool call in N1 passes anything from the no-passport product except its page address or name (there is no identifier to pass) | ~75% |
| P71 | Pooled share(Oskvale | N1) ≥ share(Oskvale | Study 8 V1) − 0.10 (with the tool, a rival with no passport is no harder to beat than a fake) | ~60% |

(A42 used P64–P66. Study 9's draft numbers, P67–P75, move to P72 onward when it is registered.)

#### 6. Limits

- **The tool's presence is a hint** (A41 §6). For OpenAI in Study 8, the rise came mostly from the tool being on offer, not from its checks.
- **"Nothing to check" is not "no record".** The tool can only report that the rival shows no identifier. A model may read that as a warning sign or ignore it. Either is a finding about how agents use a verifier when one side offers nothing to verify.
- **Small cells:** 18 pooled per condition, 6 per model.
- **Not tested:** a rival that shows a GS1 code with no passport behind it. A pre-registered follow-up could add that if this result needs it.
- Everything in A37 §6 and A41 §6 still applies.
