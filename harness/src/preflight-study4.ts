/**
 * Study 4 preflight (gates Q1-Q6), read-only against the live testnet.
 *
 *   Q1  Live verdicts. For each dpp block in our listing (P = fixture A, T = C, U = B):
 *       GET verification_url -> 200 with verdict verified / invalid (reason
 *       data_changed_since_anchoring) / unverified about the fixture's own product; the
 *       resolver (GET upi) answers 200 and advertises links.verificationUrl equal to the
 *       block's verification_url; GET passport_url answers 200 with the fixture's variant.
 *   Q2  The served dpp blocks still hold: every stored Study 3 served file
 *       (stimulus/ucp/served) matches stimulus/ucp/manifest.json; each block in ours-P/T/U is
 *       a byte substring of its fixture's stored lookup; a LIVE catalog lookup of the fixture
 *       GTIN today returns the same block, byte for byte.
 *   Q3  Pages served: fetch_url (the trial's own tool, built exactly as the runner builds it)
 *       answers every listing's url with its stored page (200, sha256 = manifest); another
 *       path on a shop host is 404; no page names a passport, ugpdpp, verif*, credential.
 *   Q4  Hashes: every Study 4 listing and page matches stimulus/study4/manifest.json, and is
 *       reproduced byte for byte from its hashed inputs (S1-A page, the template, the stored
 *       dpp blocks).
 *   Q5  Identity and no condition naming (stimulus/study4.ts checkStudy4Invariants): ours-P/T/U
 *       minus their dpp block are byte-identical to ours-N (N = P minus dpp); the dpp blocks
 *       have one shape once ids are masked; no merchant field mentions the passport or
 *       checking; no listing text says fixture, condition, study, tamper(ed|ing), genuine, unsigned or control.
 *   Q6  Every dpp link is inside fetch_url's allow-list.
 *
 * Usage:  cd harness && <bun> run src/preflight-native.ts --study4     (or src/preflight-study4.ts)
 * Exit 0 only if every gate passes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFetchTool, PATH_RESTRICTED_HOSTS, REAL_ALLOWED_HOSTS } from "./fetch-tool";
import { getJson, readFixtures, RESOLVER_BASE, type GateResult } from "./preflight-native";
import { dppBytesServed, dppOf, pickVariant, UCP_LOOKUP_URL, type Dpp, type ServedLookup, type UcpManifest } from "../../stimulus/ucp";
import {
  ALL_PRODUCTS,
  checkStudy4Invariants,
  COMPETITORS,
  DPP_SOURCE,
  EXPECTED_VERDICT,
  listingFor,
  loadStudy4Stimulus,
  OURS,
  OURS_SOURCE_PAGE,
  pageUrl,
  renderPlainPage,
  S1A_LINK_LINE,
  S4_CONDS,
  serialiseListing,
  sha256,
  STIMULUS_DIR,
  type S4Cond,
} from "../../stimulus/study4";
import { E_HOST } from "../../stimulus/condition-e";

/** fetch_url's fictional hosts in Study 4: Study 3's three, plus the three competitor shops. */
export const S4_FICTIONAL_HOSTS = ["shop.tarnvale.example", "www.quillbury.example", E_HOST, ...COMPETITORS.map((p) => p.host)];

export interface Study4PreflightResult {
  ok: boolean;
  ranAt: string;
  gates: GateResult[];
  verdicts: Partial<Record<Exclude<S4Cond, "N">, { verdict: string | null; reason: string | null; productId: string | null }>>;
}

async function postJson(url: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    return { status: res.status as number | null, text: await res.text(), error: null as string | null };
  } catch (e) {
    return { status: null, text: "", error: e instanceof Error ? e.message : String(e) };
  }
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

export async function runStudy4Preflight(): Promise<Study4PreflightResult> {
  const gates: GateResult[] = [];
  const fx = readFixtures();
  const verdicts: Study4PreflightResult["verdicts"] = {};
  let stim: ReturnType<typeof loadStudy4Stimulus> | null = null;
  const q4: GateResult = { gate: "Q4 every Study 4 listing and page matches its hash and is reproduced from its inputs", ok: true, lines: [] };
  try {
    stim = loadStudy4Stimulus();
    q4.lines.push(`ok   ${S4_CONDS.length} listings of ours, ${COMPETITORS.length} competitor listings and ${ALL_PRODUCTS.length} pages match stimulus/study4/manifest.json`);
  } catch (e) {
    q4.ok = false;
    q4.lines.push(`FAIL ${e instanceof Error ? e.message : e}`);
  }
  const dpps = {} as Record<Exclude<S4Cond, "N">, Dpp>;
  if (stim) for (const c of ["P", "T", "U"] as const) dpps[c] = stim.manifest.ours[c].dpp!;

  // Q1 live verdicts
  const q1: GateResult = { gate: "Q1 live verdicts via each dpp block's verification_url (P verified, T invalid, U unverified)", ok: true, lines: [] };
  if (!stim) {
    q1.ok = false;
    q1.lines.push("FAIL no stored listings to read the dpp blocks from");
  } else {
    for (const c of ["P", "T", "U"] as const) {
      const f = DPP_SOURCE[c];
      const d = dpps[c];
      const exp = EXPECTED_VERDICT[c];
      const v = await getJson(d.verification_url);
      const j = v.json as { verdict?: string; reason?: string; subject?: { productId?: string } } | undefined;
      const ok = v.status === 200 && j?.verdict === exp.verdict && (!exp.reason || j?.reason === exp.reason) && j?.subject?.productId === fx[f].productId;
      verdicts[c] = { verdict: j?.verdict ?? null, reason: j?.reason ?? null, productId: j?.subject?.productId ?? null };
      if (!ok) q1.ok = false;
      q1.lines.push(`${ok ? "ok  " : "FAIL"} ${c} (fixture ${f}): GET ${d.verification_url} -> HTTP ${v.status ?? v.error} verdict=${j?.verdict} reason=${j?.reason ?? "-"} subject.productId=${j?.subject?.productId} (expected ${exp.verdict}${exp.reason ? `/${exp.reason}` : ""}, ${fx[f].productId})`);
      const r = await getJson(d.upi);
      const adv = (r.json as { links?: { verificationUrl?: string } } | undefined)?.links?.verificationUrl;
      const rok = r.status === 200 && adv === d.verification_url && d.upi === `${RESOLVER_BASE}${fx[f].gtin}`;
      if (!rok) q1.ok = false;
      q1.lines.push(`${rok ? "ok  " : "FAIL"} ${c}: GET ${d.upi} -> HTTP ${r.status ?? r.error}, links.verificationUrl ${adv === d.verification_url ? "= the block's verification_url" : `= ${adv}`}`);
      const p = await getJson(d.passport_url);
      const pid = (p.json as { id?: string } | undefined)?.id;
      const pok = p.status === 200 && pid === fx[f].variantId;
      if (!pok) q1.ok = false;
      q1.lines.push(`${pok ? "ok  " : "FAIL"} ${c}: GET passport_url -> HTTP ${p.status ?? p.error}, id=${pid}`);
    }
  }
  gates.push(q1);

  // Q2 served blocks
  const q2: GateResult = { gate: "Q2 the three dpp blocks are the stored served bytes and today's live lookup returns them unchanged", ok: true, lines: [] };
  try {
    const ucpDir = join(STIMULUS_DIR, "ucp");
    const m = JSON.parse(readFileSync(join(ucpDir, "manifest.json"), "utf8")) as UcpManifest;
    for (const s of m.served) if (sha256(readFileSync(join(ucpDir, s.file))) !== s.sha256) throw new Error(`stimulus/ucp/${s.file} does not match stimulus/ucp/manifest.json`);
    q2.lines.push(`ok   all ${m.served.length} stored Study 3 served files match stimulus/ucp/manifest.json`);
    if (!stim) throw new Error("no stored Study 4 listings");
    for (const c of ["P", "T", "U"] as const) {
      const f = DPP_SOURCE[c];
      const gtin = fx[f].gtin!;
      const e = stim.manifest.ours[c];
      const served = readFileSync(join(STIMULUS_DIR, e.servedLookupFile!), "utf8");
      if (sha256(Buffer.from(served, "utf8")) !== e.servedLookupSha256) throw new Error(`${e.servedLookupFile} hash differs from the Study 4 manifest's record`);
      if (!dppBytesServed(served, dpps[c])) throw new Error(`${c}: the dpp block is not a substring of ${e.servedLookupFile}`);
      if (!stim.ours[c].includes(`"dpp":${JSON.stringify(dpps[c])}`)) throw new Error(`${c}: ours-${c} does not carry the manifest's dpp bytes`);
      const live = await postJson(UCP_LOOKUP_URL, { ids: [gtin] });
      if (live.status !== 200) throw new Error(`${c}: live POST ${UCP_LOOKUP_URL} {"ids":["${gtin}"]} -> HTTP ${live.status ?? live.error}`);
      const ld = dppOf(pickVariant(JSON.parse(live.text) as ServedLookup, gtin).variant, gtin);
      const same = JSON.stringify(ld) === JSON.stringify(dpps[c]) && dppBytesServed(live.text, dpps[c]);
      if (!same) {
        q2.ok = false;
        q2.lines.push(`FAIL ${c}: live dpp ${JSON.stringify(ld)} != stored ${JSON.stringify(dpps[c])}`);
      } else q2.lines.push(`ok   ${c} (fixture ${f}): stored block = served substring (${e.servedLookupFile}) = today's live block`);
    }
  } catch (e) {
    q2.ok = false;
    q2.lines.push(`FAIL ${e instanceof Error ? e.message : e}`);
  }
  gates.push(q2);

  // Q3 pages served by the trial's own fetch tool
  const q3: GateResult = { gate: "Q3 fetch_url serves every listing's product page (no passport on any page)", ok: true, lines: [] };
  if (!stim) {
    q3.ok = false;
    q3.lines.push("FAIL no stored pages");
  } else {
    const tool = createFetchTool(Object.values(stim.pages).map((p) => ({ url: p.url, html: p.html })), S4_FICTIONAL_HOSTS);
    for (const p of ALL_PRODUCTS) {
      const listingText = p.id === OURS.id ? stim.ours.N : stim.competitors[p.id];
      const url = (JSON.parse(listingText) as { url: string }).url;
      await tool.spec.execute({ url });
      const e = tool.log[tool.log.length - 1];
      const ok = url === pageUrl(p) && e.outcome === "stored_page" && e.status === 200 && e.bodySha256 === stim.pages[p.id].sha256;
      if (!ok) q3.ok = false;
      q3.lines.push(`${ok ? "ok  " : "FAIL"} ${p.id}: ${url} -> ${e.outcome} ${e.status} sha256=${e.bodySha256?.slice(0, 12)}…`);
      const bad = stim.pages[p.id].html.match(/passport|ugpdpp|verif|credential|product information/i);
      if (bad) {
        q3.ok = false;
        q3.lines.push(`FAIL ${p.id}: page contains "${bad[0]}"`);
      }
    }
    await tool.spec.execute({ url: `https://${COMPETITORS[0].host}/no-such-page` });
    const e404 = tool.log[tool.log.length - 1];
    const ok404 = e404.outcome === "stored_404" && e404.status === 404;
    if (!ok404) q3.ok = false;
    q3.lines.push(`${ok404 ? "ok  " : "FAIL"} another path on a shop host -> ${e404.outcome} ${e404.status}`);
  }
  gates.push(q3);

  // Q4 reproduction
  if (stim) {
    try {
      const s1a = readFileSync(join(STIMULUS_DIR, OURS_SOURCE_PAGE), "utf8");
      if (sha256(Buffer.from(s1a, "utf8")) !== stim.manifest.sourcePage.sha256) throw new Error(`${OURS_SOURCE_PAGE} changed since the build`);
      const oursPage = s1a.split(S1A_LINK_LINE).join("");
      if (oursPage !== stim.pages[OURS.id].html) throw new Error("our page is not S1-A minus its product-information line");
      if (renderPlainPage(OURS) !== oursPage) throw new Error("the page template no longer renders ours as S1-A minus the line");
      for (const p of COMPETITORS) if (renderPlainPage(p) !== stim.pages[p.id].html) throw new Error(`page ${p.id} is not reproduced by the template`);
      for (const c of S4_CONDS) if (serialiseListing(listingFor(OURS, oursPage, c === "N" ? null : dpps[c])) !== stim.ours[c]) throw new Error(`ours-${c} is not reproduced`);
      for (const p of COMPETITORS) if (serialiseListing(listingFor(p, stim.pages[p.id].html, null)) !== stim.competitors[p.id]) throw new Error(`listing ${p.id} is not reproduced`);
      q4.lines.push("ok   every page and listing reproduced byte for byte (S1-A minus one line; the same template for the competitors; the stored dpp blocks)");
      for (const c of S4_CONDS) q4.lines.push(`     ours-${c}  ${stim.manifest.ours[c].sha256}  ${stim.manifest.ours[c].bytes} B`);
      for (const [k, e] of Object.entries(stim.manifest.competitors)) q4.lines.push(`     ${k}  ${e.sha256}  ${e.bytes} B`);
      for (const p of stim.manifest.products) q4.lines.push(`     page ${p.id}  ${p.page.sha256}`);
    } catch (e) {
      q4.ok = false;
      q4.lines.push(`FAIL ${e instanceof Error ? e.message : e}`);
    }
  }
  gates.push(q4);

  // Q5 identity + no condition naming
  const q5: GateResult = { gate: "Q5 ours identical across P/T/U/N except the dpp block; no listing names a condition", ok: true, lines: [] };
  if (!stim) {
    q5.ok = false;
    q5.lines.push("FAIL no stored listings");
  } else {
    try {
      for (const l of checkStudy4Invariants(stim.ours, stim.competitors, dpps)) q5.lines.push(`ok   ${l}`);
    } catch (e) {
      q5.ok = false;
      q5.lines.push(`FAIL ${e instanceof Error ? e.message : e}`);
    }
  }
  gates.push(q5);

  // Q6 allow-list
  const q6: GateResult = { gate: "Q6 every dpp link is inside fetch_url's allow-list", ok: true, lines: [] };
  if (!stim) {
    q6.ok = false;
    q6.lines.push("FAIL no dpp blocks");
  } else {
    for (const c of ["P", "T", "U"] as const)
      for (const k of ["upi", "passport_url", "verification_url"] as const)
        if (!inAllowList(dpps[c][k])) {
          q6.ok = false;
          q6.lines.push(`FAIL ${c}: dpp.${k} ${dpps[c][k]} is outside the allow-list`);
        }
    if (q6.ok) q6.lines.push("ok   upi, passport_url and verification_url of P, T, U are reachable by fetch_url");
  }
  gates.push(q6);

  return { ok: gates.every((g) => g.ok), ranAt: new Date().toISOString(), gates, verdicts };
}

export function printStudy4Preflight(r: Study4PreflightResult): void {
  console.log(`\n=== STUDY 4 PREFLIGHT (gates Q1-Q6) — ${r.ranAt} ===`);
  for (const g of r.gates) {
    console.log(`\n[${g.ok ? "PASS" : "FAIL"}] gate ${g.gate}`);
    for (const l of g.lines) console.log(`  ${l}`);
  }
  console.log(`\nSTUDY 4 OVERALL: ${r.ok ? "PASS" : "FAIL"}`);
}

if (import.meta.main) {
  const r = await runStudy4Preflight();
  printStudy4Preflight(r);
  process.exit(r.ok ? 0 : 1);
}
