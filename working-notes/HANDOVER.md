# Handover — Agent DPP Verification Study

**Written 2026-08-07. Deadline 18 August 2026, Stripe Sydney.**
Read this first if you are picking the study up cold.

---

# ⛔ SIX THINGS TO READ BEFORE YOU TOUCH ANYTHING

**The study is currently SIDELINED** — James is on the platform rebuild. That is a
priority decision, not a judgement on the work. **Do not resume trials or live-testnet
writes on your own initiative.**

1. ⛔ **NO TRIAL HAS EVER RUN.** If you find a results file, treat it as an **error**,
   not as a resumption. There is no data of any kind.
2. ⛔ **P1–P11 are byte-identical to `e1a5c08`, and `ed36035` committed the
   amendments.** So *"logged before the first trial"* is now externally verifiable
   instead of the document vouching for itself. **This is the single most valuable
   thing done on this study — do not break the property.** Amendments are appended,
   never edited in place.
3. ⛔ **The fixtures are NOT matched in the sense that matters: the independent
   variable does not exist.** A and B both return `unverified`; C returns
   `valid_unanchored`. Until A is anchored and C forged, **every trial would measure
   nothing.** This gates everything else. The preflight will refuse to start — that is
   correct behaviour, not an obstacle to remove.
4. ⛔ **THE SEPARATION GUARD IS CORRECT. DO NOT "FIX" IT.** It fires on ~18% of healthy
   replicates and that number is *not* a misfire rate — those are genuine
   quasi-complete separations (observed max |coef| 36.8, max SE 2.3 × 10⁷ against
   thresholds of 10). `P(the primary estimand P2 has no reportable fit)` went
   **1.0000 → 0.0000**. ⚠ **Anyone who reads "fires on 18% of healthy data" without
   running the Monte Carlo will try to repair a working guard.** See the Firth section
   below before touching `fit_and_report`.
5. ⛔ **The Firth inversion is written BEFORE data, deliberately:** the *better* the
   agents perform, the *more* likely the pre-registered maximum-likelihood table is
   disclaimed and the Firth numbers carry the result. **Written after the run, nobody
   would believe it was understood beforehand.** A Firth table is not a failed
   analysis.
6. ✅ **James's machine has been RESTORED.** A global scikit-learn downgrade made
   earlier on 2026-08-07 has been reverted — global is back to **1.9.0**, `firthlogist`
   removed from it, `pip check` clean. The study's pinned stack lives only in `.venv/`.
   **Nothing outside this repo is left changed.**

⭐ **The most transferable lesson, and it cost the most to learn:** I set an acceptance
criterion ("the guard must almost never fire on healthy data") that was simply wrong
for this design, and **only an independent check that actually ran the numbers could
tell a bad guard from a bad expectation. Reasoning could not have separated those
two.** Every serious defect found on this study — five of them — was found by
*running* something, never by reading it.

---

## The one-line status

**No trial has ever been run. There are no results.** The instrument is now in good
shape; the remaining work is fixture data on the live testnet, and it needs James.

---

## What was true when this session started

- The harness **could not start at all** — a Windows path bug at two sites, and
  dependencies that had never been installed.
- **The experiment's independent variable did not exist.** Conditions A, B and C all
  returned an identical `unverified` verdict. Only B matched its declared ground
  truth, and only by accident.
- **The fixtures were never matched.** Condition A carried an EU Battery Passport
  category; B and C carried none. A served 1,473 bytes against B's 4,858. The study's
  core A-vs-B contrast had been confounded with payload size since 2026-07-23.
- `analyze.py` would have crashed on the first curly quote an agent emitted
  (no `encoding=`, and this machine's default really is cp1252 — measured).
- A truncated Claude response was scored as a **wrong answer**, not as missing data.

---

## What is done

| | |
|---|---|
| Harness starts, dependencies installed | ✅ |
| Both Windows path bugs fixed | ✅ |
| `analyze.py` reads UTF-8 | ✅ |
| Python 3.12 + pandas + statsmodels + firthlogist | ✅ |
| Claude `max_tokens` 32000, streaming, `stop_reason` inspected | ✅ |
| Kimi (`kimi-k3`) added as a 5th arm, live-tested with a real tool round-trip | ✅ |
| All four other model IDs validated against vendor docs | ✅ |
| Five-part preflight gate, four adversarial rounds | ✅ |
| Amendments A1–A17 **committed** at `ed36035` | ✅ |
| P1–P11 byte-identical to `e1a5c08` | ✅ |
| Fixtures on a common schema, A and B byte-identical | ✅ |
| Condition C carries a real credential (`valid_unanchored`) | ✅ |

**Nothing has been written to any host outside the testnet, and no vendor API has
been billed.**

---

## The preflight gate — read this before you trust a run

`harness/src/preflight.ts` refuses to start a run unless **five** things hold:

1. **Schema** — every declared and observed status is a value the coding scheme can hold.
2. **Agreement** — each condition's live status equals its declared ground truth.
3. **Declared distinctness** — the three declared ground truths differ.
4. **Observed distinctness** — the three live statuses differ.
5. **Matchedness** — the three served passports are identical once only what is
   *legitimately allowed to vary* has been bounded.

**The governing principle, mechanised rather than documented:** *an exemption must
bound what may vary, never merely delete it from comparison.* There is no exemption
kind that simply drops a value; `validateExemptions()` throws at module load if one
is introduced.

**Four adversarial rounds.** Rounds 1–3 each broke it — including making it print
"PASSED" while the independent variable did not exist. Round 4 could not break it by
accident and gave an explicit **ship** judgement. Zero false alarms across 13 probes,
which matters as much: *a gate that cries wolf gets bypassed at 2am, and then the
confound walks straight back in.*

**`SKIP_PREFLIGHT=1`** bypasses it loudly, stamps every JSONL row as bypassed, and
exits **3** — never 0.

---

## ⛔ Do these before trial 1

1. **Finish the fixtures.** See the two open questions below.
2. **Anchor A** (needs a signed on-chain transaction — James).
3. **Build C's fraud: anchor, THEN republish.** ⚠ The republish is the second half of
   the forgery — doing it first makes C come out *verified*.
   ⚠ **Test on a throwaway product first**: C today fails two checks and still returns
   `valid_unanchored` under a summary beginning "VALID". If the forged condition's
   top-line word is VALID, the study measures something else.
4. **Finish the analysis work** — the only item that cannot be recovered later.
   Without a `verification_status × condition × mode` table, **P3 is unevaluable.**
5. **Log every remaining amendment.** Then, and only then, trial 1.

---

## Open questions for James

1. **`manufacturerInformation`, `manufacturingPlace`, `operatorInformation`** are
   required and the VoltCore template does not have them either. May they come from
   the fixtures' own original Provenance data (Family Labs Energy Systems GmbH,
   FLE Werk 2)? It is manufacturer identity, not a compliance claim.
2. **The carbon-footprint and supply-chain-due-diligence sections.** Approval to copy
   the VoltCore values was relayed via the orchestrator; it deserves confirmation in
   James's own words, because it puts signed compliance claims on-chain.

**The fabrication line, agreed and to be stated in the write-up:** a plausible mass or
material split is a fixture. **A carbon-footprint figure with an invented study
reference, or a due-diligence attestation, is a false compliance claim** — and these
passports are SD-JWT signed and ERC725Y anchored under Family Labs, which makes it
durable and attributable. **An honestly incomplete passport beats a dishonestly
complete one.**

---

## What the results will probably say — written down before any data exists

- **P1 will probably FAIL.** The served passport ships `ug:verification`,
  `ug:credential`, `ug:onChainAnchor`, `ug:verifyUrl` and literal
  `ug:verifyInstructions` **as plain readable text**. Once A is anchored, a naive agent
  can distinguish A from B by *reading*. **This is a fact about the passport format,
  not about the agents**, and the write-up must say so — otherwise a failed P1 reads
  as "naive agents CAN spot verified passports", which is false and would be ours.
- **P4 will probably HOLD, strongly and for the right reason.** A naive reader sees
  C's credential block, trusts it, and clears the fraud.
- ⭐ **The headline is better than the prediction it replaces:** *an agent can separate
  credential-bearing from credential-less, but cannot separate genuine from forged —
  it can only trust the claim.* That is the actual threat model of a digital product
  passport, and the reason the cryptographic layer exists. P1 holding would only have
  said "agents are blind".
- **A-vs-C is uncontaminated** by any of this, while A-vs-B is compromised. The
  contrast that survives is the contrast the study is actually about.

**⛔ The stimulus must NOT be altered to protect P1.** Hiding evidence the product
genuinely ships would make the prediction more likely to come true. Let it fail and
explain why.

---

## ⭐ Expect Firth to BE the primary analysis, not a fallback

Measured, 500+ replicate Monte Carlo at the study's own predicted rates:

**If the agents perform at the top of P6's pre-registered 85–98% band, the
pre-registered maximum-likelihood logit will frequently have no valid fit.**

This is not a bug and not a false alarm. A `mode × condition` slab is 40 rows, and
`0.98^40 = 0.45` — so a whole slab coming out all-correct is close to a coin flip.
That is genuine **quasi-complete separation**: coefficients blow up (observed max
36.8) and standard errors explode (observed max 2.3 × 10⁷).

Verdict-fire rate by tool-arm accuracy:

| tool accuracy | ML table disclaimed |
|---|---|
| 0.85 | 0.3% |
| U(0.85, 0.92) | 3.0% |
| **U(0.85, 0.98)** — the pre-registered band | **16–18%** |
| U(0.95, 0.98) | 76% |
| 0.98 | 76% |

**The pre-committed Firth refit rescued 100% of these cases** (424/424 and 442/442 in
two independent runs), returning finite coefficients and CIs. So the primary estimand
is always reportable — but in the good-performance scenario **the reported numbers
will be Firth's, not maximum likelihood's.**

⛔ **A10 treats Firth as an edge-case fallback. On this design it is closer to the
expected path.** Say so in the write-up rather than presenting it as a rescue, and do
not treat a disclaimed ML table as a failed analysis — *the better the agents do, the
more likely it is.*

---

## ✅ Run the analysis from the study's virtualenv

```
<repo>/.venv/Scripts/python.exe analysis/analyze.py <trials.jsonl>
```

`.venv/` is gitignored. Recreate it with the commands at the top of
`analysis/requirements.txt`.

**A global scikit-learn downgrade was made earlier on 2026-08-07 and has been
REVERTED.** The machine's global interpreter is back to **scikit-learn 1.9.0**, and
`firthlogist` (installed only that day) has been removed from it. Both verified by
measurement rather than assertion: a real `LogisticRegression().fit()` against the
global interpreter, and `pip check` → *No broken requirements found*. The study's
pinned stack now lives only inside `.venv`.

⭐ **Verify this dependency by FITTING, never by IMPORTING.** `firthlogist` calls a
scikit-learn internal removed in 1.6, so with a modern scikit-learn the **import
succeeds and the fit raises** — the failure would surface only at the moment
separation was actually detected, which is precisely when it is needed. An import
check proves nothing here. Confirmed inside the venv on genuinely separated data:
ML raised, Firth returned finite coefficients, CIs and p-values.

---

## (historical) The change that was made outside this repo — now reverted

`firthlogist` could not be installed as specified. Two independent blockers, both found
by running it, not reading it:
1. Its metadata declares `Requires-Python >=3.8,<3.11`, so a plain install fails on
   Python 3.12.
2. It calls a scikit-learn internal **removed in scikit-learn 1.6**, so with the
   installed 1.9.0 the *import* succeeded and the *fit* raised — a failure that would
   only have surfaced at the exact moment separation was detected.

**Resolution: `scikit-learn` was downgraded globally from 1.9.0 to 1.5.2** on this
machine, and `requirements.txt` now pins `scikit-learn<1.6` with a `--no-deps` install
documented. ⚠ **This is a machine-wide change outside the study repo and may affect
other Python work.** A virtualenv for the study would be the clean fix.
(A naive `--ignore-requires-python` install also silently downgrades numpy 2.5 → 1.26;
that was avoided. Environment left at numpy 2.5.1 / scipy 1.18.0.)

---

## Known limitations, all logged

- **H3 cannot be tested as locked.** It names four rails; two exist — and those two are
  one, because the naive page read serves the JSON-LD that *contains* the embedded
  credential.
- **P9 is not evaluable** from the shipped instrument. `flagged_fraud` exists nowhere;
  `decision == "reject"` was silently substituted. Report it as "B-rejection rate".
- **Perplexity is structurally absent** from the propensity table, so P11's
  "large cross-agent variance" rests on **three** pre-registered agents, not five.
- **Kimi is exploratory** — no pre-registered prediction mentions it. It may never be
  reported as confirming or refuting P6 or P7.
- **Eleven residual gate bypasses**, all insider-only (prose smuggled into URL and
  chain-label fields). They close with four regex edits — **after** trial 1.
- ⚠ **Two gate sensitivities, both now self-diagnosing:**
  - **Unequal-length SKUs consume raw-byte headroom.** A 9/13/6-character spread
    spends 28 of the 32-byte tolerance. This now has **its own assertion and its own
    message**, printed on every run pass or fail, stating the spread, the bytes
    consumed and the headroom left — and saying explicitly *"this is not a matchedness
    failure"*. Left undiagnosed it would have surfaced as apparent fixture drift on
    fixtures that were genuinely matched, which is a cry-wolf failure, and a gate that
    cries wolf is one an operator learns to bypass. Today: `9/9/9`, spread 0 B.
    **The fix if it ever trips is equal-length SKUs — never a wider tolerance, never
    `SKIP_PREFLIGHT`.**
  - **A per-request timestamp field** (e.g. `ug:generatedAt`) would hard-fail
    matchedness until exempted. It names the differing path, so it is diagnosable
    rather than mysterious.

---

## The rule that kept saving us

**`STUDY_DESIGN.md` summarises. The code executes. THE FILE THAT RUNS WINS.**

Five times in one session, someone — including the orchestrator, and including me —
reasoned from a summary and reached a confident wrong answer that the executing file
refuted in one command. Every serious defect found tonight was found by *running*
something, never by reading it.

This belongs in the write-up's methods notes. It is a lesson about pre-registered
studies generally, not about this repository.

---

## Hard rules

- **Never `git stash`** — fifteen worktrees share one `.git`.
- **Do not create a branch.**
- **Do not restart the local stack** — there is no safe stop; it corrupts PGlite.
- **Testnet only.** `UG_API_BASE` must never resolve to `REDACTED_PRODUCTION_HOST`.
  ⚠ **Judge by CNAME target, never by TLD** — the alpha stack owns a `.org` host.
- **Never edit P1–P11.** Amendments are appended, never edited in place.
