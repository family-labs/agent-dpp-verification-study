/**
 * Study 3 preflight: the UCP gates U1-U5, run AFTER Study 2's gates 0-4 and the follow-up's
 * F1-F4 (preflight-native.ts, unchanged), which arm H and arm R-claude rely on as before.
 *
 *   U1  GET <api>/.well-known/ucp answers 200 and declares the extension
 *       xyz.universalgoods.api.shopping.dpp (schema on <api>/ucp/schemas/shopping/dpp.json,
 *       extending dev.ucp.shopping.catalog.lookup); the schema answers 200 under that name.
 *       ETags and the extension version are printed (to be recorded in the amendment).
 *   U2  POST <api>/ucp/catalog/lookup {"ids":[gtin]} for A, B, C: 200, exactly one product
 *       and one variant, which are the fixture's own; the variant carries a dpp block with the
 *       four keys; dpp.upi is the fixture's model-level UPI; dpp.verification_url equals the
 *       resolver's advertised links.verificationUrl (gate 2) and GETting it returns the gate-1
 *       verdict about the fixture's own product; dpp.passport_url answers 200 with the
 *       variant's passport JSON. A lookup of E's GTIN returns no product.
 *   U3  No credential-state leak: the three dpp blocks are byte-identical once each
 *       fixture's own ids and GTIN are masked (same keys, order, values). The whole lookup
 *       responses are diffed the same way and every differing path is printed; a path that
 *       reaches the arm-U listing (ids, barcodes, dpp) fails.
 *   U4  Stored stimuli: stimulus/ucp/manifest.json exists, every served file and listing
 *       matches its sha256, the stored dpp blocks equal today's live ones, the listings are
 *       reproduced byte for byte from the stored responses and the hashed S1 pages, and
 *       every listing invariant holds (stimulus/ucp.ts checkListingInvariants).
 *   U5  The fetch tool reaches every dpp link: upi, passport_url and verification_url are
 *       inside fetch_url's allow-list (no allow-list change is needed for arm U).
 *
 * Until universal-goods-testnet PR #372 is deployed, U1 fails with HTTP 404 and U2-U4 fail
 * cleanly as "not reachable / not captured". Exit 1 on any failure.
 *
 * Usage:  cd harness && <bun> run src/preflight-native.ts --study3
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkListingInvariants,
  DPP_EXTENSION_NAME,
  dppOf,
  listingE,
  listingFromLookup,
  PAGE_FILE,
  pickVariant,
  serialiseListing,
  sha256,
  STIMULUS_DIR,
  UCP_CATALOG_LOOKUP,
  UCP_CONDS,
  UCP_DIR,
  UCP_LOOKUP_URL,
  UCP_MANIFEST,
  UCP_SCHEMA_URL,
  UCP_WELL_KNOWN_URL,
  type CondIds,
  type Dpp,
  type ServedLookup,
  type UcpCond,
  type UcpListingEntry,
  type UcpManifest,
} from "../../stimulus/ucp";
import { GTIN_E } from "../../stimulus/condition-e";
import { PATH_RESTRICTED_HOSTS, REAL_ALLOWED_HOSTS } from "./fetch-tool";
import {
  diffPayloads,
  EXPECTED,
  FIXTURE_CONDITIONS,
  getJson,
  readFixtures,
  RESOLVER_BASE,
  type FixtureCondition,
  type GateResult,
  type NativePreflightResult,
} from "./preflight-native";

export interface Study3PreflightResult {
  ok: boolean;
  ranAt: string;
  gates: GateResult[];
  extension: { name: string; version: string | null; wellKnownEtag: string | null; schemaEtag: string | null };
  liveDpp: Partial<Record<FixtureCondition, Dpp>>;
}

async function post(url: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status as number | null, text, json, error: null as string | null };
  } catch (e) {
    return { status: null, text: null, json: undefined, error: e instanceof Error ? e.message : String(e) };
  }
}

async function headAware(url: string) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status as number | null, etag: res.headers.get("etag"), json, error: null as string | null };
  } catch (e) {
    return { status: null, etag: null, json: undefined, error: e instanceof Error ? e.message : String(e) };
  }
}

function idsOf(): Record<"A" | "B" | "C", CondIds> {
  const fx = readFixtures();
  const out = {} as Record<"A" | "B" | "C", CondIds>;
  for (const c of FIXTURE_CONDITIONS) out[c] = { productId: fx[c].productId!, variantId: fx[c].variantId!, gtin: fx[c].gtin! };
  return out;
}

function maskStr(s: string, ids: CondIds): string {
  return s.split(ids.productId).join("<productId>").split(ids.variantId).join("<variantId>").split(ids.gtin).join("<gtin>");
}
function maskDeep(v: unknown, ids: CondIds): unknown {
  if (typeof v === "string") return maskStr(v, ids);
  if (Array.isArray(v)) return v.map((x) => maskDeep(x, ids));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskDeep(x, ids)]));
  return v;
}

/** Loads the five stored listings, each checked against stimulus/ucp/manifest.json. Throws on any mismatch. */
export function loadStoredListings(): Record<UcpCond, { text: string; entry: UcpListingEntry }> {
  if (!existsSync(UCP_MANIFEST))
    throw new Error("stimulus/ucp/manifest.json does not exist: run stimulus/build-ucp.ts --capture once PR #372 is deployed");
  const m = JSON.parse(readFileSync(UCP_MANIFEST, "utf8")) as UcpManifest;
  const out = {} as Record<UcpCond, { text: string; entry: UcpListingEntry }>;
  for (const c of UCP_CONDS) {
    const entry = m.listings.find((l) => l.condition === c);
    if (!entry) throw new Error(`no listing for ${c} in stimulus/ucp/manifest.json`);
    const p = join(UCP_DIR, entry.file);
    if (!existsSync(p)) throw new Error(`${entry.file} is missing`);
    const text = readFileSync(p, "utf8");
    if (sha256(Buffer.from(text, "utf8")) !== entry.sha256) throw new Error(`${entry.file} does not match its manifest sha256`);
    out[c] = { text, entry };
  }
  return out;
}

function inAllowList(u: string): boolean {
  try {
    const x = new URL(u);
    const h = x.hostname.toLowerCase();
    if (x.protocol !== "https:" || !(REAL_ALLOWED_HOSTS as readonly string[]).includes(h)) return false;
    const pre = PATH_RESTRICTED_HOSTS[h];
    return pre === undefined || x.pathname.startsWith(pre);
  } catch {
    return false;
  }
}

export async function runStudy3Preflight(pf: NativePreflightResult): Promise<Study3PreflightResult> {
  const gates: GateResult[] = [];
  const ids = idsOf();
  const liveDpp: Study3PreflightResult["liveDpp"] = {};
  const extension: Study3PreflightResult["extension"] = { name: DPP_EXTENSION_NAME, version: null, wellKnownEtag: null, schemaEtag: null };
  const NOT_DEPLOYED = "the UCP endpoint (universal-goods-testnet PR #372) is not deployed on testnet";

  // U1 profile + schema
  const u1: GateResult = { gate: "U1 /.well-known/ucp declares the dpp extension", ok: true, lines: [] };
  const wk = await headAware(UCP_WELL_KNOWN_URL);
  extension.wellKnownEtag = wk.etag;
  if (wk.status !== 200 || wk.json === undefined) {
    u1.ok = false;
    u1.lines.push(`FAIL GET ${UCP_WELL_KNOWN_URL} -> HTTP ${wk.status ?? wk.error}${wk.status === 404 ? ` — ${NOT_DEPLOYED}` : ""}`);
  } else {
    const caps = (wk.json as { ucp?: { capabilities?: Record<string, Array<{ version?: string; schema?: string; extends?: string[] }>> } }).ucp?.capabilities ?? {};
    const ext = caps[DPP_EXTENSION_NAME]?.[0];
    const ok = !!ext && ext.schema === UCP_SCHEMA_URL && (ext.extends ?? []).includes(UCP_CATALOG_LOOKUP) && !!caps[UCP_CATALOG_LOOKUP];
    if (!ok) u1.ok = false;
    extension.version = ext?.version ?? null;
    u1.lines.push(`${ok ? "ok  " : "FAIL"} profile declares ${DPP_EXTENSION_NAME}: ${JSON.stringify(ext ?? null)}  (ETag ${wk.etag})`);
    const sc = await headAware(UCP_SCHEMA_URL);
    extension.schemaEtag = sc.etag;
    const sname = (sc.json as { name?: string; version?: string } | undefined)?.name;
    const sok = sc.status === 200 && sname === DPP_EXTENSION_NAME;
    if (!sok) u1.ok = false;
    u1.lines.push(`${sok ? "ok  " : "FAIL"} GET ${UCP_SCHEMA_URL} -> HTTP ${sc.status ?? sc.error}, name=${sname}, version=${(sc.json as { version?: string } | undefined)?.version}  (ETag ${sc.etag})`);
  }
  gates.push(u1);

  // U2 lookups
  const u2: GateResult = { gate: "U2 lookup per fixture GTIN returns its dpp; verification_url gives the gate-1 verdict", ok: true, lines: [] };
  const lookups: Partial<Record<FixtureCondition, unknown>> = {};
  if (!u1.ok && wk.status === 404) {
    u2.ok = false;
    u2.lines.push(`FAIL not attempted: ${NOT_DEPLOYED}`);
  } else {
    for (const c of FIXTURE_CONDITIONS) {
      const r = await post(UCP_LOOKUP_URL, { ids: [ids[c].gtin] });
      if (r.status !== 200 || r.json === undefined) {
        u2.ok = false;
        u2.lines.push(`FAIL ${c}: POST ${UCP_LOOKUP_URL} {"ids":["${ids[c].gtin}"]} -> HTTP ${r.status ?? r.error}`);
        continue;
      }
      lookups[c] = r.json;
      let dpp: Dpp;
      try {
        const { productId, variant } = pickVariant(r.json as ServedLookup, ids[c].gtin);
        if (productId !== ids[c].productId || variant.id !== ids[c].variantId)
          throw new Error(`product/variant ${productId}/${variant.id} are not fixture ${c}'s`);
        dpp = dppOf(variant, ids[c].gtin);
      } catch (e) {
        u2.ok = false;
        u2.lines.push(`FAIL ${c}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      liveDpp[c] = dpp;
      u2.lines.push(`     ${c}: dpp ${JSON.stringify(dpp)}`);
      const upiOk = dpp.upi === `${RESOLVER_BASE}${ids[c].gtin}`;
      const linkOk = dpp.verification_url === pf.verificationLinks[c];
      if (!upiOk || !linkOk) u2.ok = false;
      u2.lines.push(`${upiOk ? "ok  " : "FAIL"} ${c}: dpp.upi is the fixture's model-level UPI`);
      u2.lines.push(`${linkOk ? "ok  " : "FAIL"} ${c}: dpp.verification_url = resolver links.verificationUrl (${pf.verificationLinks[c]})`);
      const v = await getJson(dpp.verification_url);
      const j = v.json as { verdict?: string; reason?: string; subject?: { productId?: string } } | undefined;
      const exp = EXPECTED[c];
      const vok =
        v.status === 200 && j?.verdict === exp.verdict && (!exp.reason || j?.reason === exp.reason) &&
        j?.verdict === pf.verdicts[c].verdict && j?.subject?.productId === ids[c].productId;
      if (!vok) u2.ok = false;
      u2.lines.push(`${vok ? "ok  " : "FAIL"} ${c}: verification_url -> HTTP ${v.status ?? v.error} verdict=${j?.verdict} reason=${j?.reason} subject.productId=${j?.subject?.productId}`);
      const p = await getJson(dpp.passport_url);
      const pid = (p.json as { id?: string } | undefined)?.id;
      const pok = p.status === 200 && pid === ids[c].variantId;
      if (!pok) u2.ok = false;
      u2.lines.push(`${pok ? "ok  " : "FAIL"} ${c}: passport_url -> HTTP ${p.status ?? p.error}, id=${pid}`);
    }
    const re = await post(UCP_LOOKUP_URL, { ids: [GTIN_E] });
    const eProducts = (re.json as ServedLookup | undefined)?.products;
    const eok = re.status === 200 && Array.isArray(eProducts) && eProducts.length === 0;
    if (!eok) u2.ok = false;
    u2.lines.push(`${eok ? "ok  " : "FAIL"} E: lookup of ${GTIN_E} -> HTTP ${re.status ?? re.error}, ${eProducts?.length ?? "?"} product(s) (expected 0)`);
  }
  gates.push(u2);

  // U3 no-leak
  const u3: GateResult = { gate: "U3 dpp block identical in shape across A/B/C (no credential-state leak)", ok: true, lines: [] };
  if (FIXTURE_CONDITIONS.every((c) => liveDpp[c])) {
    const shapes = FIXTURE_CONDITIONS.map((c) => maskStr(JSON.stringify(liveDpp[c]), ids[c]));
    const same = new Set(shapes).size === 1;
    if (!same) u3.ok = false;
    u3.lines.push(`${same ? "ok  " : "FAIL"} masked dpp: ${same ? shapes[0] : JSON.stringify(shapes)}`);
    const masked = Object.fromEntries(FIXTURE_CONDITIONS.map((c) => [c, maskDeep(lookups[c], ids[c])])) as Record<FixtureCondition, unknown>;
    const { diffs } = diffPayloads(masked, []);
    const REACHES = /^\$\.products\[0\]\.(id|variants\[0\]\.(id|barcodes|dpp))(\b|\.|\[|$)/;
    for (const d of diffs) {
      const reaches = REACHES.test(d.path);
      if (reaches) u3.ok = false;
      u3.lines.push(`${reaches ? "FAIL" : "info"} DIFF ${d.path}${reaches ? " (reaches the listing)" : " (does not reach the listing)"}\n       A=${d.values.A}\n       B=${d.values.B}\n       C=${d.values.C}`);
    }
    if (!diffs.length) u3.lines.push("ok   whole lookup responses identical once own ids and GTIN are masked");
  } else {
    u3.ok = false;
    u3.lines.push("FAIL not all three live dpp blocks were read; nothing to compare");
  }
  gates.push(u3);

  // U4 stored stimuli
  const u4: GateResult = { gate: "U4 stored UCP responses and listings match their hashes and today's live dpp", ok: true, lines: [] };
  if (!existsSync(UCP_MANIFEST)) {
    u4.ok = false;
    u4.lines.push("FAIL stimulus/ucp/manifest.json does not exist: run `bun run ../stimulus/build-ucp.ts --capture` once PR #372 is deployed");
  } else {
    try {
      const m = JSON.parse(readFileSync(UCP_MANIFEST, "utf8")) as UcpManifest;
      for (const s of m.served) {
        const buf = readFileSync(join(UCP_DIR, s.file));
        if (sha256(buf) !== s.sha256) throw new Error(`${s.file} does not match its manifest sha256`);
      }
      u4.lines.push(`ok   ${m.served.length} served responses match their sha256 (captured ${m.capturedAt}; extension version ${m.extension.version}, schema ETag ${m.extension.schemaEtag})`);
      const stored = loadStoredListings();
      u4.lines.push(`ok   ${UCP_CONDS.length} listings match their sha256`);
      const pages = Object.fromEntries(
        (["A", "B", "C", "D"] as const).map((c) => [c, readFileSync(join(STIMULUS_DIR, PAGE_FILE[c]), "utf8")]),
      ) as Record<"A" | "B" | "C" | "D", string>;
      const rebuilt = {} as Record<UcpCond, string>;
      for (const c of ["A", "B", "C", "D"] as const) {
        const src = c === "D" ? "A" : c;
        const lf = m.served.find((s) => s.file === `served/lookup-${src}-${ids[src].gtin}.json`);
        if (!lf) throw new Error(`no stored lookup for ${src}`);
        const lookup = JSON.parse(readFileSync(join(UCP_DIR, lf.file), "utf8")) as ServedLookup;
        rebuilt[c] = serialiseListing(listingFromLookup(lookup, ids[src].gtin, pages[c]));
      }
      rebuilt.E = serialiseListing(listingE(JSON.parse(rebuilt.A)));
      for (const c of UCP_CONDS) if (rebuilt[c] !== stored[c].text) throw new Error(`listing ${c} is not reproduced from the stored response and page`);
      u4.lines.push("ok   every listing reproduced byte for byte from the stored responses and the hashed S1 pages");
      for (const l of checkListingInvariants(rebuilt, ids)) u4.lines.push(`ok   ${l}`);
      for (const c of FIXTURE_CONDITIONS) {
        const live = liveDpp[c];
        const st = stored[c].entry.dpp;
        if (!live) throw new Error(`no live dpp for ${c} to compare with the stored one`);
        if (JSON.stringify(live) !== JSON.stringify(st)) throw new Error(`${c}: stored dpp ${JSON.stringify(st)} != live ${JSON.stringify(live)}`);
      }
      u4.lines.push("ok   stored dpp blocks equal today's live ones (A, B, C)");
    } catch (e) {
      u4.ok = false;
      u4.lines.push(`FAIL ${e instanceof Error ? e.message : e}`);
    }
  }
  gates.push(u4);

  // U5 allow-list
  const u5: GateResult = { gate: "U5 every dpp link is inside fetch_url's allow-list", ok: true, lines: [] };
  if (FIXTURE_CONDITIONS.every((c) => liveDpp[c])) {
    for (const c of FIXTURE_CONDITIONS) {
      for (const k of ["upi", "passport_url", "verification_url"] as const) {
        const ok = inAllowList(liveDpp[c]![k]);
        if (!ok) u5.ok = false;
        if (!ok) u5.lines.push(`FAIL ${c}: dpp.${k} ${liveDpp[c]![k]} is outside the allow-list`);
      }
    }
    if (u5.ok) u5.lines.push("ok   upi, passport_url and verification_url of A, B, C are all reachable by fetch_url");
  } else {
    u5.ok = false;
    u5.lines.push("FAIL no live dpp links to check");
  }
  gates.push(u5);

  return { ok: gates.every((g) => g.ok), ranAt: new Date().toISOString(), gates, extension, liveDpp };
}

export function printStudy3Preflight(r: Study3PreflightResult): void {
  console.log(`\n=== STUDY 3 PREFLIGHT (UCP gates U1-U5) — ${r.ranAt} ===`);
  console.log(`endpoint: ${UCP_WELL_KNOWN_URL}  lookup: ${UCP_LOOKUP_URL}`);
  for (const g of r.gates) {
    console.log(`\n[${g.ok ? "PASS" : "FAIL"}] gate ${g.gate}`);
    for (const l of g.lines) console.log(`  ${l}`);
  }
  console.log(`\nSTUDY 3 UCP OVERALL: ${r.ok ? "PASS" : "FAIL"}`);
}
