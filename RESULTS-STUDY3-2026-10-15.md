# Study 3 results: the passport delivered through the Universal Commerce Protocol (A33)

**Run:** 2026-10-14/15, seed 20261016, 440 trials, run id `2026-10-14T23-38-42-887Z`, against
our UCP test endpoint on testnet (platform PR #372).
**Data:** `results-archive/study3-2026-10-14T23-38-42-887Z.jsonl` (sha256 in
`results-archive/SHA256SUMS`). **Analysis output:** `analysis/study3-results-2026-10-15.txt`, from
the registered `analysis/analyze_study3.py` unchanged.
**Spend:** USD 7.29 (Gemini 4.46, Kimi 2.11, OpenAI 0.40, Anthropic 0.38), each within its cap.

The predictions were registered in A33 after Study 2, the follow-up and four smoke trials had
been seen. Exploratory notes are marked.

## Data quality

440 of 440 trials usable. No errors, no missing reports, no instrument-invalid trial. Models as
returned: `claude-haiku-5-5`, `gemini-3.8-flash`, `gpt-5.4-mini-2026-03-17`, `kimi-k2.6`.

## Primary result: delivery through UCP

**Question:** did the model reach the checker on passports A to D, unprompted?

| Model | Web page (arm H) | UCP listing (arm U) | Difference (95% interval) |
|---|---|---|---|
| claude-haiku-5-5 | 2/40 (5%) | **40/40** | **+95 points** [+80.5, +98.6] |
| kimi-k2.6 | 1/40 (2.5%) | **40/40** | **+97.5 points** [+83.9, +99.6] |
| gpt-5.4-mini | 0/40 | **33/40** (82.5%) | **+82.5 points** [+65.6, +91.3] |
| gemini-3.8-flash | 40/40 | 40/40 | 0 [−8.8, +8.8] |

**Caught the passport edited after recording (C, rule C), unprompted:**

| Model | Web page | UCP listing |
|---|---|---|
| claude-haiku-5-5 | 2/10 | **10/10** |
| kimi-k2.6 | 0/10 | **10/10** |
| gpt-5.4-mini | 0/10 | **9/10** |
| gemini-3.8-flash | 10/10 | 10/10 |

The same models and the same products were run on the same day, in one shuffled schedule. On
a web page, three of four models almost never opened the checker without being asked. Given
the same passport as named fields in a UCP catalog listing, they opened it in nearly every
trial and caught the tampered passport.

## Predictions

| # | Prediction | Result |
|---|---|---|
| P25 | UCP reaches the checker ≥ 20 points more often than the web page, for ≥ 2 of the 3 non-Gemini models | **Supported**, 3 of 3 (+95, +97.5, +82.5) |
| P26 | Gemini reaches the checker in ≥ 90% of A–D trials in both arms | **Supported** (40/40 and 40/40) |
| P27 | Arm U: C flagged in ≥ 50% of C trials for ≥ 3 of 4 models | **Supported**, 4 of 4 (10, 10, 9, 10 of 10) |
| P28 | Arm R-claude: Claude reports A `verified` ≥ 85% | **Not supported** (0/8; see note 1) |

## Other results

- **The overstated page (D):** caught by Claude, Gemini and Kimi in both arms (10/10 each).
  `gpt-5.4-mini` caught it in neither arm (0/10, 0/10).
- **Catching tampering did not always change the decision.** In arm U, Claude and Gemini
  refused to stock every tampered passport (C: do_not_stock 10/10 each). Kimi flagged all 10 but
  recommended "stock with caveats" in 8; GPT flagged 9 but recommended "stock with caveats" in 7.
- **Plain hosted passport (E),** where over-trust cannot be measured without a status question:
  - No model chose a plain `stock`. The registered decision distribution is in the analysis
    output.
  - `gpt-5.4-mini` opened E's link 1/10 times from UCP and 0/10 from the page.
- **Rule C false positives:** rule C fired on the unsigned passport B in arm U for Claude (5/10)
  and Gemini (3/10). These models wrote that B "failed" verification, when the checker had
  answered that nothing was signed. C's flag rates are therefore an upper bound for those two
  models. It never fired on A or E.
- **Arm R-claude (asked to check):**

  | Condition | Correct | Note |
  |---|---|---|
  | B | 8/8 | |
  | C | 8/8 | |
  | D | 8/8 | |
  | E | 8/8 | Never called the plain hosted passport verified |
  | A | **0/8** | See note 1 |

## Notes (exploratory)

**1. Why Claude never said "verified" on the genuine passport.** Claude reached the checker on
A and read `verified` in its trials, then answered `unverified` on the *compliance claim*. Its
reasons:
- the passport's declaration-of-conformity document could not be opened (the fixture data links
  it to a host that does not exist);
- the variant is marked `draft`;
- the responsible operator is not verified.

It separated "the data is unchanged" from "the product is compliant". That is a defensible
reading of our own definition ("supported by evidence whose integrity you confirmed"). The
unreachable document is a flaw in our fixture data, and it may have pushed other models away
from `verified` in earlier runs too. A future run should host the documents the passport cites.

**2. The UCP effect has more than one possible cause.** The UCP listing differs from the web
page in format, and it names the checker explicitly (`verification_url`). Study 3 shows that
this delivery works much better than a link on a page. It does not separate whether the field
name, the JSON format or the missing page layout does the work (A33 §6). The listing is our
construction of what a UCP platform would hand a model, not the output of a real platform.

## What this adds

Across Studies 2 and 3:
- **"Can":** an off-the-shelf model can follow a product's passport to its checker and catch
  tampering.
- **"Does, unprompted":** this depends heavily on **how the passport reaches the model.** As a
  link on a web page, one model in four checked unprompted. As structured fields in a UCP
  catalog listing, all four did, and all four caught the tampered passport.

**Not claimed:**
- that any real UCP platform passes our extension through;
- that the field name alone is the cause;
- competitor comparison, "all AI models", physical authenticity, or economic benefit.

## Correction (2026-10-15, after review by James)

The open-ended prompt in Study 3, and in the follow-up's arm O, was not a natural shopping
request. It cast the model as helping "a business buyer decide whether to stock this product
for sale in the EU". In arm U it also named the source, "the merchant's catalog (Universal
Commerce Protocol)". A real person asks something like "help me decide which battery to buy",
and never mentions the protocol behind the product data.

So "unprompted" in this file means **"not asked to check"**, not "a natural shopping request".
The comparison between the UCP listing and the web page still holds, because both arms used the
same framing. But the naming of UCP in arm U's prompt is a possible cue that arm H did not
have. Study 4 (to be registered as A34) repeats the question with a plain consumer request and
no mention of UCP, checking, evidence or the EU.
