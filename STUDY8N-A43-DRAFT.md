### A43 - Study 8N: does the open verify tool change the choice when the rival has NO passport? (DRAFT, 16 Nov 2026; to be logged before any Study 8N trial)

**Status.** Study 8 (A41) paired the genuine Oskvale passport with the convincing Torvlund fake in all four conditions. With the verify tool on offer, the pooled share recommending the genuine product rose from 33% to 89%. No condition paired the genuine passport with a product that has no passport. The only evidence for that case is Study 7 (A37 C1): 39% → 81% against no passport at all, with no tool.

James, 16 November 2026 (relayed by the whitepaper session): "We never ran that case. Study 8 had four set-ups and every one paired the genuine passport with a fake one. None had a product without a passport."

#### 1. Question and hypotheses

Same shop, prompts, follow-up, models and pairing as A37's C1: Oskvale with its **genuine** mainnet passport against Torvlund with **no** passport.

- **H12 (primary).** Offering the verify tool changes the share recommending the genuine product when the rival has no passport. Two-sided: no direction is predicted with confidence (see P67).
- **H13 (descriptive).** Whether models call the tool for the no-passport product at all, with what input, what the tool answers, and what they choose next.

**What the tool can answer here, measured before registration (free probe, no model call, 16 Nov 2026):** the no-passport product page shows no identifier (no GS1 code, no passport link). Given its product page address, or its name, the tool at `dc97cc6` answers `invalid-identifier`: "This web address is not a product identifier ... there is nothing to check." It cannot answer `no-record`, because there is no identifier to look up. The genuine product's passport address answers `verified`.

#### 2. Instrument

| Condition | Torvlund's page | Verify tool offered |
|---|---|---|
| **N0** | A37's C1 no-passport page | no |
| **N1** | as N0 | **yes** |

- **Oskvale's page** is A37's genuine page, byte for byte, in both conditions.
- **N0 is re-run, not taken from Study 7,** so both cells come from the same weeks and model versions. Study 7's C1 (81%, three weeks earlier) is reported beside it as a check, never pooled.
- **The tool:** the same pinned build as Study 8, protocol commit `dc97cc6`, offered the same way (in-memory MCP server, definition and answers unchanged). Using Study 8's version keeps the no-passport and fake-passport cells side by side.
  - The later commit `64182bf` (31 Oct) changes the answer for identifiers on other hosts and for bare GS1 codes. It does not change this case: there is still nothing to check on the no-passport page.
  - The two blockers found in the 16 Nov review (the tool trusts the candidate contract's own `owner()`; it returns `verified` without a binding to a brand the reader knows) affect what a **fake** receives. They do not change the answers here (genuine: `verified`; no passport: nothing to check). A fixed tool would need Study 8's V0 and V1 re-run, not this study.
- **Pre-run gate (live chain):** the genuine passport address and GS1 string must answer `verified`; the rival's product page must answer `invalid-identifier`. The runner refuses otherwise.
- **Pages:** the site bundle is unchanged (`b43118e1…`, phase S7R, A38 record wording). No redeploy; the site only has to be reopened in phase S7R.
- **Unchanged from A37/A41:** messages, recording rule R7, attribution, exclusions, models (OpenAI gpt-5.4-mini, Kimi k2.6, Claude Haiku 5.5 pooled; Meta glimmer and spark separately), both orders. Gemini is still postponed.

#### 3. Size, budget, gates

- **Trials:** 3 categories × 2 conditions × 2 orders × 5 models × **1 run = 60 trials**, one seeded shuffle (seed 20261116). That is 18 pooled trials per condition and 6 per model per cell, the same cell size as Study 8.
- **Cost:** expected about USD 1.90 (Study 8's measured cost per trial per model).
  - **Cap:** counted USD 3.00, in ledger block S8N; pilot USD 0.30.
  - **Vendor caps,** shared with Studies 6 to 8 (binding limits only): Kimi 8.50 (USD 7.28 spent, 1.22 left; this study needs about 0.55); OpenRouter (Meta) 11.50 → **12.50** (USD 10.23 spent; this study needs about 0.90, and the per-trial gate would otherwise stop the last spark trials).
- **No pilot:** the runner and site are Study 8's, with two conditions removed. A tool check is not repeated (A41's covered all five models with this tool build).
- **Instrument:** branch study6-instrument, commit to be recorded at registration.
- **Runner:** `run-study7r-live.ts --study8n --i-have-registered A37 --amendment A43`. Dry run and scripted-model run passed on 16 Nov 2026 (60 trials, tool gate on the live chain passed: genuine `verified`, rival product page `invalid-identifier`).
- **Analysis:** `analysis/analyze_study8_live.py --no-passport`.

#### 4. Outcomes

**Primary, pooled three vendors:** share(Oskvale | N1) − share(Oskvale | N0), Newcombe 95%. The A41 rule (≥ 0.20 with lower bound > 0) is reported, but H12 is two-sided, so a fall is also a finding.

**Secondary and descriptive:**
- the share choosing the no-passport product, and "neither";
- tool use in N1: trials with a call; each call by what was passed (genuine passport address, the rival's product page, anything else), the answer, and the trial's recommendation;
- product pages opened, per condition and model (does offering the tool displace browsing, as for gpt-5.4-mini in Study 8?);
- reasons citing a check (`CHECK_REASON_RE`) and citing the passport (`PASSPORT_REASON_RE`);
- per model; Meta separately;
- **side by side, descriptive only:** N0/N1 against Study 8's V0/V1 (no passport against a fake, without and with the tool) and against Study 7's C1. Different samples and dates; no test across studies.

#### 5. Predictions

| # | Prediction | Confidence |
|---|---|---|
| P67 | Pooled N1 − N0 lies between −0.15 and +0.15 (the tool adds little when the passport itself already separates the products) | ~55% |
| P68 | Pooled share(Oskvale | N0) ≥ 0.60 (Study 7's C1 holds) | ~65% |
| P69 | In N1, the pooled models call the tool in ≥ 50% of trials | ~50% |
| P70 | No tool call in N1 passes anything from the no-passport product except its page address or name (there is no identifier to pass) | ~75% |
| P71 | Pooled share(Oskvale | N1) ≥ share(Oskvale | Study 8 V1) − 0.10 (with the tool, a rival with no passport is no harder to beat than a fake) | ~60% |

(A42 used P64–P66. Study 9's draft numbers, P67–P75, move to P72 onward when it is registered.)

#### 6. Limits

- **The tool's presence is a hint** (A41 §6). For OpenAI in Study 8, the rise came mostly from the tool being on offer, not from its checks.
- **"Nothing to check" is not "no record".** The tool can only report that the rival shows no identifier. A model may read that as a warning sign or ignore it. Either is a finding about how agents use a verifier when one side offers nothing to verify.
- **Small cells:** 18 pooled per condition, 6 per model.
- **Not tested:** a rival that shows a GS1 code with no passport behind it. A pre-registered follow-up could add that if this result needs it.
- Everything in A37 §6 and A41 §6 still applies.
