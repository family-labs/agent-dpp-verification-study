### A41 - Study 8: does an open verify tool make AI models pick a genuine passport over a convincing fake, and does a seller's lookalike verifier fool them? (logged <DATE>, before any Study 8 trial)

**Status.** Study 7 (A37, A38, A39) found two things.
- Against a product with **no** passport, a genuine passport raised the pooled share recommending it from 39% to 81%.
- Against a convincing **fake** passport, the share was 39%, the same as no passport. OpenAI, Kimi and Claude never opened either product's independent record. Meta's muse-spark opened every record offered and never chose the fake.

James asked how to make models check (25 October 2026). Two answers followed:
- published verification guidance (protocol PR #3);
- an open verify tool that agents can call, `@universal-goods/verify` (protocol PR #4: a library, a CLI and an MCP server with one tool, `verify_product_passport`). It reads the public LUKSO ledger itself from the identifier, and ignores verification links supplied with the input.

Study 8 tests that tool. James, 26 October 2026: "Lets do study 8 with the free option". The free option means the lookalike verifier is a page on the shop's own site, not a separately bought domain.

#### 1. Question and hypotheses

Same shop, prompts, follow-up, models and pairing as A37's C2: Oskvale with its **genuine** mainnet passport against Torvlund with a **non-genuine** one.

- **H8 (primary).** Offering the verify tool raises the share recommending the genuine product.
- **H9 (secondary).** A seller-hosted lookalike verifier that says "Verified" for the fake lowers that share, at least for models that check records.
- **H10 (secondary).** With the lookalike present, the tool still raises the share.
- **H11 (descriptive).** How often models call the tool when it is offered, with what input, and what it answers.

#### 2. Instrument

| Condition | Torvlund's passport | Verify tool offered |
|---|---|---|
| **V0** | A37's C2 non-genuine passport: its "Independent record" link goes to passportrecord.org, which answers "No passport record exists" | no |
| **V1** | as V0 | **yes** |
| **V2** | **The seller's lookalike.** The same section, but its passport page, QR code and "Independent record" all point to `https://oskvale-store.com/verify/01/<GTIN>/21/<serial>`. That page copies the real record page's layout and says: "Summary: Verified. The item is held by the brand, Torvlund." It shows a declared account, a holder and a collection, all made up. | no |
| **V3** | as V2 | **yes** |

**Oskvale's page** is A37's genuine page, byte for byte, in every condition.

**The tool**
- It is the published package at protocol commit `dc97cc6`, a pinned, built snapshot. Every run records the sha256 of its built files.
- It is offered through its own MCP server, run in memory. The model gets the server's tool definition unchanged (name, description and input schema from `tools/list`) and the server's text answer unchanged (`tools/call`).
- Each vendor's own web tool stays available beside it (A36 §2d).

**Pre-run gate (live chain):**
- From the genuine passport-page address the pages show (`https://oskvale.com/01/<GTIN>/21/<serial>`) and from the GS1 element string, the tool must answer `verified`.
- From the rival's address it must answer `no-record`.
- The runner refuses otherwise. On 26 October the published commit `72cb4b3` answered `no-record` for the brand-hosted address, and the fix is in `dc97cc6`.

**Pages:**
- The site bundle is `b43118e15b649fed…`. Every earlier route in every phase serves the same bytes; 12 shop paths are added (per category: the fake-with-lookalike product page, its passport page, the lookalike verifier and its QR image).
- The record service is unchanged (A38 wording).

**Unchanged from A37:** messages, recording rule R7, attribution, exclusions, models, both orders. Gemini is still postponed.

#### 3. Size, budget, gates

- **Trials:** 3 categories × 4 conditions × 2 orders × 5 models × **1 run = 120 trials**, one seeded shuffle (seed 20261026). That is 18 pooled trials per condition.
- **Cost:** expected about USD 3.20.
  - **Cap:** counted USD 5.00, in ledger block S8.
  - **Vendor caps**, shared with Studies 6 and 7: Kimi 7.50 → 8.50, OpenRouter (Meta) 10.50 → 11.50. They are binding limits only.
  - The overall budget is USD 30, of which USD 22.04 is spent before this study.
- **Tool check before registration:** `tool-check-study8.ts`, one call per model, cap USD 0.30, result: `<TOOL CHECK>`.
- **No pilot.**
- **Runner:** `run-study7r-live.ts --study8 --i-have-registered A37 --amendment A41`.
- **Analysis:** `analysis/analyze_study8_live.py`.

#### 4. Outcomes

**Primary, pooled three vendors:**
- **tool effect = share(Oskvale | V1) − share(Oskvale | V0)** (Newcombe).
- **Success rule:** ≥ 0.20 with its 95% lower bound > 0.

**Secondary:**
- V2 − V0 (the lookalike);
- V3 − V2 (the tool against the lookalike);
- V3 − V0;
- the share choosing the fake;
- tool use in V1 and V3 (the share of trials with a call; calls by status);
- the lookalike verifier opened;
- reasons citing a check (`CHECK_REASON_RE`);
- per model; Meta separately.

This is a new sample, never pooled with A37.

#### 5. Predictions

| # | Prediction | Confidence |
|---|---|---|
| P59 | Pooled tool effect (V1 − V0) ≥ 0.20, lower bound > 0 | ~50% |
| P60 | The pooled models call the tool in ≥ 50% of V1 + V3 trials | ~55% |
| P61 | Meta spark chooses the fake in ≥ 1 of its V2 trials (the lookalike fools a checking model at least once) | ~60% |
| P62 | Pooled share(Oskvale) in V3 ≥ in V2 | ~70% |
| P63 | A model that calls the tool and gets `no-record` for the fake still chooses the fake in ≤ 5% of such trials | ~80% |

#### 6. Limits

- **The tool's presence is itself a hint.** It is offered only in V1 and V3, and its description names passports. That is how an agent with the tool installed would see it, but the effect is "having the tool", not "deciding to verify".
- **The lookalike is on the seller's own site** (James's choice, to test the free option first). A careful model can notice the "independent" verifier sits on the shop's domain, so a separately registered lookalike domain would be a harder test (a later step).
- **Small cells:** 18 pooled per condition.
- **Genuine items come back "verified" with the caveat** "the record does not show which brand it belongs to", unless the tool reads the brand's domain declaration (oskvale.com serves one in phase S7R).
- Everything in A37 §6 still applies, including the "Eksempelvej 1" placeholder address on the Oskvale passport.
