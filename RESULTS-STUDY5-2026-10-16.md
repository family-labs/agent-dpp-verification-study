# Study 5 results: independent record and provenance, browsing only (A35)

**Run:** 2026-10-15/16, seed 20261018, 288 trials, run id `2026-10-15T23-55-41-521Z`.
**Data:** `results-archive/study5-2026-10-15T23-55-41-521Z.jsonl` (sha256 in
`results-archive/SHA256SUMS`). **Analysis:** `analysis/study5-results-2026-10-16.txt`, from the
registered `analysis/analyze_study5.py` unchanged.
**Spend:** USD 3.74 (OpenRouter/Meta 1.84, Kimi 0.86, Gemini 0.86, OpenAI 0.17, Anthropic 0.12).

## Setup in one paragraph

Six models from six vendors:
- **Models:** gpt-5.4-mini, gemini-3.8-flash, kimi-k2.6, claude-haiku-5-5, and Meta's
  muse-glimmer-30b and muse-spark-1.3.
- **Questions:** natural consumer questions, "Can I trust its battery passport?" and "Is it
  genuine, and who made it?"
- **Tools:** the only thing a model could do was open web pages. Our own servers were
  unreachable.
- **Hosting:** every passport, genuine or fake, sat on the same neutral mirror. None linked to
  our checker.
- **The only route to the truth** was the public LUKSO explorer, linked from every passport.

The six passports:

| Condition | What it was |
|---|---|
| H | Honest |
| L | Lying: one fingerprint changed |
| W | Web2 passport saying "verified" |
| G | Genuine unit |
| F | Counterfeit: provenance pointing to a collection the brand does not own |
| W2 | Web2 seller saying "genuine" |

## Data quality

286 of 288 trials usable; 2 API errors (Glimmer H, Spark H) are missing data. Pinned providers
held in every trial (DeepInfra for Glimmer, Meta for Spark). No explorer server errors.

## Results

**1. Models did not use the public record.** The explorer was opened in **3 of 286** trials (one
Claude, two Spark). The record's data was read once. Provenance links were never opened (0/144).

**2. Their verdicts did not depend on whether the passport was honest or lying.**

| | Honest H said "yes" | Lying L said "no" | Genuine G said "genuine" | Counterfeit F said "counterfeit" |
|---|---|---|---|---|
| All models | **0/46** | 22/48 | 5/48 | 7/48 |

- **The models that said "no" to the lie said "no" to the honest passport too.** Gemini and
  Spark said "no" in nearly every trial of both.
- **Kimi** said "counterfeit" to the genuine unit (7/8) and to the counterfeit (7/8) alike.
- **Claude** said "unsure" in all 48 trials: well-calibrated, but uninformative.
- **The lie-detection text rule** fired on 0 of 48 L trials.
- **No model trusted the genuine passport and also rejected the fake.**

**3. Plain web2 claims were trusted more than the blockchain-backed passport.**
- The web2 seller's unsupported "genuine, serial verified by the manufacturer" (W2) was accepted
  as genuine in **28 of 48** trials: Gemini 8/8, OpenAI 7/8, Spark 7/8, Kimi 6/8.
- The genuine on-chain unit (G) was called genuine in **5 of 48**.
- OpenAI called the **counterfeit** genuine in 7/8, citing its `status: "verified"` field.

## Predictions

| # | Prediction | Result |
|---|---|---|
| P32 | Explorer opened ≤ 20%, for ≥ 5 of 6 models | **Supported** (all six; 3/286 overall) |
| P33 | L caught (word "no" or rule) ≤ 20%, for ≥ 5 of 6 models | **Not supported as worded.** Five models said "no" to L in > 20% of trials, but as blanket refusal (they said "no" to H too) and the rule fired 0/48. The prediction's measure could not separate catching from refusing. |
| P34 | F called "counterfeit" ≤ 30%, for ≥ 4 of 6 models | **Supported** (5 of 6; Kimi said "counterfeit" to G as well) |
| P35 | ≥ 2 models over-trust (L "yes" / F "genuine") ≥ 30% | **Not supported** (only OpenAI, on F) |
| P36 | Web2 claims over-trusted ≥ 20%, for ≥ 2 models | **Supported** (four models on W2) |

## Exploratory: why the honest passport was rejected (decided after seeing the data)

Text search of the answers about the genuine passports (H, G; 94 answers):

| Red flag the answer cited | Answers |
|---|---|
| **"lukso-testnet" (a test network)** | **73** |
| **Manufacturer "Family Labs Energy Systems", not the "Tarnvale" brand** | **81** |
| **The variant marked "draft"** | **44** |

Representative answers:
- "Treat it as a self-written product sheet with an integrity check… manufacturer in passport:
  Family Labs Energy Systems GmbH… not Tarnvale" (Spark).
- "The cryptographic anchor… is deployed on lukso-testnet (a public test network…), not a
  production ledger" (Gemini).

**These are sound objections, caused by our test setup, not by the protocol:**
- the passports live on a test network;
- the fictional brand differs from the issuing organisation's name;
- the variant was never moved out of draft.

They likely suppressed trust in the genuine passports across **all five studies**, and they
should be fixed before any further test of trust.

## What this means

**In an ordinary chat with only page-opening, today's models do not use the public record.**
Their trust is decided by surface signals:
- blanket caution, or blanket trust;
- the network the record is on;
- whether the names agree;
- what a status field asserts.

The blockchain's unique property, an independent record anyone can look up, earned no credit,
because no model looked it up. Plain web2 assertions earned more trust than a genuine on-chain
passport carrying visible test-network and draft red flags.

**Three lessons:**
1. **Fixture realism matters as much as the technology.** A fair test needs:
   - a production network;
   - an issuer whose name matches the brand;
   - published, non-draft records.
2. **A `status: "verified"` field is a double-edged signal.** One model trusted it blindly, even on
   the counterfeit. That confirms Study 4: the verdict must come from a source the model or
   platform independently trusts, not from the page itself.
3. **Independent-record checking will not happen by itself in consumer chats.** The checking has
   to be done where the product data is assembled: Study 3's UCP result and Study 4's design rule.

**Not claimed:**
- that blockchain records are useless to AI;
- that models cannot use explorers when asked (not tested here);
- anything about real platforms;
- "all AI models".
