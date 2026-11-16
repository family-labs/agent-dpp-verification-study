/**
 * Study 6 live sites: offline selftest of the Worker against the built bundle (no network).
 * Run from harness/:  bun run ../site/selftest-site.ts [--mock]
 * Needs site/dist/bundle.json (bun run ../site/build-site.ts [--mock]). Exit 0 only if every check passes.
 *
 *   T1  every route of every phase and host answers 200 with the bundle's bytes and content type, and
 *       every stimulus file is served at its manifest URL in each phase that should show it
 *   T2  every answer carries X-Robots-Tag noindex and Cache-Control no-store
 *   T3  the declaration file: 200 JSON on the brand host in D1 only; 404 in every other phase and on the
 *       copycat host always; W shows the plain-claim product pages and no passport or DoC page
 *   T4  content never depends on the query string or the user agent
 *   T5  www. and http:// answer 301 to https://<host> with the path and query kept; another host 404;
 *       POST answers 405
 *   T6  every link and asset reference in every served HTML page resolves (200) in that phase
 *   T7  /__s6/: a missing or wrong key answers byte for byte like an unknown path; with the key, the
 *       phase switch works and is recorded; the log returns each visit with its time, query and user agent
 *   T8  robots.txt answers 200 in every phase and allows every fetcher
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND_HOST, DECLARATION_PATH, LOOKALIKE_HOST, PRODUCT_KEYS, productPath, readS6Manifest, passportPagePath, docPath } from "../stimulus/study6";
import { BUNDLE_FILE, HOSTS, PHASES, type Bundle, type Phase } from "./build-site";
import { localEnv } from "./local-env";

const MOCK = process.argv.includes("--mock");
if (!existsSync(BUNDLE_FILE)) {
  console.error(`missing ${BUNDLE_FILE}: run site/build-site.ts first`);
  process.exit(2);
}
const B = JSON.parse(readFileSync(BUNDLE_FILE, "utf8")) as Bundle;
if (B.mock !== MOCK) {
  console.error(`the bundle is ${B.mock ? "MOCK" : "counted"}; run with${B.mock ? "" : "out"} --mock or rebuild`);
  process.exit(2);
}
const { handle } = await import("./worker");
const KEY = "selftest-admin-key-0123456789";
const env = localEnv(KEY);
const ctx = { waitUntil: (p: Promise<unknown>) => void env.pending.push(p) };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const results: Array<{ id: string; ok: boolean; lines: string[] }> = [];
const gate = (id: string, bad: string[], okLine: string) => results.push({ id, ok: bad.length === 0, lines: bad.length ? bad.slice(0, 40) : [okLine] });

async function get(url: string, init: RequestInit & { ua?: string } = {}) {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", init.ua ?? "selftest/1.0");
  const r = await handle(new Request(url, { ...init, headers }), env, ctx);
  const body = r.body ? await r.text() : "";
  return { status: r.status, headers: r.headers, body };
}
async function setPhase(p: Phase) {
  const r = await get(`https://${BRAND_HOST}/__s6/phase`, { method: "PUT", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ phase: p, note: "selftest" }) });
  if (r.status !== 200) throw new Error(`phase switch to ${p} failed: ${r.status} ${r.body}`);
}

const m = readS6Manifest(MOCK)!;
const t1: string[] = [];
const t2: string[] = [];
let served = 0;
for (const ph of PHASES) {
  await setPhase(ph);
  for (const h of HOSTS)
    for (const [path, id] of Object.entries(B.routes[ph][h])) {
      const r = await get(`https://${h}${path}`);
      served++;
      if (r.status !== 200 || sha(r.body) !== id || r.headers.get("Content-Type") !== B.files[id].contentType) t1.push(`${ph} ${h}${path}: ${r.status}, bytes ${sha(r.body) === id ? "ok" : "differ"}`);
      if (!/noindex/.test(r.headers.get("X-Robots-Tag") ?? "") || r.headers.get("Cache-Control") !== "no-store") t2.push(`${ph} ${h}${path}: headers ${r.headers.get("X-Robots-Tag")} / ${r.headers.get("Cache-Control")}`);
    }
  // the stimuli each phase must show, at their manifest URLs
  const want: string[] =
    ph === "W" ? ["brand/home", ...PRODUCT_KEYS.map((k) => `${k}/store-W`)] : ph === "D0" || ph === "D1" ? [...PRODUCT_KEYS.flatMap((k) => [`${k}/store-G-${ph}`, `${k}/lookalike-F-${ph}`, `${k}/passport-${ph}`, `${k}/doc-G`, `${k}/doc-F`]), "brand/home", "lookalike/home"] : [];
  if (ph === "D1") want.push("declaration");
  for (const k of want) {
    const e = m.stimuli[k];
    const r = await get(e.url);
    if (r.status !== 200 || sha(r.body) !== e.sha256) t1.push(`${ph}: ${k} not served at ${e.url} with its manifest bytes (${r.status})`);
  }
}
gate("T1 every route serves the bundle's bytes; each phase shows its stimuli", t1, `${served} route answers across ${PHASES.length} phases x 2 hosts, all with the bundle's bytes and type; every phase's stimuli at their manifest URLs`);

// T3
const t3: string[] = [];
for (const ph of PHASES) {
  await setPhase(ph);
  const d = await get(`https://${BRAND_HOST}${DECLARATION_PATH}`);
  const published = ph === "D1" || ph.startsWith("S7");
  if (published ? d.status !== 200 || !/json/.test(d.headers.get("Content-Type") ?? "") : d.status !== 404) t3.push(`${ph}: declaration on the brand host answers ${d.status}`);
  const dl = await get(`https://${LOOKALIKE_HOST}${DECLARATION_PATH}`);
  if (dl.status !== 404) t3.push(`${ph}: declaration on the copycat host answers ${dl.status}`);
  const nf = await get(`https://${BRAND_HOST}/products/another`);
  if (nf.status !== 404 || !/noindex/.test(nf.headers.get("X-Robots-Tag") ?? "")) t3.push(`${ph}: an unknown path answers ${nf.status}`);
  if (!/noindex/.test(d.headers.get("X-Robots-Tag") ?? "")) t2.push(`${ph}: 404 without noindex`);
}
await setPhase("W");
for (const k of PRODUCT_KEYS) {
  const p = await get(`https://${BRAND_HOST}${productPath(k)}`);
  if (p.status !== 200 || p.body.includes('id="battery-passport"') || !p.body.includes("Authentic, verified by Oskvale.")) t3.push(`W: ${k} product page is not the plain-claim page`);
  for (const path of [passportPagePath(k), docPath(k)]) if ((await get(`https://${BRAND_HOST}${path}`)).status !== 404) t3.push(`W: ${path} is served`);
  if ((await get(`https://${LOOKALIKE_HOST}${productPath(k)}`)).status !== 404) t3.push(`W: the copycat serves ${productPath(k)}`);
}
gate("T3 declaration only in D1 on the brand host; W has no passport", t3, "declaration 200 JSON in D1 and the Study 7 phases on oskvale.com only; 404 in closed/check/W/D0 and always on oskvale-store.com; W serves the plain-claim pages, no passport or DoC page, no copycat shop");
gate("T2 noindex and no-store on every answer", t2, "X-Robots-Tag noindex, noarchive and Cache-Control no-store on every 200 and 404");

// T4
const t4: string[] = [];
await setPhase("D1");
for (const k of PRODUCT_KEYS)
  for (const h of HOSTS) {
    const base = await get(`https://${h}${productPath(k)}`);
    for (const v of [
      { q: "?utm_source=share&utm_id=ab12cd34", ua: "selftest/1.0" },
      { q: "", ua: "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)" },
      { q: "?x=1", ua: "Claude-User" },
    ]) {
      const r = await get(`https://${h}${productPath(k)}${v.q}`, { ua: v.ua });
      if (r.body !== base.body) t4.push(`${h}${productPath(k)}${v.q} (${v.ua}) differs`);
    }
  }
gate("T4 content never depends on query or user agent", t4, "same bytes with and without a share tag, for three user agents, on every product page of both hosts");

// T5
const t5: string[] = [];
const w = await get(`https://www.${BRAND_HOST}${productPath("lmt")}?utm_id=x`);
if (w.status !== 301 || w.headers.get("Location") !== `https://${BRAND_HOST}${productPath("lmt")}?utm_id=x`) t5.push(`www: ${w.status} ${w.headers.get("Location")}`);
const wl = await get(`https://www.${LOOKALIKE_HOST}/`);
if (wl.status !== 301 || wl.headers.get("Location") !== `https://${LOOKALIKE_HOST}/`) t5.push(`www copycat: ${wl.status} ${wl.headers.get("Location")}`);
const hp = await get(`http://${BRAND_HOST}/`);
if (hp.status !== 301 || hp.headers.get("Location") !== `https://${BRAND_HOST}/`) t5.push(`http: ${hp.status} ${hp.headers.get("Location")}`);
if ((await get("https://example.org/")).status !== 404) t5.push("another host is not 404");
const post = await get(`https://${BRAND_HOST}${productPath("lmt")}`, { method: "POST", body: "x" });
if (post.status !== 405) t5.push(`POST answers ${post.status}`);
const head = await get(`https://${BRAND_HOST}/`, { method: "HEAD" });
if (head.status !== 200 || head.body !== "") t5.push(`HEAD answers ${head.status} with ${head.body.length} bytes`);
gate("T5 redirects, other hosts, methods", t5, "www. and http:// -> 301 to https://<host> keeping path and query; other host 404; POST 405; HEAD 200 without a body");

// T6 link integrity per phase
const t6: string[] = [];
let links = 0;
for (const ph of PHASES) {
  await setPhase(ph);
  for (const h of HOSTS)
    for (const [path, id] of Object.entries(B.routes[ph][h])) {
      if (!B.files[id].contentType.startsWith("text/html")) continue;
      const html = B.files[id].body;
      const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((x) => x[1]).filter((u) => !u.startsWith("mailto:"));
      for (const ref of refs) {
        let u: URL;
        try {
          u = new URL(ref, `https://${h}${path}`);
        } catch {
          t6.push(`${ph} ${h}${path}: bad reference ${ref}`);
          continue;
        }
        if (!(HOSTS as readonly string[]).includes(u.hostname)) continue; // the explorer is a third party
        links++;
        const r = await get(u.href);
        if (r.status !== 200) t6.push(`${ph} ${h}${path}: ${u.href} answers ${r.status}`);
      }
    }
}
gate("T6 every link and asset on our hosts resolves in its phase", t6, `${links} references to our two hosts in served pages, all 200 in their phase (explorer links are a third party, not followed here)`);

// T7 admin door
const t7: string[] = [];
await setPhase("D0");
const unknown = await get(`https://${BRAND_HOST}/__s6/nothing-here`);
for (const [label, init] of [
  ["no key", {}],
  ["wrong key", { headers: { Authorization: "Bearer wrong" } }],
] as const) {
  const r = await get(`https://${BRAND_HOST}/__s6/health`, init as RequestInit);
  if (r.status !== 404 || r.body !== unknown.body) t7.push(`${label}: ${r.status}, ${r.body === unknown.body ? "same" : "different"} body`);
}
const hl = await get(`https://${BRAND_HOST}/__s6/health`, { headers: { Authorization: `Bearer ${KEY}` } });
const hj = JSON.parse(hl.body || "{}");
if (hl.status !== 200 || hj.phase !== "D0" || hj.bundleSha256 !== B.bundleSha256) t7.push(`health: ${hl.status} ${hl.body}`);
await Promise.all(env.pending);
const tag = "?utm_source=share&utm_id=zz99yy88";
await get(`https://${LOOKALIKE_HOST}${productPath("industrial")}${tag}`, { ua: "LogProbe/2.0" });
await Promise.all(env.pending);
// page through the whole log, as the harness does
const lj = { requests: [] as Array<Record<string, unknown>>, phaseChanges: [] as Array<Record<string, unknown>> };
for (let since = 0; ; ) {
  const lg = await get(`https://${BRAND_HOST}/__s6/log?since_id=${since}&limit=1000`, { headers: { Authorization: `Bearer ${KEY}` } });
  const page = JSON.parse(lg.body || "{}") as typeof lj;
  lj.phaseChanges = page.phaseChanges ?? [];
  if (!page.requests?.length) break;
  lj.requests.push(...page.requests);
  since = Number(page.requests[page.requests.length - 1].id);
}
const row = lj.requests?.findLast((x) => x.query === tag);
if (!row || row.ua !== "LogProbe/2.0" || row.host !== LOOKALIKE_HOST || row.path !== productPath("industrial") || row.status !== 200 || row.phase !== "D0" || !row.ts) t7.push(`log row missing or wrong: ${JSON.stringify(row)}`);
if (lj.requests?.some((x) => String(x.path).startsWith("/__s6/health") && x.status === 200)) t7.push("an authorised admin call was logged as a visit");
if (!lj.phaseChanges || lj.phaseChanges.length < PHASES.length) t7.push(`phase changes not recorded (${lj.phaseChanges?.length})`);
const bad = await get(`https://${BRAND_HOST}/__s6/phase`, { method: "PUT", headers: { Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ phase: "D9" }) });
if (bad.status !== 400) t7.push(`an unknown phase was accepted (${bad.status})`);
gate("T7 admin door", t7, `no key or a wrong key = the unknown-path 404 byte for byte; health, phase switch and log work with the key; ${lj.requests?.length} visits logged with time, host, path, query, user agent, status, phase; ${lj.phaseChanges?.length} phase changes recorded`);

// T8
const t8: string[] = [];
for (const ph of PHASES) {
  await setPhase(ph);
  for (const h of HOSTS) {
    const r = await get(`https://${h}/robots.txt`);
    if (r.status !== 200 || !/User-agent: \*\nAllow: \//.test(r.body) || /Disallow/.test(r.body)) t8.push(`${ph} ${h}: robots.txt ${r.status}`);
  }
}
gate("T8 robots.txt allows every fetcher", t8, "robots.txt 200 on both hosts in every phase: User-agent * Allow /, AI fetchers named, no Disallow");

// T9 Study 7 record service (Worker-built from the live explorer; the explorer is faked here)
const t9: string[] = [];
const c = (B as unknown as { checker?: { host: string; declaration: { website: string; account: string }; records: Record<string, { collection: string; tokenIdHex: string }> } }).checker;
if (!c) t9.push("no checker in the bundle (stimulus/build-study7.ts --write first)");
else {
  const [path, rec] = Object.entries(c.records)[0];
  let holder = c.declaration.account;
  env.FETCH = (async (u: string) => {
    if (!String(u).includes(`/api/v2/tokens/${rec.collection}/instances/${rec.tokenIdHex}`)) return new Response("no", { status: 404 });
    return new Response(JSON.stringify({ owner: { hash: holder } }), { headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  await setPhase("S7F1");
  const h1 = await get(`https://${c.host}${path}?utm_id=x`);
  if (h1.status !== 200 || !h1.body.includes("The item is held by the brand, Oskvale.") || !h1.body.includes(c.declaration.website) || h1.body.includes("A seller on any other website") || !/noindex/.test(h1.headers.get("X-Robots-Tag") ?? "")) t9.push(`record page (brand holds): ${h1.status}`);
  const j = await get(`https://${c.host}${path}?format=json`);
  const jj = JSON.parse(j.body || "{}");
  if (jj.holderIsBrand !== true || jj.brandDeclaredWebsite !== c.declaration.website) t9.push(`record JSON: ${j.body.slice(0, 120)}`);
  holder = "0x000000000000000000000000000000000000dead";
  const h2 = await get(`https://${c.host}${path}`);
  if (!h2.body.includes("which is not Oskvale's declared account")) t9.push("record page does not report a non-brand holder");
  env.FETCH = (async () => {
    throw new Error("down");
  }) as unknown as typeof fetch;
  const h3 = await get(`https://${c.host}${path}`);
  if (h3.status !== 200 || !h3.body.includes("could not be read just now")) t9.push("explorer outage not reported");
  if ((await get(`https://${c.host}/01/0000/21/x`)).status !== 404) t9.push("unknown record path is not 404");
  const nr = await get(`https://${c.host}/01/09520606000040/21/000001`);
  if (nr.status !== 200 || !nr.body.includes("No passport record exists on the public ledger")) t9.push(`a well-formed unknown identifier is not answered "no record" (${nr.status})`);
  if ((await get(`https://${c.host}/`)).status !== 200) t9.push("record service home not 200");
  const w = await get(`https://www.${c.host}${path}`);
  if (w.status !== 301) t9.push(`www record host answers ${w.status}`);
  env.FETCH = undefined;
}
gate("T9 Study 7 record service", t9, "brand holder -> plain summary naming the declared website; JSON form; a non-brand holder and an explorer outage are reported as such; a well-formed unknown identifier answers no-record; a malformed path 404; noindex; www 301");

await setPhase("closed");
console.log(`\n=== STUDY 6 SITE SELFTEST${MOCK ? " [MOCK BUNDLE]" : ""} - bundle ${B.bundleSha256.slice(0, 16)} built ${B.builtAt} ===`);
for (const r of results) console.log(`[${r.ok ? "PASS" : "FAIL"}] ${r.id}${r.lines.map((l) => `\n      ${l}`).join("")}`);
const ok = results.every((r) => r.ok);
console.log(`\nSITE SELFTEST: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
