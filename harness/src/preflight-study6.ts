/**
 * Study 6 preflight. Gates S0-S11 are OFFLINE (no network: every fetch_url call they make is to a
 * stored page or to a host the tool refuses before any request). Gate L1 is live and runs only
 * with --live: it reads the explorer the stimuli point at (the TESTNET explorer in --mock mode).
 *
 *   S0  Fixtures: fixtures/study6-conditions.json has no null id and names LUKSO mainnet, chain 42
 *       (counted mode). --mock: the testnet collections A/B/C are used and the nulls are listed as a note.
 *   S1  Every stimulus hashes and builds: every manifest entry matches its file, and buildAll()
 *       from the manifest's fixtures reproduces every file byte for byte (same keys, same URLs);
 *       the manifest's fixtures equal the fixture file (counted) or MOCK_FIXTURES (mock).
 *   S2  D0 and D1 differ ONLY by the declaration field and file: for each product and page (store G,
 *       lookalike F, passport page) the D1 page minus D1_FIELD_LINE and its JSON-LD minus the last
 *       additionalProperty (= D1_JSONLD_PROPERTY) equal the D0 page exactly; no D0 page names the
 *       issuer declaration; the served set of X-D1 is X-D0's (arm pages swapped) plus the declaration only.
 *   S3  The copycat F differs from the brand ONLY in the host-bound strings, for EVERY copied page
 *       (home, collections, returns, warranty, contact, the three declarations of conformity, the
 *       product pages of both arms): the copy's href="https://oskvale-store.com..." paths, in page order,
 *       are exactly study6.ts hostBoundPaths() for that page; the brand page's host-bound paths are the
 *       same list on https://oskvale.com; the lookalike host occurs nowhere else in the copy; the copy
 *       with those strings moved back is the brand page byte for byte; on a product page the only
 *       brand-host links left in the copy are the passport page (and, in D1, the issuer declaration);
 *       the copy's block equals the brand's block with its declaration-of-conformity link moved back;
 *       the brand's block equals the passport page's. The PASS lines list every differing string.
 *   S4  W has no passport: no block, no JSON-LD, no GTIN, no serial, no explorer, no declaration of
 *       either kind; it carries AUTH_CLAIM; it is G-D0's page with the block replaced by the claim.
 *   S5  No page, block or declaration contains a banned word (blockchain, on-chain, NFT, crypto,
 *       web3, certified, compliant) or an instruction-like phrase (study6.ts INSTRUCTION_PATTERNS),
 *       and no stimulus names a reserved .example host or carries a registry-number label.
 *   S6  GTIN check digits valid (EAN-13), prefix 952, the GTIN in every block is the computed one, and
 *       it equals the GTIN-14 in fixtures/study6-conditions.json and fixtures/study6-batteries.json.
 *   S7  Every link target (every URL in every page and the declaration) is on the allow-list
 *       (oskvale.com, oskvale-store.com, or the explorer host on an /api/v2/ path); none is a platform host.
 *       The one non-link URL allowed is the JSON-LD "@context" https://schema.org.
 *   S8  fetch_url, built as a trial builds it, serves every stored URL of every cell with its hash;
 *       every link on a fictional host in every served page resolves (200) in that cell; it answers
 *       404 for the declaration in D0 and W, for the declaration path on the LOOKALIKE host in every
 *       cell, and for another path on either fictional host; it refuses an off-list host, every
 *       platform host, www.oskvale.com and the old .example hosts.
 *   S9  The prompt and follow-up never name passports, ledgers, records, declarations or checking
 *       (PROMPT_FORBIDDEN_RE); the fetch tool description is Study 2's.
 *   S10 The declaration is minimal: exactly version, organisation, website, account, network
 *       {name, chainId}, collections [{address, product}], matching the fixtures; its website is the
 *       brand's origin (https://oskvale.com), never the lookalike's.
 *   S11 The stimulus matches the mainnet product data: the fixture keys are lmt, industrial, stationary;
 *       each title, model and DoC number is the one in study6-batteries.json; manufacturer.webAddress
 *       and the creator script's WEB_ORIGIN are https://oskvale.com and BRAND is "Oskvale"; every DoC
 *       field of the data appears in the DoC page's text.
 *   L1  (--live) Each product's item record answers 200 JSON whose owner.hash is the fixture profile
 *       and whose id is the fixture token id; its collection record answers 200 JSON whose newest
 *       OwnershipTransferred names the fixture profile as owner. It also logs the holder's `owner.name`
 *       as the explorer shows it (the public profile is named "Oskvale"; see the A36 draft).
 *       Live reads are paced at most 1 per second and stop on HTTP 429.
 *
 * Usage (from harness/):  bun run src/preflight-study6.ts --mock          offline, mock stimuli
 *                         bun run src/preflight-study6.ts --mock --live   + L1 on the TESTNET explorer
 *                         bun run src/preflight-study6.ts --live          counted stimuli (LUKSO mainnet, read-only)
 * Exit 0 only if every gate run passes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createFetchTool, FETCH_TOOL_DESCRIPTION, NOT_REACHABLE } from "./fetch-tool";
import type { GateResult } from "./preflight-native";
import { PROMPT_FORBIDDEN_RE, S6_FOLLOW_UP, S6_QUESTION, S6_SYSTEM } from "./prompts-study6";
import { s6Allow, setupFor } from "./study6-stimulus";
import {
  AUTH_CLAIM,
  AUTH_CLAIM_HTML,
  BATTERY_DATA,
  BLOCK_CLOSE,
  BLOCK_OPEN,
  BRAND,
  BRAND_ORIGIN,
  buildAll,
  collectionRecordUrl,
  copiedPairs,
  D1_FIELD_LINE,
  D1_JSONLD_PROPERTY,
  DECLARATION_KEYS,
  DECLARATION_PATH,
  DECLARATION_URL,
  docPath,
  ean13Valid,
  extractBlock,
  extractJsonLd,
  fileOf,
  fixtureProblems,
  GS1_DEMO_PREFIX,
  gtin14,
  gtinOf,
  hostBoundPaths,
  hrefPathsOn,
  INSTRUCTION_PATTERNS,
  itemRecordUrl,
  LOOKALIKE_HOST,
  LOOKALIKE_ORIGIN,
  MAINNET_CHAIN_ID,
  MOCK_FIXTURES,
  notHostBoundPaths,
  PLATFORM_HOSTS,
  PRODUCT_KEYS,
  PRODUCTS,
  readFixtures,
  readS6Manifest,
  resolveFixtures,
  S6_CONDS,
  S6_CREATOR_FILE,
  S6_FICTIONAL_HOSTS,
  S6_NEAR_MISS_HOSTS,
  servedKeys,
  sha256,
  STIMULUS_DIR,
  textRuleHits,
  tokenIdHex,
  urlsIn,
  visibleAndAttrText,
  type S6Manifest,
} from "../../stimulus/study6";

export interface Study6PreflightResult {
  ok: boolean;
  ranAt: string;
  mock: boolean;
  live: boolean;
  gates: GateResult[];
}

const stripJsonLd = (html: string) => html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "<script/>");
const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const LIVE_GAP_MS = 1100;

class RateLimited extends Error {}
let lastLive = 0;

async function viaTool(url: string, stored: Array<{ url: string; html: string; contentType?: string }>, explorerHost: string, live = false, retried = false): Promise<{ status: number | null; outcome: string; contentType: string | null; body: string; json: unknown }> {
  if (live) {
    // At most one live read per second (James, 22 Oct 2026).
    const wait = lastLive + LIVE_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastLive = Date.now();
  }
  const tool = createFetchTool(stored, S6_FICTIONAL_HOSTS, s6Allow(explorerHost));
  const out = await tool.spec.execute({ url });
  const e = tool.log[0];
  if (live && e.status === 429) throw new RateLimited(`HTTP 429 from ${url}: live reads stopped`);
  // As Study 5's preflight: the explorer answers an occasional 504, so the PREFLIGHT retries a 5xx or
  // a network error once after 3 s. A trial's fetch_url never retries (what a model sees is logged).
  if (!retried && e.outcome !== "stored_page" && ((e.status !== null && e.status >= 500) || e.outcome === "network_error")) {
    await new Promise((r) => setTimeout(r, 3000));
    return viaTool(url, stored, explorerHost, live, true);
  }
  const i = out.indexOf("\n\n");
  const body = i >= 0 ? out.slice(i + 2) : out;
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* not JSON */
  }
  return { status: e.status, outcome: e.outcome, contentType: e.contentType, body, json };
}

export async function runStudy6Preflight(opts: { mock: boolean; live: boolean }): Promise<Study6PreflightResult> {
  const gates: GateResult[] = [];
  const gate = (id: string, ok: boolean, detail: string[]) => gates.push({ gate: id, ok, lines: detail.filter(Boolean) });
  const m: S6Manifest | null = readS6Manifest(opts.mock);

  // ---------------- S0
  {
    const bad = fixtureProblems(readFixtures());
    if (opts.mock) gate("S0 fixtures", true, [`MOCK: testnet collections A/B/C (never counted); fixtures/study6-conditions.json still has ${bad.length} null id(s)${bad.length ? `: ${bad.join("; ")}` : ""}`]);
    else gate("S0 fixtures", bad.length === 0, bad.length ? bad : [`every mainnet id present (LUKSO mainnet, chain ${MAINNET_CHAIN_ID})`]);
  }
  if (!m) {
    gate("S1 every stimulus hashes and builds", false, [`${opts.mock ? "stimulus/study6/mock" : "stimulus/study6"}/manifest.json missing`]);
    return { ok: false, ranAt: new Date().toISOString(), mock: opts.mock, live: opts.live, gates };
  }
  const rd = (key: string) => readFileSync(join(STIMULUS_DIR, m.stimuli[key].file), "utf8");

  // ---------------- S1
  {
    const b: string[] = [];
    if (m.mock !== opts.mock) b.push(`manifest mock=${m.mock}, preflight mock=${opts.mock}`);
    let want = MOCK_FIXTURES;
    if (!opts.mock) {
      try {
        want = resolveFixtures(readFixtures());
      } catch (e) {
        b.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (!deepEq(m.fixtures, want)) b.push("the manifest's fixtures differ from the fixture source (rebuild)");
    for (const [k, e] of Object.entries(m.stimuli)) {
      const p = join(STIMULUS_DIR, e.file);
      if (!existsSync(p)) b.push(`${k}: ${e.file} missing`);
      else if (sha256(readFileSync(p, "utf8")) !== e.sha256) b.push(`${k}: ${e.file} hash mismatch`);
    }
    const { files } = buildAll(m.fixtures);
    for (const [k, f] of files) {
      const e = m.stimuli[k];
      if (!e) b.push(`${k}: built but not in the manifest`);
      else if (e.file !== fileOf(m.mock, k) || e.url !== f.url || e.sha256 !== sha256(f.text)) b.push(`${k}: the rebuild differs from the stored file`);
    }
    for (const k of Object.keys(m.stimuli)) if (!files.has(k)) b.push(`${k}: in the manifest but not built`);
    gate("S1 every stimulus hashes and builds", b.length === 0, b.length ? b : [`${files.size} files hashed and reproduced byte for byte (built ${m.builtAt})`]);
  }

  // ---------------- S2
  {
    const b: string[] = [];
    const n: string[] = [];
    const ISSUER_DECL = /well-known|product-passports|issuer declaration/i;
    for (const p of PRODUCT_KEYS) {
      for (const part of ["store-G", "lookalike-F", "passport"]) {
        const d0 = rd(`${p}/${part}-D0`);
        const d1 = rd(`${p}/${part}-D1`);
        if (d1.split(D1_FIELD_LINE).length !== 2) b.push(`${p} ${part}: D1 does not carry the declaration field exactly once`);
        if (stripJsonLd(d1).split(D1_FIELD_LINE).join("") !== stripJsonLd(d0)) b.push(`${p} ${part}: D1 minus the declaration field != D0 (outside the JSON-LD)`);
        const j0 = extractJsonLd(d0) as Array<{ additionalProperty: unknown[] }>;
        const j1 = extractJsonLd(d1) as Array<{ additionalProperty: unknown[] }>;
        if (j0.length !== 1 || j1.length !== 1) b.push(`${p} ${part}: expected one JSON-LD block each (D0 ${j0.length}, D1 ${j1.length})`);
        else {
          const last = j1[0].additionalProperty[j1[0].additionalProperty.length - 1];
          const rest = { ...j1[0], additionalProperty: j1[0].additionalProperty.slice(0, -1) };
          if (!deepEq(last, D1_JSONLD_PROPERTY)) b.push(`${p} ${part}: D1's last JSON-LD property is not the declaration`);
          if (!deepEq(rest, j0[0])) b.push(`${p} ${part}: D1 JSON-LD minus the declaration != D0 JSON-LD`);
        }
        if (ISSUER_DECL.test(d0)) b.push(`${p} ${part}: a D0 page names the issuer declaration`);
      }
      for (const g of ["G", "F"]) {
        const s0 = servedKeys(p, `${g}-D0` as "G-D0");
        const s1 = servedKeys(p, `${g}-D1` as "G-D1");
        const mapped = s1.filter((k) => k !== "declaration").map((k) => k.replace(/-D1$/, "-D0"));
        if (!deepEq(mapped, s0) || !s1.includes("declaration") || s0.includes("declaration")) b.push(`${p} ${g}: served sets differ by more than the declaration file (D0 ${s0.join(",")}; D1 ${s1.join(",")})`);
      }
      n.push(`${p}: product, copycat and passport pages differ D0 to D1 by the one field line and the one JSON-LD property; served sets by the declaration file only`);
    }
    for (const k of Object.keys(m.stimuli)) if (k !== "declaration" && !/-D1$/.test(k) && ISSUER_DECL.test(rd(k))) b.push(`${k}: names the issuer declaration outside arm D1`);
    gate("S2 D0 and D1 differ only by the declaration field and file", b.length === 0, [...b, ...(b.length ? [] : n)]);
  }

  // ---------------- S3
  {
    const b: string[] = [];
    const listed = new Map<string, string>();
    for (const pair of copiedPairs()) {
      const g = rd(pair.g);
      const f = rd(pair.f);
      const want = hostBoundPaths(pair.page);
      const fPaths = hrefPathsOn(f, LOOKALIKE_ORIGIN);
      const extra = "store" in pair.page ? notHostBoundPaths(pair.page.store, pair.arm!) : [];
      const gPaths = hrefPathsOn(g, BRAND_ORIGIN).filter((x) => !extra.includes(x));
      if (!deepEq(fPaths, want)) b.push(`${pair.f}: copycat host-bound paths ${JSON.stringify(fPaths)} != ${JSON.stringify(want)}`);
      if (!deepEq(gPaths, want)) b.push(`${pair.g}: brand host-bound paths ${JSON.stringify(gPaths)} != ${JSON.stringify(want)}`);
      if (count(f, LOOKALIKE_HOST) !== want.length) b.push(`${pair.f}: the lookalike host occurs ${count(f, LOOKALIKE_HOST)} times, not only in its ${want.length} host-bound strings`);
      if (count(g, LOOKALIKE_HOST) !== 0) b.push(`${pair.g}: the brand page names the lookalike host`);
      const back = f.split(`href="${LOOKALIKE_ORIGIN}/`).join(`href="${BRAND_ORIGIN}/`);
      if (back !== g) b.push(`${pair.f}: with its host-bound strings moved back to ${BRAND_ORIGIN} it is not ${pair.g} byte for byte`);
      const left = hrefPathsOn(f, BRAND_ORIGIN);
      if (!deepEq(left, extra)) b.push(`${pair.f}: brand-host links left in the copy ${JSON.stringify(left)} != ${JSON.stringify(extra)}`);
      const kind = "store" in pair.page ? "product page" : "doc" in pair.page ? "declaration of conformity" : pair.page.site.startsWith("collection-") ? "collection page" : `${pair.page.site} page`;
      if (!listed.has(kind)) listed.set(kind, `(${want.length}, e.g. ${pair.f}) ${want.join(" ")}`);
      if ("store" in pair.page) {
        const p = pair.page.store;
        const gb = extractBlock(g);
        const fb = extractBlock(f);
        const pp = extractBlock(rd(`${p}/passport-${pair.arm}`));
        if (!gb || !fb || !pp) b.push(`${pair.g}: a page has no block`);
        else {
          if (fb.split(`href="${LOOKALIKE_ORIGIN}${docPath(p)}"`).join(`href="${BRAND_ORIGIN}${docPath(p)}"`) !== gb) b.push(`${pair.f}: the copy's block is not the brand's with only the declaration-of-conformity link moved`);
          if (gb !== pp) b.push(`${pair.g}: the passport page's block differs from the product page's`);
          if (/issuer declaration/i.test(f) !== (pair.arm === "D1")) b.push(`${pair.f}: ${pair.arm === "D1" ? "lacks" : "carries"} the issuer declaration line`);
        }
      }
    }
    gate("S3 the copycat differs from the brand only in the host-bound strings", b.length === 0, b.length ? b : [
      `${copiedPairs().length} copied pages (7 site pages, 3 declarations of conformity, 3 products x 2 arms): each copy = the brand page with only href="${BRAND_ORIGIN}<path>" -> href="${LOOKALIKE_ORIGIN}<path>" for exactly these paths, in page order (header + nav: / and 3 collections and /contact; footer: /returns /warranty /contact):`,
      ...[...listed].map(([k, s]) => `  ${k} ${s}`),
      `product pages: the block's declaration-of-conformity link is the one host-bound link inside the block; the passport-page link and (D1) the issuer declaration stay on ${BRAND_ORIGIN}; the brand's block = the passport page's block`,
      `the lookalike host ${LOOKALIKE_HOST} occurs nowhere else in any copy; the support e-mail is the same on both hosts`,
    ]);
  }

  // ---------------- S4
  {
    const b: string[] = [];
    for (const p of PRODUCT_KEYS) {
      const w = rd(`${p}/store-W`);
      const g = rd(`${p}/store-G-D0`);
      if (w.includes(BLOCK_OPEN) || /passport/i.test(w)) b.push(`${p}: W carries a passport`);
      if (/application\/ld\+json/.test(w)) b.push(`${p}: W carries JSON-LD`);
      if (w.includes(gtinOf(p)) || w.includes(PRODUCTS[p].serial)) b.push(`${p}: W names the GTIN or serial`);
      if (w.includes(m.explorerHost) || /declaration|well-known|explorer|lukso|\/doc\//i.test(w)) b.push(`${p}: W names the explorer or a declaration`);
      if (!w.includes(AUTH_CLAIM)) b.push(`${p}: W lacks its claim`);
      const block = extractBlock(g)!;
      if (g.replace(block, AUTH_CLAIM_HTML) !== w) b.push(`${p}: W is not G-D0 with the block replaced by the claim`);
      if (!block.endsWith(BLOCK_CLOSE)) b.push(`${p}: block extraction failed`);
    }
    for (const k of servedKeys("lmt", "W")) if (/passport|well-known|\/doc\//i.test(rd(k))) b.push(`W cell serves ${k}, which names a passport or a declaration`);
    gate("S4 W has no passport", b.length === 0, b.length ? b : [`W = G-D0 with the block replaced by ${JSON.stringify(AUTH_CLAIM)}; no GTIN, serial, JSON-LD, explorer, declaration of conformity or issuer declaration in any page a W trial is served`]);
  }

  // ---------------- S5
  {
    const b: string[] = [];
    for (const [k, e] of Object.entries(m.stimuli)) {
      const t = rd(k);
      const text = e.contentType.startsWith("text/html") ? visibleAndAttrText(t) : t;
      for (const h of textRuleHits(text)) b.push(`${k}: ${h}`);
      for (const h of textRuleHits(t).filter((x) => x.startsWith("banned"))) b.push(`${k} (raw): ${h}`);
      if (/\.example\b/i.test(t)) b.push(`${k}: names a reserved .example host`);
      if (/\b(VAT (no|number|reg)|CVR|company (registration|number)|reg(istration)?\.? no)\b/i.test(t)) b.push(`${k}: carries a registry-number label`);
      if (/\b\d+ reviews?\b|\brating\b|\b[1-5](\.\d)? out of 5\b/i.test(visibleAndAttrText(t))) b.push(`${k}: carries a review count or rating`);
    }
    gate("S5 no banned words, no instruction-like phrases", b.length === 0, b.length ? [...new Set(b)] : [`${Object.keys(m.stimuli).length} files clean (banned words, ${INSTRUCTION_PATTERNS.length} instruction-like patterns, no .example host, no registry-number label, no review count)`]);
  }

  // ---------------- S6
  {
    const b: string[] = [];
    if (!ean13Valid("4006381333931")) b.push("the EAN-13 routine rejects the GS1 textbook example 4006381333931");
    if (ean13Valid("4006381333932")) b.push("the EAN-13 routine accepts a wrong check digit");
    const fxFile = readFixtures();
    for (const p of PRODUCT_KEYS) {
      const g = gtinOf(p);
      if (!ean13Valid(g)) b.push(`${p}: ${g} has a wrong check digit`);
      if (!g.startsWith(GS1_DEMO_PREFIX)) b.push(`${p}: ${g} is not under GS1 prefix ${GS1_DEMO_PREFIX}`);
      if (m.gtins[p] !== g) b.push(`${p}: manifest GTIN ${m.gtins[p]} != ${g}`);
      if (fxFile.products[p]?.gtin !== gtin14(g)) b.push(`${p}: study6-conditions.json gtin ${fxFile.products[p]?.gtin} != ${gtin14(g)}`);
      if (PRODUCTS[p].dataGtin !== gtin14(g)) b.push(`${p}: study6-batteries.json gtin ${PRODUCTS[p].dataGtin} != ${gtin14(g)}`);
      for (const a of ["D0", "D1"]) {
        const blk = extractBlock(rd(`${p}/store-G-${a}`)) ?? "";
        if (!blk.includes(`<dt>GTIN</dt><dd>${g}</dd>`) || !blk.includes(`"gtin13": "${g}"`)) b.push(`${p} ${a}: the block does not carry ${g}`);
      }
    }
    gate("S6 GTIN check digits valid (GS1 952)", b.length === 0, b.length ? b : PRODUCT_KEYS.map((p) => `${p}: ${gtinOf(p)} valid EAN-13, prefix 952; = ${gtin14(gtinOf(p))} in both fixture files`));
  }

  // ---------------- S7
  {
    const b: string[] = [];
    const allowed = new Set<string>([...S6_FICTIONAL_HOSTS, m.explorerHost]);
    let n = 0;
    for (const k of Object.keys(m.stimuli)) {
      for (const u of urlsIn(rd(k))) {
        if (u === "https://schema.org") continue;
        n++;
        let url: URL;
        try {
          url = new URL(u);
        } catch {
          b.push(`${k}: unparseable URL ${u}`);
          continue;
        }
        const h = url.hostname.toLowerCase();
        if ((PLATFORM_HOSTS as readonly string[]).some((x) => h === x || h.endsWith(`.${x}`))) b.push(`${k}: names a platform host ${u}`);
        else if (!allowed.has(h)) b.push(`${k}: ${u} is off the allow-list`);
        else if (h === m.explorerHost && !url.pathname.startsWith("/api/v2/")) b.push(`${k}: explorer link ${u} is not a JSON API path`);
        if (url.protocol !== "https:") b.push(`${k}: ${u} is not https`);
      }
    }
    gate("S7 every link target is on the allow-list", b.length === 0, b.length ? b : [`${n} URL occurrences across ${Object.keys(m.stimuli).length} files: all on ${[...allowed].join(", ")}`]);
  }

  // ---------------- S8
  {
    const b: string[] = [];
    let served = 0;
    let links = 0;
    for (const p of PRODUCT_KEYS)
      for (const c of S6_CONDS) {
        let s;
        try {
          s = setupFor(p, c, opts.mock);
        } catch (e) {
          b.push(`${p} ${c}: ${e instanceof Error ? e.message : e}`);
          continue;
        }
        for (const f of s.stimulusFiles) {
          const g = await viaTool(f.url, s.storedPages, s.explorerHost);
          if (g.status !== 200 || sha256(g.body) !== f.sha256) b.push(`${p} ${c}: ${f.url} not served with ${f.file}'s bytes (${g.status})`);
          else served++;
        }
        const fictional = new Set(s.storedPages.flatMap((pg) => urlsIn(pg.html)).filter((u) => (S6_FICTIONAL_HOSTS as readonly string[]).includes(new URL(u).hostname)));
        for (const u of fictional) {
          const g = await viaTool(u, s.storedPages, s.explorerHost);
          if (g.status !== 200) b.push(`${p} ${c}: the link ${u} in a served page answers ${g.status}`);
          else links++;
        }
        if (!c.endsWith("D1")) {
          const d = await viaTool(DECLARATION_URL, s.storedPages, s.explorerHost);
          if (d.status !== 404) b.push(`${p} ${c}: the declaration answers ${d.status}, not 404`);
        }
        const other = await viaTool(`${BRAND_ORIGIN}/products/another`, s.storedPages, s.explorerHost);
        if (other.status !== 404) b.push(`${p} ${c}: another brand path answers ${other.status}`);
        const lookDecl = await viaTool(`${LOOKALIKE_ORIGIN}${DECLARATION_PATH}`, s.storedPages, s.explorerHost);
        if (lookDecl.status !== 404) b.push(`${p} ${c}: the declaration path on the lookalike host answers ${lookDecl.status}, not 404`);
        const lookOther = await viaTool(`${LOOKALIKE_ORIGIN}/products/another`, s.storedPages, s.explorerHost);
        if (lookOther.status !== 404) b.push(`${p} ${c}: another lookalike path answers ${lookOther.status}`);
      }
    const refused = ["https://www.google.com/search?q=oskvale", ...PLATFORM_HOSTS.map((h) => `https://${h}/01/0${gtinOf("lmt")}`), ...S6_NEAR_MISS_HOSTS.map((h) => `https://${h}/`)];
    for (const u of refused) {
      const g = await viaTool(u, [], m.explorerHost);
      if (g.outcome !== "host_not_reachable" || !g.body.includes(NOT_REACHABLE)) b.push(`${u} was not refused (${g.outcome})`);
    }
    const plain = await viaTool(`http://${new URL(BRAND_ORIGIN).hostname}/`, [], m.explorerHost);
    if (plain.outcome !== "not_https") b.push(`http:// on the brand host was not refused (${plain.outcome})`);
    gate("S8 fetch_url serves every stored page with its hash and refuses off-list hosts", b.length === 0, b.length ? b : [
      `${served} stored responses across ${PRODUCT_KEYS.length * S6_CONDS.length} cells served with their hashes; ${links} fictional-host links in served pages all resolve in their cell`,
      `declaration 404 in D0 and W; on the lookalike host the declaration path 404 in every cell; other paths 404 on both hosts`,
      `refused: an off-list host, ${PLATFORM_HOSTS.length} platform hosts, ${S6_NEAR_MISS_HOSTS.join(", ")}; http:// refused`,
    ]);
  }

  // ---------------- S9
  {
    const b: string[] = [];
    for (const [name, t] of [["system", S6_SYSTEM], ["question", S6_QUESTION], ["follow-up", S6_FOLLOW_UP]] as const) {
      const hit = t.match(PROMPT_FORBIDDEN_RE);
      if (hit) b.push(`${name} names a checking method: "${hit[0]}"`);
    }
    if (FETCH_TOOL_DESCRIPTION !== "Fetch a web page or file over HTTPS and return its status, content type and body.") b.push("the fetch tool description is not Study 2's");
    gate("S9 prompts neutral; tool description generic", b.length === 0, b.length ? b : ["system, question and follow-up clean; fetch_url description unchanged"]);
  }

  // ---------------- S10
  {
    const b: string[] = [];
    const d = JSON.parse(rd("declaration")) as Record<string, unknown>;
    if (!deepEq(Object.keys(d), [...DECLARATION_KEYS])) b.push(`keys ${JSON.stringify(Object.keys(d))}, wanted ${JSON.stringify(DECLARATION_KEYS)}`);
    if (d.website !== BRAND_ORIGIN) b.push(`website ${d.website}, not ${BRAND_ORIGIN}`);
    if (d.website === LOOKALIKE_ORIGIN) b.push("the declaration names the lookalike shop as the website");
    if (d.organisation !== BRAND) b.push(`organisation ${d.organisation}`);
    if (d.account !== m.fixtures.profileAddress) b.push(`account ${d.account} != fixture profile`);
    if (!deepEq(d.network, { name: m.fixtures.network.name, chainId: m.fixtures.network.chainId })) b.push("network differs from the fixtures");
    const want = PRODUCT_KEYS.map((k) => ({ address: m.fixtures.products[k].collection, product: PRODUCTS[k].name }));
    if (!deepEq(d.collections, want)) b.push("collections differ from the fixtures");
    gate("S10 the declaration is minimal and matches the fixtures", b.length === 0, b.length ? b : [`${DECLARATION_KEYS.join(", ")}; website ${d.website}; account ${d.account}; ${want.length} collections`]);
  }

  // ---------------- S11
  {
    const b: string[] = [];
    const fxKeys = Object.keys(readFixtures().products ?? {});
    if (!deepEq(fxKeys, [...PRODUCT_KEYS])) b.push(`study6-conditions.json product keys ${JSON.stringify(fxKeys)} != ${JSON.stringify(PRODUCT_KEYS)}`);
    const creator = readFileSync(S6_CREATOR_FILE, "utf8");
    const web = /export const WEB_ORIGIN = "([^"]+)"/.exec(creator)?.[1];
    const brand = /export const BRAND = "([^"]+)"/.exec(creator)?.[1];
    if (web !== BRAND_ORIGIN) b.push(`create-study6-mainnet.ts WEB_ORIGIN ${web} != ${BRAND_ORIGIN}`);
    if (brand !== BRAND) b.push(`create-study6-mainnet.ts BRAND ${brand} != ${BRAND}`);
    const lines: string[] = [];
    for (const p of PRODUCT_KEYS) {
      const raw = BATTERY_DATA.products[p];
      const d = PRODUCTS[p];
      if (raw.sections.batteryIdentification.data.manufacturer.webAddress !== BRAND_ORIGIN) b.push(`${p}: manufacturer.webAddress is not ${BRAND_ORIGIN}`);
      if (raw.model !== d.model || raw.title !== d.name) b.push(`${p}: title or model differs from the data`);
      const docText = visibleAndAttrText(rd(`${p}/doc-G`)).replace(/\s+/g, " ");
      const fields = [d.doc.id, d.doc.product, d.doc.category, d.doc.batchOrSerialNumber, d.doc.manufacturerName, d.doc.manufacturerAddress, d.doc.soleResponsibilityStatement, d.doc.objectOfDeclaration, ...d.doc.legislation, ...d.doc.standards, d.doc.place, d.doc.date, d.doc.signatoryName, d.doc.signatoryFunction];
      for (const x of fields) if (!docText.includes(x.replace(/\s+/g, " "))) b.push(`${p}: the DoC page lacks ${JSON.stringify(x)}`);
      const store = rd(`${p}/store-G-D0`);
      if (!store.includes(`<h1>${d.name}</h1>`) || !store.includes(`Model ${d.model}`)) b.push(`${p}: the product page lacks the title or model`);
      lines.push(`${p}: "${d.name}", model ${d.model}, DoC ${d.doc.id} (${fields.length} DoC fields on the page)`);
    }
    gate("S11 the stimulus matches the mainnet product data", b.length === 0, b.length ? b : [...lines, `brand ${BRAND}, web origin ${BRAND_ORIGIN} (= create-study6-mainnet.ts)`]);
  }

  // ---------------- L1 (live)
  if (opts.live) {
    const b: string[] = [];
    const n: string[] = [];
    if (!m.explorerVerified && !opts.mock) n.push(`explorer host ${m.explorerHost} is an UNVERIFIED config value; this gate is its verification`);
    if (!opts.mock && m.fixtures.network.chainId !== MAINNET_CHAIN_ID) b.push(`the stimuli name chain ${m.fixtures.network.chainId}, not LUKSO mainnet ${MAINNET_CHAIN_ID}`);
    try {
      for (const p of PRODUCT_KEYS) {
        const f = m.fixtures.products[p];
        const it = await viaTool(itemRecordUrl(m.explorerHost, f.collection, f.tokenId), [], m.explorerHost, true);
        const owner = ((it.json as { owner?: { hash?: string } })?.owner?.hash ?? "").toLowerCase();
        const ownerName = (it.json as { owner?: { name?: string | null } })?.owner?.name ?? null;
        const id = String((it.json as { id?: string })?.id ?? "").toLowerCase();
        n.push(`${p} item record -> ${it.status} ${it.contentType}; owner ${owner} (owner.name ${JSON.stringify(ownerName)}); id ${id.slice(0, 16)}...`);
        if (it.status !== 200 || !/json/i.test(it.contentType ?? "")) b.push(`${p}: item record did not answer 200 JSON (${it.status} ${it.outcome})`);
        else {
          if (owner !== m.fixtures.profileAddress) b.push(`${p}: the item's holder ${owner} != the fixture profile ${m.fixtures.profileAddress}`);
          if (id !== tokenIdHex(f.tokenId)) b.push(`${p}: the instance id ${id} != the fixture token id`);
        }
        const lg = await viaTool(collectionRecordUrl(m.explorerHost, f.collection), [], m.explorerHost, true);
        type L = { decoded?: { method_call?: string; parameters?: Array<{ name: string; value: string }> } };
        const own = ((lg.json as { items?: L[] })?.items ?? []).find((x) => (x.decoded?.method_call ?? "").startsWith("OwnershipTransferred"));
        const newOwner = (own?.decoded?.parameters?.find((x) => x.name === "newOwner")?.value ?? "").toLowerCase();
        n.push(`${p} collection record -> ${lg.status}; newest OwnershipTransferred newOwner ${newOwner || "(none)"}`);
        if (lg.status !== 200) b.push(`${p}: collection record answered ${lg.status}`);
        else if (newOwner !== m.fixtures.profileAddress) b.push(`${p}: the collection's owner on the explorer ${newOwner || "(none)"} != the fixture profile`);
      }
    } catch (e) {
      if (!(e instanceof RateLimited)) throw e;
      b.push(e.message);
    }
    n.push("live reads paced at >= 1.1 s apart; any HTTP 429 stops them");
    gate(`L1 the explorer JSON names the fixture holder (${m.explorerHost})`, b.length === 0, [...b, ...n]);
  }

  return { ok: gates.every((g) => g.ok), ranAt: new Date().toISOString(), mock: opts.mock, live: opts.live, gates };
}

export function printStudy6Preflight(r: Study6PreflightResult): void {
  console.log(`\n=== STUDY 6 PREFLIGHT (S0-S11${r.live ? " + L1" : ""})${r.mock ? " [MOCK STIMULI]" : ""} - ${r.ranAt} ===`);
  for (const g of r.gates) console.log(`[${g.ok ? "PASS" : "FAIL"}] ${g.gate}${g.lines.map((l) => `\n      ${l}`).join("")}`);
  console.log(`\nSTUDY 6 PREFLIGHT: ${r.ok ? "PASS" : "FAIL"}${r.mock ? " (mock stimuli: never sufficient for a trial)" : ""}`);
}

if (import.meta.main) {
  const a = process.argv.slice(2);
  for (const x of a) if (x !== "--mock" && x !== "--live") {
    console.error(`unknown argument ${x}`);
    process.exit(2);
  }
  const r = await runStudy6Preflight({ mock: a.includes("--mock"), live: a.includes("--live") });
  printStudy6Preflight(r);
  process.exit(r.ok ? 0 : 1);
}
