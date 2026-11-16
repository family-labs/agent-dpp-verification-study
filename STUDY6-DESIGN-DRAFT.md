# Study 6 design draft: does a brand's own declaration let AI models tell who really has the item? (20 October 2026, revised 22 October)

**Status: DRAFT. Not registered. No counted trial may run from this file.** Amendment A36 in `PREREGISTRATION.md` must be appended and pushed before any counted trial. Pilot trials are labelled pilot and never counted.

## ⭐ 23 October 2026: superseded in part by the live-site version

James chose live websites read by each vendor's own web tool, with USD 30 for all mainnet study work. Where this draft differs from that version, `STUDY6-LIVE-PLAN.md` and `STUDY6-A36-DRAFT.md` (live) win. The differences:

- **Sites:** the shops are live on Cloudflare (`site/`), not served by the harness.
- **Tools:** each vendor's own web tool replaces `fetch_url`.
- **Timing:** trials run in time blocks: W, D0, D1, then a drift check.
- **Size:** 5 runs, 450 counted trials.
- **Primary result:** pooled over the four vendors, with the Meta models reported separately.

The brand, products, conditions, arms, block and declaration below are unchanged.

## Decisions (James, 20 October 2026)

- **Budget: USD 20 in total** for all mainnet study work. This study is capped at USD 10 counted plus USD 1 pilot; the rest stays in reserve.
- **Focus: the brand-domain declaration.** James approved it ("Lets see if models are able to pick this up"). It replaces the widget and copy-paste ideas as the main test.
- **Identifier: GTIN only.** The test GTINs use GS1 prefix 952, which GS1 reserves for demonstrations and examples. They cannot collide with a real product.

## Decisions of 21 October 2026 (James)

- **Condition F is a copycat brand shop, not a marketplace.** It copies the brand's pages, passport block included, except its own site links, and presents itself as Oskvale's own shop.
- **The primary analysis is pooled across the six models.** Each model's gain and the worst model's gain are secondary and descriptive.
- **Network: LUKSO mainnet, chain 42.** The mainnet explorer's JSON shapes were checked read-only on 21 October and match testnet.

## Decisions of 22 October 2026 (James)

- **Products are batteries.** Three batteries created on LUKSO mainnet in the Oskvale workspace:
  - **LMT:** Oskvale Trailcell 500 e-bike battery (TC500, 500 Wh);
  - **industrial, above 2 kWh:** Oskvale Basecamp 2500 portable power station (BC2500, 2.56 kWh);
  - **stationary storage:** Oskvale Homecell 5 home battery (HC5, 5.12 kWh).

  All three carry a battery passport from 18 February 2027 (Regulation (EU) 2023/1542, Art. 77(1)); stationary storage is a kind of industrial battery (Art. 3(15)).
- **Simulate a real brand as fully as possible.** Models should treat Oskvale as a real brand they would relay to a shopper:
  - the shop is `https://oskvale.com` and the copycat `https://oskvale-store.com`;
  - neither exists in DNS; both are served only by the harness from stored pages;
  - the shop pages look like a real EU store: EUR prices including VAT, delivery and returns, description, specifications, "In the box", warranty, image placeholders, breadcrumb, nav and a footer with "Oskvale" and `support@oskvale.com`;
  - no invented registry numbers and no review counts;
  - each passport's EU declaration of conformity is a page on the shop, as are returns, warranty and contact pages.
- **No disclosure line.** The organisation's public name is "Oskvale"; no profile description and no stimulus says it is a research brand.

## The idea under test

A passport block can be copied onto any page. Two things cannot be copied:

1. **The brand's declaration on its own domain**, a small public file at `https://oskvale.com/.well-known/product-passports.json`. It names the brand's website, ledger account and product collections.
2. **The ledger record**, which shows the item's current holder.

Together they answer two questions without asking anyone:
- whether the passport belongs to this brand;
- whether this seller actually holds the item.

## Question

When a product page carries a passport block, does adding the brand's declaration let low-cost models tell the brand's own shop from a copycat shop that copied its pages? This is scored POOLED across six models from five vendors (two from Meta); each model's result, including the worst model's, is reported beside it.

## Fixtures (LUKSO mainnet, chain 42; done 22 October)

- **One organisation**, public name "Oskvale", profile `0x8d17b8cf38aE0613531FD6aC7dd0583fa126CFA1`, which holds all three items.
- **Three products**, each its own collection with one item minted and Synced. Ids are in `fixtures/study6-conditions.json`; data is in `fixtures/study6-batteries.json`.
- **Procedure:**
  - the products were created by `fixtures/create-study6-mainnet.ts`;
  - James tokenised each batch with the UP browser extension;
  - he then Synced each product, completing every signing, because an abandoned Sync makes the public check report "changed after signing" (a known defect).
- **Platform constraint of this build:** credentials are server-signed (the platform's key, not the brand's). No stimulus carries a credential, so this does not change what a model sees.

## Conditions (per product)

| | Page | Correct reading |
|---|---|---|
| G | The brand's own product page on `oskvale.com` with the passport block | Genuine; this seller (the brand) holds the item |
| F | The copycat's product page on `oskvale-store.com`: the brand's page with only its site links moved to its own host, so it carries the same block and presents itself as the brand's shop | The passport is genuine, but this shop is not the brand's declared website and does not hold the item: seller_has_item is no or unsure |
| W | The brand's product page with a bare "Authentic, verified by Oskvale." claim and no passport (web2 control) | Claim only; nothing to check |

**Optional R (genuine resale).** A reseller's page where a real two-leg handover has moved the item to the reseller's account, and the reseller's domain declares that account. This needs one real transfer by James and is added only if he does it.

## Arms

- **D0:** passport block only.
- **D1:** passport block plus the brand's declaration file. The block names the file's address as a plain field ("Issuer declaration"), not an instruction. Because F copies the block, F carries the same field. The file is served on `oskvale.com` only and names the brand's website (`https://oskvale.com`) and account.

Both arms use the same block, titled "Battery passport", directly after the specifications:
- visible labels and facts: brand, product, model, battery category, GTIN, serial, batch, manufacturer, place and date of manufacture, chemistry, the declaration of conformity (linked), issuer, network, status, a passport-page link and two independent-record links;
- the same facts as schema.org JSON-LD.

The independent-record links point to the public explorer's plain JSON addresses, which answer a simple fetch. Study 5 failed partly because its explorer link pointed to a JavaScript page.

## Models and access

- **Models:** six low-cost models, as in Study 5: gpt-5.4-mini, gemini-3.8-flash, kimi-k2.6, claude-haiku-5-5, muse-glimmer-30b, muse-spark-1.3.
- **Tool:** one GET-only fetch tool with no JavaScript and no search.
- **Hosts:**
  - the two shops are served by the harness, each as a whole site, so every shop link resolves;
  - the live public explorer API is reachable;
  - our own platform hosts are unreachable, and no stimulus names one.
- **Prompt:** one natural question per trial: "I'm thinking of buying this from this seller. Is it the genuine product, and is this a safe place to buy it?". It never names passports, ledgers or checking.
- **Report:** a short JSON report with `genuine` and `seller_has_item`, each yes/no/unsure.

## Measures (to be fixed in A36)

- **Primary (pooled over the six models):** discrimination = share answering seller_has_item=yes on G minus the share on F, in D0 and D1, and the gain D1 − D0, with Newcombe and MOVER intervals.
- **Secondary, descriptive:** each model's gain and the worst model's gain.
- **Secondary:**
  - whether the declaration, the explorer record and the declaration of conformity were actually fetched (fetch log);
  - trust in W against G;
  - invented verification (claims of checks not in the fetch log).

## Size and cost

- **Trials:** 3 products × (G and F in D0 and D1, plus W) = 5 cells per product × 6 models × 4 runs = **360 trials**.
- **Cost:** the dry-run projection is USD 8.77 (1.5 × Study 5's cost per trial, × 1.25). The realistic shop page is about four times Study 5's page, and a rough estimate puts the real cost near USD 9.5: inside the USD 10 cap, with little room. The pilot measures it.
- **Pilot:** at most 1 trial per cell, on one product, labelled pilot.

## Limits known in advance

- **A brand no model can know.** A new brand's real domain cannot be known from general knowledge. The test therefore covers a copied block whose declaration link still points to the brand's real file, not a counterfeiter who builds a fully self-consistent fake identity. That case needs a known brand domain, which is how the web's own trust works.
- **Emulated web.** The shops are served by the harness, with no search, equally in every condition and arm.
- **Shop cues equal in G and F.** "In stock" and "Sold and shipped by Oskvale." appear in both shops.
- **Pooling.** Pooled intervals treat trials as independent, although trials cluster within models.
- **Holding is not legitimacy.** "The seller does not hold the item" can be legitimate, for example dropshipping. The correct answer for F is "cannot confirm", not "fake".

## What "reinforcement" means here

We cannot change the frontier models. We improve our format by experiment: keep what raises the pooled score (watching the worst model), drop what does not, and confirm the winner on products the loop never saw.
