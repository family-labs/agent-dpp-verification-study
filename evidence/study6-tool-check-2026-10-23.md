# Study 6 live: tool check, 23 October 2026 (before registration; not trials)

**Setup.** The sites were deployed on Cloudflare (Worker `oskvale-study6`) and switched to phase `check`, which shows only neutral pages:
- `/check/delivery-areas`, which links `/check/delivery-areas-2`;
- that page links `/check/delivery-areas.json` and `https://explorer.execution.mainnet.lukso.network/api/v2/stats`;
- later additions: `/check/delivery-guide` (a long page) and `/check/stock-levels.json` (a JSON file the size and shape of the declaration).

One call per model asked for the code words and one explorer statistic. The raw output is `harness/results/tool-check-study6-2026-10-23T06-09-18-088Z.json` (git-ignored, archived with the results).

**Spend.**
- The scripted check cost USD 0.141.
- 17 ad hoc probe calls (Gemini 16, Kimi 1) are booked at a conservative USD 0.08.
- Total recorded: USD 0.22 of the USD 0.50 cap.

## Per vendor

| Model | Reached our site | Followed a link | Read our JSON | Reached the explorer API | Fetcher seen in the access log |
|---|---|---|---|---|---|
| gpt-5.4-mini | **not tested**: the OpenAI key has expired (HTTP 401) | | | | |
| gemini-3.8-flash | its fetcher did (HTTP 200), but the tool reported `URL_RETRIEVAL_STATUS_ERROR` and the model said the site was "blocked or restricted" | no | no | (not reached) | `GoogleAgent-URLContext`, Google LLC |
| kimi-k2.6 | yes | yes | the 0.1 KB check file failed (fiber HTTP 500, retried about 60 times through many networks); the 0.6 KB declaration-sized file **succeeded** | yes | **no single fetcher**: a rotating pool of residential networks (China, Latin America and others) with ordinary browser user agents |
| claude-haiku-5-5 | yes | yes | yes | yes (correct `total_blocks`) | `Claude-User/1.0`, Anthropic, PBC |
| muse-glimmer-30b (OpenRouter fetch) | yes | yes | yes | not in OpenRouter's response (unknown) | `OpenRouter-WebFetch/1.0`, Cloudflare network |
| muse-spark-1.3 (OpenRouter fetch) | yes | yes | yes | not in OpenRouter's response (unknown) | `OpenRouter-WebFetch/1.0` |

## Gemini: what was ruled out

All probes used `url_context` on gemini-3.8-flash.

| Test | Result |
|---|---|
| `X-Robots-Tag: noindex, noarchive` | error |
| `noindex` only | error |
| `all` (no restriction) | error |
| a 3 KB text page instead of a 0.6 KB one | error |
| example.com (Cloudflare) | error |
| docs.universalgoods.org (Cloudflare) | error |
| httpbin.org/html | success |
| developers.cloudflare.com, uncached URL | success |
| wikipedia.org, uncached URL | success |
| the explorer's `/api/v2/stats` | success |
| gs1.org | success from Google's cache; error with a query string (that site sends 403 to the fetcher) |
| gemini-3.6-flash and gemini-3.5-flash | same behaviour as 3.8 |

**Reading.** Neither the robots header, page size, Cloudflare nor the query string explains the failure. Google's fetcher does collect our pages; the tool then reports an error.
- **Observed:** pages on large, established domains succeed.
- **Hypothesis, not confirmed:** Gemini's URL tool refuses content from brand-new or unknown domains, a reputation or safety gate after the fetch.
- **Consequence, as Google ships the tool today:** Gemini cannot read either Oskvale shop.

## The access log on a brand-new domain

Within an hour of going live, the domains drew unrelated traffic:
- vulnerability scanners: `/.env`, `/.git/HEAD`, `/config.json`, leakix and other `l9scan` agents;
- Googlebot, and certificate-transparency followers.

That was 271 of the first 896 requests. A plain time window would credit a trial with these visits. The attribution rule was therefore tightened before any trial (`harness/src/study6-site.ts`, selftest L1):
- a row is a trial's only if it carries the trial's share tag, or falls in its window **and** comes from that vendor's fetcher (by user agent);
- for Kimi, which has no stable fetcher identity, a row counts only on a path that Kimi's own record (the tool calls the harness relayed) says it requested;
- every other row in the window is background, counted and never scored;
- a row the site served but the vendor's own record reports as failed is not counted as received.
