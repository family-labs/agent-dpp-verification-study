# Study 7 (live shop) results, 24 October 2026

**Question:** when a shopper asks an AI model to choose between two matched batteries, does the one with a genuine Digital Product Passport win the recommendation?

**Registration:**
- **A37**, registered 24 October 2026 before any Study 7 trial (`PREREGISTRATION.md`, commit 5f6a5ca).
- **A38** (after the pilot, before any counted trial): the record page drops the Study 6 sentence "A seller on any other website is not the holder of this item".
- **A39** (during the run): Kimi's spending limit raised from USD 5.00 to USD 6.50.

**Run:** 24 October 2026, 09:36–10:26 UTC and 10:29–11:15 UTC (see Deviations). Full output: `analysis/study7r-live-results-2026-10-24.txt`. Raw data and SHA256 sums: `results-archive/`.

## The answer in four lines

1. **Against a product with no passport, the genuine passport wins.**
   - The three pooled models recommended the Oskvale battery in **81%** of trials when only it carried a passport. With no passport on either page they did so in **39%**.
   - The effect is **+0.417** (95% interval +0.192 to +0.588). The registered success rule (≥ 0.20, lower bound above zero) is **MET**.
   - In 81% of those answers the stated reasons cite the passport.
2. **Against a rival with a fake passport, the advantage disappears for the pooled models:** 39%, exactly the baseline (effect +0.000, −0.215 to +0.215).
   - None of the three ever opened either product's independent record (0 of 72 trials where a record existed). So a passport that only *looks* real counts the same as a real one.
   - Claude chose the fake in 6 of 12 trials.
3. **The one model that checks the record is not fooled:**
   - Meta muse-spark-1.3 opened the independent record in **every** trial where one existed (24/24) and chose the genuine product in 12/12 against the fake.
   - Meta glimmer never opened a record; it chose the genuine product 6/12 against the fake, 12/12 against none.
4. **The models seldom choose when nothing separates the products:** "neither" in 61% of pooled baseline trials. The passport is what breaks the tie.

## Primary result (pooled: OpenAI, Kimi, Anthropic; 36 trials per condition)

| Condition | Oskvale page | Torvlund page | Oskvale recommended | "Neither" | Reasons cite the passport |
|---|---|---|---|---|---|
| C0 baseline | no passport | no passport | 14/36 (39%) [0.25, 0.55] | 22/36 | 0/36 |
| C1 | **genuine** | no passport | **29/36 (81%)** [0.65, 0.90] | 7/36 | 29/36 |
| C2 | **genuine** | **fake** | 14/36 (39%) [0.25, 0.55] | 15/36 | 24/36 |

- **H1 effect C1 − C0: +0.417 (+0.192, +0.588). Success rule MET.**
- **H2 effect C2 − C0: +0.000 (−0.215, +0.215).**
- In C2 the pooled models chose the fake Torvlund product in 7/36 trials: Claude 6, OpenAI 1.
- **Position:** of the 64 pooled answers that named a product, 30 (47%) chose the first link. There is no position effect to speak of, and every condition ran both orders equally.
- **Every trial fetched both product pages** (180/180). No errors and no missing answers: 180 of 180 trials usable.

## Meta (reported separately; OpenRouter fetch)

| Condition | Oskvale recommended | Oskvale record opened | Torvlund record opened |
|---|---|---|---|
| C0 | 7/24 (29%) | n/a | n/a |
| C1 | 24/24 (100%) | 12/24 (all spark) | n/a |
| C2 | 18/24 (75%) | 12/24 (all spark) | 12/24 (all spark) |

- Effects: C1 − C0 +0.708 (+0.465, +0.851); C2 − C0 +0.458 (+0.176, +0.651).
- Spark also opened the Oskvale passport page (24 trials) and the brand's declaration (23 trials). Glimmer opened none of them.

## Per model (descriptive; 12 trials per cell)

| Model | C0 | C1 | C2 | C1 − C0 | C2 − C0 | Records opened |
|---|---|---|---|---|---|---|
| OpenAI gpt-5.4-mini | 0/12 | 8/12 | 5/12 | +0.667 | +0.417 | 0 |
| Kimi k2.6 | 7/12 | 9/12 | 7/12 | +0.167 | +0.000 | 0 |
| Claude Haiku 5.5 | 7/12 | 12/12 | 2/12 (fake 6) | +0.417 | **−0.417** | 0 |
| Meta glimmer | 2/12 | 12/12 | 6/12 | +0.833 | +0.333 | 0 |
| Meta spark | 5/12 | 12/12 | 12/12 | +0.583 | +0.583 | 36 (every one offered) |

**Why Claude chose the fake** (its own reasons, all six in the Torvlund-first order):
- the fake's passport links "all stay on the store's domain", while the genuine passport's QR code and links point to another domain (oskvale.com, the brand's own site);
- the genuine product's manufacturer address, "Eksempelvej 1" (Danish for "Example Road"), "looks like a placeholder". It is one: the Study 6 fixtures used it so as not to name a real street.

The fake was built to fail only when checked. Without the check, these surface cues decided the choice.

## Predictions (A37 §5)

| # | Prediction | Result |
|---|---|---|
| P48 | Pooled H1 effect ≥ 0.20 with lower bound > 0 (~35%) | **True** (+0.417, +0.192) |
| P49 | H2 effect ≥ H1 effect (~55%) | **False** (+0.000 vs +0.417) |
| P51 | Record opened in ≥ 25% of pooled trials where present (~35%) | **False** (0/72) |
| P52 | At least one model recommends the genuine product in ≥ 80% of its C1 trials (~50%) | **True** (Claude, glimmer and spark 12/12) |
| P53 | "Neither" in ≥ 20% of pooled trials (~40%) | **True** (44/108, 41%) |

## What this means

- **A passport works as a tie-breaker.** Faced with two otherwise identical products, models mostly refuse to choose. Add a genuine passport to one, and every model except Kimi moves clearly toward it, citing the passport.
- **Mainstream models trust the look of a passport, not its truth.** OpenAI, Kimi and Claude never opened a record, so a convincing fake erased the genuine passport's advantage. Claude even preferred the fake when it looked more self-consistent. This matches Study 6, where a bare "Authentic" claim was trusted as much as a passport.
- **Checking works when it happens.** Spark opened the record every time it was offered and never chose the fake. The value of a ledger-backed passport is realised only through an independent, plain-language record that a model reads. No model in Studies 6 or 7 opened the raw explorer links (0 of 570 trials). Blockscout pages are built in the browser, so a fetcher that does not run the page's code sees only the page title.
- **For the protocol:** the advantage over fakes depends on making the check happen without the model choosing to check, for example through agent tools, marketplaces or a standard endpoint that query the record. It also depends on the genuine passport not looking less "consistent" than a fake: links on another domain are normal for a brand-issued passport, but a model may read them as a warning sign.

## Deviations and disclosures

1. **A38 (after the pilot).** The pilot (15 trials, excluded) showed spark reading the record's Study 6 sentence as proof that the legitimate shop was not the holder and refusing both products. James chose to drop the sentence before the counted run.
   - This was decided after seeing pilot data and can only help the genuine product.
   - The site bundle was unchanged (673cb70c); only the Worker's wording changed. The runner checked the live wording before the first trial.
2. **A39 (budget stop and resume).** The run stopped itself at 10:26 UTC after 89 trials: Kimi reached its USD 5.00 vendor limit, which Studies 6 and 7 share.
   - James raised Kimi's limit to USD 6.50, A39 was registered and pushed, and the remaining 91 trials ran from 10:29 UTC with `--resume`.
   - The site was closed for those 3 minutes. The two files are analysed together; together they hold every schedule index 0–179 exactly once.
3. **Interim look.** At 140 of 180 trials, James asked how the results looked, and an interim analysis was shown to him. Nothing about the run was changed afterwards; the run's remaining 40 trials were already scheduled.
4. **Background traffic.** The site log has 412 background rows inside trial windows (scanners on new domains), attributed away by fetcher identity as in A36. One trial had a vendor-only site fetch.

## Limits

- **The genuine product's address is a placeholder** ("Eksempelvej 1"). Claude noticed it, and it counted against the genuine passport in C2. A real brand's real address would remove this.
- **Domain asymmetry:** the genuine passport lives on the brand's domain, while the fake's lives on the shop's. This is realistic, but a model may read it as a warning sign.
- **Only Oskvale has a mainnet passport**, so brand is not counterbalanced. C0 measures the plain brand preference, and effects are taken against it.
- **Both brands and the shop are new**, with no reviews. The record service was built by the study team.
- **Cells are small** (36 pooled, 12 per model), so per-model numbers are descriptive.
- Gemini is postponed (A36): its own URL tool still does not read the new domains.

## Spend

| Item | USD |
|---|---|
| Tool check | 0.05 |
| Pilot | 0.30 |
| Counted run (180 trials; cap 11.00) | 4.19 |
| **Study 7 total** | **4.53** |
| Studies 6 + 7 and the knowledge probe, live ledger | 20.24 of USD 30 |

Per model, counted: spark 1.65, Kimi 1.39, OpenAI 0.76, Claude 0.20, glimmer 0.19.

## Files

- `results-archive/study7r-live-2026-10-24T09-36-02-666Z.jsonl`: trials 1–89.
- `results-archive/study7r-live-2026-10-24T10-29-32-059Z.jsonl`: the 91 resumed trials.
- `results-archive/pilot-study7r-live-2026-10-24T08-15-26-359Z.jsonl`: the pilot (excluded).
- `results-archive/site-log-2026-10-24T11-16-36-041Z.jsonl`: every site request since deployment (7,858 rows, 34 phase changes).
- `results-archive/study7r-counted-console-2026-10-24.log`: the run's console log.
- `analysis/study7r-live-results-2026-10-24.txt`: the full analysis output.
- **Command:** `python -I analysis/analyze_study7r_live.py <both counted jsonl files>`.
- The site is in phase **closed** (checked 11:16 UTC).
