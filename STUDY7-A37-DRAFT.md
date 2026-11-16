# Amendment A37 (Study 7: does a passport win the recommendation?). REGISTERED 2026-10-24 (appended to PREREGISTRATION.md).

**Redefined 24 October 2026 by James.** "The purpose of the study is to know if it would recommend this certain product that has a digital product passport over a product that doesnt or doesnt have a genuine passport". The measure is therefore **which product the model recommends**, not "does this seller have the item". This replaces the page-format draft of the same day.

**Registration rule.** No trial, counted or pilot, may run until all of these are done:
1. James approves this text;
2. the shop phase is deployed (section 2a);
3. the tool check has passed (section 2f);
4. the text is appended to `PREREGISTRATION.md` as `### A37` and pushed.

---

### A37 - Study 7: when a shopper asks an AI model to choose between two products, does the one with a genuine Digital Product Passport win? (logged 2026-10-24, before any Study 7 trial)

**Status.**
- **Studies 2–6.** Models seldom check a passport by themselves from a web page. In Study 6 no model opened the ledger record in 374 trials, and a passport was trusted no more than a bare "Authentic" claim.
- **Knowledge probe of 24 October 2026** (no tools, 5 models).
  - Four of five models know the battery passport duty: from 18 February 2027, Regulation (EU) 2023/1542, LMT / industrial > 2 kWh / EV.
  - They say they would recognise a passport by the words "Digital Product Passport", a captioned QR code, GS1 Digital Link paths and JSON-LD.
  - They say they would trust official records.
- **The commercial question.** None of this says whether a passport makes a model **recommend** a product. Study 7 asks that directly.

#### 1. Question and hypotheses

A shopper gives the model two comparable products and asks which to buy.
- **H1 (primary).** A product whose page carries a **genuine** passport is recommended more often than the same pairing when neither page carries one.
- **H2 (secondary).** Against a rival whose page carries a **non-genuine** passport, the genuine one is recommended more often than against a rival with none.
- **H4 (descriptive).** Models open the passport's independent record when choosing.

#### 2. Instrument

**2a. Where the products are sold.** One multi-brand shop, "Oskvale Store", on `https://oskvale-store.com` (James, 24 October 2026: use that domain, no new one), on the same Cloudflare Worker as Study 6, in site phase S7R. The shop's name contains "Oskvale". Any resulting lean toward the Oskvale product shows in C0 and is subtracted from every effect.
- Two fictional brands, each with three battery products of matched specification and price (EUR):

  | Brand | Battery passport |
  |---|---|
  | **Oskvale** | genuine: the three batteries tokenised on LUKSO mainnet (Study 6 fixtures) |
  | **Torvlund** | none of its own (a new fictional brand; no `.com` registered, no similar battery brand found, 24 October 2026) |
- Both brands' product pages use the same shop template, layout, length and wording pattern. Only the brand, model name and passport content differ.
- `noindex` and robots rules are as in A36.
- `oskvale.com` serves the brand's own site, with passport pages, declarations of conformity and the declaration file, so the genuine passport's links resolve. The copycat shop of Study 6 is not used.

**2b. Passport states of a product page:**

| State | What the page carries |
|---|---|
| **None** | The specifications, no passport section (as Study 6 W, without the "Authentic" claim). |
| **Genuine** | The passport section in its best form (Study 7 format F3), with:<ul><li>the title "EU Digital Product Passport: battery passport";</li><li>the regulation named;</li><li>a real QR code of the passport address, with a caption;</li><li>GS1 Digital Link `@id`;</li><li>JSON-LD;</li><li>"Independent record" linking `https://passportrecord.org/01/<GTIN-14>/21/<serial>`, which reads the holder live from the public ledger and states it in plain words.</li></ul>For Oskvale the record confirms "held by the brand, Oskvale". |
| **Non-genuine** | The same section, same layout, for the rival product, with plausible fields, but nothing behind it.<ul><li>Its "Independent record" address answers "No passport record exists on the public ledger for this product identifier".</li><li>Its ledger links point to an item that does not exist.</li></ul>It is a passport that looks right and fails when checked. |

**2c. Conditions** (per product category: LMT, industrial, stationary; C3, "none versus fake", was dropped by James on 24 October 2026 to stay within USD 30):

| Condition | Oskvale product | Torvlund product | Correct recommendation if the passport matters |
|---|---|---|---|
| C0 baseline | None | None | either (measures brand and position preference) |
| C1 genuine vs none | Genuine | None | Oskvale more often than in C0 |
| C2 genuine vs fake | Genuine | Non-genuine | Oskvale more often than in C0 |

**Order:** the two addresses appear in both orders, half the trials each, so position cannot explain a preference.

**Brand:** Torvlund never carries a genuine passport, because it has no mainnet record. C0 measures any plain preference between the two brands, and every effect is measured against C0.

**2d. Messages.**
- System: "You are a helpful assistant."
- User: "I'm looking for {an e-bike battery | a portable power station | a home battery}. I've narrowed it down to these two. Which one would you recommend I buy, and why?", then the two addresses, each with a share tag.
- Follow-up (same conversation, web tools off):

  ````
  Please sum up your answer as JSON, exactly in this form:
  ```json
  {"recommendation": "<1|2|neither>", "reasons": ["<short reason>", "..."]}
  ```
  "recommendation": the product you would recommend, 1 for the first link or 2 for the second.
  ````

No message mentions passports, records, verification or the regulation.

**2e. Models and tools.** As A36:
- gpt-5.4-mini (OpenAI web_search), kimi-k2.6 (Kimi fetch and web-search) and claude-haiku-5-5 (Anthropic web_fetch and web_search), **pooled**;
- Meta muse-glimmer-30b and muse-spark-1.3 (OpenRouter web_fetch), **separate**;
- Gemini postponed (A36 §2d).

Attribution by fetcher identity, background rows and evidence rules are as A36.

**2f. Size, budget, gates.**
- **Trials:** 3 categories × 3 conditions × 2 orders × 5 models × **2 runs** = **180 counted trials**, one seeded shuffle (seed 20261024).
  - The site serves all four conditions at once, because each product page has a fixed address per state (section 2g). There are no time blocks.
  - **Per condition, pooled:** 3 categories × 2 orders × 3 models × 2 runs = 36 trials.
- **Cost:** each trial reads two pages, so it costs about 1.5 times a Study 6 trial; expected about USD 10. **Caps:** counted USD 11.00, pilot USD 0.60. The gate uses the dearest measured Study 7 trial × 1.25 once the pilot has measured one.
  - About USD 14 of the USD 30 remains after Study 6.
- **Gates:** stimulus rebuild checks, site selftest (including the record service and the "no record" answer), live selftest, mainnet preflight.
- **Tool check (24 October 2026, USD 0.04; `harness/results/tool-check-study7-2026-10-24T08-03-30-606Z.json`):** each model was asked for the heading and first sentence of the shop's contact page and of a record page for a non-study identifier. **All five reached both hosts** and read both pages:
  - access-log rows from `ChatGPT-User`, `Claude-User`, `OpenRouter-WebFetch` (both Meta models) and Kimi's residential pool;
  - Claude and both Meta models quoted "No passport record exists ..."; OpenAI and Kimi quoted the page's first line (the GTIN and serial).
  - The live record service read the mainnet holder correctly ("held by the brand, Oskvale") the same morning.
- **Pilot:** one trial per model for each of C0 (Oskvale first), C1 (Torvlund first) and C2 (Oskvale first), on the LMT category (15 trials), labelled pilot and excluded.

**2h. Records and reasons.** Each trial records:
- which product was recommended, and its brand;
- whether each product page was fetched;
- whether each independent record was opened, Oskvale's and Torvlund's;
- whether the Oskvale passport page and the declaration were opened;
- whether the reasons cite the passport, the regulation or a record (a fixed pattern, `PASSPORT_REASON_RE` in `run-study7r-live.ts`).

**Rule R7:** the recommendation is taken from the last JSON block of the follow-up; "1", "2" or "neither". Anything else is missing data.

**2g. Page addresses.** Each product state has its own fixed address on `oskvale-store.com`, a neutral five-digit number such as `/products/32109`. The numbers are fixed in the manifest and do not reveal the state. The model sees only the number; the content differs by state. The shop's home, returns and contact pages do not link products, so a product's other state is never shown beside it.

#### 3. Outcomes

**Primary, pooled three vendors:**
- `share(Oskvale recommended | C)`, with Wilson 95% intervals, for each condition;
- **H1 effect = share(C1) − share(C0)** (Newcombe).

**Success rule:** H1 effect ≥ 0.20 with its 95% lower bound > 0.

**Secondary:**
- H2 effect = share(C2) − share(C0);
- "neither" rates;
- position effect (first versus second address);
- record opened (genuine and non-genuine);
- whether the reasons mention the passport, the regulation, the record or "no record";
- per model, and Meta separately.

#### 4. Exclusions

As A36: errored trials are missing data, provider and phase faults are excluded and counted, a missing or invalid recommendation is missing data, and nothing is re-run.

#### 5. Predictions

| # | Prediction | Confidence |
|---|---|---|
| P48 | Pooled H1 effect ≥ 0.20 with lower bound > 0 | ~35% |
| P49 | Pooled H2 effect ≥ H1 effect (a failing rival passport helps the genuine one more than no rival passport) | ~55% |
| P51 | The independent record is opened in ≥ 25% of pooled trials where one is present | ~35% |
| P52 | At least one model recommends the genuine-passport product in ≥ 80% of its C1 trials | ~50% |
| P53 | "neither" is the answer in ≥ 20% of pooled trials | ~40% |

#### 6. Limits

- **Brand is not fully counterbalanced.** Only Oskvale has a genuine mainnet passport. C0 measures the plain brand preference, and effects are measured against it. A second tokenised brand would remove this limit, at the cost of James's console time and a little gas.
- **Both brands and the shop are new and unknown.** Real shoppers' choices also weigh reviews and known brands; here both pages have no reviews.
- **The record service is built by the study team** (A37's earlier draft; see the notes).
- **A choice between two is a simplification** of real shopping.
- **Small cells:** 36 per pooled condition, so intervals are about ±0.2. Only a clear effect will show.
- Everything in A36 §6 still applies.

---

## Notes for James (not part of the amendment)

1. **Decided 24 October:** the shop is `oskvale-store.com`, selling both brands; C3 is dropped; 180 trials within USD 30.
2. **Still to do on Cloudflare:** switch off Browser Integrity Check on `passportrecord.org` (it was still on).
3. **Second genuine brand (optional, stronger).** If you tokenise and Sync three Torvlund products on mainnet (as you did for Oskvale), each brand can carry the genuine passport in half the trials. That fully removes the brand confound.
4. **What is reused:** the live sites, the vendor tools, the access log, the record service, the passport section in its F3 form, the runner, the scoring and the analysis approach. New work: the shop template for two brands, the Torvlund pages and fake passport, the two-address prompt, the recommendation scoring, and the "no record" answer.
5. **Gemini:** still postponed.
