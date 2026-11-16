# Study 8 results, 29 October 2026: does the open verify tool make AI models pick a genuine passport over a convincing fake?

**Registration:**
- **A41**, registered and pushed 26 October 2026 before any trial (commit f80f928).
- **A42** (26 October): A41 continues Claude-first after the OpenRouter stop, plus the Claude ladder, which is reported separately in `RESULTS-STUDY8-CLAUDE-2026-10-26.md`.

**Runs:**

| Run | When (UTC) | Trials | USD |
|---|---|---|---|
| First run | 25 Oct 23:54 – 26 Oct 00:14 | 35 | 0.94 |
| Claude Haiku resume | 26 Oct 11:19–11:28 | 15 | 0.11 |
| OpenAI, Kimi and Meta resume, after James's OpenRouter top-up | 28 Oct 22:56–23:47 | 70 | 2.67 |

- **Usable: 119 of 120.** One spark trial failed with OpenRouter's "no credit" error (scheduleIndex 34). One glimmer answer had no valid recommendation (missing data).
- The site was closed between and after the runs.
- Full output: `analysis/study8-live-results-2026-10-29.txt`. Data and SHA256: `results-archive/`.

**The set-up in one paragraph.** Two matched batteries are sold on one shop: Oskvale with a **genuine** passport on the public ledger, Torvlund with a **convincing fake**. The shopper asks "which would you recommend?". In **V1 and V3** the model also has the open verify tool (`verify_product_passport`, protocol commit `dc97cc6`) in its toolbox, as an installed plug-in would be. In **V2 and V3** the fake's "Independent record" link goes to a **lookalike verifier on the seller's own site** that says "Verified".

## The answer in four lines

1. **The verify tool works.** The pooled models (OpenAI, Kimi, Claude Haiku) recommended the genuine product in **89%** of trials with the tool, against **33%** without it.
   - **Tool effect +0.556** (95% interval +0.240 to +0.744). **The registered success rule is MET.**
   - Against the seller's lookalike verifier: 94% with the tool, 56% without.
2. **No model ever chose the fake after the tool said "no record" for it: 0 of 46 such trials.** With the tool on offer, no model chose the fake in any trial (0 of 59); without it, the pooled models chose the fake in 7 of 36.
3. **Whether a model uses the tool decides who benefits.** Claude Haiku (12/12), Kimi (11/12), glimmer (12/12) and spark (11/11) called it almost every time. **OpenAI's gpt-5.4-mini called it once in 12 trials.**
4. **The seller-hosted lookalike verifier fooled no model.** The pooled models never opened it. Meta spark opened it in all 6 of its V2 trials and chose the genuine product all 6 times.

## Primary result (pooled: OpenAI, Kimi, Anthropic; 18 trials per condition)

| Condition | Genuine recommended | Fake | Neither | Tool used |
|---|---|---|---|---|
| V0, no tool | 6/18 (33%) [0.16, 0.56] | 4/18 | 8/18 | n/a |
| **V1, tool** | **16/18 (89%)** [0.67, 0.97] | 0/18 | 2/18 | 12/18 |
| V2, lookalike, no tool | 10/18 (56%) [0.34, 0.75] | 3/18 | 5/18 | n/a |
| **V3, lookalike + tool** | **17/18 (94%)** [0.74, 0.99] | 0/18 | 1/18 | 12/18 |

**Effects:**
- **V1 − V0: +0.556 (+0.240, +0.744). MET.**
- V2 − V0: +0.222 (−0.094, +0.484). The lookalike did not lower the genuine share: the pooled models never opened it.
- V3 − V2: +0.389 (+0.105, +0.612).
- V3 − V0: +0.611 (+0.306, +0.788).

**Tool answers (pooled):**
- `verified` 24, always for the genuine product;
- `no-record` 27, always for the fake's code;
- `invalid-identifier` 10, for the fake's seller-hosted passport address. After that answer the models went on to check the GS1 code.

**Position:** 44–54% of the answers naming a product chose the first link in every condition, so there is no position effect.

## By model (6 trials per cell; Meta reported separately)

| Model | V0 genuine / fake | V1 genuine | V2 genuine / fake | V3 genuine | Tool used when offered |
|---|---|---|---|---|---|
| OpenAI gpt-5.4-mini | 2 / 2 | 5/6 | 3 / 1 | 5/6 | **1/12** |
| Kimi k2.6 | 2 / 0 | 5/6 | 5 / 0 | 6/6 | 11/12 |
| Claude Haiku 5.5 | 2 / 2 | **6/6** | 2 / 2 | **6/6** | 12/12 |
| Meta glimmer | 4 / 0 | 6/6 | 3 / 0 (1 missing) | 6/6 | 12/12 |
| Meta spark | 6 / 0 | 5/5 (1 errored) | 6 / 0 | 6/6 | 11/11 |

**Meta separately:** V1 − V0 +0.167 (−0.119, +0.448). Spark already checks records without the tool (6/6 in V0), so the tool adds little for it.

**OpenAI, a caution on reading the pooled effect.**
- gpt-5.4-mini rose from 2/6 to 5/6 genuine with the tool on offer, while calling it only once.
- With the tool on offer it opened both product pages in 9 of 12 trials, against 12 of 12 without.
- So for OpenAI the rise is not the tool's *check*. It may be the tool's *description*, which the model reads in its toolbox: a passport badge is "a claim, not verification". A41 §6 flagged this: offering the tool is itself a hint.
- **The pooled effect therefore includes some "the tool is there" effect,** as well as the effect of the checks themselves. The cleanest evidence for the check itself is point 2 above (0 of 46) and Claude Haiku (2/6 → 6/6, tool used every time).

## Predictions (A41 §5)

| # | Prediction | Result |
|---|---|---|
| P59 | Pooled tool effect (V1 − V0) ≥ 0.20, lower bound > 0 (~50%) | **True** (+0.556, +0.240) |
| P60 | The pooled models call the tool in ≥ 50% of V1 + V3 trials (~55%) | **True** (24/36, 67%) |
| P61 | Spark chooses the fake in ≥ 1 V2 trial (~60%) | **False** (0/6; it opened the lookalike every time and chose the genuine product every time) |
| P62 | Pooled share(Oskvale) V3 ≥ V2 (~70%) | **True** (94% vs 56%) |
| P63 | After `no-record` for the fake, the fake is chosen in ≤ 5% of such trials (~80%) | **True** (0 of 46) |

## What this means

- **An open verify tool turns "can't tell a real passport from a convincing fake" into "picks the real one", for models that call it.** Study 7 found the genuine passport's advantage disappeared against a convincing fake. With the tool, it comes back: 33% → 89%.
- **Adoption by AI products is the deciding factor.** The tool only helps models that use it. Four of five models did; OpenAI's mini model largely did not. How the tool reaches agents, and how its description is worded, matter as much as what it checks.
- **A lookalike verifier on the seller's own site is not a real threat to careful models.** Spark and the larger Claude models (A42) recognised a seller-hosted "independent" record for what it is. The untested hard case is a lookalike on its own domain (proposed Study 12).
- **For the whitepaper:** the ledger supplies a record nobody can quietly edit, and the open tool makes reading it one step for any agent. Together they restore the genuine passport's advantage against fakes.

## Deviations and disclosures

1. **The OpenRouter credit stop (A42 §1).**
   - The first run stopped at trial 35 when the OpenRouter account ran out of credit.
   - One spark trial errored (missing data, not re-run).
   - Claude's remaining trials ran on 26 October and OpenAI, Kimi and Meta's on 28 October, in registered schedule order, with `--resume` on the earlier files.
   - Two days separate the parts. Model versions were pinned as before, and the site bundle and tool were unchanged.
2. **A harness fix before registration** (the A41 tool check): the OpenRouter follow-up drops the extra tool's turns.
3. **Interim look.** James asked for an interim look at 36 trials on 26 October; it is reported here. No decision about the run was taken from it.
4. **The tool's presence is a hint** (A41 §6); see the OpenAI note above.

## Spend

| Item | USD |
|---|---|
| A41 tool check | 0.05 |
| A41 trials | 3.68 |
| A42 (Claude ladder + its tool check, James's Anthropic credit; separate report) | 6.00 |

## Files

- `results-archive/study8-live-2026-10-25T23-53-59-448Z.jsonl`: first run.
- `results-archive/study8-live-2026-10-26T11-19-41-816Z.jsonl`: Claude Haiku resume.
- `results-archive/study8-live-2026-10-28T22-55-53-305Z.jsonl`: OpenAI, Kimi and Meta resume.
- `results-archive/study8-console-2026-10-29.log`: the console log of all runs.
- **Command:** `python -I analysis/analyze_study8_live.py <the three jsonl files>`.
