/**
 * Study 6 live sites: the Cloudflare Worker that serves oskvale.com and oskvale-store.com (23 Oct 2026).
 *
 * What it does, and nothing else:
 *   - answers GET and HEAD from the bundle (site/dist/bundle.json) for the CURRENT PHASE, by host and
 *     path only (the query string never changes content); other methods 405
 *   - www.<host> and http:// -> 301 to https://<host><same path and query>
 *   - every answer: X-Robots-Tag "noindex, noarchive", Cache-Control "no-store"
 *   - writes EVERY request to the D1 table `requests` (time, host, method, path, query, user agent,
 *     status, phase, network, country, Cloudflare's verified-bot category when Cloudflare supplies it)
 *   - /__s6/* is the harness's admin door. Without the right Bearer key it answers exactly like any
 *     unknown path (404 page); with it: GET health, GET/PUT phase, GET log. Admin calls are not
 *     written to `requests`; phase changes are written to `phase_changes`.
 *
 * Bindings (wrangler.toml): DB (D1 database), ADMIN_TOKEN (secret). The phase lives in D1 (table
 * `state`) and is read on every request, so a switch takes effect at once on every Cloudflare location.
 */
import bundleJson from "./dist/bundle.json";

type Phase = "closed" | "check" | "W" | "D0" | "D1" | "S7F0" | "S7F1" | "S7F3" | "S7R";
const PHASES: readonly Phase[] = ["closed", "check", "W", "D0", "D1", "S7F0", "S7F1", "S7F3", "S7R"];
interface Bundle {
  mock: boolean;
  builtAt: string;
  bundleSha256: string;
  files: Record<string, { contentType: string; body: string }>;
  routes: Record<Phase, Record<string, Record<string, string>>>;
  notFound: Record<Phase, Record<string, string>>;
  holding: string;
  checker?: {
    host: string;
    explorerHost: string;
    brand: string;
    declaration: { website: string; account: string; url: string };
    records: Record<string, { product: string; serial: string; collection: string; tokenIdHex: string }>;
    pages: { home: string; notFound: string };
  };
}

/** The minimum of Cloudflare's D1 interface this Worker uses (so the selftest can pass a fake). */
export interface D1Like {
  prepare(sql: string): { bind(...v: unknown[]): { run(): Promise<unknown>; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<{ results: T[] }> } };
}
export interface Env {
  DB: D1Like;
  ADMIN_TOKEN: string;
  /** X-Robots-Tag value (wrangler var); default "noindex, noarchive". */
  ROBOTS_TAG?: string;
  /** Tests only: replaces the global fetch the record service uses to read the explorer. */
  FETCH?: typeof fetch;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const BUNDLE = bundleJson as unknown as Bundle;
/**
 * Which wording the record service uses, reported by the admin health answer (the bundle hash does not
 * cover this file). "A38": the Study 6 sentence "A seller on any other website is not the holder of this
 * item." is dropped from the brand-holds summary (James, 24 Oct 2026), because in Study 7 a legitimate shop
 * sells the item.
 */
export const RECORD_WORDING = "A38";
export const SITE_HOSTS = ["oskvale.com", "oskvale-store.com"] as const;
let BASE_HEADERS: Record<string, string> = { "X-Robots-Tag": "noindex, noarchive", "Cache-Control": "no-store" };

function respond(status: number, file: { contentType: string; body: string } | null, method: string, extra: Record<string, string> = {}): Response {
  const headers = { ...BASE_HEADERS, ...extra, ...(file ? { "Content-Type": file.contentType } : {}) };
  return new Response(method === "HEAD" || !file ? null : file.body, { status, headers });
}

async function currentPhase(env: Env): Promise<Phase> {
  const row = await env.DB.prepare("SELECT value FROM state WHERE key = 'phase'").bind().first<{ value: string }>();
  const v = row?.value as Phase | undefined;
  return v && PHASES.includes(v) ? v : "closed";
}

/** Constant-time comparison of the admin key. */
function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function json(status: number, v: unknown): Response {
  return new Response(JSON.stringify(v), { status, headers: { ...BASE_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
}

async function admin(req: Request, url: URL, env: Env): Promise<Response | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!sameKey(auth.replace(/^Bearer /, ""), env.ADMIN_TOKEN ?? "")) return null;
  const route = url.pathname.slice("/__s6/".length);
  if (route === "health" && req.method === "GET") {
    return json(200, { ok: true, phase: await currentPhase(env), bundleSha256: BUNDLE.bundleSha256, builtAt: BUNDLE.builtAt, mock: BUNDLE.mock, recordWording: RECORD_WORDING });
  }
  if (route === "phase" && req.method === "GET") return json(200, { phase: await currentPhase(env) });
  if (route === "phase" && req.method === "PUT") {
    const body = (await req.json().catch(() => null)) as { phase?: string; note?: string } | null;
    const to = body?.phase as Phase | undefined;
    if (!to || !PHASES.includes(to)) return json(400, { error: `phase must be one of ${PHASES.join(", ")}` });
    const from = await currentPhase(env);
    const at = new Date().toISOString();
    await env.DB.prepare("INSERT INTO state (key, value) VALUES ('phase', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(to).run();
    await env.DB.prepare("INSERT INTO phase_changes (ts, from_phase, to_phase, note) VALUES (?1, ?2, ?3, ?4)").bind(at, from, to, String(body?.note ?? "").slice(0, 200)).run();
    return json(200, { from, to, at });
  }
  if (route === "log" && req.method === "GET") {
    const since = Math.max(0, Number(url.searchParams.get("since_id") ?? 0) | 0);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 500) | 0));
    const r = await env.DB.prepare("SELECT * FROM requests WHERE id > ?1 ORDER BY id LIMIT ?2").bind(since, limit).all();
    const p = await env.DB.prepare("SELECT * FROM phase_changes ORDER BY id").bind().all();
    return json(200, { requests: r.results, phaseChanges: p.results });
  }
  return json(404, { error: "no such admin route" });
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Study 7's independent record service: one page per item, built at request time from the PUBLIC
 * LEDGER (the explorer's item record, read live) and the brand's declaration as published. It states
 * the holder and the brand's declared website in plain words and as JSON. Same frame as site/assets.ts.
 */
async function renderRecord(c: NonNullable<Bundle["checker"]>, path: string, env: Env): Promise<{ status: number; body: string; json: unknown }> {
  const r = c.records[path];
  if (!r) {
    // A well-formed GS1 Digital Link item path with no record: answered plainly (200), as a registry
    // answers "not found" for an identifier it does not know. Anything else is a 404.
    const m = /^\/01\/(\d{14})\/21\/([^/]{1,40})$/.exec(path);
    if (!m) return { status: 404, body: BUNDLE.files[c.pages.notFound].body, json: null };
    const summary = "No passport record exists on the public ledger for this product identifier.";
    const json = { gtin: m[1], serial: m[2], record: null, summary, readAt: new Date().toISOString() };
    const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Passport record: GTIN ${m[1]}, serial ${escHtml(m[2])}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#111;line-height:1.55}h1{font-size:24px}pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}</style>
</head>
<body>
<h1>Passport record</h1>
<p>GTIN ${m[1]}, serial ${escHtml(m[2])}</p>
<p><strong>Summary:</strong> ${summary}</p>
<pre>${escHtml(JSON.stringify(json, null, 2))}</pre>
</body>
</html>
`;
    return { status: 200, body, json };
  }
  const itemUrl = `https://${c.explorerHost}/api/v2/tokens/${r.collection}/instances/${r.tokenIdHex}`;
  const readAt = new Date().toISOString();
  let owner: string | null = null;
  let readError: string | null = null;
  try {
    const res = await (env.FETCH ?? fetch)(itemUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) readError = `the ledger record answered HTTP ${res.status}`;
    else owner = (((await res.json()) as { owner?: { hash?: string } }).owner?.hash ?? "").toLowerCase() || null;
  } catch (e) {
    readError = "the ledger record could not be reached";
  }
  const isBrand = owner !== null && owner === c.declaration.account;
  const summary = readError
    ? `The public ledger record could not be read just now (${readError}).`
    : isBrand
      ? `The item is held by the brand, ${c.brand}. The brand's declared website is ${c.declaration.website}.`
      : `The item is held by account ${owner}, which is not ${c.brand}'s declared account. The brand's declared website is ${c.declaration.website}.`;
  const json = {
    product: r.product,
    serial: r.serial,
    issuingBrand: c.brand,
    brandDeclaredWebsite: c.declaration.website,
    brandDeclaredAccount: c.declaration.account,
    brandDeclaration: c.declaration.url,
    currentHolder: owner,
    holderIsBrand: readError ? null : isBrand,
    network: { name: "LUKSO mainnet", chainId: 42 },
    collection: r.collection,
    ledgerRecord: itemUrl,
    readAt,
    summary,
  };
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Passport record: ${escHtml(r.product)}, serial ${escHtml(r.serial)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#111;line-height:1.55}h1{font-size:24px}dt{color:#555;margin-top:10px}dd{margin:0;overflow-wrap:anywhere}pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}</style>
</head>
<body>
<h1>Passport record</h1>
<p><strong>${escHtml(r.product)}</strong>, serial ${escHtml(r.serial)}</p>
<p><strong>Summary:</strong> ${escHtml(summary)}</p>
<dl>
<dt>Issuing brand</dt><dd>${escHtml(c.brand)}</dd>
<dt>Brand's declared website</dt><dd>${escHtml(c.declaration.website)} (from the brand's declaration, ${escHtml(c.declaration.url)})</dd>
<dt>Brand's declared ledger account</dt><dd>${escHtml(c.declaration.account)}</dd>
<dt>Current holder of this item</dt><dd>${escHtml(owner ?? "not read")}${readError ? "" : isBrand ? " (the brand's declared account)" : " (not the brand's declared account)"}</dd>
<dt>Network</dt><dd>LUKSO mainnet, chain ID 42</dd>
<dt>Product collection</dt><dd>${escHtml(r.collection)}</dd>
<dt>Read from the public ledger</dt><dd>${escHtml(readAt)}, ${escHtml(itemUrl)}</dd>
</dl>
<pre>${escHtml(JSON.stringify(json, null, 2))}</pre>
</body>
</html>
`;
  return { status: 200, body, json };
}

export async function handle(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  BASE_HEADERS = { "X-Robots-Tag": env.ROBOTS_TAG ?? "noindex, noarchive", "Cache-Control": "no-store" };
  const url = new URL(req.url);
  const rawHost = url.hostname.toLowerCase();
  const host = rawHost.startsWith("www.") ? rawHost.slice(4) : rawHost;
  const cf = (req as unknown as { cf?: Record<string, unknown> }).cf ?? {};
  const started = new Date().toISOString();
  let phase: Phase = "closed";
  let res: Response;

  const checker = BUNDLE.checker;
  if (checker && host === checker.host && rawHost === host && url.protocol !== "http:" && !url.pathname.startsWith("/__s6/")) {
    phase = await currentPhase(env);
    if (req.method !== "GET" && req.method !== "HEAD") res = new Response(null, { status: 405, headers: { ...BASE_HEADERS, Allow: "GET, HEAD" } });
    else if (url.pathname === "/" ) res = respond(200, BUNDLE.files[checker.pages.home], req.method);
    else if (url.pathname === "/robots.txt") res = respond(200, { contentType: "text/plain; charset=utf-8", body: "User-agent: *\nAllow: /\n" }, req.method);
    else {
      const path = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
      const wantsJson = url.searchParams.get("format") === "json" || /application\/json/.test(req.headers.get("Accept") ?? "");
      const rec = await renderRecord(checker, path, env);
      res = wantsJson && rec.json ? respond(rec.status, { contentType: "application/json; charset=utf-8", body: JSON.stringify(rec.json, null, 2) + "\n" }, req.method) : respond(rec.status, { contentType: "text/html; charset=utf-8", body: rec.body }, req.method);
    }
  } else if (checker && (host === checker.host) && (rawHost !== host || url.protocol === "http:")) {
    res = new Response(null, { status: 301, headers: { ...BASE_HEADERS, Location: `https://${host}${url.pathname}${url.search}` } });
  } else if (!(SITE_HOSTS as readonly string[]).includes(host)) {
    res = new Response(null, { status: 404, headers: BASE_HEADERS });
  } else if (rawHost !== host || url.protocol === "http:") {
    phase = await currentPhase(env); // logged with the row, so a redirect is not mistaken for another phase
    res = new Response(null, { status: 301, headers: { ...BASE_HEADERS, Location: `https://${host}${url.pathname}${url.search}` } });
  } else {
    // admin calls are not logged as visits; a wrong or missing key falls through to the plain 404 below
    const adm = url.pathname.startsWith("/__s6/") ? await admin(req, url, env) : null;
    if (adm) return adm;
    phase = await currentPhase(env);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res = new Response(null, { status: 405, headers: { ...BASE_HEADERS, Allow: "GET, HEAD" } });
    } else {
      // a trailing slash finds the same page; nothing else is normalised
      const path = url.pathname.length > 1 && url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
      const id = BUNDLE.routes[phase][host][path];
      res = id ? respond(200, BUNDLE.files[id], req.method) : respond(404, BUNDLE.files[BUNDLE.notFound[phase][host]], req.method);
    }
  }

  const bot = cf.botManagement as { verifiedBot?: boolean } | undefined;
  ctx.waitUntil(
    env.DB.prepare(
      "INSERT INTO requests (ts, host, raw_host, method, path, query, ua, status, phase, asn, as_org, country, colo, verified_bot, verified_bot_category, ray, referer, accept) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
    )
      .bind(
        started,
        host,
        rawHost,
        req.method,
        url.pathname,
        url.search,
        (req.headers.get("User-Agent") ?? "").slice(0, 400),
        res.status,
        phase,
        (cf.asn as number | undefined) ?? null,
        ((cf.asOrganization as string | undefined) ?? "").slice(0, 120) || null,
        (cf.country as string | undefined) ?? null,
        (cf.colo as string | undefined) ?? null,
        bot?.verifiedBot === undefined ? null : bot.verifiedBot ? 1 : 0,
        (cf.verifiedBotCategory as string | undefined) ?? null,
        req.headers.get("cf-ray"),
        (req.headers.get("Referer") ?? "").slice(0, 400) || null,
        (req.headers.get("Accept") ?? "").slice(0, 200) || null,
      )
      .run()
      .catch(() => undefined),
  );
  return res;
}

export default { fetch: (req: Request, env: Env, ctx: Ctx) => handle(req, env, ctx) };
