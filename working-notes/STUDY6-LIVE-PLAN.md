# Study 6, live-site version: plan for James (23 October 2026)

**Status: PLAN. Nothing is deployed, registered or run.** Prices were read from each vendor's own pricing page on 23 October 2026.

## The answer in five lines

1. **Two real websites on Cloudflare, run by one small program.** `oskvale.com` is the brand's shop and `oskvale-store.com` is the copycat. The program writes down every visit: who came (the fetcher's name, its "user agent"), which page, and when.
2. **Each model reads the shop with its own maker's web tool,** as it would for a real shopper: OpenAI web search, Google's URL reader, Anthropic web fetch, Kimi's fetch tool. Meta has no tool of its own, so its two models use OpenRouter's fetch tool and are reported separately.
3. **The study runs in three time blocks:**
   - **W:** product pages carry only the plain claim, with no passport;
   - **D0:** the pages carry the passport block;
   - **D1:** the brand publishes its declaration file.

   The order follows your decision of 23 October: D0 first, then publish the file. W comes first so that no passport page is ever cached before it.
4. **Cost: USD 30 covers 450 counted trials.** The worst case is about USD 21 for six models, five runs and 15 page versions, plus about USD 2 for the tool check and pilot. That leaves about USD 7 in reserve.
5. **A36 changes in 9 places.** The main ones are the live sites, vendor tools, the time blocks, the access log as evidence, a per-trial share link, and Meta reported apart. One finding comes before any trial: **Google's tool cannot follow links on a page**, so Gemini can never open the declaration or the ledger record by itself.

## 1. How the live sites work

**What is true (checked today):**
- Cloudflare Workers is a small program at Cloudflare's edge that answers every request to a domain.
- A Worker can serve stored files and write each request to a small database (Cloudflare D1).
- The free plan covers 100,000 requests a day, far more than we need.

**What I will build** (in this worktree, committed locally only):

| Part | What it does |
|---|---|
| **Page files** | Built by the existing page builder (`stimulus/study6.ts`), restyled as a modern shop (large product image, buy box, specification tabs, footer). The builder's checks stay: the copycat differs from the brand only in its own site links, and D0 and D1 differ only by the declaration line. |
| **Product pictures** | Clean drawn product images (SVG), so the shop looks finished. They are not photos and claim nothing. |
| **The Worker** | One program serves both domains. `www.` sends visitors to the plain domain, as real shops do. Every answer carries `X-Robots-Tag: noindex`, so search engines never list the pages. `robots.txt` allows every fetcher, AI fetchers by name included. Pages are never cached. |
| **Time-block switch** | One setting decides what the sites show: `closed` (a plain holding page), `check`, `W`, `D0`, `D1`, then `closed` again. Only the harness can change it, using a secret key. The declaration file `/.well-known/product-passports.json` exists only in block D1, and only on `oskvale.com`. |
| **Access log** | Each request is written down with: time, domain, path, query, user agent, response code, the visitor's network (ASN and country) and Cloudflare's verified-bot flag. The harness downloads the log after every trial. |
| **Basket** | "Add to basket" is a plain button that does nothing. There is no checkout, payment or form. |
| **Teardown** | After the study the Worker is deleted, the sites stop answering, and the log is archived with the results. **Recommendation:** keep both domains registered for the year you paid for, so nobody else can put a page on `oskvale-store.com` while the paper cites it. |

**Your Cloudflare steps** (when the account exists; I will give you click-by-click notes):
1. Buy `oskvale.com` and `oskvale-store.com` through Cloudflare.
2. Turn off Cloudflare's AI-crawler blocking for both sites:
   - set "AI Crawl Control" to allow every crawler;
   - turn off the managed robots.txt;
   - turn off "Bot Fight Mode".

   Press reports say Cloudflare's defaults for new domains changed on 15 September 2026 and can block AI fetchers. I have not confirmed this in Cloudflare's own documentation; the tool check will show it either way. Left on, those fetches would fail silently.
3. Create an API token limited to Workers and D1 on this account. Put it in the study `.env`; I never print it.

I then deploy. The deploy is a public step, so I deploy only when you say so.

## 2. Each vendor's own web tool, priced

Prices are per call or per 1,000 calls, plus the model's normal token price for whatever the tool reads.

| Model | Its own tool | Tool price | Can it follow a link found on the page? | Source |
|---|---|---|---|---|
| gpt-5.4-mini (OpenAI) | `web_search`: searches, and opens pages ("open_page") | USD 10 per 1,000 calls, plus the text it reads at token price | Probably; the docs list "open_page" but do not say whether it reaches a page no search engine has listed. **The tool check measures this.** | developers.openai.com pricing, web search guide |
| gemini-3.8-flash (Google) | `url_context` (reads a given address), plus Google Search | URL reading free (tokens only). Search: 5,000 free a month, then USD 14 per 1,000 | **No.** Google's docs: the model "will only retrieve content from the URLs you provide, not any content from nested links". | ai.google.dev pricing, URL context guide |
| claude-haiku-5-5 (Anthropic) | `web_fetch` plus `web_search` | Fetch: no charge beyond tokens. Search: USD 10 per 1,000 | **Yes.** URLs from earlier fetch results may be fetched. Its cache can be switched off (`use_cache: false`), and it obeys robots.txt. | platform.claude.com web fetch tool, pricing |
| kimi-k2.6 (Moonshot) | Kimi's official tools `moonshot/fetch` and `moonshot/web-search` | Fetch free "for a limited time" (USD 0.002 per call on the plain endpoint); web search about USD 0.005 per call | Yes. The model names the URL it wants. | platform.kimi.ai tools pricing, official-tools guide |
| muse-glimmer-30b, muse-spark-1.3 (Meta, via OpenRouter) | **None of Meta's own.** OpenRouter offers `openrouter:web_fetch` for any model. | Free with OpenRouter's own fetcher; USD 1 per 1,000 with Exa | Yes | openrouter.ai web fetch docs; endpoint listing read today |

**Two cautions:**
- Kimi's old built-in search was due to be retired on 20 October 2026. Its replacement is documented on Kimi's platform, but I have not used it yet.
- The tool check (section 5) confirms each tool works on our sites before any trial.

**What this means for the study (judgement):**
- **Gemini, as Google ships it, can read only the page you paste.** It cannot open the declaration or the ledger record unless Google Search happens to return them, and it will not, because the pages are not indexed. Gemini's D1 gain is therefore expected to be zero. That is a real result about today's tools, not a fault of the study. It strengthens the design rule your earlier data supports: check the passport where the product data is assembled, and pass the result on.
- **Meta: report separately, do not drop.** The tool is OpenRouter's, not Meta's, so pooling it with the four makers' own tools would mix two questions. Kept apart, it still shows what an open model does when someone gives it a fetch tool. It costs about USD 7 of the 21.

## 3. How many trials USD 30 buys

**Worst case per trial, assumed:**
- twice Study 5's measured input per model (the pages are bigger, and models may read the ledger record and the declaration);
- 1.3 times its output;
- the most tool calls likely;
- a further 1.25 safety factor.

| Model | Worst case per trial |
|---|---|
| gpt-5.4-mini | USD 0.065 to 0.095 (search fees dominate) |
| gemini-3.8-flash | USD 0.037 |
| kimi-k2.6 | USD 0.051 |
| claude-haiku-5-5 | USD 0.030 |
| muse-glimmer-30b | USD 0.018 |
| muse-spark-1.3 | USD 0.076 |
| **One trial of each of the six** | **USD 0.28 to 0.31** |

**Page versions:** 3 products × 5 versions (G-D0, F-D0, G-D1, F-D1, W) = 15 per run.

| Runs | Trials (all six models) | Worst case | Room left of USD 30 after check and pilot |
|---|---|---|---|
| 4 | 360 | USD 16.7 to 18.6 | about USD 10 |
| **5 (recommended)** | **450** | **USD 20.8 to 23.3** | **about USD 5 to 7** |
| 6 | 540 | USD 25.0 to 28.0 | too little |

**Recommendation: 5 runs.**
- That gives 450 counted trials:
  - 300 from the four vendors' own tools, which makes 60 trials in each pooled cell of the main result;
  - 150 from the Meta models, reported separately.
- **Hard stops:**
  - the study total is USD 25 counted, the pilot USD 2 and the tool check USD 0.50;
  - each vendor has its own cap;
  - spend is checked before every trial and after every API call, as in Studies 5 and 6.
- **Expected real spend is about half the worst case,** going by Study 5, which came in at USD 3.74 against its caps.

## 4. What changes in A36

1. **Hosts:** live websites on Cloudflare, not files served by the harness. The page bytes are still fixed, hashed and checked before each block.
2. **Tools:** each vendor's own web tool (section 2) replaces our `fetch_url`. Meta's models use OpenRouter's fetch and are **reported outside the pooled main result**.
3. **Time blocks:** W, then D0, then D1, run back to back on one day if the rate limits allow. Each block uses the same shuffled order of models and products.
   - Because the blocks differ in time, a change in a vendor's model or tool midway could look like an effect.
   - **Drift check:** a small set of repeat W trials runs at the end, after D1, and is compared with the first W block. If the answers moved, A36 says so.
4. **The share link:** each trial's address carries a normal-looking share tag, `?utm_source=share&utm_id=<8 random letters>`, as links copied from a shop often do.
   - It stops a vendor serving a cached copy from an earlier block.
   - It lets the access log tie each visit to its trial.
   - The page content never depends on the tag.
5. **Evidence of checking:** "opened the declaration" or "opened the record" now counts only if one of these shows it:
   - the vendor's own tool record (every vendor reports the URLs it fetched);
   - our access log (for our two domains).

   Visits are tied to a trial by the tag and by time: trials for one vendor run one at a time, so the log cannot mix two of its trials.
6. **The prompt:** the shopper's question with the address pasted, as a person would type it. No page text is pasted any more. The JSON follow-up question is unchanged.
7. **Size and money:** 5 runs, 450 trials, counted cap USD 25, pilot cap USD 2. New per-vendor caps.
8. **New predictions,** for example: "Gemini opens the declaration in 0% of D1 trials" and "a vendor fetch blocked by robots or Cloudflare occurs in under 5% of trials".
9. **Limits added:**
   - the sites are live but unlisted;
   - vendors' fetchers may cache or rewrite pages;
   - the blocks are not interleaved;
   - the access log sees only our two domains (the ledger explorer is a third party; its visits show only in the vendor's record).

**Unchanged:** the products, brand, GTINs, conditions G, F and W, the pooled success rule (gain at least 0.20 with its lower bound above 0), the report format and the no-disclosure rule.

## 5. Order of work, and what needs your yes

| Step | Who | Spends | Needs your yes |
|---|---|---|---|
| 1. Build the sites, Worker and harness changes, and test them locally with no network | me | nothing | no (local commits only) |
| 2. Rewrite A36 | me | nothing | review |
| 3. Cloudflare account, two domains, AI blocking off, API token | you | domains | yours |
| 4. Deploy the sites in the `closed` block | me | nothing | **yes** (public step) |
| 5. **Tool check:** one call per vendor on a neutral test page, not a study page. It confirms that each tool reaches the site, its user agent, whether it follows a link, and whether it caches. | me | up to USD 0.50 | **yes** (paid) |
| 6. Fix A36 with what the tool check found, then register it: append to `PREREGISTRATION.md` and push to the private repo | me | nothing | **yes** |
| 7. Pilot: one trial per version per model on one product (30 trials), labelled pilot and not counted | me | up to USD 2 | **yes** (paid) |
| 8. Counted run: W, D0, D1 blocks, then the drift check | me | up to USD 25 | **yes** (paid) |
| 9. Sites closed, Worker deleted, log archived, all model keys rotated | me + you | nothing | yes |

## 6. Two realism points you may want to change before the sites go live

- **The address "Eksempelvej 1, Copenhagen" means "Example Road 1" in Danish.** A model that reads Danish may spot it as a placeholder. It sits in the mainnet product data, the declaration of conformity included, so changing it means editing the product and one more Sync for each product, with your signing. My call: it is a real weakness, but it is equal in G and F, so it does not bias the measured gain. Change it only if you want the strongest realism.
- **The GTINs use GS1's demonstration range 952**, which a well-informed model could recognise. You chose to keep it for safety. Unchanged.

## 7. Proposal: "AI discovery" studies, later (not built)

The controlled studies ask: given this page, can the model tell? Discovery studies ask whether models find and recommend the product without being pointed at it. They need the controlled results first, so that a discovery failure can be traced to a cause. I propose three steps, each its own amendment:

1. **Findability.** Let the sites be indexed (drop `noindex`) and ask open shopping questions, such as "best e-bike battery under EUR 700 in Denmark". Measure whether any vendor's search reaches Oskvale at all, and how long that takes after publication. The cost is small, because no checking is involved.
2. **Discovery with a copycat.** Index both shops and ask the same open questions. Which shop does the model recommend, and does a declaration change that? This is the copycat test without the hand-holding.
3. **Agent shopping.** Run the same questions through the agent shopping surfaces (UCP-style catalogues such as Google's) once the UCP endpoint is on mainnet. Our earlier data says the verdict should be passed there.

Ground rule for all three: the brand stays fictional, the products stay on mainnet, and nothing is ever bought.

## Sources (read 23 October 2026)

- OpenAI pricing (web search USD 10 per 1,000 calls; gpt-5.4-mini USD 0.75 / 4.50 per million tokens): https://developers.openai.com/api/docs/pricing, web search guide https://developers.openai.com/api/docs/guides/tools-web-search
- Google Gemini pricing (gemini-3.8-flash USD 0.75 / 3.75 until 31 December 2026; Search 5,000 a month free, then USD 14 per 1,000; URL context tokens only): https://ai.google.dev/gemini-api/docs/pricing. URL context ("not any content from nested links"; index first, then live fetch): https://ai.google.dev/gemini-api/docs/url-context
- Anthropic pricing (web search USD 10 per 1,000; web fetch no extra charge; Haiku 5.5 USD 0.10 / 0.50): https://platform.claude.com/docs/en/about-claude/pricing. Web fetch tool (prior-URL rule, `use_cache`, robots.txt error): https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool
- Kimi tools pricing (`$web_search` USD 0.005 per call, retirement expected 20 October 2026; fetch USD 0.002): https://platform.kimi.ai/docs/pricing/tools. Official tools (`moonshot/fetch`, `moonshot/web-search`): https://platform.kimi.ai/docs/guide/use-official-tools
- OpenRouter web fetch (OpenRouter engine free, Exa USD 1 per 1,000): https://openrouter.ai/docs/guides/features/server-tools/web-fetch. Endpoint listing, read today: muse-spark-1.3 has only a pass-through web search; muse-glimmer-30b has none.
