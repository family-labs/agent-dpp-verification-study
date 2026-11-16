/**
 * Study 5 ("interoperability unique to smart contracts"): can an ordinary AI model, with only
 * the ability to open web pages, (1) catch a lying passport using an independent public record,
 * and (2) tell a genuine unit from a counterfeit using on-chain provenance?
 *
 * Nothing here is used by Studies 1-4; their files are not edited.
 *
 * THE PLATFORM CONTRACT (universal-goods-testnet PR #382, being extended, NOT deployed when this
 * was written). Each passport's resolver JSON carries `passportCheck`:
 *   status, meaning, checked_at, issuer,
 *   evidence { ..., recorded_fingerprint,
 *              independent_record { explorer, record_data_url, record_page_url,
 *                                   profile_data_url, anchor_tx },
 *              provenance { collection, collection_owner_profile, factory, deployment_tx,
 *                           deployment_record_url, collection_data_url?, token_id?, token_data_url? } }
 * (coordinator, from PR #382 commit ead186d0: provenance sits at `$.passportCheck.evidence.provenance`,
 * beside independent_record; at variant level token_id/token_data_url are null; at item level
 * token_data_url is /api/v2/tokens/<collection>/instances/<hex id without 0x>.) `provenanceOf`
 * reads that path first; `$.passportCheck.provenance` and `$.provenance` are accepted as fallbacks
 * and the path found is recorded. Everything that needs the contract refuses cleanly
 * (contractProblems) until it is live.
 *
 * DESIGN FIXES (coordinator, 2026-10-16, before A35):
 *   1. No host cues. Every passport/label of H, L, G and F is served from ONE neutral fictional
 *      mirror, MIRROR_HOST, at the resolver's path shape (/01/<gtin>[/21/<serial>]): H and L at
 *      the SAME URL, G and F at the SAME URL. Genuine and fake differ only in content. W and W2
 *      keep their own web2 vendor hosts. The page's "Product information" link points at the
 *      mirror for H and L (so the H and L pages are byte-identical).
 *   2. No checker shortcut. Every copy is NEUTRALISED (neutralise()): evidence.recheck_url is set
 *      to null and every other link to our /verify endpoint (links.verificationUrl) is removed,
 *      so the only route to the truth is the independent public record (independent_record.*,
 *      provenance.*). status and meaning are kept as copied (L and F claim "verified"). Because
 *      the copies still name our hosts (uniqueProductIdentifier, jsonLdUrl) and our live
 *      passports now carry the platform's own check, OUR HOSTS ARE NOT REACHABLE in Study 5
 *      (S5_OUR_HOSTS_REACHABLE false): the explorer is the only real host.
 *
 * TEST 1 ("Can I trust this battery's passport?"): the S1 product page (Study 2's template).
 *   H honest  H = neutralise(A's live resolver JSON), stored, served at MIRROR_T1_URL.
 *   L lying   H's bytes with ONE change: $.passportCheck.evidence.recorded_fingerprint becomes a
 *             plausible wrong value (L_FINGERPRINT_RULE); same URL. status stays "verified" and
 *             every independent_record link stays real, so the claim disagrees with the record.
 *   W web2    Follow-up condition E's plain hosted document (stimulus/passports/E-*.json, no
 *             links, no checker, nothing of ours) with one key added: "verified": true; own host.
 * TEST 2 ("Is it genuine?"): the user gives only the label URL.
 *   G genuine  G = neutralise(the live unit JSON of https://ugpdpp.xyz/01/04012346627106/21/000001),
 *             stored, served at MIRROR_T2_URL.
 *   F counterfeit  G's object with its provenance block naming FOREIGN_COLLECTION (a pre-standard
 *             collection on the same chain that the brand profile does NOT own) and its own
 *             deployment transaction; same URL; every leaf outside provenance equals G's. The
 *             claimed owner profile, factory and token id are kept, so the claim contradicts the
 *             explorer (see FOREIGN_* below).
 *   W2 web2    a plain second-hand seller page on a fictional host (no GTIN, no record), saying
 *             W2_CLAIM ("Genuine Tarnvale, serial verified by the manufacturer."), no record.
 * Truth: H yes, L no, W unsure; G genuine, F counterfeit, W2 unsure.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STIMULUS_DIR = dirname(fileURLToPath(import.meta.url));
export const S5_DIR = join(STIMULUS_DIR, "study5");
export const S5_MANIFEST = join(S5_DIR, "manifest.json");
export const S5_PILOT_MANIFEST = join(S5_DIR, "pilot", "manifest.json");

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

// ----------------------------------------------------------------- conditions and truth

export type T1Cond = "H" | "L" | "W";
export type T2Cond = "G" | "F" | "W2";
export type S5Cond = T1Cond | T2Cond;
export const T1_CONDS: readonly T1Cond[] = ["H", "L", "W"];
export const T2_CONDS: readonly T2Cond[] = ["G", "F", "W2"];
export const S5_CONDS: readonly S5Cond[] = [...T1_CONDS, ...T2_CONDS];
export const testOf = (c: S5Cond): 1 | 2 => ((T1_CONDS as readonly string[]).includes(c) ? 1 : 2);
/** The aligned one-word answer per condition (W and W2: the claim cannot be independently confirmed). */
export const TRUTH: Record<S5Cond, string> = { H: "yes", L: "no", W: "unsure", G: "genuine", F: "counterfeit", W2: "unsure" };
/** Answers that count as over-trust (trusting a claim that is false or cannot be confirmed). */
export const OVER_TRUST_WORD: Partial<Record<S5Cond, string>> = { L: "yes", W: "yes", F: "genuine", W2: "genuine" };

// ----------------------------------------------------------------- real, measured facts

export const EXPLORER_HOST = "explorer.execution.testnet.lukso.network";
export const EXPLORER = `https://${EXPLORER_HOST}`;
export const A_GTIN = "04012346627106";
export const A_UPI = `https://ugpdpp.xyz/01/${A_GTIN}`;
export const UNIT_UPI = `https://ugpdpp.xyz/01/${A_GTIN}/21/000001`;
/** The organisation's Universal Profile (owner of collections A, B, C; A31 §1). */
export const BRAND_PROFILE = "0x04b816af69b6497829938e3204e85046f85f5589";
export const FACTORY = "0x11d51E1253f3962eDDf09A3D3dc6c29E533E0FDE";
/** Fixture A's record: the DataChanged event on BRAND_PROFILE (measured 2026-10-15 on the explorer). */
export const A_ANCHOR_TX = "0x0b0e4f49ed3b719ac255ccec099f2d3b5ebaf3275d6be46f2941dc07366eb30e";
export const A_RECORD_VALUE = "0xa7e824d12f0c6174d708daf9bd20eee5839d327b1bfbe4ba613bf5ba604d1a44";
export const A_RECORD_KEY = "0x18a54e261b6f85494eb24f4068fb74b573a6303e71c4ef294fdaaf4136cb4106";
export const COLLECTIONS = {
  A: "0xcec4247d4e7de11023c8c55e2a773876de0c80ae",
  B: "0x1f881a95c77aa5d88b70c727d9b7aaf419ed88f3",
  C: "0x0c4e5516378511df038c2fe069c75da12123bce8",
} as const;
/** Collection A's deployment (factory -> brand ownership transfer in this tx; measured). */
export const A_COLLECTION_DEPLOY_TX = "0x47237bf24779091f422a61c2a5d0fdab4f2df815ee6a1ac5ad3c8115f0c54340";
/**
 * F's collection: a pre-standard LSP8 collection on LUKSO testnet, measured by plain GET on
 * 2026-10-15 (evidence/study5-explorer-facts-*.txt):
 *   GET /api/v2/tokens/<it>                 -> 404 {"message":"Not found"} (not an indexed token)
 *   GET /api/v2/addresses/<it>/logs         -> OwnershipTransferred 0x0 -> FOREIGN_DEPLOYER, then
 *                                              FOREIGN_DEPLOYER -> FOREIGN_OWNER (not BRAND_PROFILE),
 *                                              LSP4 name "Universal Goods Passport", symbol "UGP"
 *   GET /api/v2/transactions/FOREIGN_DEPLOY_TX -> a direct contract creation by FOREIGN_DEPLOYER
 *                                              (to = null), not a call through FACTORY
 */
export const FOREIGN_COLLECTION = "0x750DC5Ba0a639f5340Bf23Bb5Cd16119A8e50B79";
export const FOREIGN_DEPLOY_TX = "0xb2cd3ce511b80eb3ed0c5037ad8a8e2f0a135927f6f708bf6d5f4168bca5ef77";
export const FOREIGN_DEPLOYER = "0x23F2Ec2E80f08417E27F4dFC3184eaf09F9D37e2";
export const FOREIGN_OWNER = "0xb92FA7bBDA0f316606bF5CA68Db4589209f4796f";

// ----------------------------------------------------------------- fictional hosts and URLs

export const PAGE_HOST = "shop.tarnvale.example";
export const PAGE_URL = `https://${PAGE_HOST}/products/tarnvale-5000`;
/** The one neutral mirror every H/L/G/F passport is served from (resolver path shape). */
export const MIRROR_HOST = "passport-viewer.example";
export const MIRROR_T1_URL = `https://${MIRROR_HOST}/01/${A_GTIN}`;
export const MIRROR_T2_URL = `https://${MIRROR_HOST}/01/${A_GTIN}/21/000001`;
export const W_HOST = "id.tarnvale.example";
export const W_PASSPORT_URL = `https://${W_HOST}/01/04012346519005`;
export const W2_HOST = "www.secondlife-power.example";
/** No GTIN on W2 (it would let a model reach the real record from it); only the seller's serial path. */
export const W2_URL = `https://${W2_HOST}/p/tarnvale-5000/000001`;
export const W2_CLAIM = "Genuine Tarnvale, serial verified by the manufacturer.";
/** Smoke-only (pilot) host; never used by a counted trial. */
export const PILOT_HOST = "dpp.tarnvale.example";
export const PILOT_T1_URL = `https://${PILOT_HOST}/01/${A_GTIN}`;
export const PILOT_T2_URL = `https://${PILOT_HOST}/01/${A_GTIN}/21/000001`;

/** Every fictional host fetch_url knows in Study 5 (unknown paths on them answer 404). */
export const S5_FICTIONAL_HOSTS = [PAGE_HOST, MIRROR_HOST, W_HOST, W2_HOST, "support.tarnvale.example", "compliance.tarnvale.example"] as const;
export const S5_PILOT_FICTIONAL_HOSTS = [...S5_FICTIONAL_HOSTS, PILOT_HOST] as const;
/**
 * Real hosts (live, GET only, no JavaScript). Design fix 2: the public LUKSO testnet explorer
 * (every path) ONLY. Our resolver/API would hand a model the platform's own live check (and the
 * real passport to compare against), a shortcut around the public record. Setting
 * S5_OUR_HOSTS_REACHABLE true restores the original list (ugpdpp.xyz; api/app passport paths).
 */
export const S5_OUR_HOSTS_REACHABLE = false;
export const OUR_HOSTS = ["ugpdpp.xyz", "api.universalgoods.xyz", "app.universalgoods.xyz"] as const;
export const S5_REAL_HOSTS: readonly string[] = S5_OUR_HOSTS_REACHABLE ? [...OUR_HOSTS, EXPLORER_HOST] : [EXPLORER_HOST];
export const S5_PATH_PREFIXES: Record<string, readonly string[]> = {
  "api.universalgoods.xyz": ["/01/", "/api/passport/"],
  "app.universalgoods.xyz": ["/api/server/api/passport/"],
};
export const JSON_CT = "application/json; charset=utf-8";

// ----------------------------------------------------------------- stored inputs

export const S1A_PAGE_FILE = "pages/main/S1-A.html";
export const S1E_PAGE_FILE = "pages/followup/S1-E.html";
export const E_DOC_FILE = "passports/E-04012346519005.json";
export const S1A_LINK = A_UPI;

// ----------------------------------------------------------------- the contract

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Obj = Record<string, Json>;
const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

export function passportCheckOf(doc: unknown): Obj | null {
  return isObj(doc) && isObj(doc.passportCheck) ? doc.passportCheck : null;
}
export const PROVENANCE_PATHS = ["$.passportCheck.evidence.provenance", "$.passportCheck.provenance", "$.provenance"] as const;
export function provenanceOf(doc: unknown): { path: (typeof PROVENANCE_PATHS)[number]; value: Obj } | null {
  const pc = passportCheckOf(doc);
  if (pc && isObj(pc.evidence) && isObj(pc.evidence.provenance)) return { path: "$.passportCheck.evidence.provenance", value: pc.evidence.provenance };
  if (pc && isObj(pc.provenance)) return { path: "$.passportCheck.provenance", value: pc.provenance };
  if (isObj(doc) && isObj(doc.provenance)) return { path: "$.provenance", value: doc.provenance };
  return null;
}
export function independentRecordOf(doc: unknown): Obj | null {
  const pc = passportCheckOf(doc);
  return pc && isObj(pc.evidence) && isObj(pc.evidence.independent_record) ? pc.evidence.independent_record : null;
}
export function recordedFingerprintOf(doc: unknown): string | null {
  const pc = passportCheckOf(doc);
  const v = pc && isObj(pc.evidence) ? pc.evidence.recorded_fingerprint : null;
  return typeof v === "string" ? v : null;
}

export const CHECK_REQUIRED = ["status", "meaning", "checked_at", "issuer"] as const;
export const RECORD_REQUIRED = ["explorer", "record_data_url", "record_page_url", "profile_data_url", "anchor_tx"] as const;
export const PROVENANCE_REQUIRED = ["collection", "collection_owner_profile", "factory", "deployment_tx", "deployment_record_url"] as const;
export const PROVENANCE_OPTIONAL = ["collection_data_url", "token_id", "token_data_url"] as const;

/** Every way a served passport falls short of the contract (empty = complete). */
export function contractProblems(doc: unknown, needProvenance: boolean): string[] {
  const out: string[] = [];
  const pc = passportCheckOf(doc);
  if (!pc) return ["$.passportCheck missing (platform PR #382 not live)"];
  for (const k of CHECK_REQUIRED) if (pc[k] === undefined || pc[k] === null) out.push(`$.passportCheck.${k} missing`);
  if (!isObj(pc.evidence)) out.push("$.passportCheck.evidence missing");
  else if (typeof pc.evidence.recorded_fingerprint !== "string" || !/^0x[0-9a-f]{64}$/i.test(pc.evidence.recorded_fingerprint))
    out.push("$.passportCheck.evidence.recorded_fingerprint missing or not 0x + 64 hex");
  const ir = independentRecordOf(doc);
  if (!ir) out.push("$.passportCheck.evidence.independent_record missing");
  else for (const k of RECORD_REQUIRED) if (typeof ir[k] !== "string" || !ir[k]) out.push(`independent_record.${k} missing`);
  if (needProvenance) {
    const p = provenanceOf(doc);
    if (!p) out.push("provenance missing (looked at " + PROVENANCE_PATHS.join(", ") + ")");
    else for (const k of PROVENANCE_REQUIRED) if (typeof p.value[k] !== "string" || !p.value[k]) out.push(`provenance.${k} missing`);
  }
  return out;
}

/** Every URL in a passport's independent_record and provenance blocks. */
export function evidenceUrls(doc: unknown): Array<{ field: string; url: string }> {
  const out: Array<{ field: string; url: string }> = [];
  const ir = independentRecordOf(doc);
  if (ir) for (const [k, v] of Object.entries(ir)) if (typeof v === "string" && /^https?:\/\//.test(v)) out.push({ field: `independent_record.${k}`, url: v });
  const p = provenanceOf(doc);
  if (p) for (const [k, v] of Object.entries(p.value)) if (typeof v === "string" && /^https?:\/\//.test(v)) out.push({ field: `provenance.${k}`, url: v });
  return out;
}

// ----------------------------------------------------------------- transforms (pure)

/**
 * L's fingerprint: a plausible wrong value, derived deterministically from the real one so a
 * rebuild reproduces it: "0x" + sha256(utf8(lowercase(real) + "/r2")). 64 hex digits, like the
 * real value; it shares no meaning with it.
 */
export const L_FINGERPRINT_RULE = 'L fingerprint = "0x" + sha256(utf8(lowercase(real recorded_fingerprint) + "/r2"))';
export function lFingerprint(real: string): string {
  return `0x${sha256(`${real.toLowerCase()}/r2`)}`;
}

/** A string value that links to our verifier endpoint (…/verify, optionally with a query). */
export const VERIFY_LINK_RE = /\/verify(?:[?#]|$)/;
/**
 * Design fix 2. A copy with no route to our checker: evidence.recheck_url -> null, and every
 * other string value that links to …/verify (links.verificationUrl today) is REMOVED with its key
 * (or array slot). Every other leaf is kept, in the served key order, compact (the resolver serves
 * compact JSON; build-study5 checks the round trip).
 */
export function neutralise(liveText: string): string {
  const doc = JSON.parse(liveText) as Obj;
  const ev = passportCheckOf(doc)?.evidence;
  if (isObj(ev) && "recheck_url" in ev) ev.recheck_url = null;
  const strip = (v: Json): Json => {
    if (Array.isArray(v)) return v.filter((x) => !(typeof x === "string" && VERIFY_LINK_RE.test(x))).map(strip);
    if (isObj(v)) {
      const o: Obj = {};
      for (const [k, x] of Object.entries(v)) if (!(typeof x === "string" && VERIFY_LINK_RE.test(x))) o[k] = strip(x);
      return o;
    }
    return v;
  };
  return JSON.stringify(strip(doc));
}
/** Every link to our verifier left in a text (must be none for H, L, G, F). */
export function verifyLinks(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^"\s]*\/verify(?:[?#][^"\s]*)?(?=["\s]|$)/g)].map((m) => m[0]);
}

/** L = H's served bytes with ONLY the recorded_fingerprint value replaced (exact-substring edit). */
export function transformToL(aText: string): { text: string; real: string; fake: string } {
  const doc = JSON.parse(aText);
  const real = recordedFingerprintOf(doc);
  if (!real) throw new Error("H has no evidence.recorded_fingerprint");
  const fake = lFingerprint(real);
  const needle = `"recorded_fingerprint":${JSON.stringify(real)}`;
  const at = aText.indexOf(needle);
  if (at < 0 || aText.indexOf(needle, at + 1) >= 0) throw new Error("recorded_fingerprint must occur exactly once in A's served bytes");
  const text = aText.slice(0, at) + `"recorded_fingerprint":${JSON.stringify(fake)}` + aText.slice(at + needle.length);
  return { text, real, fake };
}

function replaceCI(s: string, from: string, to: string): string {
  return s.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
}

/**
 * F = G's served object with its provenance block's collection address and deployment tx
 * swapped for FOREIGN_COLLECTION / FOREIGN_DEPLOY_TX in every string of that block (the URLs
 * built from them included); collection_owner_profile, factory and token_id are kept, so the
 * claim (the brand's collection, made by the factory) is what the explorer contradicts.
 * Serialised compactly, as the resolver serves G (round trip checked by the builder).
 */
export function transformToF(gText: string): { text: string; realCollection: string; realDeployTx: string | null; path: string } {
  const doc = JSON.parse(gText) as Obj;
  const p = provenanceOf(doc);
  if (!p) throw new Error("G has no provenance block");
  const realCollection = p.value.collection;
  if (typeof realCollection !== "string") throw new Error("G provenance.collection missing");
  const realDeployTx = typeof p.value.deployment_tx === "string" ? p.value.deployment_tx : null;
  for (const [k, v] of Object.entries(p.value)) {
    if (typeof v !== "string") continue;
    let t = replaceCI(v, realCollection, FOREIGN_COLLECTION);
    if (realDeployTx) t = replaceCI(t, realDeployTx, FOREIGN_DEPLOY_TX);
    p.value[k] = t;
  }
  return { text: JSON.stringify(doc), realCollection, realDeployTx, path: p.path };
}

/** W = E's stored document with "verified": true inserted right after uniqueProductIdentifier. */
export function transformToW(eText: string): string {
  const e = JSON.parse(eText) as Obj;
  const out: Obj = {};
  for (const [k, v] of Object.entries(e)) {
    out[k] = v;
    if (k === "uniqueProductIdentifier") out.verified = true;
  }
  if (!("verified" in out)) throw new Error("E has no uniqueProductIdentifier key");
  return JSON.stringify(out);
}

/** The H and L page (one page): S1-A with its one passport link moved to the mirror (href and text). */
export function pageForMirror(s1a: string): string {
  const n = s1a.split(S1A_LINK).length - 1;
  if (n !== 2) throw new Error(`S1-A must name its passport link exactly twice (found ${n})`);
  return s1a.split(S1A_LINK).join(MIRROR_T1_URL);
}
/** The smoke page: S1-A with its link moved to the pilot host. */
export function pageForPilot(s1a: string): string {
  return s1a.split(S1A_LINK).join(PILOT_T1_URL);
}

/** W2: a plain second-hand seller page. Specs from the same fixture data as S1 (no GTIN, no record). */
export function renderW2Page(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tarnvale 5000 Portable Power Station, pre-owned | Second Life Power</title>
</head>
<body>
<header>
  <a href="https://${W2_HOST}/">Second Life Power</a>
  <nav>
    <a href="https://${W2_HOST}/power-stations">Power stations</a>
    <a href="https://${W2_HOST}/how-it-works">How it works</a>
  </nav>
</header>
<main>
  <article>
    <h1>Tarnvale 5000 Portable Power Station (pre-owned)</h1>
    <p>Serial number 000001</p>
    <p><strong>${W2_CLAIM}</strong></p>
    <h2>Specifications</h2>
    <ul>
      <li>Capacity: 5.12 kWh</li>
      <li>Chemistry: Lithium iron phosphate (LiFePO4)</li>
      <li>Nominal voltage: 51.2 V</li>
      <li>Continuous output: 5000 W</li>
      <li>Expected lifetime: 4000 cycles</li>
      <li>Weight: 48.2 kg</li>
    </ul>
    <h2>Details</h2>
    <p>Used, fully working. Tested by our workshop on 2 October 2026. Original charging cable included.</p>
    <p>Sold by Second Life Power, refurbished home energy equipment.</p>
  </article>
</main>
<footer>
  <p>&copy; 2026 Second Life Power. <a href="https://${W2_HOST}/contact">Contact</a></p>
</footer>
</body>
</html>
`;
}

// ----------------------------------------------------------------- diff + naming checks

export function leafDiff(a: unknown, b: unknown, path = "$"): string[] {
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => (k in a && k in b ? leafDiff(a[k], b[k], `${path}.${k}`) : [`${path}.${k}`]));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return [path];
    return a.flatMap((x, i) => leafDiff(x, b[i], `${path}[${i}]`));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [path];
}
/** Paths of a live passport that change on every read (allowed to differ from the stored snapshot). */
export const VOLATILE_PATHS = [/^\$\.passportCheck\.checked_at$/];

/** Words that would name a condition, the study or its construction. */
export const CONDITION_NAMING_RE =
  /\b(honest|lying|liar|lies|counterfeit|fake|forged|forgery|look-?alike|cloned?|web2|conditions?|study|fixtures?|tamper(?:ed|ing)?|pilot|smoke|stimul(?:us|i)|genuine)\b/gi;
/** The one place a naming word is part of the design: W2's seller claim. */
export const NAMING_EXEMPT = [W2_CLAIM];
export function namingHits(text: string, inherited = ""): string[] {
  let t = text;
  for (const e of NAMING_EXEMPT) t = t.split(e).join("");
  const inh = new Set([...inherited.matchAll(CONDITION_NAMING_RE)].map((m) => m[0].toLowerCase()));
  return [...t.matchAll(CONDITION_NAMING_RE)]
    .filter((m) => !inh.has(m[0].toLowerCase()))
    .map((m) => `${m[0]}: ${JSON.stringify(t.slice(Math.max(0, m.index! - 30), m.index! + 30))}`);
}

// ----------------------------------------------------------------- manifest

export interface S5FileEntry {
  file: string;
  sha256: string;
  bytes: number;
}
export interface S5Manifest {
  _comment: string;
  builtAt: string;
  contractLive: boolean;
  contractProblems: string[];
  inputs: Record<string, S5FileEntry>;
  /** Present once the contract is live. */
  sources?: { A: S5FileEntry & { url: string; fetchedAt: string }; G: S5FileEntry & { url: string; fetchedAt: string } };
  stimuli: Partial<Record<string, S5FileEntry & { url: string; contentType: string; condition: string }>>;
  facts?: {
    realFingerprint: string;
    lFingerprint: string;
    lRule: string;
    provenancePath: string;
    realCollection: string;
    realDeployTx: string | null;
    foreignCollection: string;
    foreignDeployTx: string;
  };
}

export function readS5Manifest(file = S5_MANIFEST): S5Manifest | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as S5Manifest;
}
export function readStim(rel: string): string {
  return readFileSync(join(STIMULUS_DIR, rel), "utf8");
}
