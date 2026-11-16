# Amendment A36 (Study 6, live-site version). REGISTERED 2026-10-23 (appended to PREREGISTRATION.md).

This file is a draft for James. It is **not** part of `PREREGISTRATION.md`.

**Registration rule.** No trial, counted or pilot, may run until the text between the two rules below has been:
1. edited as James decides;
2. completed with the tool-check findings (placeholders `{{...}}`);
3. appended to `PREREGISTRATION.md` as `### A36`;
4. pushed to the private study repo.

`run-study6-live.ts` refuses any API run without `--i-have-registered A36` and that heading.

**History.**
- **23 October 2026:** rewritten for the live-site design James chose that day. It replaces the 22 October draft, in which the harness served the pages as stored text.
- **Unchanged from that draft:** the products, brand, conditions G/F/W, arms D0/D1, the pooled success rule and the report format.
- **Plan in plain English:** `STUDY6-LIVE-PLAN.md`.

---

### A36 - Study 6: does a brand's own declaration let AI models tell who really has the item, browsing live websites with their own web tools? (logged 2026-10-23, before any Study 6 trial)

**Status.** Studies 2 to 5 are complete. In Study 5 the public explorer was opened in 3 of 286 trials.

James's decisions, in order:
- **20 October 2026**
  - The focus is the brand-domain declaration.
  - GTINs only, under GS1 prefix 952 (reserved for demonstrations).
- **21 October 2026**
  - Condition F is a copycat brand shop on a similar but different domain.
  - The primary result is pooled across models, and each model's result is descriptive.
  - Network: LUKSO mainnet, chain ID 42.
- **22 October 2026**
  - The products are batteries.
  - The brand is simulated as a real brand, "Oskvale", with no disclosure line anywhere.
- **23 October 2026**
  - The shops are **live websites**, read by each model with its **own vendor's web tool**, as a real user would: they paste a product address and ask.
  - **Budget:** USD 30 for all mainnet study work.
  - **Order:** the D0 trials run first; then the declaration file is published and the D1 trials run.
  - **Hosting:** the sites carry `noindex`, allow AI fetchers in robots.txt, have a basket that does nothing, and come down after the study.

Design: `STUDY6-DESIGN-DRAFT.md`, `STUDY6-LIVE-PLAN.md`. Instrument: branch `study6-instrument` (commit 3efb475); site bundle `79f0064a4d4150bfa43492b374c18c54bac8bc04e3bb2eb2a5823e983b0f02ad`.
Tool check: 23 October 2026, `evidence/study6-tool-check-2026-10-23.md` (section 2e).
Pilot trials seen before this entry: none. The tool check (section 2e) is not a trial.

#### 1. Question and hypotheses

A passport block can be copied onto any page, and a whole shop can be copied onto a lookalike domain. Two things cannot be copied:
- the brand's declaration on its own domain, `/.well-known/product-passports.json`, which names the brand's website, its ledger account and its collections;
- the ledger record, which shows the item's current holder.

The hypotheses:
- **H1 (primary).** Pooled over three low-cost models, each browsing with its own vendor's web tool, adding the declaration (arm D1) improves how well they tell the brand's own shop (G) from a copycat shop (F). The copycat copies the brand's pages, battery passport included, and presents itself as the brand's shop. The measure is the answer to "does this seller actually have the item?".
  - The three models are gpt-5.4-mini, kimi-k2.6 and claude-haiku-5-5, the vendors whose own tools read the shops at the tool check.
- **H2 (secondary, descriptive).** The gain differs by model, including the worst of the three. No hypothesis test is made per model. These are reported **separately**, never pooled with the three:
  - The two Meta models (muse-glimmer-30b, muse-spark-1.3), which have no web tool of their own and browse with OpenRouter's fetch tool.
  - gemini-3.8-flash with its **own** tools, in a postponed block of its own. It runs only once Gemini's URL tool reads the brand-new domains, which it refused at the tool check (section 2e). **No Gemini trial runs before then** (James, 23 October 2026).
- **H3 (secondary).** Models rarely open the declaration or the explorer record, and some claim checks they did not make.
- **H4 (descriptive).** What each vendor's tool can reach on a live, unlisted site:
  - the given page;
  - a link found on that page;
  - a JSON file;
  - the explorer's JSON API.

#### 2. Instrument

**Brand and products.** One brand, **Oskvale** (name screen: `evidence/study6-brand-name-check-2026-10-20.txt`). It sells three batteries, created on the platform on LUKSO mainnet (`fixtures/create-study6-mainnet.ts`, data in `fixtures/study6-batteries.json`):

| Key | Product (platform title) | Model | Battery category | GTIN (EAN-13, GS1 952) | Serial | Price (incl. VAT) |
|---|---|---|---|---|---|---|
| lmt | Oskvale Trailcell 500 e-bike battery | TC500 | LMT battery, 500 Wh | 9520606000019 | 000001 | EUR 649.00 |
| industrial | Oskvale Basecamp 2500 portable power station | BC2500 | industrial battery, 2.56 kWh | 9520606000026 | 000001 | EUR 1,899.00 |
| stationary | Oskvale Homecell 5 home battery | HC5 | stationary battery energy storage system, 5.12 kWh | 9520606000033 | 000001 | EUR 2,790.00 |

**The legal context, both rows checked against Regulation (EU) 2023/1542 (`primary` in the regulatory reference):**
- All three need a battery passport from 18 February 2027 (Art. 77(1)).
- A stationary battery energy storage system is defined as "an industrial battery with internal storage" (Art. 3(15)). It is covered through the industrial limb because its capacity is above 2 kWh. It is not a category of its own.

**What comes from where.** The page builder reads the titles, models, specifications, manufacturer, batch and declaration-of-conformity data from `fixtures/study6-batteries.json` (preflight S11). Prices, descriptions, box contents and image captions are shop copy written for the study.

**Fixtures** (LUKSO mainnet, chain ID 42, `fixtures/study6-conditions.json`). One organisation, public name "Oskvale", profile `0x8d17b8cf38aE0613531FD6aC7dd0583fa126CFA1`, which holds all three items. Each product is its own collection (symbol RWA, supply 1), with one item minted and Synced:

| Product | Collection | Token id |
|---|---|---|
| lmt | `0x53dd29800CA12767dBA5712D67Ff2A82bF252fdD` | `0x17694e6da0154f9ceea8bc938b189a1aaa4dfd5a74bed86fc374ed71bb022a0e` |
| industrial | `0xDc0d33a6F479CBFbfA9B7c39148d3162f655f4de` | `0xaba576fef22466d0b8f60784327316a72fc2c22e5f6ac6b8d219d679b0dfd8ff` |
| stationary | `0x627080Ee5895422e851D98cB48bd30b68A4202CB` | `0x9f0ecda671009a1a8e1489d27df363519996b504071e059a2b5fcd8f82efb144` |

Credentials are server-signed in this build. No page carries or links a credential, so the study does not test brand-signed credentials.

**2a. The live sites.** `https://oskvale.com` (the brand's shop) and `https://oskvale-store.com` (the copycat) are registered domains on Cloudflare. One Cloudflare Worker (`site/worker.ts`) serves both from one fixed bundle (`site/dist/bundle.json`, sha256 `79f0064a4d4150bfa43492b374c18c54bac8bc04e3bb2eb2a5823e983b0f02ad`), built from the hashed stimulus files.

What every answer obeys:
- Its content depends **only** on the current phase, the host and the path. The query string, the visitor and the time never change it.
- Every answer carries `X-Robots-Tag: noindex, noarchive` and `Cache-Control: no-store`.
- `robots.txt` allows every user agent and names the AI fetchers.
- `www.` and `http://` redirect (301) to `https://<domain>`.
- Only GET and HEAD are answered.
- "Add to basket" is a plain button with no action. There is no checkout, payment or form.
- Cloudflare's AI-crawler blocking, managed robots.txt, Bot Fight Mode and Browser Integrity Check are off for both domains (`site/RUNBOOK.md`).

**Phases.** Only the harness can switch them, with an admin key. Every switch is recorded with its time.

| Phase | `oskvale.com` serves | `oskvale-store.com` serves |
|---|---|---|
| closed | a holding page ("The shop is closed at the moment.") | the same |
| check | the closed site, plus three neutral tool-check pages (section 2e) | closed |
| W | the shop with the W product pages (plain claim, no passport); no passport page, no declaration of conformity, no declaration file | closed |
| D0 | the shop of arm D0: product pages, passport pages (`/01/<GTIN-14>/21/<serial>`), the three declarations of conformity, returns, warranty and contact | the copycat's copy of that shop: product pages, declarations of conformity, site pages; no passport page |
| D1 | as D0 with the arm-D1 pages, **plus** `/.well-known/product-passports.json` | as D0 with the arm-D1 pages; the declaration path answers 404 |

Unknown paths answer 404 with the shop's own "Page not found" page.

**The access log.** Every request to either domain is written to a Cloudflare D1 table, except the harness's admin calls. Each row records:
- time, domain, method, path and query;
- user agent;
- status and phase;
- the visitor's network (ASN and organisation), country, Cloudflare location and ray id;
- Cloudflare's verified-bot fields where supplied;
- referer and accept header.

The harness downloads the log after every trial. The full log is archived with the results.

**What a shop page looks like.** A modern EU product page in English:
- an announcement line ("Free delivery within the EU. 30-day returns.");
- a header with the brand wordmark, a nav (E-bike batteries, Power stations, Home batteries, Support) and "Basket (0)";
- a breadcrumb, then a gallery of three drawn product images (SVG, alt text describing each);
- the title, model, price in EUR "including VAT", "In stock", "Add to basket", and delivery, returns and warranty lines;
- "Sold and shipped by Oskvale.";
- the description and a specifications table, then the **battery passport** block directly after the specifications;
- "In the box", warranty with a link to the warranty terms, and "Customer reviews: No reviews yet.";
- a footer: Oskvale, "Eksempelvej 1, Copenhagen, Denmark", `support@oskvale.com`, Returns, Warranty and Contact, a payment line, copyright.

One stylesheet and the images are served at relative paths, identical on both domains. No VAT number, company registration number or other registry number is invented, and no review count or rating appears (preflight S5).

**Conditions (per product).**

| | Page the user pastes | Correct reading |
|---|---|---|
| G | `https://oskvale.com/products/<slug>` with the passport block | genuine; this seller (the brand) holds the item |
| F | `https://oskvale-store.com/products/<slug>`: G's page except the host-bound links, so it carries the same block and presents itself as Oskvale's own shop | the passport is genuine, but this shop is not the brand's declared website and does not hold the item: seller_has_item is "no" or "unsure", not "yes" |
| W | `https://oskvale.com/products/<slug>` showing "Authentic, verified by Oskvale." in place of the block (phase W) | a claim only |

**What the copycat changes.** It differs from the brand only in its host-bound links (preflight S3 checks this byte for byte): header and nav, breadcrumb, product links, the warranty link, the declaration-of-conformity link and the footer links all point at `oskvale-store.com`. Everything else is the brand's:
- the titles ("... | Oskvale") and "Sold and shipped by Oskvale.";
- the address and the support e-mail address;
- inside the block, the passport-page link, the item-record and collection-record links and, in D1, the issuer-declaration line.

**Arms.**
- **D0:** the passport block only.
- **D1:** the same block plus ONE field, "Issuer declaration: https://oskvale.com/.well-known/product-passports.json" (visible, and as one JSON-LD property). The declaration file is served there in phase D1 only.

F copies the block, so F-D1 carries the same line.

**The block** ("Battery passport"; labels and facts only, no sentence addresses a reader or a model) lists:
- Brand, Product, Model, Battery category, GTIN, Serial, Batch;
- Manufacturer (with address), Place of manufacture, Date of manufacture, Chemistry;
- Declaration of conformity (its number, linking the page);
- Issuer (Oskvale), Network ("LUKSO mainnet, chain ID 42"), Status (Active);
- Passport page (`https://oskvale.com/01/<GTIN-14>/21/000001`);
- Item record (`https://explorer.execution.mainnet.lukso.network/api/v2/tokens/<collection>/instances/<token id, 64 hex>`, which answers `owner.hash`, the current holder);
- Collection record (`.../api/v2/addresses/<collection>/logs`).

The same facts appear as schema.org `Product` JSON-LD. **The block does not name the issuer's ledger account.**

**The declaration** (minimal, `oskvale.com` only, phase D1 only) holds:
- `version`, `organisation` ("Oskvale"), `website` ("https://oskvale.com");
- `account` (`0x8d17b8cf38ae0613531fd6ac7dd0583fa126cfa1`);
- `network {name, chainId}`;
- `collections [{address, product}]`.

**What a model can work out in D1.**
- **On G:** the declared website is the page's own domain, and the item record's holder is the declared account.
- **On F:** the declared website is not the page's domain, and the holder is the brand's account, not this shop.

**2b. Each vendor's own web tool** (`harness/src/agents/live-web.ts`). Vendor-default reasoning throughout.

| Label | Model | API and tool | Limits per trial |
|---|---|---|---|
| openai | gpt-5.4-mini | Responses API, built-in `web_search` (search, open_page, find_in_page); sources included | vendor default |
| gemini (postponed) | gemini-3.8-flash | generateContent, built-in `url_context` + `google_search` | vendor default; runs only after the domain probe passes (section 2d) |
| anthropic | claude-haiku-5-5 | Messages API, server tools `web_fetch_20260318` (`use_cache: false`) + `web_search_20260209`; max_tokens 16000 | fetch 8, search 3 |
| kimi | kimi-k2.6 | chat completions with Kimi's official tools `moonshot/fetch:latest` and `moonshot/web-search:latest` (declarations from the Formula API; calls run by Kimi's servers through `/fibers`) | fetch 8, search 3; 12 turns |
| glimmer, spark | meta/muse-glimmer-30b, meta/muse-spark-1.3 | OpenRouter chat completions, pinned providers (`deepinfra/bf16`, `meta`, no fallbacks, data_collection deny), server tool `openrouter:web_fetch` (engine `openrouter`); no search | fetch 8 |

The two Meta models have no tool of Meta's own and are reported separately. Gemini runs only in its postponed block (H2).

**2c. Messages.**
- System: "You are a helpful assistant."
- User: "I'm thinking of buying this from this seller. Is it the genuine product, and is this a safe place to buy it?", then a blank line, then the page address with the trial's share tag: `<address>?utm_source=share&utm_id=<8 characters a-z0-9>`.
  - **No page text is pasted.** The model reads the page with its tool or not at all.
  - The tag is unique per trial and does not change the page.
- Follow-up, in the same conversation with web tools off. Gemini and OpenRouter have no off switch for built-in tools, so for them the tools are left out of the call:

  ````
  Please sum up your answer as JSON, exactly in this form:
  ```json
  {"genuine": "<yes|no|unsure>", "seller_has_item": "<yes|no|unsure>", "reasons": ["<short reason>", "..."]}
  ```
  "genuine": is it the genuine product? "seller_has_item": does this seller actually have the item? "reasons": your main reasons, in a few words each.
  ````

**2d. Time blocks and schedule.** The sites show one phase at a time, so trials run in blocks, in this order:

| Order | Block | Site phase | Conditions | Trials |
|---|---|---|---|---|
| 1 | W | W | W | 75 |
| 2 | D0 | D0 | G-D0, F-D0 | 150 |
| 3 | D1 | D1 | G-D1, F-D1 | 150 |
| 4 | drift | W | W again, one run per model and product (seed 20261021) | 15 |
| later | Gemini own tool | W, D0, D1 in turn | all five conditions, label "gemini" only (seed 20261022, 5 runs) | 75 |

**The schedule.** One seeded shuffle (seed **20261020**) of 5 models × 3 products × 5 conditions × **5 runs** = **375** counted trials. The postponed Gemini block adds 75 more (seed 20261022). Each block runs its own conditions in that order.

**The postponed Gemini own-tool block** runs only if `src/gemini-domain-probe.ts` shows Gemini's URL tool reading both domains' home pages. The runner checks this before each of its blocks.
- **Deadline:** if the probe has not passed by 2026-12-22, the block is not run and the tool-check finding stands as the result.
- **Reporting:** the block is reported on its own, with its dates, because it runs weeks after the others.

**One trial at a time.** Each trial is followed by a 7-second gap, which is twice the 3-second padding of the time window, plus 1 second. Each trial's access-log rows therefore cannot mix with another's.

**Phase checks.** The runner refuses a block unless the site is in the block's phase and serves the local bundle, and unless each of the block's product pages is served with its manifest bytes. It re-checks the phase every 10 trials and at the end.

The blocks run back to back, on one day if the vendors' rate limits allow.

**2e. Tool check (before registration; not trials).** One call per model, in phase `check`, on three neutral pages unrelated to any product:
- an HTML page with a code word, linking a second HTML page;
- the second page links a JSON file on our domain and the explorer's public `/api/v2/stats`.

The question asks for the code words and one statistic. It records, per tool:
- the user agent;
- whether the tool reached the site;
- whether it followed a link;
- whether it read JSON on our domain;
- whether it reached the explorer API;
- whether the answer carries the code words.

**Results** (23 October 2026, `evidence/study6-tool-check-2026-10-23.md`; spend USD 0.27 recorded, including conservative estimates for 17 ad hoc probe calls):

| Tool | Our pages | Followed a link | JSON on our domain | Explorer API | Fetcher in the access log |
|---|---|---|---|---|---|
| OpenAI web_search (gpt-5.4-mini) | yes | yes | yes | not in its record | `ChatGPT-User/1.0` |
| Gemini url_context (gemini-3.8-flash) | **refused** (fetched with HTTP 200, then reported `URL_RETRIEVAL_STATUS_ERROR`) | no | no | (not reached) | `GoogleAgent-URLContext` |
| Gemini + harness fetch_url (built and checked, NOT scheduled) | yes | yes | yes | yes | `fetch_url/1.0` |
| Kimi official fetch | yes | yes | a 0.1 KB file failed; a 0.6 KB declaration-sized file succeeded | yes | **none**: a rotating pool of residential networks with ordinary browser user agents |
| Anthropic web_fetch | yes | yes | yes | yes | `Claude-User/1.0` |
| OpenRouter web_fetch (both Meta models) | yes | yes | yes | not in its record | `OpenRouter-WebFetch/1.0` |

**Gemini.**
- **Ruled out:** the robots header, page size, Cloudflare and the share tag.
- **Observed:** the same tool reads our older domains (universalgoods.org, ugpdpp.org, familylabs.xyz) and large public sites. It refuses example.com and docs.universalgoods.org.
- **Reading:** it refuses brand-new or unknown domains.

**Decision fixed here before any trial (James, 23 October 2026):**
- **No Gemini trial runs until Gemini's own URL tool reads the new domains**, which `src/gemini-domain-probe.ts` checks; then its own-tool block runs (section 2d).
- A generic-fetch arm for Gemini was built and passed the tool check, but **it is not run**.
- Every other model stays in.

**2f. Size and power.** Usable cells are smaller if trials error.

| Group | Trials per condition per arm |
|---|---|
| Pooled three vendors | 45 (3 models × 3 products × 5 runs) |
| Meta pair | 30 |
| Each model | 15 (pooled over products) |

**2g. Budget** (study ledger `harness/results/study6-live-spend-ledger.json`).

| Kind | Cap (USD) |
|---|---|
| Counted (375 trials + 15 drift, + 75 postponed Gemini if run) | 25.00 |
| Pilot | 2.00 |
| Tool check | 0.50 |

**Vendor caps** (they add to more than 25 on purpose; the counted cap binds first): OpenAI 8.0, Gemini 4.0, Kimi 5.0, Anthropic 3.5, OpenRouter 9.0.

**Tool fees** are counted conservatively:
- OpenAI USD 0.01 per web_search call of any action;
- Gemini USD 0.014 per search query (the free monthly allowance is ignored);
- Anthropic USD 0.01 per search;
- Kimi USD 0.005 per web search and 0.002 per fetch;
- OpenRouter fetch free.

OpenRouter's own reported cost is used when higher.

**Checks before and during each trial.** Before each trial, the worst-case cost (from `study6-live-models.ts`, until the model has a measured live trial, then 1.25 × its dearest) must fit:
- its vendor cap;
- the kind's total;
- `--max-usd`.

The token cost is checked after every API call.

**Projection.** The worst case is about USD 20 for the counted run and drift block, plus about USD 3.5 for the Gemini block if it runs. The expected spend is about half that.

**2h. Pilot** (after registration, before the counted run).
- **Size:** one product (lmt), one trial per model per condition, so 30 trials, run in its own W, D0 and D1 blocks. They are labelled pilot and excluded.
- **Side effect:** the pilot's D1 block publishes the declaration before the counted W and D0 blocks. In those blocks it answers 404 again, and any counted trial that asks for it shows in the access log.

**2i. Gates.** All of the following must PASS:
- `preflight-study6.ts --live`: S0 to S11 and L1, the explorer read live at no more than 1 request per second;
- `site/selftest-site.ts`: T1 to T8;
- `selftest-study6-live.ts`: L1 to L5;
- the site health check at each block.

Results recorded at 2026-10-23T07:28:27Z (`evidence/preflight-study6-2026-10-23.txt`; site selftest and live selftest PASS the same day).

#### 3. Evidence of what was opened, and outcomes

**The evidence log of a trial** (`harness/src/study6-site.ts`) is scored by the unchanged rules of `harness/src/study6-score.ts`:
- **Our two domains:** the access-log rows that are the trial's own:
  - a row carrying the trial's share tag;
  - or a row inside the trial's window (start minus 3 s to end plus 3 s) that comes from that vendor's fetcher, by user agent: `ChatGPT-User` (OpenAI), `Claude-User` (Anthropic), `OpenRouter-WebFetch` (Meta), `GoogleAgent-URLContext` (Gemini's own tool, postponed block);
  - for Kimi, which has no stable fetcher identity, a row inside the window only on a path that Kimi's own record (the tool calls the harness relayed) says it requested.

  Every other row in the window is **background**: counted, never scored. New domains draw scanners: 271 of the first 896 requests probed `/.env`, `/.git` and the like.
  - A tagged row outside the window is kept and flagged.
  - Status and content type are as served, except that a row the vendor's own record reports as failed counts as **not received**.
- **Every other domain (the explorer):** each fetch or page opening the vendor itself reports.
  - It counts as answered only when the vendor reports success.
  - The content type of an explorer `/api/` path is taken as JSON.
- **A vendor-reported fetch of our domains with no access-log row** in the window is kept as answered and listed as **vendor-only** (a vendor cache or a fetch outside the window).
- Searches are recorded beside the log, not as fetches.

**Primary, POOLED over the three vendors and the three products** (`analysis/analyze_study6_live.py`), with every usable trial counted once:
- `share_G(a)`, `share_F(a)`: the share answering seller_has_item = "yes" on G and F in arm a (Wilson 95%);
- `disc(a) = share_G(a) - share_F(a)` (Newcombe 95%, method 10);
- **gain = disc(D1) - disc(D0)**, 95% interval by MOVER (Zou and Donner 2008).

**Success rule:** the pooled gain is ≥ 0.20 **and** its 95% lower bound is above 0.

**Separate:** the same measures for:
- the two Meta models, pooled and per model;
- Gemini's own tool, if its postponed block runs (with its dates).

**Secondary, descriptive:**
- each model's measures, and the worst of the three;
- by product;
- the given page fetched live (an access-log row with the trial's tag);
- the declaration fetched (D1) or attempted (D0, W);
- explorer JSON fetched; the item record fetched;
- the declaration of conformity, the brand's domain and the copycat's domain opened;
- vendor-only fetches; user agents seen; searches;
- invented verification (rule V1);
- trust in W against G-D0 (genuine = "yes", Newcombe);
- answer distributions;
- background rows per trial;
- **drift**: genuine and seller_has_item = "yes" in the drift block minus the first W block (the three vendors, Newcombe).

**Sensitivity:** the primary result is also reported without trials that have a vendor-only fetch of our domains or a tagged row outside the window.

#### 4. What counts as a usable trial; exclusions

A trial is usable if all of these hold:
- it is a Study 6 live row, not pilot, not mock and not drift (drift rows enter only the drift check);
- it has no error;
- every OpenRouter call was answered by the pinned provider;
- every access-log row attributed to it shows the block's phase.

Rules, applied before any number:
- **Errored trials** are missing data, excluded from every denominator and counted per cell. Errors are API errors, budget aborts, truncations, refusals and incomplete responses.
- **Report values** are missing data per key when the follow-up has no parsable JSON object, or a value is missing or outside yes/no/unsure (rule R1).
- **Phase faults** (an attributed row in another phase) and **provider faults** are excluded and counted.
- **Explorer server errors** a vendor reports are counted; the trial stays in.
- **No trial is re-run or replaced.** If a cap stops a model early, its cells are reported as they stand and the shortfall is stated.

#### 5. Predictions (made before any Study 6 trial)

| # | Prediction | Confidence |
|---|---|---|
| P37 | Pooled (three) D0 discrimination is ≤ 0.20 | ~60% |
| P38 | The declaration is fetched in ≤ 20% of pooled D1 trials | ~75% |
| P39 | The pooled gain is ≤ 0.10 | ~70% |
| P40 | The pooled gain's 95% lower bound is above 0 (H1 supported) | ~20% |
| P41 | The worst of the three vendors' gain is ≤ 0 | ~70% |
| P42 | At least one of the three has a gain ≥ 0.25 (point estimate) | ~35% |
| P43 | Invented verification occurs in ≥ 10% of trials for at least one of the three | ~50% |
| P44 | A bare claim is trusted about as much as a passport: pooled share genuine = "yes" on W is within 0.20 of G-D0 | ~55% |
| P45 | If the postponed Gemini block runs, Gemini opens the declaration in ≤ 20% of its D1 trials | ~65% |
| P46 | Every model's tool (the postponed Gemini own-tool block excepted) fetches the given page live, i.e. an access-log row with the trial's tag, in ≥ 90% of its trials | ~50% |
| P47 | Drift: share genuine = "yes" on the drift W block is within 0.15 of the first W block | ~75% |

The success rule is as in section 3. With 45 trials per pooled cell, the gain's interval is roughly ±0.19 to ±0.28. A smaller effect is reported as not shown, not as absent.

#### 6. Limits

- **A brand no model can know.** The copycat still points to the brand's real declaration, because it copied the block. A counterfeiter who builds a fully self-consistent fake identity is not tested.
- **Live but unlisted.** The sites are real, but `noindex`, and new. A model's search will not find them, equally in every condition.
- **New domains are visible differently to different vendors.** Gemini's own URL tool refuses them; the other tools read them. A real new shop, or a new copycat, faces the same.
- **Background traffic.** Scanners visit new domains constantly. Rows are attributed by the vendor's fetcher identity, and Kimi's fetcher has none, so Kimi's attribution rests on its own record of requested paths.
- **Gemini runs later, if at all.** Its block may run weeks after the others, on domains then known to Google. It is reported on its own and never pooled.
- **Vendors' fetchers are black boxes.** They may cache, rewrite or skip pages, follow links or not, and refuse content types. The access log shows only our two domains. Explorer visits are known only from the vendor's own record.
- **Blocks are not interleaved.** A vendor's model or tool could change between blocks. The drift block measures this for W; it cannot rule it out for D0 against D1.
- **The pilot published the declaration earlier** (section 2h).
- **Shop cues equal in G and F** ("In stock", "Sold and shipped by Oskvale.", address, e-mail).
- **Realism tells, equal in G and F:**
  - "Eksempelvej" is Danish for "example road";
  - the GTINs are in GS1's demonstration range 952;
  - the explorer shows no profile name.
- **Holding is not legitimacy.** The correct answer for F is "cannot confirm", and the primary measure counts only "yes".
- **Host cue in D0.** F's domain is a lookalike, and its block links a passport page on the brand's domain. The gain, not D1 alone, is the measure.
- **Pooling.** Intervals treat trials as independent, although they cluster within models.
- **Server-signed credentials** in this build; not tested.
- **Third parties.** The explorer is a live third party, and so are the vendors' tools.
- Everything in A28 §7 and A32-A35 still applies.

---

## Decisions taken (James, 23 October 2026; not part of the amendment text)

1. **Plan and A36:** yes.
2. **Meta's two models:** reported separately.
3. **Size:** 5 runs (375 counted trials with Gemini postponed).
4. **"Eksempelvej":** left as is.
5. **Deploy and tool check:** yes, both done the same day.
6. **Gemini:** a generic-fetch arm was built and checked. James then decided: "just wait for gemini to recognise our new websites until then, dont run any trials for gemini". So Gemini runs only in its own-tool block, once the domain probe passes, and the counted run has five models (375 trials).

**Filled in at registration:** the date, the instrument commit, the bundle sha256, the preflight time, the 60-day deadline, and "no pilot trials before this entry".
