# Study 8, Claude only: results, 26 October 2026

**Registration:** A41 (Study 8) and A42 (Claude only, Claude ladder), registered and pushed before the trials they cover. **This is a partial report.**
- Claude's part of A41 is complete (24 of 24 Claude Haiku trials).
- A41's OpenAI, Kimi and Meta trials wait for the OpenRouter top-up (A42 §1). A41's registered pooled result is reported once they have run.

**Runs (26 October 2026):**

| Run | Time (UTC) | Trials | USD |
|---|---|---|---|
| A41 first run | 23:54–00:14 | 35 (9 Claude Haiku) | 0.94 |
| A41 Haiku resume | 11:19–11:28 | 15 | 0.11 |
| A42 ladder | 11:28–11:42 | 18 of 20 (2 Fable trials skipped by its cap) | 5.49 |

The site was closed after each run. Output: `analysis/study8-claude-results-2026-10-26.txt`. Data and SHA256: `results-archive/`.

**What every trial compares:** two matched e-bike batteries (or power stations, or home batteries, for Haiku) on one shop. Oskvale has a **genuine** passport on the public ledger; Torvlund has a **convincing fake**.

| Condition | The fake's "Independent record" | Verify tool offered |
|---|---|---|
| V0 | Our real record page, which says "no record" | no |
| V1 | as V0 | **yes** |
| V2 | **The seller's lookalike verifier on the shop's own site**, which says "Verified" | no |
| V3 | as V2 | **yes** |

## The answer in four lines

1. **With the verify tool, every Claude model chose the genuine product every time:** Haiku 12/12, Sonnet 4/4, Opus 4/4, Fable 1/1. Every model called the tool in every trial where it had it. When the tool said "no record" for the fake, no model ever chose the fake.
2. **Without the tool, the smallest model is fooled and the larger ones are not.**
   - Haiku chose the genuine product in only 4 of 12 trials without the tool: the fake 4, neither 4.
   - Sonnet (4/4), Opus (4/4) and Fable (1/1) chose the genuine product every time.
3. **The larger models checked on their own.** Without being asked, they opened the independent record, the brand's declaration and even the ledger. They then reasoned about who vouches for what. Opus: "Product 1's passport, declaration of conformity and 'independent' record are all on the shop's own website, so none of it is independent."
4. **The seller's lookalike verifier fooled no model.** Sonnet, Opus and Fable opened it in 3 trials and still chose the genuine product. Their stated reason was that the "independent" check sat on the seller's own site. So this is the *easier* test (A41 §6). A lookalike on its own domain remains untested.

## By model

| Model | V0 (no tool) | V1 (tool) | V2 (lookalike, no tool) | V3 (lookalike + tool) | Tool used when offered | USD per trial |
|---|---|---|---|---|---|---|
| Claude Haiku 5.5 (A41, 3 categories) | genuine 2, fake 2, neither 2 | **genuine 6/6** | genuine 2, fake 2, neither 2 | **genuine 6/6** | 12/12 | 0.009 |
| Claude Sonnet 5.5 (A42, e-bike) | genuine 2/2 | genuine 2/2 | genuine 2/2 | genuine 2/2 | 4/4 | 0.16 |
| Claude Opus 5.5 (A42, e-bike) | genuine 2/2 | genuine 2/2 | genuine 2/2 | genuine 2/2 | 4/4 | 0.32 |
| Claude Fable 5.1 (A42, e-bike, V2 and V3 only) | not run | not run | genuine 1/1 | genuine 1/1 | 1/1 | 0.82 |

**Tool answers across the ladder:**
- the genuine product: `verified` 9;
- the fake's code: `no-record` 10;
- the fake's seller-hosted passport address: `invalid-identifier` 4. After that answer the models went on to check the GS1 code itself.

**What the larger models used without the tool (V0, V2):**
- the independent record (passportrecord.org) in 6 of 9 trials;
- the seller's lookalike in 3 of 5 V2 trials;
- the brand's declaration;
- the explorer.

Their reasons name:
- where each passport is hosted (the brand's own domain or the seller's);
- the independent record's answer;
- the brand's declaration of its ledger account;
- "the public blockchain record… still held by Oskvale's own account".

## Predictions (A42 §4)

| # | Prediction | Result |
|---|---|---|
| P64 | A larger Claude model opens the rival's record or verifier unprompted in V0 or V2 | **True** (Sonnet and Opus opened the rival's record; Sonnet, Opus and Fable opened the lookalike) |
| P65 | Every larger model given the tool calls it in ≥ 3 of its 4 such trials | **True** for Sonnet and Opus (4/4); Fable 1/1 (only one V3 trial ran) |
| P66 | No larger model recommends the fake in V3 | **True** |

**A41 Claude-related predictions:** P63 ("a model that gets `no-record` for the fake chooses it in ≤ 5%") is true for Claude: 0 of 24 tool trials (Haiku 12, ladder 12). The pooled predictions wait for the full A41.

## What this means

- **The tool closes the gap where it is needed most.** The smallest, cheapest model is the one most likely to sit inside high-volume shopping assistants, and it was fooled by a convincing fake in a third of its trials without the tool. With the tool it was never fooled, and it used the tool every time.
- **Larger models are already careful.** Sonnet, Opus and Fable read provenance like a careful human: who hosts the passport, whether the "independent" record is really independent, what the public record says. For them the tool adds speed and certainty (one call instead of several page reads) more than a different answer.
- **Hosting matters, and cuts both ways.** In Study 7, Haiku preferred the fake partly *because* its links all stayed on the shop's site. Here the larger models treated exactly that as a warning. A brand-hosted passport plus an independent record on a separate domain is the pattern careful models trust.
- **The next hard test is a lookalike verifier on its own domain.** Here the seller's own address gave it away, which is why A41 called this the easier case.

## Limits

- **Tiny cells.** Two trials per model and condition in the ladder, one for Fable; Haiku has six per condition. Descriptive only, with no success rule for A42.
- **Only one Claude model (Haiku) ran all three product categories;** the ladder ran the e-bike battery only.
- **The tool is offered, not discovered.** It is in the model's toolbox from the start, as an installed plug-in would be (A41 §6).
- **The lookalike was on the seller's own domain** (James's free option).
- Everything in A37 §6 still applies (a new shop and brands, the placeholder address).

## Spend

| Item | USD |
|---|---|
| A41 tool check (5 models) | 0.05 |
| A42 tool check (Sonnet, Opus, Fable) | 0.51 |
| A41 Claude Haiku (24 trials, in the A41 runs) | 0.22 |
| A42 ladder | 5.49 (Sonnet 1.28, Opus 2.57, Fable 1.64) |

- **Anthropic credit used for A42** (tool check + ladder + the Haiku resume): about USD 6.11 of the ~USD 10 James set aside.
- **A41 so far** (all models): USD 1.05.

## Files

- `results-archive/study8-live-2026-10-25T23-53-59-448Z.jsonl`: A41 first run (35 rows; scheduleIndex 34 spark errored, OpenRouter 402).
- `results-archive/study8-live-2026-10-26T11-19-41-816Z.jsonl`: A41 Claude Haiku resume (15 rows).
- `results-archive/study8c-live-2026-10-26T11-28-01-127Z.jsonl`: A42 ladder (18 rows).
- `results-archive/study8-console-2026-10-26.log`: the console log of all three runs.
- **Commands:**
  - `python -I analysis/analyze_study8_live.py --ladder <ladder jsonl>`
  - `python -I analysis/analyze_study8_live.py <A41 jsonl files>` (once A41 is complete)
