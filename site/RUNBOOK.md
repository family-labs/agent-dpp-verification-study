# Study 6 live sites: runbook

The two sites are `oskvale.com` (the brand's shop) and `oskvale-store.com` (the copycat). One Cloudflare Worker serves both from `site/dist/bundle.json`, and every visit is written to a D1 database. Plan: `../STUDY6-LIVE-PLAN.md`.

**Nothing here has been deployed yet.** Every step marked **public** needs James's yes first.

## A. James: account and domains (once)

1. Create the Cloudflare account and buy `oskvale.com` and `oskvale-store.com` in Cloudflare Registrar.
2. For **each** of the two sites, in the Cloudflare dashboard:
   - **AI Crawl Control**: set every crawler to **Allow**.
   - Turn off the **managed robots.txt** (Cloudflare can add its own rules in front of ours).
   - **Security → Bots**: turn off **Bot Fight Mode**.
   - **Security → Settings**:
     - **Browser Integrity Check: off**. It turns away requests whose user agent looks unusual, and AI fetchers often send one.
     - **Security Level: Essentially off.**
   - **SSL/TLS → Edge certificates**: **Always Use HTTPS: on**.
3. Create an **API token** (My Profile → API Tokens → Create custom token) with these permissions:
   - Account / Workers Scripts / Edit
   - Account / D1 / Edit
   - Zone / Workers Routes / Edit
   - Zone / DNS / Edit (custom domains add DNS records)

   Limit it to this account and the two zones. Put it in the study `.env` as `CLOUDFLARE_API_TOKEN`, with `CLOUDFLARE_ACCOUNT_ID`. Never paste it in chat.
4. Optional: Email Routing for `support@oskvale.com`, forwarding to an inbox of your choice. No trial needs it.

## B. Deploy (Claude; **public**: only after James's yes)

Run these from `site/`. Keys come from the study `.env`.

1. Install wrangler, pinned: `npm install --no-save wrangler@<version>`.
2. Create the database: `wrangler d1 create oskvale-study6`. Copy `wrangler.toml.example` to `wrangler.toml` and fill in `database_id`.
3. Load the tables: `wrangler d1 execute oskvale-study6 --remote --file=schema.sql`. The phase starts as `closed`.
4. Set the admin key:
   - generate a random 32-byte hex key;
   - store it in the study `.env` as `SITE_ADMIN_TOKEN`;
   - give it to the Worker with `wrangler secret put ADMIN_TOKEN`;
   - never print it.
5. Build: `bun run build-site.ts`. Requires `stimulus/build-study6.ts --write` and `preflight-study6.ts --live` to PASS first.
6. Deploy with `wrangler deploy`. This attaches the four custom domains (both domains, with and without `www.`).
7. Checks, from `harness/`:
   - `bun run src/site-admin.ts health` must show `phase closed` and `sameBundle true`.
   - From outside, `curl -sI https://oskvale.com/` must show 200 with `X-Robots-Tag: noindex, noarchive`.
   - `https://www.oskvale.com/` must answer 301.
   - `https://oskvale.com/robots.txt` must answer 200.

## C. Phases, in order (each switch is **public**)

| Step | Command (from `harness/`) | What the sites show |
|---|---|---|
| tool check | `src/site-admin.ts phase check`, then `src/tool-check-study6.ts --i-approve-spend`, then `phase closed` | neutral check pages only |
| pilot (after A36 is registered) | `phase W`, then `run-study6-live.ts --block W --pilot ...`; then `phase D0` and the D0 block; then `phase D1` and the D1 block | the shops |
| counted run | `phase W`, then the W block; `phase D0`, then the D0 block; `phase D1`, then the D1 block; `phase W`, then `--block drift` | the shops |
| end | `phase closed`, then `src/site-admin.ts log 0` to archive the whole log | holding page |

The runner refuses a block if the site is not in that block's phase, or if it serves a bundle other than the local build.

## D. Teardown (after the analysis)

1. Archive the log: `src/site-admin.ts log 0`. Put it with the results and record its SHA256 in `SHA256SUMS`.
2. Run `wrangler delete`, which removes the Worker; the sites stop answering. Then delete the D1 database with `wrangler d1 delete oskvale-study6`.

   **This deletion cannot be undone.** Do it only after James confirms that the archived log is complete.
3. Keep both domains registered until they expire, so that nobody else can serve pages under the names the paper cites.
4. Revoke the Cloudflare API token, and rotate every model key in the study `.env`.
