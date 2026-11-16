# Study 6 (live sites) results, 24 October 2026

**Registered as A36** (`PREREGISTRATION.md`, commit 8dffb50, 23 October 2026, before any trial).

**Run:** 23 October 13:51 UTC to 24 October 06:15 UTC. Full output: `analysis/study6-live-results-2026-10-24.txt`. Raw data and SHA256 sums: `results-archive/`.

## The answer in four lines

1. **The declaration did not help the models tell the brand's shop from the copycat.**
   - The pooled gain (OpenAI, Kimi, Claude) was **+0.044**, 95% interval −0.119 to +0.215. The registered success rule needed at least +0.20 with the lower bound above zero: **not met**.
   - Meta's two models, reported separately, gained +0.067 (−0.103 to +0.252).
2. **Every vendor's own web tool reached the live pages** in 95–100% of trials. The sites and the measurement worked.
3. **Some models opened the brand's declaration once it was published:**
   - Meta spark 30/30;
   - Claude 15/30;
   - Meta glimmer 10/29;
   - OpenAI 3/30;
   - Kimi 1/30.

   **No model opened the ledger record in any of the 374 usable trials.** The models follow about one link and stop.
4. **The models almost never commit.** "Does this seller actually have the item?" got "yes" on the brand's own shop in 11–13% of pooled trials.
   - Claude answered "unsure" in every trial.
   - Kimi answered "not genuine" in nearly every trial, apparently because the domains are new.
   - A bare "Authentic, verified by Oskvale." claim and the passport block were trusted equally: genuine = "yes" 0% on both (P44).

## Primary result (pooled: OpenAI, Kimi, Anthropic)

| Arm | Brand's shop: seller has it = yes | Copycat: yes | Discrimination (95% CI) |
|---|---|---|---|
| D0, passport block only | 5/45 (11%) | 1/45 (2%) | +0.089 (−0.024, +0.214) |
| D1, plus the declaration | 6/45 (13%) | 0/45 (0%) | +0.133 (+0.028, +0.262) |
| **Gain D1 − D0** | | | **+0.044 (−0.119, +0.215)** |

**Sensitivity:** without the 28 trials that had a vendor-only fetch or a late tagged row, the gain is +0.070 (−0.119, +0.266).

**Per model, gain D1 − D0 (descriptive):**

| Model | Gain (95% CI) | Note |
|---|---|---|
| OpenAI | +0.133 (−0.251, +0.515) | |
| Kimi | 0.000 | |
| Anthropic | 0.000 | worst of the three |
| Meta spark | +0.133 (−0.171, +0.452) | |
| Meta glimmer | 0.000 | |

## Predictions (A36 §5)

| # | Prediction | Outcome |
|---|---|---|
| P37 | D0 discrimination ≤ 0.20 | supported (+0.089) |
| P38 | Declaration fetched in ≤ 20% of pooled D1 trials | not supported (19/90 = 21%) |
| P39 | Pooled gain ≤ 0.10 | supported |
| P40 | Gain's lower bound > 0 (H1) | not supported |
| P41 | Worst model's gain ≤ 0 | supported (Anthropic 0.000) |
| P42 | One model gains ≥ 0.25 | not supported |
| P43 | Invented verification ≥ 10% for one of the three | not supported (1/225) |
| P44 | Bare claim trusted like the passport | supported (both 0%) |
| P45 | Gemini block | not run (postponed) |
| P46 | Every tool fetched the given page live ≥ 90% | supported |
| P47 | Drift ≤ 0.15 | supported: genuine = yes 0/45 in the first W block and 0/9 in the drift block. seller_has_item rose from 3/45 to 2/9, within the interval. |

## Deviations from A36 (reported, not hidden)

1. **D0 was interrupted and resumed.**
   - The launching session ended on 23 October around 15:33 UTC, 40 of 150 trials into block D0. The site stayed in phase D0 for about 10.5 hours, with no trials running.
   - The block resumed on 24 October at 02:04 UTC (`--resume`, instrument commit 96f1c5a). Finished trials were skipped and the registered order was kept.
   - The trial in flight when it stopped (schedule index 101, Kimi, stationary, F-D0) had no row. It ran on resume as its first completed attempt. Its interrupted API cost was not recorded, a few cents at most.
2. **One trial errored:** Meta glimmer, F-D1, OpenRouter's provider answered HTTP 429. It counts as missing data, as A36 §4 requires.
3. **Gemini:** no trials. Its own URL tool refused the new domains, and James decided to wait (A36 §2e, §2d).

## Spend

| Item | USD |
|---|---|
| Tool check | 0.27 |
| Pilot | 0.90 |
| Counted run (incl. drift) | 14.44 |
| **Total** | **15.61 of USD 30** |

## What it means (judgement)

- **The protocol's pieces work on the live web.** Models' own tools reach a brand's pages and can read its declaration.
- **The models don't finish the check.** No model followed the declaration to the ledger record, and their answers didn't change. With Studies 2, 4 and 5, this is the fourth study in which models do not verify a passport by themselves from a web page.
- **The design rule holds:** verify where product data is assembled and pass the verdict on. In Study 3, structured delivery led to checks and caught tampering in 39 of 40 trials.
- **The next test (Study 7, draft A37):** a single link to a verdict that reads the ledger live. It matches what the models actually do, which is to follow one link.
