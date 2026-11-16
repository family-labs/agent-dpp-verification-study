/**
 * Study 5 preflight (gates V0-V8), read-only against the live testnet and the public explorer.
 * Every explorer/passport GET goes through fetch_url built EXACTLY as a trial builds it
 * (study5-stimulus.ts fetchToolFor), so a pass also proves the allow-list and headers.
 *
 *   V0  Platform contract live: fixture A's resolver JSON (Test 1, H) and the unit's (Test 2, G)
 *       carry passportCheck { status, meaning, checked_at, issuer, evidence.recorded_fingerprint,
 *       evidence.independent_record {explorer, record_data_url, record_page_url,
 *       profile_data_url, anchor_tx} } and (G) provenance { collection, collection_owner_profile,
 *       factory, deployment_tx, deployment_record_url }; status "verified" on both.
 *   V1  Every evidence / provenance URL of the LIVE A and G returns the claimed data by plain GET:
 *       record_data_url -> 200 JSON with a DataChanged log whose value = recorded_fingerprint
 *       (and tx = anchor_tx); profile_data_url -> 200 JSON whose hash = the issuer profile;
 *       record_page_url -> 200 (HTML; noted, not required to hold data); collection_data_url
 *       -> 200 JSON naming the collection; deployment_record_url -> 200 naming the collection or
 *       its deployment tx; token_data_url -> 200 JSON for token_id; and the collection's own
 *       explorer logs show it made by `factory` and owned now by collection_owner_profile = the
 *       issuer profile.
 *   V2  L differs from H only in recorded_fingerprint: stored H = neutralise(stored A source),
 *       stored L = transformToL(H) byte for byte, leaf diff H vs L = exactly that path, L's value
 *       != the live record's value, the record's value = H's (A's real) fingerprint; stored A
 *       source = live A except VOLATILE_PATHS.
 *   V3  F's provenance demonstrably mismatches on the explorer: stored G = neutralise(stored unit
 *       source), stored F = transformToF(G), every leaf where F differs from G is inside the
 *       provenance block, F's collection is
 *       FOREIGN_COLLECTION; on the explorer its current owner != the claimed owner profile, and
 *       at least one of: collection_data_url not 200, token_data_url not 200, the collection not
 *       made by the claimed factory. Stored G source = live G except VOLATILE_PATHS.
 *   V4  W = E + {"verified": true} exactly and carries nothing of ours, no record, no explorer;
 *       W2 = renderW2Page() exactly, carries W2_CLAIM, no GTIN, no record, no explorer.
 *   V5  All stimuli hashed and reproducible: every manifest entry matches its file; pages, W, W2,
 *       L and F re-derived from their hashed inputs equal the stored bytes; T1 pages differ only
 *       in the passport link; fetch_url serves every stored URL with its hash, 404s another path
 *       on a fictional host, reaches the explorer JSON API and refuses a host off the list.
 *   V6  The live label URL (G) and A's passport answer 200 JSON through fetch_url.
 *   V8  (design fixes, 2026-10-16) No host cue and no checker shortcut: H and L are served at the
 *       SAME mirror URL, G and F at the SAME mirror URL (host MIRROR_HOST); the H and L pages are
 *       byte-identical; no copy (H, L, G, F) links to our /verify endpoint and every copy's
 *       evidence.recheck_url is null; our hosts are off the trial allow-list.
 *   V7  No stimulus names a condition (CONDITION_NAMING_RE, inherited live words excepted); no
 *       prompt or follow-up mentions blockchain, ledgers, explorers, records or verification
 *       (PROMPT_FORBIDDEN_RE); the fetch tool description is Study 2's, unchanged.
 *
 * Usage:  cd harness && bun run src/preflight-native.ts --study5   (gates 0-4 first)
 *    or:  cd harness && bun run src/preflight-study5.ts            (V0-V8 only)
 * Exit 0 only if every gate passes. Until PR #382 is deployed V0 fails and the gates that need
 * the contract report "not runnable".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFetchTool, FETCH_REQUEST_HEADERS, FETCH_TOOL_DESCRIPTION } from "./fetch-tool";
import type { GateResult } from "./preflight-native";
import { PROMPT_FORBIDDEN_RE, S5_SYSTEM, T1_FOLLOW_UP, T2_FOLLOW_UP } from "./prompts-study5";
import { S5_ALLOW, setupFor } from "./study5-stimulus";
import { E_ALLOWED_HOSTS, ugPresenceHits } from "../../stimulus/condition-e";
import {
  A_UPI,
  contractProblems,
  E_DOC_FILE,
  EXPLORER,
  EXPLORER_HOST,
  FOREIGN_COLLECTION,
  independentRecordOf,
  leafDiff,
  namingHits,
  MIRROR_HOST,
  MIRROR_T1_URL,
  MIRROR_T2_URL,
  neutralise,
  pageForMirror,
  S5_OUR_HOSTS_REACHABLE,
  verifyLinks,
  passportCheckOf,
  provenanceOf,
  readS5Manifest,
  recordedFingerprintOf,
  renderW2Page,
  S1A_LINK,
  S1A_PAGE_FILE,
  S1E_PAGE_FILE,
  S5_CONDS,
  S5_FICTIONAL_HOSTS,
  sha256,
  STIMULUS_DIR,
  transformToF,
  transformToL,
  transformToW,
  UNIT_UPI,
  VOLATILE_PATHS,
  W2_CLAIM,
  type S5Manifest,
} from "../../stimulus/study5";

export interface Study5PreflightResult {
  ok: boolean;
  ranAt: string;
  contractLive: boolean;
  gates: GateResult[];
}

interface Got {
  status: number | null;
  contentType: string | null;
  body: string;
  outcome: string;
  json: unknown;
}
/** One GET through a fresh trial-identical fetch_url (no stored pages: live hosts only). */
async function viaTool(url: string, stored: Array<{ url: string; html: string; contentType?: string }> = [], retried = false): Promise<Got> {
  const tool = createFetchTool(stored, S5_FICTIONAL_HOSTS, S5_ALLOW);
  const out = await tool.spec.execute({ url });
  const e = tool.log[0];
  const i = out.indexOf("\n\n");
  const body = i >= 0 ? out.slice(i + 2) : out;
  let json: unknown = null;
  try {
    json = JSON.parse(body);
  } catch {
    /* not JSON */
  }
  // The explorer answers an occasional 504 (seen 2026-10-15): the PREFLIGHT retries a 5xx or a
  // network error once after 3 s; a trial's fetch_url never retries (what a model sees is logged).
  if (!retried && ((e.status !== null && e.status >= 500) || e.outcome === "network_error")) {
    await new Promise((r) => setTimeout(r, 3000));
    return viaTool(url, stored, true);
  }
  return { status: e.status, contentType: e.contentType, body, outcome: e.outcome, json };
}
/** A direct GET with fetch_url's headers (for OUR live passports, which the trial tool no longer reaches). */
async function direct(url: string): Promise<Got> {
  try {
    const res = await fetch(url, { headers: FETCH_REQUEST_HEADERS, signal: AbortSignal.timeout(20_000) });
    const body = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(body);
    } catch {
      /* not JSON */
    }
    return { status: res.status, contentType: res.headers.get("content-type"), body, outcome: "fetched", json };
  } catch (e) {
    return { status: null, contentType: null, body: "", outcome: `network_error: ${e instanceof Error ? e.message : e}`, json: null };
  }
}
const lc = (s: unknown) => (typeof s === "string" ? s.toLowerCase() : "");
const DATA_CHANGED_TOPIC = "0xece574603820d07bc9b91f2a932baadf4628aabcb8afba49776529c14a6104b2";
const OWNERSHIP_TOPIC = "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0";

type Log = { address?: { hash?: string }; transaction_hash?: string; topics?: Array<string | null>; data?: string; decoded?: { method_call?: string; parameters?: Array<{ name: string; value: string }> } | null };
function dataChangedValues(json: unknown): Array<{ value: string; key: string; address: string; tx: string }> {
  const items = (json as { items?: Log[] })?.items ?? [];
  return items
    .filter((it) => lc(it.topics?.[0]) === DATA_CHANGED_TOPIC || (it.decoded?.method_call ?? "").startsWith("DataChanged"))
    .map((it) => {
      const p = it.decoded?.parameters ?? [];
      const value = lc(p.find((x) => x.name === "dataValue")?.value) || (it.data ? `0x${lc(it.data).slice(2).slice(128, 128 + 64)}` : "");
      return { value, key: lc(p.find((x) => x.name === "dataKey")?.value ?? it.topics?.[1]), address: lc(it.address?.hash), tx: lc(it.transaction_hash) };
    });
}
/** OwnershipTransferred events of a contract, oldest first. */
async function ownership(address: string): Promise<{ status: number | null; transfers: Array<{ from: string; to: string; tx: string }> }> {
  const g = await viaTool(`${EXPLORER}/api/v2/addresses/${address}/logs`);
  const items = ((g.json as { items?: Array<Log & { block_number?: number; index?: number }> })?.items ?? []).filter(
    (it) => lc(it.topics?.[0]) === OWNERSHIP_TOPIC || (it.decoded?.method_call ?? "").startsWith("OwnershipTransferred"),
  );
  const t = items
    .map((it) => {
      const p = it.decoded?.parameters ?? [];
      const from = lc(p.find((x) => x.name === "previousOwner")?.value) || `0x${lc(it.topics?.[1]).slice(26)}`;
      const to = lc(p.find((x) => x.name === "newOwner")?.value) || `0x${lc(it.topics?.[2]).slice(26)}`;
      return { from, to, tx: lc(it.transaction_hash), order: (it.block_number ?? 0) * 1e6 + (it.index ?? 0) };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ from, to, tx }) => ({ from, to, tx }));
  return { status: g.status, transfers: t };
}
const tokenIdHex = (v: unknown) => {
  const s = lc(v).replace(/^0x/, "");
  if (/^[0-9]+$/.test(s) && s.length < 64) return BigInt(s).toString(16).padStart(64, "0");
  return s.padStart(64, "0");
};

export async function checkEvidence(label: string, doc: unknown, withProvenance: boolean, out: string[], bad: string[]): Promise<{ recordValues: string[] }> {
  const pc = passportCheckOf(doc)!;
  const ir = independentRecordOf(doc)!;
  const fp = lc(recordedFingerprintOf(doc));
  const profile = lc((pc.issuer as { profile?: string } | null)?.profile ?? (pc.evidence as { profile?: string })?.profile);
  // record_data_url
  const r = await viaTool(String(ir.record_data_url));
  const dc = dataChangedValues(r.json);
  const recordValues = dc.map((d) => d.value);
  const hit = dc.find((d) => d.value === fp);
  out.push(`${label} record_data_url ${ir.record_data_url} -> ${r.status}; DataChanged values ${JSON.stringify(recordValues)}`);
  if (r.status !== 200 || !hit) bad.push(`${label}: record_data_url does not show a DataChanged value equal to recorded_fingerprint ${fp}`);
  else {
    if (lc(ir.anchor_tx) && hit.tx && hit.tx !== lc(ir.anchor_tx)) bad.push(`${label}: the record's tx ${hit.tx} != anchor_tx ${ir.anchor_tx}`);
    if (profile && hit.address && hit.address !== profile) bad.push(`${label}: the record was written by ${hit.address}, not the issuer profile ${profile}`);
  }
  // profile_data_url
  const p = await viaTool(String(ir.profile_data_url));
  out.push(`${label} profile_data_url ${ir.profile_data_url} -> ${p.status}; hash ${lc((p.json as { hash?: string })?.hash)}`);
  if (p.status !== 200 || lc((p.json as { hash?: string })?.hash) !== profile) bad.push(`${label}: profile_data_url does not return the issuer profile ${profile}`);
  // record_page_url (HTML, JS-rendered: reachable, not required to hold data)
  const pg = await viaTool(String(ir.record_page_url));
  out.push(`${label} record_page_url -> ${pg.status} ${pg.contentType}; holds the fingerprint in plain HTML: ${pg.body.toLowerCase().includes(fp.slice(2))}`);
  if (pg.status !== 200) bad.push(`${label}: record_page_url -> ${pg.status}`);
  // `explorer` is a human-readable label per the platform contract ("LUKSO testnet explorer
  // (Blockscout)"), not a URL. What must hold is that every independent_record URL is on the
  // public explorer host.
  for (const k of ["record_data_url", "record_page_url", "profile_data_url"] as const) {
    if (!lc(ir[k]).startsWith(lc(EXPLORER))) bad.push(`${label}: independent_record.${k} ${ir[k]} is not on ${EXPLORER}`);
  }
  if (!withProvenance) return { recordValues };
  // provenance
  const pv = provenanceOf(doc)!.value;
  const col = lc(pv.collection);
  if (typeof pv.collection_data_url === "string") {
    const c = await viaTool(pv.collection_data_url);
    const addr = lc((c.json as { address_hash?: string; hash?: string })?.address_hash ?? (c.json as { hash?: string })?.hash);
    out.push(`${label} collection_data_url -> ${c.status}; address ${addr}; name ${JSON.stringify((c.json as { name?: string })?.name ?? null)}`);
    if (c.status !== 200 || addr !== col) bad.push(`${label}: collection_data_url does not return collection ${col}`);
  }
  const d = await viaTool(String(pv.deployment_record_url));
  out.push(`${label} deployment_record_url -> ${d.status}; names the collection: ${d.body.toLowerCase().includes(col.slice(2))}; names deployment_tx: ${d.body.toLowerCase().includes(lc(pv.deployment_tx).slice(2))}`);
  if (d.status !== 200 || !(d.body.toLowerCase().includes(col.slice(2)) || d.body.toLowerCase().includes(lc(pv.deployment_tx).slice(2)))) bad.push(`${label}: deployment_record_url does not name the collection or its deployment tx`);
  if (typeof pv.token_data_url === "string") {
    const t = await viaTool(pv.token_data_url);
    const id = tokenIdHex((t.json as { id?: string })?.id);
    out.push(`${label} token_data_url -> ${t.status}; id ${id}; owner ${lc((t.json as { owner?: { hash?: string } })?.owner?.hash)}`);
    if (t.status !== 200 || (pv.token_id && id !== tokenIdHex(pv.token_id))) bad.push(`${label}: token_data_url does not return token ${pv.token_id}`);
  }
  const own = await ownership(col);
  const first = own.transfers[0];
  const last = own.transfers[own.transfers.length - 1];
  out.push(`${label} collection ${col} ownership on the explorer: ${own.transfers.map((x) => `${x.from}->${x.to}`).join(", ") || "(none)"}`);
  if (!last || last.to !== lc(pv.collection_owner_profile)) bad.push(`${label}: the collection's current owner on the explorer (${last?.to ?? "none"}) != collection_owner_profile ${pv.collection_owner_profile}`);
  if (lc(pv.collection_owner_profile) !== profile) bad.push(`${label}: collection_owner_profile ${pv.collection_owner_profile} != the issuer profile ${profile}`);
  if (!first || !own.transfers.some((x) => x.to === lc(pv.factory) || x.from === lc(pv.factory))) bad.push(`${label}: the collection's logs do not show the factory ${pv.factory}`);
  return { recordValues };
}

/** V3 core: does the explorer contradict this provenance block? Pushes failures to `b3`, facts to `notes`. */
export async function foreignMismatch(fDoc: unknown, b3: string[], notes: string[]): Promise<void> {
  const fp = provenanceOf(fDoc)!.value;
  if (lc(fp.collection) !== lc(FOREIGN_COLLECTION)) b3.push("F's collection is not FOREIGN_COLLECTION");
  const own = await ownership(lc(fp.collection));
  const last = own.transfers[own.transfers.length - 1];
  notes.push(`F collection ownership on the explorer: ${own.transfers.map((x) => `${x.from}->${x.to}`).join(", ")}`);
  const ownerMismatch = !!last && last.to !== lc(fp.collection_owner_profile);
  if (!ownerMismatch) b3.push(`the explorer does not show a different owner (last ${last?.to ?? "none"} vs claimed ${fp.collection_owner_profile})`);
  let other = false;
  for (const k of ["collection_data_url", "token_data_url"] as const) {
    if (typeof fp[k] !== "string") continue;
    const g = await viaTool(fp[k] as string);
    notes.push(`F ${k} -> ${g.status} ${g.body.slice(0, 60).replace(/\s+/g, " ")}`);
    if (g.status !== 200) other = true;
  }
  const madeByFactory = own.transfers.some((x) => x.from === lc(fp.factory) || x.to === lc(fp.factory));
  notes.push(`F collection made by the claimed factory ${fp.factory}: ${madeByFactory}`);
  if (!madeByFactory) other = true;
  const dep = await viaTool(String(fp.deployment_record_url));
  notes.push(`F deployment_record_url -> ${dep.status}; created_contract ${lc((dep.json as { created_contract?: { hash?: string } })?.created_contract?.hash) || "-"}; to ${lc((dep.json as { to?: { hash?: string } | null })?.to?.hash) || "null"}`);
  if (!other) b3.push("no second sign of the mismatch (collection/token JSON answer 200 and the factory made it)");
}

export async function runStudy5Preflight(): Promise<Study5PreflightResult> {
  const gates: GateResult[] = [];
  const gate = (id: string, ok: boolean, detail: string) => gates.push({ gate: id, ok, lines: detail.split(/\n/).map((l) => l.trim()).filter(Boolean) });
  const m: S5Manifest | null = readS5Manifest();

  // ---------------- V0
  const aLive = await direct(A_UPI);
  const gLive = await direct(UNIT_UPI);
  const v0: string[] = [];
  if (aLive.status !== 200 || !aLive.json) v0.push(`A ${A_UPI} -> ${aLive.status} ${aLive.outcome}`);
  if (gLive.status !== 200 || !gLive.json) v0.push(`G ${UNIT_UPI} -> ${gLive.status} ${gLive.outcome}`);
  v0.push(...contractProblems(aLive.json, false).map((p) => `A: ${p}`), ...contractProblems(gLive.json, true).map((p) => `G: ${p}`));
  for (const [k, j] of [["A", aLive.json], ["G", gLive.json]] as const) {
    const st = passportCheckOf(j)?.status;
    if (st !== undefined && st !== "verified") v0.push(`${k}: passportCheck.status is ${JSON.stringify(st)}, not "verified"`);
  }
  const contractLive = v0.length === 0;
  gate("V0 platform contract live (PR #382)", contractLive, contractLive ? `A and G carry passportCheck + evidence.independent_record (+ provenance on G at ${provenanceOf(gLive.json)?.path}); status verified` : v0.join("; "));
  const NOT_RUNNABLE = "not runnable until V0 passes (the platform contract is not live)";

  // ---------------- V1
  if (contractLive) {
    const out: string[] = [];
    const bad: string[] = [];
    await checkEvidence("A", aLive.json, false, out, bad);
    await checkEvidence("G", gLive.json, true, out, bad);
    gate("V1 every evidence/provenance URL returns the claimed data by plain GET", bad.length === 0, [...bad, ...out].join("\n      "));
  } else gate("V1 every evidence/provenance URL returns the claimed data by plain GET", false, NOT_RUNNABLE);

  // ---------------- V2 / V3 need built L and F
  const ready = !!m?.contractLive && !!m.sources && ["H", "L", "G", "F"].every((k) => !!m.stimuli[`${k}-passport`]);
  if (contractLive && ready) {
    const aSrc = readFileSync(join(STIMULUS_DIR, m!.sources!.A.file), "utf8");
    const gSrc = readFileSync(join(STIMULUS_DIR, m!.sources!.G.file), "utf8");
    const rdS = (k: string) => readFileSync(join(STIMULUS_DIR, m!.stimuli[k]!.file), "utf8");
    const [hTxt, lTxt, gTxt, fTxt] = ["H", "L", "G", "F"].map((k) => rdS(`${k}-passport`));
    const vol = (paths: string[]) => paths.filter((p) => !VOLATILE_PATHS.some((re) => re.test(p)));
    // V2
    const b2: string[] = [];
    if (hTxt !== neutralise(aSrc)) b2.push("stored H != neutralise(stored A source)");
    const lt = transformToL(hTxt);
    if (lt.text !== lTxt) b2.push("stored L != transformToL(stored H)");
    const d = leafDiff(JSON.parse(hTxt), JSON.parse(lTxt));
    if (JSON.stringify(d) !== JSON.stringify(["$.passportCheck.evidence.recorded_fingerprint"])) b2.push(`L differs from H at ${JSON.stringify(d)}`);
    const rec = await viaTool(String(independentRecordOf(JSON.parse(lTxt))!.record_data_url));
    const vals = dataChangedValues(rec.json).map((x) => x.value);
    const lv = lc(recordedFingerprintOf(JSON.parse(lTxt)));
    const hv = lc(recordedFingerprintOf(JSON.parse(hTxt)));
    if (vals.includes(lv)) b2.push("the public record CONTAINS L's fingerprint (no lie)");
    if (!vals.includes(hv)) b2.push("the public record does not contain H's (A's real) fingerprint");
    const drift = vol(leafDiff(JSON.parse(aSrc), aLive.json));
    if (drift.length) b2.push(`stored A source differs from live A at ${JSON.stringify(drift)} (rebuild + re-hash)`);
    gate(
      "V2 L differs from H only in recorded_fingerprint, and the public record contradicts it",
      b2.length === 0,
      [...b2, `H vs L differing leaves: ${JSON.stringify(d)}`, `H ${hv}, L ${lv}, record ${JSON.stringify(vals)}`].join("\n"),
    );
    // V3
    const b3: string[] = [];
    const notes: string[] = [];
    if (gTxt !== neutralise(gSrc)) b3.push("stored G != neutralise(stored unit source)");
    const ft = transformToF(gTxt);
    if (ft.text !== fTxt) b3.push("stored F != transformToF(stored G)");
    const fd = leafDiff(JSON.parse(gTxt), JSON.parse(fTxt));
    notes.push(`G vs F differing leaves: ${JSON.stringify(fd)}`);
    const pp = ft.path.replace(/^\$/, "\\$").replace(/\./g, "\\.");
    const outside = fd.filter((p) => !new RegExp(`^${pp}\\.`).test(p));
    if (outside.length) b3.push(`F differs from G outside the provenance block: ${JSON.stringify(outside)}`);
    await foreignMismatch(JSON.parse(fTxt), b3, notes);
    const gdrift = vol(leafDiff(JSON.parse(gSrc), gLive.json));
    if (gdrift.length) b3.push(`stored G source differs from live G at ${JSON.stringify(gdrift)} (rebuild + re-hash)`);
    gate("V3 F's provenance demonstrably mismatches on the explorer", b3.length === 0, [...b3, ...notes].join("\n      "));
  } else {
    const why = contractLive ? "L/F not built from the live contract yet (run stimulus/build-study5.ts --write)" : NOT_RUNNABLE;
    gate("V2 L differs from H only in recorded_fingerprint, and the public record contradicts it", false, why);
    gate("V3 F's provenance demonstrably mismatches on the explorer", false, why);
  }

  // ---------------- V8 no host cue, no checker shortcut (design fixes 2026-10-16)
  {
    const b: string[] = [];
    const n: string[] = [];
    const st = m?.stimuli ?? {};
    const url = (k: string) => st[k]?.url ?? null;
    const pairs: Array<[string, string, string]> = [["H-passport", "L-passport", MIRROR_T1_URL], ["G-passport", "F-passport", MIRROR_T2_URL]];
    for (const [x, y, want] of pairs) {
      if (!st[x] || !st[y]) {
        b.push(`${x}/${y} not built yet (needs the live contract)`);
        continue;
      }
      if (url(x) !== url(y)) b.push(`${x} is served at ${url(x)} but ${y} at ${url(y)}`);
      if (url(x) !== want || new URL(url(x)!).hostname !== MIRROR_HOST) b.push(`${x} is not served at the mirror URL ${want}`);
      else n.push(`${x} and ${y} both at ${want}`);
    }
    if (st["T1-H-page"] && st["T1-L-page"]) {
      if (st["T1-H-page"].sha256 !== st["T1-L-page"].sha256) b.push("the H and L product pages differ");
      else n.push("H and L product pages byte-identical (link to the mirror)");
    }
    for (const k of ["H-passport", "L-passport", "G-passport", "F-passport"]) {
      if (!st[k]) continue;
      const t = readFileSync(join(STIMULUS_DIR, st[k]!.file), "utf8");
      const v = verifyLinks(t);
      if (v.length) b.push(`${k} still links to our checker: ${v.join(", ")}`);
      const ev = passportCheckOf(JSON.parse(t))?.evidence as { recheck_url?: unknown } | undefined;
      if (!ev || ev.recheck_url !== null) b.push(`${k}: evidence.recheck_url is not null`);
    }
    for (const k of ["W-passport", "W2-page"]) if (st[k] && new URL(st[k]!.url).hostname === MIRROR_HOST) b.push(`${k} is on the mirror (web2 keeps its own host)`);
    if (S5_OUR_HOSTS_REACHABLE) b.push("our hosts are on the trial allow-list (a route to the platform's own check)");
    else {
      const ours = await viaTool(A_UPI);
      if (ours.outcome !== "host_not_reachable") b.push(`${A_UPI} is reachable through the trial's fetch_url (${ours.outcome})`);
      else n.push("our resolver is not reachable through the trial's fetch_url");
    }
    gate("V8 no host cue (one mirror URL per test) and no checker shortcut (no /verify, recheck_url null, our hosts off the list)", b.length === 0, [...b, ...n].join("\n"));
  }

  // ---------------- V4 W, W2
  {
    const b: string[] = [];
    const eText = readFileSync(join(STIMULUS_DIR, E_DOC_FILE), "utf8");
    const e = m?.stimuli["W-passport"];
    const w = e ? readFileSync(join(STIMULUS_DIR, e.file), "utf8") : null;
    if (!w) b.push("W not built");
    else {
      if (w !== transformToW(eText)) b.push("W != transformToW(E)");
      if ((JSON.parse(w) as { verified?: unknown }).verified !== true) b.push('W does not claim "verified": true');
      const hits = ugPresenceHits(w);
      if (hits.length) b.push(`W carries something of ours: ${hits.join("; ")}`);
      if (/explorer|independent_record|passportCheck|lukso/i.test(w)) b.push("W names a record or explorer");
    }
    const w2e = m?.stimuli["W2-page"];
    const w2 = w2e ? readFileSync(join(STIMULUS_DIR, w2e.file), "utf8") : null;
    if (!w2) b.push("W2 not built");
    else {
      if (w2 !== renderW2Page()) b.push("W2 != renderW2Page()");
      if (!w2.includes(W2_CLAIM)) b.push("W2 lacks its claim");
      if (/\d{13,14}|ugpdpp|universalgoods|explorer|lukso|blockchain|ledger|0x[0-9a-f]{8}/i.test(w2)) b.push("W2 names a GTIN, our hosts or a record");
      const hosts = [...w2.matchAll(/https?:\/\/([^/\s"'<>]+)/g)].map((x) => x[1]);
      if (hosts.some((h) => h !== "www.secondlife-power.example")) b.push(`W2 links off its own host: ${hosts.join(", ")}`);
    }
    void E_ALLOWED_HOSTS;
    gate("V4 W and W2 are plain claims with no independent record", b.length === 0, b.join("; ") || 'W = E + "verified": true; W2 = the fixed seller page');
  }

  // ---------------- V5 hashes, reproducibility, serving
  {
    const b: string[] = [];
    const n: string[] = [];
    if (!m) b.push("stimulus/study5/manifest.json missing");
    else {
      for (const [k, e] of Object.entries({ ...m.inputs, ...m.stimuli, ...(m.sources ?? {}) })) {
        const t = readFileSync(join(STIMULUS_DIR, e!.file), "utf8");
        if (sha256(t) !== e!.sha256) b.push(`${k} (${e!.file}) hash mismatch`);
      }
      const s1a = readFileSync(join(STIMULUS_DIR, S1A_PAGE_FILE), "utf8");
      const s1e = readFileSync(join(STIMULUS_DIR, S1E_PAGE_FILE), "utf8");
      const rd = (k: string) => (m.stimuli[k] ? readFileSync(join(STIMULUS_DIR, m.stimuli[k]!.file), "utf8") : null);
      if (rd("T1-H-page") !== pageForMirror(s1a)) b.push("T1-H page != pageForMirror(S1-A)");
      if (rd("T1-L-page") !== pageForMirror(s1a)) b.push("T1-L page != pageForMirror(S1-A)");
      if (rd("T1-W-page") !== s1e) b.push("T1-W page != S1-E");
      const lines = (s: string) => s.split("\n");
      for (const [k, other] of [["H/L", rd("T1-H-page")], ["W", rd("T1-W-page")]] as const) {
        if (!other) continue;
        const a = lines(s1a);
        const o = lines(other);
        const diff = a.map((l, i) => (l !== o[i] ? i : -1)).filter((i) => i >= 0);
        if (a.length !== o.length || diff.length !== 1 || !a[diff[0]].includes(S1A_LINK)) b.push(`T1-${k} page differs from S1-A in more than the passport link line (${diff.length} lines)`);
      }
      // serving through the trial's own tool
      for (const c of S5_CONDS) {
        let s;
        try {
          s = setupFor(c);
        } catch (err) {
          (m.contractLive ? b : n).push(`${c}: ${err instanceof Error ? err.message : err}`);
          continue;
        }
        for (const f of s.stimulusFiles) {
          const g = await viaTool(f.url, s.storedPages);
          if (g.status !== 200 || sha256(g.body) !== f.sha256) b.push(`${c}: fetch_url does not serve ${f.url} with ${f.file}'s bytes (${g.status})`);
        }
        n.push(`${c}: ${s.stimulusFiles.length} stored file(s) served with their hashes`);
      }
    }
    const nf = await viaTool("https://shop.tarnvale.example/products/another");
    if (nf.status !== 404) b.push(`another path on a fictional host -> ${nf.status}, not 404`);
    const ex = await viaTool(`${EXPLORER}/api/v2/addresses/0x04b816af69b6497829938e3204e85046f85f5589`);
    if (ex.status !== 200 || !ex.json) b.push(`the explorer JSON API is not reachable through fetch_url (${ex.status} ${ex.outcome})`);
    const off = await viaTool("https://www.google.com/search?q=tarnvale");
    if (off.outcome !== "host_not_reachable") b.push(`a host off the list was reachable (${off.outcome})`);
    const app = await viaTool("https://app.universalgoods.xyz/dashboard");
    if (app.outcome !== "host_not_reachable") b.push(`app.universalgoods.xyz/dashboard was reachable (${app.outcome})`);
    gate("V5 stimuli hashed, reproducible, and served as a trial serves them", b.length === 0, [...b, ...n].join("\n      "));
  }

  // ---------------- V6 live label / passport reachable through fetch_url
  {
    const b: string[] = [];
    if (gLive.status !== 200 || (gLive.json as { kind?: string })?.kind !== "item") b.push(`G label URL -> ${gLive.status} kind ${(gLive.json as { kind?: string })?.kind}`);
    if (aLive.status !== 200 || (aLive.json as { kind?: string })?.kind !== "variant") b.push(`A passport -> ${aLive.status} kind ${(aLive.json as { kind?: string })?.kind}`);
    gate("V6 the live passports answer 200 JSON (direct GET; the trial tool does not reach our hosts)", b.length === 0, b.join("; ") || `G kind item, A kind variant (${gLive.contentType})`);
  }

  // ---------------- V7 naming + prompt neutrality
  {
    const b: string[] = [];
    const n: string[] = [];
    const fixed = [S5_SYSTEM, T1_FOLLOW_UP, T2_FOLLOW_UP];
    for (const t of fixed) if (PROMPT_FORBIDDEN_RE.test(t)) b.push(`a fixed message names a checking method: ${JSON.stringify(t)}`);
    if (PROMPT_FORBIDDEN_RE.test(FETCH_TOOL_DESCRIPTION) && !/fetch a web page/i.test(FETCH_TOOL_DESCRIPTION)) b.push("the fetch tool description is not generic");
    const srcA = m?.sources ? readFileSync(join(STIMULUS_DIR, m.sources.A.file), "utf8") : "";
    const srcG = m?.sources ? readFileSync(join(STIMULUS_DIR, m.sources.G.file), "utf8") : "";
    for (const c of S5_CONDS) {
      let s;
      try {
        s = setupFor(c);
      } catch {
        n.push(`${c}: not built`);
        continue;
      }
      // The user message minus the page HTML (the page is a stimulus, checked below).
      const prompt = s.user.split("Page HTML:")[0];
      if (PROMPT_FORBIDDEN_RE.test(prompt)) b.push(`${c}: the user message names a checking method: ${JSON.stringify(prompt.match(PROMPT_FORBIDDEN_RE)?.[0])}`);
      if (PROMPT_FORBIDDEN_RE.test(s.followUp)) b.push(`${c}: follow-up names a checking method`);
      const inherited = c === "L" ? srcA : c === "F" ? srcG : "";
      for (const p of s.storedPages) {
        const hits = namingHits(`${p.url}\n${p.html}`, inherited);
        if (hits.length) b.push(`${c} ${p.url}: ${hits.join("; ")}`);
      }
      // The fixed question and follow-up carry the answer words by design ("genuine, counterfeit,
      // or unsure") and are identical in every condition of a test; what varies is the URL given.
      const uh = namingHits(s.givenUrl);
      if (uh.length) b.push(`${c} given URL: ${uh.join("; ")}`);
    }
    gate("V7 no stimulus names a condition; prompts never name a checking method; tool description generic", b.length === 0, [...b, ...n].join("; ") || "clean");
  }

  return { ok: gates.every((g) => g.ok), ranAt: new Date().toISOString(), contractLive, gates };
}

export function printStudy5Preflight(r: Study5PreflightResult): void {
  console.log(`\n=== STUDY 5 PREFLIGHT (V0-V8) — ${r.ranAt} ===`);
  for (const g of r.gates) console.log(`[${g.ok ? "PASS" : "FAIL"}] ${g.gate}${g.lines.map((l) => `\n      ${l}`).join("")}`);
  console.log(`\nSTUDY 5 PREFLIGHT: ${r.ok ? "PASS" : "FAIL"}${r.contractLive ? "" : " (platform contract not live)"}`);
}

if (import.meta.main) {
  const r = await runStudy5Preflight();
  printStudy5Preflight(r);
  process.exit(r.ok ? 0 : 1);
}
