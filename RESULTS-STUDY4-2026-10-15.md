# Study 4 results: a plain shopping question (A34)

**Run:** 2026-10-15, seed 20261017, 160 trials, run id `2026-10-15T05-39-42-094Z`.
**Data:** `results-archive/study4-2026-10-15T05-39-42-094Z.jsonl` (sha256 in
`results-archive/SHA256SUMS`). **Analysis output:** `analysis/study4-results-2026-10-15.txt`, from
the registered `analysis/analyze_study4.py` unchanged.
**Spend:** USD 1.03 (Gemini 0.44, Kimi 0.44, OpenAI 0.15, Anthropic 0.06).

The predictions were registered in A34 after Studies 2–3 and two smoke rounds had been seen.
Exploratory notes are marked.

## Setup in one paragraph

A person asks: "Help me decide which battery to buy for backup power at home." The platform runs
the product search, as Google AI Mode does, and the model sees four comparable fictional
batteries in a random order. Ours sits mid-field on specs and price. Our listing carries
nothing, a genuine passport (P), a tampered one (T) or an unsigned one (U). After answering,
the model is asked to pick one product.

## Data quality

160 of 160 trials usable. Every trial had the platform search and a valid pick, and every
answer was in English.

## Results

**1. In a natural conversation, no model checked any passport.**
- **Checker:** reached in 0 of 120 trials that carried a passport.
- **Passport:** opened in 3 of 120 (Gemini, one in each of P, T and U).
- **Tampering:** flagged in 0 of 40.

**2. The products' specs and price decided the pick, not the passport.**

| Model | Picks in this run |
|---|---|
| Gemini | Wexmoor W5 (highest output), 40/40 times |
| GPT | Mostly Corrandel PS5000 (cheapest, most cycles) |
| Kimi | Split between Corrandel and Wexmoor |
| Claude | Split, and the only model that sometimes picked ours |

Our product was picked 8 times in 160.

| Model | P (genuine) | T (tampered) | U (unsigned) | N (no passport) |
|---|---|---|---|---|
| claude-haiku-5-5 | 3/10 | 1/10 | 3/10 | 0/10 |
| gemini-3.8-flash | 0/10 | 0/10 | 0/10 | 0/10 |
| gpt-5.4-mini | 0/10 | 1/10 | 0/10 | 0/10 |
| kimi-k2.6 | 0/10 | 0/10 | 0/10 | 0/10 |

- **Claude** picked ours 3/10 with any passport field present (genuine or unsigned) and 0/10
  without, a difference of +30 points with a 95% interval of −3.8 to +60.3. It is suggestive
  but not established at this sample size.
- **The other three models showed no difference.**
- **Pooled model:** "a genuine passport" carried a positive coefficient (Firth, p = 0.046), driven
  by Claude.

**3. A tampered passport was not punished.** No model checked, so the tampered passport
carried the same weight as the genuine one, where it carried any.

## Predictions

| # | Prediction | Result |
|---|---|---|
| P29 | Checker reached unprompted ≤ 20%, for ≥ 3 of 4 models | **Supported** (0% for all four) |
| P30 | No detectable passport advantage (P − N within ±15 points), for ≥ 3 of 4 models | **Supported** (3 of 4; Claude +30, interval includes 0) |
| P31 | Tampering mostly not punished (T below P by ≥ 15 points for at most 1 of 4 models) | **Supported** (only Claude, +20, interval includes 0) |

All three sober predictions held.

## Exploratory (decided after seeing the data)

**E1. A passport field was presented as a trust signal without being checked.** Gemini's answers
described our passport with words like "verified", "compliance", "traceability" or "registered",
without opening the checker:

| Passport | Gemini answers using that framing |
|---|---|
| Genuine | 10 of 10 |
| **Tampered** | **8 of 10** |
| Unsigned | 4 of 10 |

One answer about the tampered passport called it "a Digital Product Passport for verified battery
lifecycle compliance". The other models rarely mentioned the passport at all. The presence of
passport fields is being read as a credential in itself. Unless someone checks, a forged or
tampered passport earns the same credit as a genuine one.

**E2. Selection was close to deterministic per model.** Gemini picked the same product in all 40
trials. With one competitor clearly "best" on each model's preferred attribute, a mid-field
product rarely wins, whatever it carries. A passport cannot overcome a spec gap in this setting.

## What Studies 2–4 now say together

| Setting | Result |
|---|---|
| Asked to check (Study 2) | One model checks every passport correctly; others often stop before the checker |
| Not asked to check, but a framed business-sourcing task (follow-up, Study 3) | As a web link, one model in four checks. As named catalog fields (UCP), all four check and catch tampering |
| A natural shopping question, with the platform doing the search (Study 4) | No model checks. The passport hardly moves the pick, and one model presents an unchecked, even tampered, passport as a mark of trust |

**The honest conclusion:** smart-contract passports **can** be checked by AI models, and the
technology works when they look. But in a natural shopping conversation today, models do not
look. Worse, a passport field can be mistaken for a guarantee. The check therefore has to happen
**where the platform assembles the product data**, not be left to the model's initiative. That
means a platform or catalog service that verifies the passport and passes the model the verdict,
not just the link. That is a design requirement for the UCP extension and for any "Connect"
integration.

**Not claimed:** anything about real platforms' ranking; that passports never help selection (Claude's
signal is suggestive, and the sample is small); "all AI models"; physical authenticity; economic
benefit.
