# Study 2 results: native interoperability (A28–A31)

**Run:** 2026-10-14, seed 20261014, 240 trials, run id `2026-10-14T00-39-03-229Z`.
**Data:** `harness/results/native-2026-10-14T00-39-03-229Z.jsonl` (git-ignored; archived
separately). **Analysis output:** `analysis/native-results-2026-10-14.txt`, produced by the
pre-registered `analysis/analyze_native.py` unchanged.
**Spend:** USD 4.32 main run, USD 4.39 including the pilot, against a USD 10 ceiling.

Everything under "Registered results" was specified before the first trial (A28 §6, A29,
A31). Everything under "Exploratory" was decided after seeing the data and is labelled so.
It may suggest explanations; it cannot confirm them.

## Data quality

240 of 240 trials usable. No instrument-invalid trial (the checker never returned a verdict
that disagreed with preflight), no API error, no unparseable report. Models as returned by
the APIs: `gpt-5.4-mini-2026-03-17`, `gemini-3.8-flash`, `kimi-k2.6`.

## Registered results

### Primary: native check rate (A, C and D; correct verdict AND both links fetched)

| Model | A | C | D | Pooled A+C+D |
|---|---|---|---|---|
| gemini-3.8-flash | 20/20 | 20/20 | 20/20 | **60/60, 100% [94.0, 100]** |
| gpt-5.4-mini | 1/20 | 1/20 | 0/20 | 2/60, 3.3% [0.9, 11.4] |
| kimi-k2.6 | 4/20 | 6/20 | 4/20 | 14/60, 23.3% [14.4, 35.4] |

Wilson 95% intervals.

### Accuracy of the verdict, any path

| Model | A verified | B unverified | C invalid | D mismatch |
|---|---|---|---|---|
| gemini-3.8-flash | 20/20 | 20/20 | 20/20 | 20/20 |
| gpt-5.4-mini | 1/20 | 11/20 | 12/20 | 3/20 |
| kimi-k2.6 | 6/20 | 5/20 | 6/20 | 20/20 |

### Predictions

| # | Prediction | Result |
|---|---|---|
| P12 | Chain-following ≥ 70% of A, C, D for ≥ 2 of 3 models | **Not supported.** Gemini 60/60; GPT 5/60; Kimi 20/60 |
| P13 | A correct ≥ 85% for ≥ 2 of 3 models | **Not supported.** Gemini only |
| P14 | Among chain-followers, C reported invalid ≥ 80% | **Supported.** 27/27, 100% [87.5, 100] |
| P15 | D caught less often than C, every model | **Not supported.** Gemini 100 vs 100; Kimi 100 vs 30; GPT 15 vs 60 |
| P16 | Conventional over-trust (B called verified) ≤ 10%, every model | **Supported.** Gemini 0/20, GPT 0/20, Kimi 2/20 |
| P17 | S1 − S2 accuracy within ±15 points, every model (equivalence) | **Partly.** Point estimates all within ±15; intervals within ±15 for Gemini only (GPT −7.5 [−27.0, +12.9]; Kimi −7.5 [−27.9, +13.8]) |

### Other registered outcomes

- **Chain-following:** Gemini 80/80; Kimi 27/80; GPT 5/80. Every model fetched the product
  link in at least 79 of 80 trials. The drop is at the second hop, from passport to checker.
- **Pooled regression** (Firth, because the Gemini cells separate perfectly): the model
  terms dominate (GPT −6.0, Kimi −5.5 on the log-odds scale, both p < 0.0001). The template
  term is not distinguishable from zero (+0.34 [−0.32, +1.00]), so whether the page was the
  brand's own store or a retailer made no detectable difference.
- **Decisions:** no model chose a plain "stock" in any trial. On B, C and D the dominant
  decision was "do not stock" (45, 53 and 52 of 60).
- **Citations against the fetch log:** Gemini cited 7 URLs it never fetched (in 7 trials); Kimi
  51 (in 48 trials); GPT 97 (in 71 of 80 trials).

## Exploratory (decided after seeing the data)

**E1. Reaching the checker and being right go together.** Across all models, trials that
fetched the verification link were correct 100/112 (89%); trials that did not were correct
44/128 (34%). This is correlational: models choose whether to follow, and the split is
largely between models.

**E2. The platform's own granularity warning explains almost every wrong answer.** Every
model-level battery passport carries a platform notice that a battery passport is per
individual battery and so is not conformant when served at variant level. It is identical
across A, B and C, so it reveals no condition. All three models saw and mentioned it (237
of 240 trials). Gemini treated it as a statement about passport granularity and answered
correctly every time. GPT and Kimi treated it as an integrity or conformity failure: **95 of
their 96 wrong answers cite it.** Kimi in particular answered `mismatch` on 14 of 20
verified passports, quoting the warning.

**E3. Fabricated evidence.** GPT's `evidence_used` named URLs absent from its own fetch log
in 71 of 80 trials. An agent's account of what it checked cannot be taken at face value. The
fetch log, not the self-report, is the evidence.

## What this supports

Within A28 §7's limits:

- **Supported, as an existence result:** an off-the-shelf model with only web access can
  follow a product page's link to a smart-contract passport and its checker, and reach the
  right verdict. `gemini-3.8-flash` did so in 80 of 80 trials, including every passport whose
  data was edited after recording (20/20) and every page that overstated its passport
  (20/20), and it never called the conventional passport verified (0/20).
- **Supported:** with a conventional hosted passport there was nothing to check, and models
  almost never pretended otherwise: 2 of 60 B trials were called verified, both by Kimi.
- **Not supported:** that this happens across AI models generally. Two of three
  cost-efficient models mostly stopped at the passport and did not open the checker, and
  were misled by a platform notice.

**Not claimed:** any competitor comparison; "all AI models"; spontaneous behaviour (the
prompt asks the model to check evidence); physical authenticity; that the anchor rather
than the signature is the cause (no signed-but-unanchored arm); economic benefit.

## Independent check (A31 §5, a demonstration outside the predictions)

`evidence/independent_check.py` reads fixture A's anchor from LUKSO testnet through a public
RPC that is not ours (`rpc.testnet.lukso.network`) and compares it with the sha256 of the
archived credential. Result on 2026-10-14: **MATCH**
(`0xa7e824d12f0c6174d708daf9bd20eee5839d327b1bfbe4ba613bf5ba604d1a44`), with no call to any
Universal Goods service. Standard library only.
