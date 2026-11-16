# Study 7 format test results, 25 October 2026

**Question:** must a product page show the full, technical passport section, or does one plain line naming the passport win the recommendation just as well?

**Registration:** A40, registered and pushed 25 October 2026 before any trial (`PREREGISTRATION.md`, commit f2cae45). The QR-only version was dropped by James before registration.

**Run:** 25 October 2026, 03:56–05:12 UTC, 90 of 90 trials, no errors, USD 1.80. The site is in phase closed. Full output: `analysis/study7b-live-results-2026-10-25.txt`. Raw data and SHA256: `results-archive/`.

## The answer in three lines

1. **The one-line passport mention works exactly as well as the full block.** With ChatGPT, Kimi and Claude pooled:
   - no passport: Oskvale recommended 22%;
   - full block: 78%;
   - **one line: 78%**.

   The line's effect is **+0.556** (95% interval +0.230 to +0.743), so the registered success rule (≥ 0.20, lower bound above zero) is **MET**. The difference between the line and the full block is +0.000 (−0.265 to +0.265).
2. **The full block replicates Study 7:** +0.556 here against +0.417 in A37.
3. **The models name the line in their reasons**, for example "Includes an EU Digital Product Passport and independent verification link". Of all 26 recommendations of the minimal-line product:
   - 24 cite the passport;
   - 24 cite the EU rules or compliance;
   - 18 mention verification.

## Primary result (pooled: OpenAI, Kimi, Anthropic; 18 trials per condition)

| Oskvale page (Torvlund: no passport) | Oskvale recommended | "Neither" | Reasons cite the passport | Record opened |
|---|---|---|---|---|
| C0 no passport | 4/18 (22%) [0.09, 0.45] | 14/18 | 0/18 | n/a |
| CF full block | 14/18 (78%) [0.55, 0.91] | 3/18 | 13/18 | 0/18 |
| **CM one line** | **14/18 (78%)** [0.55, 0.91] | 4/18 | 12/18 | 1/18 (Claude) |

**Effects:**
- CF − C0: +0.556 (+0.230, +0.743);
- **CM − C0: +0.556 (+0.230, +0.743), MET;**
- CM − CF: +0.000 (−0.265, +0.265).

**Meta (separate):**
- C0 4/12, CF 12/12, CM 12/12.
- Spark opened the record and the passport page in every passport trial (12/12); glimmer never did.

**Per model** (6 trials per cell, descriptive):

| Model | C0 | CF | CM |
|---|---|---|---|
| OpenAI | 0/6 | 3/6 | 3/6 |
| Kimi | 2/6 | 5/6 | 5/6 |
| Claude | 2/6 | 6/6 | 6/6 |
| glimmer | 1/6 | 6/6 | 6/6 |
| spark | 3/6 | 6/6 | 6/6 |

**Position:** of the answers naming a product, 36–50% chose the first link in each condition. There is no position effect.

## Predictions (A40 §5)

| # | Prediction | Result |
|---|---|---|
| P54 | Pooled CM effect ≥ 0.20, lower bound > 0 (~50%) | **True** (+0.556, +0.230) |
| P56 | Pooled CF effect ≥ 0.20, lower bound > 0 (~65%) | **True** (+0.556, +0.230) |
| P57 | share(CM) ≤ share(CF) (~70%) | **True** (equal, 14/18 each) |
| P58 | Pooled models open the record in ≥ 10% of CM trials (~15%) | **False** (1/18, 6%) |

## What this means

- **For clients:** a single line of real text is enough for AI models to recognise the passport and prefer the product. For example: "EU Digital Product Passport: compliance, materials and origin record for this product. View passport · Verify independently". The long field table adds nothing measurable. The line must be page text, not an image, and not something a script draws after the page loads.
- **Limits that still apply.** The line wins against a product with **no** passport. Study 7 showed that against a convincing fake, the pooled models do not check, and the advantage disappears. The line includes "Verify independently", but only spark (and Claude once) followed it.

## Limits

- **Small cells** (18 pooled per condition), so this test cannot rule out a modest difference between the line and the full block (interval ±0.27).
- **Battery products only.** The line's word "compliance" draws on the battery rules; for a fashion product the wording and the effect may differ.
- **Placement and content are tested together:** the line sits in the product summary, the block below the specifications.
- **Designed after seeing A37's results**, using the words models cited there.
- **A37 §6 still applies:** new brands and shop, no reviews, a record service built by the study team, and only Oskvale with a mainnet passport. One Kimi answer gave "house brand" (Oskvale Store selling Oskvale) as a reason; C0 measures that preference.

## Spend

| Item | USD |
|---|---|
| Format test, 90 trials (cap 3.00) | 1.80 |
| Live studies total (Studies 6, 7, this test, knowledge probe) | 22.04 of USD 30 |

## Files

- `results-archive/study7b-live-2026-10-25T03-55-54-202Z.jsonl`: the 90 trials.
- `results-archive/study7b-console-2026-10-25.log`: the run's console log.
- `analysis/study7b-live-results-2026-10-25.txt`: the full analysis output.
- **Command:** `python -I analysis/analyze_study7b_live.py <jsonl>`.
