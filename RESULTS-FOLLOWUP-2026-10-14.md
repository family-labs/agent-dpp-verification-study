# Follow-up results (A32): reworded notice, plain hosted passport, open-ended prompt

**Run:** 2026-10-14, seed 20261015, 210 trials, run id `2026-10-14T06-43-19-769Z`, after
platform PR #368 (the reworded battery notice) was live on testnet.
**Data:** `results-archive/followup-2026-10-14T06-43-19-769Z.jsonl` (sha256 in
`results-archive/SHA256SUMS`). **Analysis output:** `analysis/followup-results-2026-10-14.txt`,
from the registered `analysis/analyze_followup.py` unchanged.
**Spend:** USD 4.30 this run; study total USD 8.69 of the USD 10 ceiling.

The predictions were registered in A32 **after** Study 2's results were seen, and are
labelled so. Exploratory notes are marked.

## Data quality

- **Arm R:** 118 of 120 usable. 2 API errors (both kimi-k2.6, condition C) are missing data.
- **Arm O:** 88 of 90 usable. 2 responses without the JSON block are missing data (A9).
- **Instrument:** no instrument-invalid trial.

## Predictions

| # | Prediction | Result |
|---|---|---|
| P18 | Arm R: Kimi reports A `verified` ≥ 50% | **Supported.** 6/8 (75%); Study 2 S1 2/10, difference +55 points [+8.9, +77.9] |
| P19 | Arm R: GPT reaches the checker ≤ 20% | **Supported.** 1/32 on A–D |
| P20 | Arm R: Gemini stays ≥ 90% correct on A–D | **Supported.** 32/32 |
| P21 | Arm R: E reported `verified` ≤ 10%, every model | **Not supported.** Gemini 0/8, GPT 1/8, **Kimi 6/8** |
| P22 | Arm O: product link opened in < 50%, for ≥ 2 of 3 models | **Not supported.** Gemini 30/30, Kimi 29/30, GPT 3/30 |
| P23 | Arm O: checker reached ≤ 20%, every model | **Not supported.** **Gemini 24/24 unprompted**; GPT 0/24; Kimi 0/24 |
| P24 | Arm O: C flagged ≤ 20%, every model | **Not supported.** Gemini 5/5; GPT 0/6; Kimi 0/6 |

## Findings

### 1. With the notice reworded, Kimi's misreadings largely stopped (arm R)

Kimi's accuracy rose on the passports it had been misreading. Compared with Study 2's
matching template (S1):

| Condition | Study 2 (S1) | Arm R | Difference (points) |
|---|---|---|---|
| A, verified | 2/10 | 6/8 | +55 [+8.9, +77.9] |
| B, unverified | 3/10 | 7/8 | +57.5 [+11.5, +79.3] |
| C, invalid | 2/10 | 4/6 | +46.7 [−1.3, +74.3] |

Kimi's chain-following on A–D also rose, from 27/80 (34%) to 17/30 (57%).

This is a before-and-after comparison on two days with the same model ids, not a randomised
one (A32 §6). It supports "after the notice was reworded, Kimi's accuracy rose
substantially", not a claim about any single word.

**GPT's results show why Study 2's numbers needed reading with care.** Its accuracy on C
*fell*: 4/10 → 0/8 on S1, and 12/20 → 0/8 against all of Study 2. In Study 2 GPT almost
never reached the checker. It called C "invalid" because the old notice said the passport
was "not conformant": right for the wrong reason. With the notice reworded and still no
checker reached, it no longer does. So Study 2's GPT accuracy on C was an artefact of the
old wording.

### 2. Without a checker, one model took a plain hosted passport at its word (condition E)

E carries B's exact data, published as a plain document on an ordinary website with no
checker.

| Model | B called `verified` (our passport, checker answers "unverified") | E called `verified` (no checker) |
|---|---|---|
| Gemini | 0/8 | 0/8 |
| GPT | 2/8 | 1/8 |
| Kimi | 1/8 | **6/8** |

When a checker existed and answered honestly, Kimi called the unsigned passport
`verified` once in 8. When nothing could be checked, it called the same data `verified`
six times in 8. Gemini judged both correctly. E is our construction of a conventional
passport, not any vendor's product (A32 §6).

### 3. Unprompted, one model checked every passport; the others did not (arm O)

The open-ended prompt asked only for a sourcing recommendation.

| Model | Opened the product link | Reached the checker (A–D) | Caught C (rule C) | Caught D (rule D) |
|---|---|---|---|---|
| gemini-3.8-flash | 30/30 | **24/24** | **5/5** | **6/6** |
| kimi-k2.6 | 29/30 | 0/24 | 0/6 | 6/6 |
| gpt-5.4-mini | 3/30 | 0/24 | 0/6 | 1/6 |

- **Gemini, unasked:** opened the product link, then the checker, in every trial. It
  refused to stock every passport whose data had been edited after recording (C:
  do_not_stock 5/5), and it named the 6,000 versus 4,000 cycle discrepancy in every D
  trial. Its behaviour unprompted matched its behaviour when asked.
- **Kimi** read the passport nearly every time and caught every overstated page (D), which
  needs only a comparison. It never opened the checker, so it missed every edited passport
  (C) and recommended stocking all of them with caveats.
- **GPT** rarely opened the product link at all.
- **False positives:** rule C fired once on B (Gemini) and never on A or E; rule D never
  fired outside D.
- **Decisions:** no model chose a plain `stock` except one Kimi trial on E.

## What the follow-up adds to Study 2's claims

- **The thesis's existence claim holds unprompted, not only when asked.** An off-the-shelf
  model with only web access followed a product page's link to a smart-contract passport
  and its checker without being asked, and caught tampering every time
  (`gemini-3.8-flash`, 24/24 and 5/5).
- **The comparator matters, in the direction the thesis predicts.** One model treated a
  conventional hosted passport as verified in 6 of 8 trials, but our unsigned passport,
  whose checker said so honestly, in only 1 of 8.
- **How a passport describes itself is part of its interface with AI.** Rewording one
  platform notice was followed by large accuracy gains for one model, and removed false
  "invalid" answers from another.
- **Still not shown: "AI models in general".** Two of three cost-efficient models never
  reached the checker unprompted, and one rarely opened the product link at all.

**Not claimed:** competitor comparison (E is ours); "all AI models"; that a particular word
caused the change; physical authenticity; economic benefit.

## Correction (2026-10-15, after review by James)

The open-ended prompt in the follow-up's arm O (and later Study 3) was not a natural shopping
request. It cast the model as helping "a business buyer decide whether to stock this product
for sale in the EU". A real person asks something like "help me decide which battery to buy",
and never mentions the protocol behind the product data.

So "unprompted" in this file means **"not asked to check"**, not "a natural shopping request".
The comparison between the UCP listing and the web page still holds, because both arms used the
same framing. But the naming of UCP in arm U's prompt is a possible cue that arm H did not
have. Study 4 (to be registered as A34) repeats the question with a plain consumer request and
no mention of UCP, checking, evidence or the EU.
