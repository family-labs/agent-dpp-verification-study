### A40 - Study 7 format test: does a minimal passport mention still win the recommendation? (logged 2026-10-24, after the Study 7 results, before any format-test trial)

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
