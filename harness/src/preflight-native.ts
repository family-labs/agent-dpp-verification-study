/**
 * Study 2 (A28 §5) preflight — gates 1-4, read-only, against the live stack.
 *
 *   Gate 1  Live verdicts: A `verified`, B `unverified`, C `invalid` with reason
 *           `data_changed_since_anchoring` (GET <UG_API_BASE>/api/passport/<id>/verify).
 *   Gate 2  For each fixture, https://ugpdpp.xyz/01/<gtin> resolves, the payload
 *           advertises a verification link, the link is advertised IDENTICALLY for A, B
 *           and C (same field path, same URL shape once the fixture's own ids are masked),
 *           and fetching it returns the gate-1 verdict. The link is read from
 *           `links.verificationUrl` (platform PR #354); a generic scan (any URL-valued
 *           field whose path or value mentions "verif") is printed beside it and must find
 *           that one field only. Absent today: the gate fails cleanly.
 *   Gate 3  Matchedness: the three resolver payloads are diffed after masking each
 *           fixture's own ids, GTIN and SKU. Every remaining differing path is printed for
 *           human review. Path exclusions come ONLY from harness/native-exemptions.json,
 *           which starts EMPTY and is filled from the measured diff and logged in an
 *           amendment (A26/A28: "never predicted").
 *   Gate 4  No served field (key or string value, resolver payload or verifier response)
 *           contains "fixture", "study" or "condition", or uses A/B/C as a label.
 *
 * Exits 1 on ANY failure, including the expected one today (fixtures not yet created).
 *
 * Follow-up (`--followup`): gates 0-4 above run unchanged (they re-measure and diff the
 * A/B/C payloads as before), and then `runFollowupPreflight` adds gates F1-F4 for
 * condition E, the plain hosted passport with no checker:
 *   F1  E's stored document and pages match stimulus/manifest.json, the A-D main pages
 *       still match theirs, and page E differs from page A only in the product link.
 *   F2  E's document (and page) carries no UG host, id, notice, warning or link
 *       (stimulus/condition-e.ts UG_PRESENCE_PATTERNS + every study id/GTIN/SKU + any host
 *       outside E's own), and has no links / warnings / conformanceWarnings / notices key.
 *   F3  E's GTIN does not resolve on the UG resolver (https://ugpdpp.xyz/01/<gtinE> -> 404),
 *       is a valid GTIN-14 and is none of the study's GTINs: E has no UG presence.
 *   F4  E still carries B's information: transformToE(B's LIVE payload) reproduces the
 *       stored E byte for byte. B's live notice text is printed (it is dropped from E).
 *
 * Usage:  cd harness && <bun> run src/preflight-native.ts [--followup | --study3]
 *
 * Study 3 (`--study3`): everything `--followup` runs, then the UCP gates U1-U5
 * (preflight-study3.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { UG_API_BASE } from "./config";
import { FETCH_REQUEST_HEADERS } from "./fetch-tool";
import {
  B_SOURCE_URL,
  E_SERVED_URLS,
  E_UPI,
  GTIN_E,
  ourFixtureIdentifiers,
  serialiseE,
  transformToE,
  ugPresenceHits,
} from "../../stimulus/condition-e";

export type FixtureCondition = "A" | "B" | "C";
export const FIXTURE_CONDITIONS: readonly FixtureCondition[] = ["A", "B", "C"];
export const EXPECTED: Record<FixtureCondition, { verdict: string; reason?: string }> = {
  A: { verdict: "verified" },
  B: { verdict: "unverified" },
  C: { verdict: "invalid", reason: "data_changed_since_anchoring" },
};
export const RESOLVER_BASE = "https://ugpdpp.xyz/01/";

const CONDITIONS_FILE =
  process.env.FIXTURES_FILE ??
  fileURLToPath(new URL("../../fixtures/conditions.json", import.meta.url));
const EXEMPTIONS_FILE = fileURLToPath(new URL("../native-exemptions.json", import.meta.url));

export interface FixtureIds {
  sku: string;
  productId: string | null;
  variantId: string | null;
  batchId: string | null;
  gtin: string | null;
}

export function readFixtures(): Record<FixtureCondition, FixtureIds> {
  const raw = JSON.parse(readFileSync(CONDITIONS_FILE, "utf8")) as {
    assignments: Record<FixtureCondition, FixtureIds>;
  };
  return raw.assignments;
}

interface Exemption {
  path: string;
  reason: string;
  measuredOn: string;
}
function readExemptions(): Exemption[] {
  const raw = JSON.parse(readFileSync(EXEMPTIONS_FILE, "utf8")) as { exemptions: Exemption[] };
  return raw.exemptions ?? [];
}

// ---------------------------------------------------------------- HTTP helpers

export interface Fetched {
  url: string;
  status: number | null;
  contentType: string | null;
  text: string | null;
  json: unknown;
  error: string | null;
}

export async function getJson(url: string): Promise<Fetched> {
  try {
    const res = await fetch(url, {
      headers: FETCH_REQUEST_HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    let json: unknown = undefined;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { url, status: res.status, contentType: res.headers.get("content-type"), text, json, error: null };
  } catch (e) {
    return {
      url,
      status: null,
      contentType: null,
      text: null,
      json: undefined,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

export function verifierUrl(productId: string): string {
  return `${UG_API_BASE}/api/passport/${encodeURIComponent(productId)}/verify`;
}

// ---------------------------------------------------------------- JSON walking

type Leaf = { path: string; key: string; value: unknown };

export function walk(value: unknown, path = "$", key = ""): Leaf[] {
  if (Array.isArray(value)) {
    const out: Leaf[] = [];
    value.forEach((v, i) => out.push(...walk(v, `${path}[${i}]`, key)));
    if (value.length === 0) out.push({ path, key, value });
    return out;
  }
  if (value !== null && typeof value === "object") {
    const out: Leaf[] = [];
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [k, v] of entries) out.push(...walk(v, `${path}.${k}`, k));
    if (entries.length === 0) out.push({ path, key, value });
    return out;
  }
  return [{ path, key, value }];
}

export interface LinkCandidate {
  path: string;
  url: string;
}

/**
 * The field the platform will use (universal-goods-testnet PR #354, not yet deployed on
 * 2026-10-11): a top-level `links: { verificationUrl, jsonLdUrl }` block beside `dpp`.
 * Gate 2 reads THIS field; the generic scan below is printed beside it so a rename or a
 * second advertised link is visible rather than silently missed.
 */
export const ADVERTISED_LINK_PATH = "$.links.verificationUrl";

export function advertisedVerificationLink(payload: unknown): string | null {
  const links = (payload as { links?: { verificationUrl?: unknown } } | null)?.links;
  const v = links?.verificationUrl;
  return typeof v === "string" && /^https?:\/\//i.test(v) ? v : null;
}

/**
 * Generic verification-link detection: any string field holding an http(s) URL whose
 * JSON path or URL mentions "verif". The platform's field name is not final (A28 §5.2),
 * so nothing here names it.
 */
export function findVerificationLinks(payload: unknown): {
  candidates: LinkCandidate[];
  relatedFields: Array<{ path: string; value: unknown }>;
} {
  const candidates: LinkCandidate[] = [];
  const relatedFields: Array<{ path: string; value: unknown }> = [];
  for (const leaf of walk(payload)) {
    const isUrl = typeof leaf.value === "string" && /^https?:\/\//i.test(leaf.value);
    const mentions = /verif/i.test(leaf.path) || (typeof leaf.value === "string" && /verif/i.test(leaf.value));
    if (isUrl && mentions) candidates.push({ path: leaf.path, url: leaf.value as string });
    else if (mentions) relatedFields.push({ path: leaf.path, value: leaf.value });
  }
  return { candidates, relatedFields };
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function maskIds(s: string, ids: FixtureIds): string {
  let out = s;
  const pairs: Array<[string | null, string]> = [
    [ids.productId, "<productId>"],
    [ids.variantId, "<variantId>"],
    [ids.batchId, "<batchId>"],
    [ids.gtin, "<gtin>"],
    [ids.sku, "<sku>"],
  ];
  for (const [v, tag] of pairs) if (v) out = out.split(v).join(tag);
  return out;
}

function maskValue(v: unknown, ids: FixtureIds): unknown {
  if (typeof v === "string") return maskIds(v, ids);
  if (Array.isArray(v)) return v.map((x) => maskValue(x, ids));
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, maskValue(x, ids)]),
    );
  }
  return v;
}

/** `$.a.b[*].c` -> matches that path, any index at `[*]`, and everything beneath it. */
export function globToRegex(glob: string): RegExp {
  const esc = glob.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withIdx = esc.replace(/\\\[\\\*\\\]/g, "\\[\\d+\\]");
  return new RegExp(`^${withIdx}(?:[.[].*)?$`);
}

export interface PathDiff {
  path: string;
  values: Partial<Record<FixtureCondition, string>>;
}

export function diffPayloads(
  masked: Record<FixtureCondition, unknown>,
  exemptions: Exemption[],
): { diffs: PathDiff[]; exempted: PathDiff[] } {
  const maps = Object.fromEntries(
    FIXTURE_CONDITIONS.map((c) => [
      c,
      new Map(walk(masked[c]).map((l) => [l.path, JSON.stringify(l.value)])),
    ]),
  ) as Record<FixtureCondition, Map<string, string>>;
  const all = new Set<string>();
  for (const c of FIXTURE_CONDITIONS) for (const p of maps[c].keys()) all.add(p);
  const res = { diffs: [] as PathDiff[], exempted: [] as PathDiff[] };
  const ex = exemptions.map((e) => globToRegex(e.path));
  for (const p of [...all].sort()) {
    const vals = FIXTURE_CONDITIONS.map((c) => maps[c].get(p));
    if (vals[0] === vals[1] && vals[1] === vals[2]) continue;
    const d: PathDiff = {
      path: p,
      values: Object.fromEntries(
        FIXTURE_CONDITIONS.map((c, i) => [c, vals[i] === undefined ? "<absent>" : vals[i]!.slice(0, 160)]),
      ),
    };
    (ex.some((r) => r.test(p)) ? res.exempted : res.diffs).push(d);
  }
  return res;
}

/** Gate 4 scan. Returns every key or string value that could name the condition. */
export function conditionLabelHits(payload: unknown, label: string): string[] {
  const hits: string[] = [];
  const WORDS = /fixture|study|condition/i;
  const LABEL = /\b(?:fixture|condition|arm|cell|group|variant|study)\s*[-:#]?\s*[ABCD]\b/i;
  const PAREN = /\(\s*[ABCD]\s*\)/;
  for (const leaf of walk(payload)) {
    const segs = leaf.path.split(/[.[\]]/).filter(Boolean);
    for (const s of segs) if (WORDS.test(s)) hits.push(`${label} key ${leaf.path}`);
    if (typeof leaf.value === "string") {
      const v = leaf.value;
      if (WORDS.test(v)) hits.push(`${label} ${leaf.path} = ${JSON.stringify(v.slice(0, 120))} (word)`);
      else if (/^\s*[ABCD]\s*$/.test(v)) hits.push(`${label} ${leaf.path} = ${JSON.stringify(v)} (bare letter)`);
      else if (LABEL.test(v) || PAREN.test(v))
        hits.push(`${label} ${leaf.path} = ${JSON.stringify(v.slice(0, 120))} (letter label)`);
    }
  }
  return [...new Set(hits)];
}

// ---------------------------------------------------------------- the preflight

export interface GateResult {
  gate: string;
  ok: boolean;
  lines: string[];
}

export interface NativePreflightResult {
  ok: boolean;
  ranAt: string;
  apiBase: string;
  gates: GateResult[];
  /** Per fixture, from gate 1 (null when not observed). */
  verdicts: Record<FixtureCondition, { verdict: string | null; reason: string | null }>;
  /** Per fixture, the single advertised verification link (null unless gate 2 found exactly one). */
  verificationLinks: Record<FixtureCondition, string | null>;
  fixtures: Record<FixtureCondition, FixtureIds>;
}

export async function runNativePreflight(): Promise<NativePreflightResult> {
  const fixtures = readFixtures();
  const gates: GateResult[] = [];
  const verdicts = {} as NativePreflightResult["verdicts"];
  const links = {} as NativePreflightResult["verificationLinks"];
  for (const c of FIXTURE_CONDITIONS) {
    verdicts[c] = { verdict: null, reason: null };
    links[c] = null;
  }

  // Gate 0: the fixtures exist in conditions.json at all.
  const g0: GateResult = { gate: "0 fixtures recorded in conditions.json", ok: true, lines: [] };
  for (const c of FIXTURE_CONDITIONS) {
    const f = fixtures[c];
    const missing = (["productId", "gtin"] as const).filter((k) => !f?.[k]);
    if (missing.length) {
      g0.ok = false;
      g0.lines.push(`FAIL ${c} (${f?.sku}): ${missing.map((k) => `${k}=null`).join(", ")} — fixture not created`);
    } else {
      g0.lines.push(`ok   ${c} (${f.sku}): productId=${f.productId} gtin=${f.gtin}`);
    }
  }
  gates.push(g0);

  // Gate 1: live verdicts.
  const g1: GateResult = { gate: "1 live verdicts", ok: true, lines: [] };
  const verifierBodies: Partial<Record<FixtureCondition, unknown>> = {};
  for (const c of FIXTURE_CONDITIONS) {
    const id = fixtures[c]?.productId;
    if (!id) {
      g1.ok = false;
      g1.lines.push(`FAIL ${c}: no productId, cannot query the verifier`);
      continue;
    }
    const r = await getJson(verifierUrl(id));
    const j = r.json as { verdict?: unknown; reason?: unknown } | undefined;
    const verdict = typeof j?.verdict === "string" ? j.verdict : null;
    const reason = typeof j?.reason === "string" ? j.reason : null;
    verdicts[c] = { verdict, reason };
    verifierBodies[c] = r.json;
    const exp = EXPECTED[c];
    const ok = r.status === 200 && verdict === exp.verdict && (!exp.reason || reason === exp.reason);
    if (!ok) g1.ok = false;
    g1.lines.push(
      `${ok ? "ok  " : "FAIL"} ${c}: HTTP ${r.status ?? r.error} verdict=${verdict} reason=${reason}` +
        ` (expected ${exp.verdict}${exp.reason ? `/${exp.reason}` : ""})`,
    );
  }
  gates.push(g1);

  // Gate 2: resolver advertises one verification link, identically, returning the gate-1 verdict.
  const g2: GateResult = { gate: "2 resolver advertises the verification link identically", ok: true, lines: [] };
  const payloads: Partial<Record<FixtureCondition, unknown>> = {};
  const shapes: Partial<Record<FixtureCondition, string>> = {};
  for (const c of FIXTURE_CONDITIONS) {
    const gtin = fixtures[c]?.gtin;
    if (!gtin) {
      g2.ok = false;
      g2.lines.push(`FAIL ${c}: no GTIN, cannot resolve the product link`);
      continue;
    }
    const r = await getJson(`${RESOLVER_BASE}${gtin}`);
    if (r.status !== 200 || r.json === undefined) {
      g2.ok = false;
      g2.lines.push(`FAIL ${c}: ${RESOLVER_BASE}${gtin} -> HTTP ${r.status ?? r.error}, content-type ${r.contentType}`);
      continue;
    }
    payloads[c] = r.json;
    const p = r.json as { id?: unknown; kind?: unknown };
    const { candidates, relatedFields } = findVerificationLinks(r.json);
    g2.lines.push(`     ${c}: resolved -> kind=${String(p.kind)} id=${String(p.id)}; ${candidates.length} link candidate(s)`);
    for (const k of candidates) g2.lines.push(`       candidate ${k.path} = ${k.url}`);
    for (const k of relatedFields) g2.lines.push(`       (non-link field mentioning verif) ${k.path} = ${JSON.stringify(k.value)}`);
    const jsonLd = (r.json as { links?: { jsonLdUrl?: unknown } }).links?.jsonLdUrl;
    if (jsonLd !== undefined) g2.lines.push(`       (info) $.links.jsonLdUrl = ${JSON.stringify(jsonLd)}`);
    const advertised = advertisedVerificationLink(r.json);
    if (!advertised) {
      g2.ok = false;
      g2.lines.push(`FAIL ${c}: ${ADVERTISED_LINK_PATH} absent — the resolver advertises no verification link (platform PR #354 not deployed?)`);
      continue;
    }
    if (candidates.length !== 1) {
      g2.ok = false;
      g2.lines.push(`FAIL ${c}: ${candidates.length} URL fields mention "verif"; expected only ${ADVERTISED_LINK_PATH}`);
      continue;
    }
    const link = { path: ADVERTISED_LINK_PATH, url: advertised };
    links[c] = link.url;
    shapes[c] = `${link.path} :: ${maskIds(link.url, fixtures[c]).replace(UUID_RE, "<uuid>")}`;
    const v = await getJson(link.url);
    const j = v.json as { verdict?: unknown; reason?: unknown } | undefined;
    const lv = typeof j?.verdict === "string" ? j.verdict : null;
    const lr = typeof j?.reason === "string" ? j.reason : null;
    const subject = (j as { subject?: unknown } | undefined)?.subject;
    g2.lines.push(`       link subject = ${JSON.stringify(subject ?? null)}`);
    const exp = EXPECTED[c];
    const ok = v.status === 200 && lv === exp.verdict && (!exp.reason || lr === exp.reason) && lv === verdicts[c].verdict;
    if (!ok) g2.ok = false;
    g2.lines.push(`${ok ? "ok  " : "FAIL"} ${c}: link -> HTTP ${v.status ?? v.error} verdict=${lv} reason=${lr}`);
  }
  const distinctShapes = new Set(Object.values(shapes));
  if (Object.keys(shapes).length === 3 && distinctShapes.size === 1) {
    g2.lines.push(`ok   advertised identically: ${[...distinctShapes][0]}`);
  } else {
    g2.ok = false;
    g2.lines.push(`FAIL link shape not identical across A/B/C: ${JSON.stringify(shapes)}`);
  }
  gates.push(g2);

  // Gate 3: matchedness diff for human review.
  const g3: GateResult = { gate: "3 resolver payload matchedness", ok: true, lines: [] };
  if (FIXTURE_CONDITIONS.every((c) => payloads[c] !== undefined)) {
    const exemptions = readExemptions();
    const masked = Object.fromEntries(
      FIXTURE_CONDITIONS.map((c) => [c, maskValue(payloads[c], fixtures[c])]),
    ) as Record<FixtureCondition, unknown>;
    const { diffs, exempted } = diffPayloads(masked, exemptions);
    g3.lines.push(`     own ids, GTIN and SKU masked by value; ${exemptions.length} logged path exemption(s) applied`);
    for (const d of exempted) g3.lines.push(`     exempted ${d.path}`);
    for (const d of diffs) g3.lines.push(`DIFF ${d.path}\n       A=${d.values.A}\n       B=${d.values.B}\n       C=${d.values.C}`);
    if (diffs.length) {
      g3.ok = false;
      g3.lines.push(
        `FAIL ${diffs.length} differing path(s). Review each; exempt one ONLY by adding it to ` +
          `harness/native-exemptions.json with the measured reason AND logging it in an amendment.`,
      );
    } else g3.lines.push("ok   payloads matched");
  } else {
    g3.ok = false;
    g3.lines.push("FAIL not all three resolver payloads were read; nothing to compare");
  }
  gates.push(g3);

  // Gate 4: no served field names the condition.
  const g4: GateResult = { gate: "4 no served field names the condition", ok: true, lines: [] };
  let scanned = 0;
  for (const c of FIXTURE_CONDITIONS) {
    for (const [what, body] of [
      ["resolver", payloads[c]],
      ["verifier", verifierBodies[c]],
    ] as const) {
      if (body === undefined) continue;
      scanned++;
      for (const h of conditionLabelHits(body, `${c} ${what}`)) {
        g4.ok = false;
        g4.lines.push(`FAIL ${h}`);
      }
    }
  }
  if (scanned < 6) {
    g4.ok = false;
    g4.lines.push(`FAIL only ${scanned} of 6 served bodies could be scanned`);
  } else if (g4.ok) g4.lines.push("ok   no label found in 6 served bodies");
  gates.push(g4);

  return {
    ok: gates.every((g) => g.ok),
    ranAt: new Date().toISOString(),
    apiBase: UG_API_BASE,
    gates,
    verdicts,
    verificationLinks: links,
    fixtures,
  };
}

export function printPreflight(r: NativePreflightResult): void {
  console.log(`\n=== STUDY 2 NATIVE PREFLIGHT (A28 §5 gates 1-4) — ${r.ranAt} ===`);
  console.log(`verifier base: ${r.apiBase}   resolver: ${RESOLVER_BASE}`);
  for (const g of r.gates) {
    console.log(`\n[${g.ok ? "PASS" : "FAIL"}] gate ${g.gate}`);
    for (const l of g.lines) console.log(`  ${l}`);
  }
  console.log(`\nOVERALL: ${r.ok ? "PASS" : "FAIL"}`);
}

/**
 * Pilot helper: resolve a throwaway (non-fixture) GTIN, find what the resolver
 * advertises, and read the verifier's verdict for the resolved product, so the pilot
 * can apply the same instrument_invalid rule as the main run.
 */
export async function measurePilotTarget(gtin: string): Promise<{
  productId: string | null;
  kind: string | null;
  verificationLink: string | null;
  candidates: LinkCandidate[];
  verdict: string | null;
  reason: string | null;
}> {
  const r = await getJson(`${RESOLVER_BASE}${gtin}`);
  const p = (r.json ?? {}) as { id?: unknown; kind?: unknown };
  const productId = typeof p.id === "string" ? p.id : null;
  const { candidates } = findVerificationLinks(r.json);
  let verdict: string | null = null;
  let reason: string | null = null;
  if (productId) {
    const v = await getJson(verifierUrl(productId));
    const j = v.json as { verdict?: unknown; reason?: unknown } | undefined;
    verdict = typeof j?.verdict === "string" ? j.verdict : null;
    reason = typeof j?.reason === "string" ? j.reason : null;
  }
  return {
    productId,
    kind: typeof p.kind === "string" ? p.kind : null,
    verificationLink: advertisedVerificationLink(r.json) ?? (candidates.length === 1 ? candidates[0].url : null),
    candidates,
    verdict,
    reason,
  };
}

// ---------------------------------------------------------------- follow-up (condition E)

const STIMULUS = fileURLToPath(new URL("../../stimulus/", import.meta.url));

interface FollowupManifest {
  pages: Array<{ file: string; set: string; template: string; condition: string; gtin: string; upi: string; sha256: string }>;
  documents?: Array<{ file: string; condition: string; gtin: string; url: string; servedAt: string[]; contentType: string; sha256: string }>;
}

function sha256Text(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** GS1 check digit (same rule as stimulus/render.ts). */
function gtinValid(g: string): boolean {
  if (!/^\d{14}$/.test(g)) return false;
  const d = g.split("").map(Number);
  const check = d.pop()!;
  let sum = 0;
  d.reverse().forEach((x, i) => (sum += x * (i % 2 === 0 ? 3 : 1)));
  return (10 - (sum % 10)) % 10 === check;
}

export interface FollowupPreflightResult {
  ok: boolean;
  ranAt: string;
  gates: GateResult[];
  e: { gtin: string; url: string; servedAt: string[]; docSha256: string | null; pageSha256: Record<string, string> };
  /** B's live platform notice(s), as served at preflight time (dropped from E). */
  liveNotices: unknown;
}

export async function runFollowupPreflight(): Promise<FollowupPreflightResult> {
  const gates: GateResult[] = [];
  const fixtures = readFixtures();
  const manifest = JSON.parse(readFileSync(`${STIMULUS}manifest.json`, "utf8")) as FollowupManifest;
  const eDocEntry = manifest.documents?.find((d) => d.condition === "E");
  const pageSha: Record<string, string> = {};
  let eText: string | null = null;

  // F1: stored stimulus.
  const f1: GateResult = { gate: "F1 condition E stored and hashed; page E = page A but the link", ok: true, lines: [] };
  if (!eDocEntry) {
    f1.ok = false;
    f1.lines.push("FAIL no condition-E document in stimulus/manifest.json (run stimulus/build-e.ts)");
  } else {
    const path = `${STIMULUS}${eDocEntry.file}`;
    if (!existsSync(path)) {
      f1.ok = false;
      f1.lines.push(`FAIL ${eDocEntry.file} missing`);
    } else {
      eText = readFileSync(path, "utf8");
      const ok = sha256Text(eText) === eDocEntry.sha256 && eDocEntry.gtin === GTIN_E && eDocEntry.url === E_UPI;
      if (!ok) f1.ok = false;
      f1.lines.push(`${ok ? "ok  " : "FAIL"} ${eDocEntry.file} sha256 ${sha256Text(eText)} (manifest ${eDocEntry.sha256}), ${eDocEntry.contentType}`);
      const served = JSON.stringify([...E_SERVED_URLS]) === JSON.stringify(eDocEntry.servedAt);
      if (!served) f1.ok = false;
      f1.lines.push(`${served ? "ok  " : "FAIL"} served at ${eDocEntry.servedAt.join(" , ")}`);
    }
  }
  for (const p of manifest.pages.filter((x) => x.set === "main" || x.set === "followup")) {
    const path = `${STIMULUS}${p.file}`;
    const html = existsSync(path) ? readFileSync(path, "utf8") : null;
    const ok = html !== null && sha256Text(html) === p.sha256;
    if (!ok) {
      f1.ok = false;
      f1.lines.push(`FAIL ${p.file} does not match its manifest sha256`);
    }
    if (p.set === "followup") {
      pageSha[p.template] = p.sha256;
      const a = manifest.pages.find((x) => x.set === "main" && x.template === p.template && x.condition === "A");
      const aHtml = a && existsSync(`${STIMULUS}${a.file}`) ? readFileSync(`${STIMULUS}${a.file}`, "utf8") : null;
      const same =
        html !== null &&
        aHtml !== null &&
        p.upi === E_UPI &&
        aHtml.split(a!.upi).join("@@X@@") === html.split(E_UPI).join("@@X@@") &&
        aHtml.split(a!.upi).length === html.split(E_UPI).length;
      if (!same) f1.ok = false;
      f1.lines.push(`${same ? "ok  " : "FAIL"} ${p.file} ${p.sha256}: differs from ${a?.file} only in the link`);
    }
  }
  if (f1.ok) f1.lines.push("ok   every main (A-D) and follow-up (E) page matches its manifest sha256");
  if (!pageSha.S1) {
    f1.ok = false;
    f1.lines.push("FAIL no S1-E page in the manifest");
  }
  gates.push(f1);

  // F2: no UG presence in E.
  const f2: GateResult = { gate: "F2 E carries no UG host, id, notice, warning or link", ok: true, lines: [] };
  if (eText === null) {
    f2.ok = false;
    f2.lines.push("FAIL E document not read");
  } else {
    const hits = ugPresenceHits(eText);
    const j = JSON.parse(eText) as Record<string, unknown> & { dpp?: Record<string, unknown> };
    for (const k of ["links", "warnings", "notices"]) if (k in j) hits.push(`top-level key ${k}`);
    for (const k of ["conformanceWarnings", "notices", "warnings"]) if (j.dpp && k in j.dpp) hits.push(`dpp.${k}`);
    if (findVerificationLinks(j).candidates.length) hits.push("a URL field mentioning verif");
    for (const h of hits) f2.lines.push(`FAIL ${h}`);
    if (hits.length) f2.ok = false;
    else f2.lines.push(`ok   no hit for ${ourFixtureIdentifiers().length} study ids/GTINs/SKUs, the UG pattern list, or a host outside E's own`);
  }
  for (const p of manifest.pages.filter((x) => x.set === "followup")) {
    const html = readFileSync(`${STIMULUS}${p.file}`, "utf8").split(E_UPI).join("");
    const hits = ugPresenceHits(html).filter((h) => !h.startsWith("host outside"));
    if (hits.length) {
      f2.ok = false;
      f2.lines.push(`FAIL ${p.file}: ${hits.join("; ")}`);
    } else f2.lines.push(`ok   ${p.file}: no UG presence outside its link`);
  }
  gates.push(f2);

  // F3: E's GTIN is unknown to the UG resolver.
  const f3: GateResult = { gate: "F3 E's GTIN does not resolve on the UG resolver", ok: true, lines: [] };
  if (!gtinValid(GTIN_E)) {
    f3.ok = false;
    f3.lines.push(`FAIL ${GTIN_E} has an invalid GS1 check digit`);
  }
  if (ourFixtureIdentifiers().includes(GTIN_E)) {
    f3.ok = false;
    f3.lines.push(`FAIL ${GTIN_E} is a study GTIN`);
  }
  const r3 = await getJson(`${RESOLVER_BASE}${GTIN_E}`);
  const ok3 = r3.status === 404;
  if (!ok3) f3.ok = false;
  f3.lines.push(`${ok3 ? "ok  " : "FAIL"} ${RESOLVER_BASE}${GTIN_E} -> HTTP ${r3.status ?? r3.error} (expected 404)`);
  gates.push(f3);

  // F4: E still carries B's live information.
  const f4: GateResult = { gate: "F4 E reproduces B's live information (transform parity)", ok: true, lines: [] };
  let liveNotices: unknown = null;
  const rb = await getJson(B_SOURCE_URL);
  if (rb.status !== 200 || rb.json === undefined) {
    f4.ok = false;
    f4.lines.push(`FAIL ${B_SOURCE_URL} -> HTTP ${rb.status ?? rb.error}`);
  } else {
    const bj = rb.json as { dpp?: Record<string, unknown>; warnings?: unknown; notices?: unknown };
    liveNotices = {
      "dpp.conformanceWarnings": bj.dpp?.conformanceWarnings ?? null,
      "dpp.notices": bj.dpp?.notices ?? null,
      warnings: bj.warnings ?? null,
      notices: bj.notices ?? null,
    };
    f4.lines.push(`     B live notices (dropped from E): ${JSON.stringify(liveNotices)}`);
    const rebuilt = serialiseE(transformToE(rb.json, fixtures.B));
    if (eText !== null && rebuilt === eText) f4.lines.push("ok   transformToE(B live) === stored E, byte for byte");
    else {
      f4.ok = false;
      const a = new Map(walk(JSON.parse(rebuilt)).map((l) => [l.path, JSON.stringify(l.value)]));
      const b = new Map(eText ? walk(JSON.parse(eText)).map((l) => [l.path, JSON.stringify(l.value)]) : []);
      for (const p of new Set([...a.keys(), ...b.keys()])) {
        if (a.get(p) !== b.get(p)) f4.lines.push(`DIFF ${p}\n       live->E=${a.get(p)?.slice(0, 160)}\n       stored=${b.get(p)?.slice(0, 160)}`);
      }
      f4.lines.push("FAIL B's live data no longer equals E's. Rebuild E (stimulus/build-e.ts) or explain the change in the amendment.");
    }
  }
  gates.push(f4);

  return {
    ok: gates.every((g) => g.ok),
    ranAt: new Date().toISOString(),
    gates,
    e: { gtin: GTIN_E, url: E_UPI, servedAt: [...E_SERVED_URLS], docSha256: eDocEntry?.sha256 ?? null, pageSha256: pageSha },
    liveNotices,
  };
}

export function printFollowupPreflight(r: FollowupPreflightResult): void {
  console.log(`\n=== FOLLOW-UP PREFLIGHT (condition E, gates F1-F4) — ${r.ranAt} ===`);
  console.log(`E: ${r.e.url}  (GTIN ${r.e.gtin})`);
  for (const g of r.gates) {
    console.log(`\n[${g.ok ? "PASS" : "FAIL"}] gate ${g.gate}`);
    for (const l of g.lines) console.log(`  ${l}`);
  }
  console.log(`\nFOLLOW-UP OVERALL: ${r.ok ? "PASS" : "FAIL"}`);
}

if (import.meta.main) {
  const r = await runNativePreflight();
  printPreflight(r);
  let ok = r.ok;
  if (process.argv.includes("--followup") || process.argv.includes("--study3")) {
    const f = await runFollowupPreflight();
    printFollowupPreflight(f);
    ok = ok && f.ok;
    console.log(`\nCOMBINED (gates 0-4 + F1-F4): ${ok ? "PASS" : "FAIL"}`);
  }
  // Study 3 (added; without --study3 nothing above changes): the UCP gates U1-U5.
  if (process.argv.includes("--study3")) {
    const { runStudy3Preflight, printStudy3Preflight } = await import("./preflight-study3");
    const s = await runStudy3Preflight(r);
    printStudy3Preflight(s);
    ok = ok && s.ok;
    console.log(`\nSTUDY 3 COMBINED (gates 0-4 + F1-F4 + U1-U5): ${ok ? "PASS" : "FAIL"}`);
  }
  // Study 4 (added; without --study4 nothing above changes): gates 0-4, then Q1-Q6.
  if (process.argv.includes("--study4")) {
    const { runStudy4Preflight, printStudy4Preflight } = await import("./preflight-study4");
    const s4 = await runStudy4Preflight();
    printStudy4Preflight(s4);
    ok = ok && s4.ok;
    console.log(`\nSTUDY 4 COMBINED (gates 0-4 + Q1-Q6): ${ok ? "PASS" : "FAIL"}`);
  }
  // Study 5 (added; without --study5 nothing above changes): gates 0-4, then V0-V8.
  if (process.argv.includes("--study5")) {
    const { runStudy5Preflight, printStudy5Preflight } = await import("./preflight-study5");
    const s5 = await runStudy5Preflight();
    printStudy5Preflight(s5);
    ok = ok && s5.ok;
    console.log(`\nSTUDY 5 COMBINED (gates 0-4 + V0-V8): ${ok ? "PASS" : "FAIL"}`);
  }
  process.exit(ok ? 0 : 1);
}
