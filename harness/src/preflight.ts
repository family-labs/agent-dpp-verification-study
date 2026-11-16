/**
 * Ground-truth preflight.
 *
 * The independent variable of this study is the verification status of the
 * three fixtures: A must verify as "verified", B as "unverified", C as
 * "invalid". If the live API does not actually return those values, the
 * experiment has no independent variable and every trial run against it is
 * wasted — the agents would all be shown the same thing under three different
 * labels.
 *
 * The check has FIVE parts, and all five must hold:
 *
 *   1. SCHEMA. Every declared groundTruth, and every observed live status, is
 *      one of the three values the coding scheme can actually hold.
 *   2. AGREEMENT. Each condition's live status equals its declared groundTruth
 *      in the fixtures file.
 *   3. DECLARED DISTINCTNESS. The three declared groundTruth values are
 *      pairwise distinct.
 *   4. OBSERVED DISTINCTNESS. The three live statuses are pairwise distinct.
 *   5. MATCHEDNESS. The three SERVED passports are identical once the things
 *      that are legitimately allowed to differ have been removed. This has
 *      SIX limbs: (a) no differing path after normalisation; (b) no object
 *      left EMPTY by the exemptions, because a section every field of which is
 *      exempt is unverifiable rather than matched; (c) the DESCRIPTIVE payload
 *      sizes — raw bytes minus the credential/anchor blocks — agree within a
 *      tight tolerance. The credential/anchor bytes are reported separately and
 *      never asserted: that component is the independent variable. (d) the RAW
 *      descriptive bytes — measured on the wire, not on a re-serialisation —
 *      agree within the same tolerance; (e) the raw text contains no DUPLICATE
 *      JSON KEYS; (f) every exempt value still has the SHAPE it claims to have.
 *
 *      Limbs (d)-(f) exist because limbs (a)-(c) all look at the payload only
 *      AFTER JSON.parse, and parsing is lossy. `{"recyclability":"A-ONLY: THIS
 *      PRODUCT IS RECALLED","recyclability":"<normal>"}` parses to the second
 *      value — the prose never enters the compared structure, and because (c)
 *      measures a RE-SERIALISATION of the parsed object the bytes disappear
 *      from that figure too. Only the raw wire bytes ever saw it, and the raw
 *      figure was reported and never asserted. Both halves of that hole are now
 *      closed: duplicate keys fail outright, and the raw descriptive size is
 *      asserted, so the header's claim that rawBytes is "the payload the agent
 *      reads in naive mode" is now a claim this file acts on.
 *
 * Parts 1-4 prove the three conditions DIFFER in verification state. Nothing in
 * them proves the conditions are IDENTICAL in everything else, and STUDY_DESIGN
 * .md:27 requires exactly that — "matched fixtures, identical descriptive data".
 * That requirement was violated in production from 2026-07-23 without a single
 * red row: condition A carried an EU Battery Passport category while B and C
 * carried none, so A's served passport was ~1.5 KB against B's ~4.9 KB, because
 * a categorised product serves only (stored sections) INTERSECT (that category's
 * schema sections). Four green parts sat on top of it the whole time. Part 5 is
 * what makes that confound loud instead of silent, and what stops it returning.
 *
 * Parts 2-4 are all computed from, or against, the fixtures file — and the
 * fixtures file is itself part of what is under suspicion. An operator who
 * edits fixtures/conditions.json so that all three conditions declare
 * "unverified" gets three green agreement rows against a live stack that also
 * returns "unverified" three times: a "PASSED" banner over an experiment in
 * which all three conditions are literally the same condition. Distinctness is
 * what makes the assertion an assertion about the world rather than about the
 * file.
 *
 * Part 1 exists because distinctness alone is still not sufficient. Distinct
 * values can be distinct nonsense. Declaring A="valid_unanchored" against a
 * local seed that returns it, or A/B/C = "banana"/"kiwi"/"fig" against a stub
 * that echoes them, satisfies both agreement and both distinctness axes — and
 * produces a green banner over a condition that analysis/analyze.py will score
 * as 0% accurate for every agent forever, because an agent's self-report can
 * only ever be one of the four values in types.ts. Ground truth outside the
 * coding scheme is not ground truth; it is an unscoreable cell.
 *
 * The check always covers ALL THREE conditions, regardless of which subset the
 * invocation selected: a run restricted to `--conditions B` used to pass simply
 * because B happened to be the one condition that was accidentally correct.
 *
 * On failure the run aborts with a non-zero exit — unless SKIP_PREFLIGHT=1,
 * which downgrades the abort to a loud warning AND marks the result bypassed so
 * the caller can stamp every log row and exit with a distinct code.
 */
import { UG_API_BASE, fixtureFor } from "./config";
import type { Condition } from "./types";

/** Statuses the coding scheme (types.ts VerdictSelfReport) can actually hold. */
const CODEABLE_STATUSES = ["verified", "unverified", "invalid", "unknown"] as const;

/**
 * The values a ground truth is allowed to take — the codeable statuses MINUS
 * "unknown". "unknown" is something an AGENT may report when it cannot tell;
 * it is never a property of a fixture, so a fixture declaring it would make the
 * cell unscoreable in the same way an out-of-scheme value does.
 *
 * This must stay in step with the `groundTruth` union in config.ts and
 * types.ts. It is enforced, not merely documented: a declared or observed value
 * outside this set fails the preflight.
 */
const GROUND_TRUTH_VALUES = ["verified", "unverified", "invalid"] as const;

function inScheme(value: string): boolean {
  return (GROUND_TRUTH_VALUES as readonly string[]).includes(value);
}

/** The preflight is never scoped to a subset — see the header comment. */
export const PREFLIGHT_CONDITIONS: readonly Condition[] = ["A", "B", "C"] as const;

/** Exit code for a run that completed over a bypassed, FAILED preflight. */
export const BYPASSED_EXIT_CODE = 3;

/** Per-request budget. Bun's ~10s idle default is a runtime detail, not a promise. */
const FETCH_TIMEOUT_MS = 10_000;

export interface PreflightRow {
  condition: Condition;
  /** null when the fixtures file has no productId for this condition. */
  productId: string | null;
  /** null when the fixtures file could not be read for this condition. */
  groundTruth: string | null;
  liveStatus: string | null;
  ok: boolean;
  /** Populated when the row failed; explains why in one sentence. */
  detail?: string;
  /** Populated when the endpoint itself failed (network / non-200). */
  transportError?: string;
}

export interface DistinctnessCheck {
  ok: boolean;
  /** How many conditions actually had a value on this axis (nulls skipped). */
  observable: number;
  /** How many distinct values those observable conditions took. */
  distinct: number;
  /** Populated when the check failed; names the colliding conditions. */
  detail?: string;
}

export interface PreflightResult {
  apiBase: string;
  rows: PreflightRow[];
  /** Every condition's live status equals its declared ground truth. */
  agreementOk: boolean;
  /** The three DECLARED ground truths are pairwise distinct. */
  declaredDistinct: DistinctnessCheck;
  /** The three OBSERVED live statuses are pairwise distinct. */
  observedDistinct: DistinctnessCheck;
  /**
   * The three SERVED passports are identical once the legitimately-varying
   * parts (ids, per-unit identifiers, the SKU inside the product name, and the
   * verification blocks) are stripped or masked. Every such allowance is an
   * exact path in EXEMPTIONS, and the whole table is printed in the report.
   */
  matchedness: MatchednessCheck;
  /** All of: agreement, both distinctness axes, and matchedness. */
  ok: boolean;
  /** True when the preflight FAILED and SKIP_PREFLIGHT=1 let the run proceed. */
  bypassed: boolean;
}

/** Observed live status for one condition, for stamping into the trial log. */
export function observedStatusFor(
  result: PreflightResult,
  condition: Condition,
): string | null {
  return result.rows.find((r) => r.condition === condition)?.liveStatus ?? null;
}

async function checkOne(condition: Condition): Promise<PreflightRow> {
  // fixtureFor() throws when the fixtures file has no productId for this
  // condition. It used to be called outside the try, so that throw escaped as an
  // unhandled rejection and the operator got a stack trace instead of the
  // designed message. It still failed closed; now it fails cleanly.
  let productId: string;
  let groundTruth: string;
  try {
    const fixture = fixtureFor(condition);
    productId = fixture.productId;
    groundTruth = fixture.groundTruth;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      condition,
      productId: null,
      groundTruth: null,
      liveStatus: null,
      ok: false,
      transportError: `fixture unusable: ${msg}`,
      detail:
        `Condition ${condition} could not be resolved from the fixtures file — ` +
        `${msg}. Ground truth cannot be established for a condition that has no ` +
        `fixture, and an unresolvable fixture is NOT a pass.`,
    };
  }

  // SCHEMA CHECK on the DECLARED value, before spending a request. This has to
  // happen before the agreement comparison below, because agreement is an
  // equality test between two strings and will happily succeed on two equal
  // strings that mean nothing to the coding scheme.
  if (!inScheme(groundTruth)) {
    return {
      condition,
      productId,
      groundTruth,
      liveStatus: null,
      ok: false,
      detail:
        `declared ground truth "${groundTruth}" is not a value the coding ` +
        `scheme can hold. A fixture's ground truth must be one of ` +
        `${GROUND_TRUTH_VALUES.join(" | ")}. An agent's self-report can only ` +
        `ever be one of ${CODEABLE_STATUSES.join(" | ")} (types.ts), so a ` +
        `condition declared as anything else is scored 0% accurate for every ` +
        `agent by analysis/analyze.py, permanently and silently. Note ` +
        `"unknown" is deliberately excluded: it is something an agent may ` +
        `report, never a property of a fixture.`,
    };
  }

  const url = `${UG_API_BASE}/api/passport/${encodeURIComponent(productId)}/verify`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Explicit, rather than inherited from the runtime's idle default.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Explicit redirect policy. fetch follows redirects by default, so a 302
      // to another host that answers 200 with a matching status would be
      // accepted as authoritative ground truth for UG_API_BASE — the reader of
      // the JSONL would have no way to know a different host answered. Ground
      // truth must come from the host named in apiBase and nowhere else, so a
      // redirect is a hard failure rather than something to follow.
      redirect: "error",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      condition,
      productId,
      groundTruth,
      liveStatus: null,
      ok: false,
      transportError: `verifier unreachable: ${msg}`,
      detail:
        `Could not reach ${url} — a network failure, a timeout (>${FETCH_TIMEOUT_MS}ms), ` +
        `or a redirect away from the configured host is NOT a pass.`,
    };
  }

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    return {
      condition,
      productId,
      groundTruth,
      liveStatus: null,
      ok: false,
      transportError: `HTTP ${res.status}`,
      detail: `Verifier returned HTTP ${res.status} for ${url} — a non-200 is NOT a pass. Body: ${body}`,
    };
  }

  let liveStatus: string;
  try {
    const json = (await res.json()) as { verdict?: unknown };
    if (typeof json.verdict !== "string") {
      return {
        condition,
        productId,
        groundTruth,
        liveStatus: null,
        ok: false,
        transportError: "malformed response",
        detail: `Verifier response had no string "verdict" field — cannot establish ground truth.`,
      };
    }
    liveStatus = json.verdict;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      condition,
      productId,
      groundTruth,
      liveStatus: null,
      ok: false,
      transportError: `unparseable JSON: ${msg}`,
      detail: `Verifier response was not JSON — cannot establish ground truth.`,
    };
  }

  // SCHEMA CHECK on the OBSERVED value, also before the agreement comparison.
  // "valid_unanchored" is caught by its dedicated branch just below, which says
  // more; anything else out of scheme is caught here.
  if (!inScheme(liveStatus) && liveStatus !== "valid_unanchored") {
    return {
      condition,
      productId,
      groundTruth,
      liveStatus,
      ok: false,
      detail:
        `live status "${liveStatus}" is not a value the coding scheme can ` +
        `hold (${GROUND_TRUTH_VALUES.join(" | ")}). Whatever this endpoint is ` +
        `serving, it is not a verdict this study can score — and it is NOT a ` +
        `pass merely because it happens to equal the declared ground truth.`,
    };
  }

  if (liveStatus === groundTruth) {
    return { condition, productId, groundTruth, liveStatus, ok: true };
  }

  // Special-case the local-seed path's "valid_unanchored", which is NOT a
  // match for "verified" and has no home in the coding scheme.
  if (liveStatus === "valid_unanchored") {
    return {
      condition,
      productId,
      groundTruth,
      liveStatus,
      ok: false,
      detail:
        `live status "valid_unanchored" does NOT match declared ground truth ` +
        `"${groundTruth}". "valid_unanchored" means the credential ` +
        `signature checks out but nothing is anchored on chain — it is not a ` +
        `verified passport, and it has no home in the coding scheme, which ` +
        `enumerates only ${CODEABLE_STATUSES.join(" | ")} (types.ts). Coding a ` +
        `"valid_unanchored" fixture as "verified" would silently redefine the ` +
        `independent variable. This is what the local-seed path produces for A; ` +
        `it is not what the anchored testnet fixture is supposed to produce.`,
    };
  }

  return {
    condition,
    productId,
    groundTruth,
    liveStatus,
    ok: false,
    detail: `live status "${liveStatus}" != declared ground truth "${groundTruth}"`,
  };
}

/**
 * Pairwise distinctness over one axis (declared or observed).
 *
 * Rows whose value is null are skipped — they have already failed the
 * agreement check, and a missing value is not evidence of sameness.
 */
function pairwiseDistinct(
  values: Array<{ condition: Condition; value: string | null }>,
  axis: "declared ground truth" | "observed live status",
): DistinctnessCheck {
  const groups = new Map<string, Condition[]>();
  for (const { condition, value } of values) {
    if (value === null) continue;
    const group = groups.get(value) ?? [];
    group.push(condition);
    groups.set(value, group);
  }
  const observable = values.filter((v) => v.value !== null).length;
  const distinct = groups.size;
  const collisions = [...groups.entries()].filter(([, cs]) => cs.length > 1);
  if (collisions.length === 0) return { ok: true, observable, distinct };
  const detail = collisions
    .map(
      ([value, cs]) =>
        `conditions ${cs.join(", ")} are THE SAME CONDITION — ` +
        `their ${axis} is "${value}" for all of them`,
    )
    .join("; ");
  return { ok: false, observable, distinct, detail };
}

/* ------------------------------------------------------------------------- *
 * PART 5 — MATCHEDNESS
 * ------------------------------------------------------------------------- */

/**
 * WHAT AN EXEMPTION IS, AND WHY THEY ARE ALL PATH-SCOPED.
 *
 * Every entry below is something this gate has agreed to STOP NOTICING. That
 * makes the table the entire trust surface of part 5: anything on it is a place
 * a future confound can hide, and the only defence is that the table stays
 * small, specific, and readable.
 *
 * An earlier version exempted ten key NAMES at any depth — `id`, `identifier`,
 * `gtin`, `mpn`, `proof`, `credential`, `verification`, `onChainAnchor`,
 * `entityId`, `@id`. That reasoning was applied to `name` (see below) and then
 * not applied to those ten, and the consequences were real and demonstrated:
 *   - a whole extra section `ug:sections.verification` containing the free prose
 *     "A is great, buy it" was stripped before comparison and passed the gate,
 *     while a naive-mode agent reads it verbatim;
 *   - `ug:sections.compliance.proof = {recalled:true, reason:"fire hazard"}`
 *     passed;
 *   - an expired certification `identifier` and a fake notified-body `@id`
 *     passed.
 * Key-name exemption is unbounded in depth AND in meaning: "verification" names
 * the independent variable in one position and names arbitrary prose in
 * another, and a key-scoped rule cannot tell those apart.
 *
 * So: exemptions are keyed by EXACT PATH. There are no wildcards and no
 * depth-free key rules. An unknown key appearing anywhere — and in particular an
 * unknown top-level key inside `ug:sections` — is NEVER exempt and always fails
 * the gate. If a genuinely new position must be exempted, it is added here, by
 * path, with a reason. `validateExemptions()` below enforces the invariants that
 * make that promise mechanical rather than aspirational.
 *
 * ⭐ THE GOVERNING PRINCIPLE: AN EXEMPTION MUST BOUND WHAT MAY VARY, NEVER
 * MERELY DELETE IT FROM COMPARISON.
 *
 * Every path this table stops comparing is an UNPOLICED REGION, and an unpoliced
 * region is a smuggling channel: whatever an operator (or a bug, or a compromised
 * emitter) writes there reaches the agent verbatim in naive mode while this gate
 * prints OK. The old table had five bare `drop`s and the only thing standing
 * between them and arbitrary agent-readable prose was the descriptive-size check
 * — which is itself evadable, because it USED to carry a 1% relative term, so a
 * payload that grew (a matched 560 KB field on all three) bought a ~5.6 KB
 * smuggling budget. A gate whose backstop scales with the attacker's payload is
 * not a backstop.
 *
 * So no exemption may simply delete a value. Every exemption declares a SHAPE the
 * value must still have, and the shape is asserted on the served value before the
 * value is masked or set aside. A GTIN must still be 8/12/13/14 digits. An `@id`
 * must still be a URL whose path ends in a UUID. A URN must still match its
 * scheme. The credential block must still contain ONLY an enumerated set of keys,
 * each of its expected primitive form. What varies is bounded; nothing is blind.
 *
 * THREE KINDS:
 *   "mask-sku"        — the value is COMPARED, with this fixture's own SKU masked
 *                       out of it. The preferred form: it exempts the few
 *                       characters that genuinely cannot be equal while leaving
 *                       the rest of the field under comparison. `/name` used to be
 *                       a whole-field drop, which meant A's product name could read
 *                       "TOTALLY DIFFERENT PRODUCT" with the gate green. Masked,
 *                       that fails; only "PowerCell 5000 Portable Power Station
 *                       (<SKU>)" passes.
 *   "mask-product-id" — the same idea for the record's own uuid: the productId is
 *                       replaced by a placeholder and EVERYTHING ELSE in the field
 *                       (the host, the path, the URN prefix) is compared. `/@id`
 *                       and `ug:entityId` used to be bare drops, so A's `@id` could
 *                       name a different host entirely, or carry 4 KB of recall
 *                       notice, unseen.
 *   "shape-only"      — the value is NOT compared across conditions (it must
 *                       differ), but it is still asserted to have its declared
 *                       shape. This is the ONLY kind that removes a value from
 *                       comparison, and it is invalid without a `shape`
 *                       (validateExemptions enforces that). There is no kind that
 *                       merely deletes.
 *
 * NOTE what is deliberately NOT here: any bare `name`. The product name is
 * handled by path above; `name` also keys the manufacturer, every material and
 * every certification, and exempting it by key would let the conditions differ
 * in their bill of materials undetected. That reasoning is the reason this whole
 * table is path-scoped.
 */
export type ExemptionKind = "shape-only" | "mask-sku" | "mask-product-id";

/**
 * The form an exempt value must still have. Shapes are deliberately narrow and
 * boring: a shape wide enough to admit free prose is not a shape, it is a drop
 * with extra steps.
 *
 * "object" is EXHAUSTIVE: a key not named in `keys` is a FAILURE, not exempt
 * content. That is what makes the credential block a bounded region rather than
 * an unbounded one — `ug:extraProductData` has nowhere to live.
 */
export type ValueShape =
  | { kind: "string"; pattern: RegExp; note: string }
  | { kind: "integer"; note: string }
  | { kind: "object"; keys: Record<string, ValueShape>; note: string };

export interface Exemption {
  /** Exact path into the served payload. Array indices are written `[]`. */
  path: string;
  kind: ExemptionKind;
  /**
   * True for the credential / anchor blocks — the study's independent variable.
   * These are the ONLY exemptions whose byte cost is expected to be large, and
   * their size is reported separately and never asserted (see part 5b).
   */
  independentVariable?: boolean;
  /**
   * The shape the served value must still have. REQUIRED for "shape-only" —
   * a value removed from comparison with no shape is an unpoliced region.
   * Optional but strongly preferred on the mask kinds, where it bounds the part
   * the mask blanks out.
   */
  shape?: ValueShape;
  reason: string;
}

/* --- shape vocabulary, so the table below reads as data rather than regex --- */
const UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const s = (pattern: RegExp, note: string): ValueShape => ({ kind: "string", pattern, note });
const int = (note: string): ValueShape => ({ kind: "integer", note });

/**
 * The canonical verification-instruction text. PINNED, not pattern-matched.
 *
 * `ug:verifyInstructions` is the one genuinely free-prose field in the credential
 * block, and prose is exactly what a smuggler wants: rewriting it to "the only
 * unit with a 10-year warranty and zero defects" put 265 bytes of marketing in
 * front of a naive-mode agent with the gate green, because the whole block was a
 * wholesale drop. It is instructions — the same instructions for every passport
 * the emitter serves — so it is not per-condition data and there is no reason for
 * it to vary at all. If the emitter's wording legitimately changes, UPDATE THIS
 * CONSTANT. Being made to do that deliberately is the feature.
 */
const CANONICAL_VERIFY_INSTRUCTIONS =
  "GET ug:verifyUrl for a structured verdict (verified | valid_unanchored | " +
  "unverified | invalid) covering signature, issuer trust, and the on-chain " +
  "anchor match. Or verify independently: the credential is a standard SD-JWT; " +
  "its SHA-256 hash must equal the ERC725Y value stored at ug:dataKey on the " +
  "issuer Universal Profile.";

/** A shape admitting exactly one literal string. */
function lit(text: string, note: string): ValueShape {
  return { kind: "string", pattern: new RegExp(`^${escapeRegExp(text)}$`), note };
}

/**
 * The credential block's ENTIRE allowed key set. The independent variable is
 * *that a credential exists and what its verdict is* — not licence for arbitrary
 * text under a `ug:` prefix. Any key not listed here fails the gate.
 */
const VERIFICATION_SHAPE: ValueShape = {
  kind: "object",
  note: "the credential block — an enumerated key set, no free text",
  keys: {
    "ug:credentialFormat": s(
      /^W3C Verifiable Credential, SD-JWT \(vc\+sd-jwt, (ES256|ES384|EdDSA)\)$/,
      "a format label from a fixed enumeration",
    ),
    // Base64url only: no spaces, so no prose can ride here in the clear. Base64
    // could of course ENCODE prose — but a credential body is irreducibly opaque
    // and is the independent variable itself. Its length is therefore unbounded
    // here and excluded from both size assertions, by design.
    "ug:credential": s(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(~[A-Za-z0-9_-]*)*$/,
      "an SD-JWT: three base64url segments plus ~-separated disclosures",
    ),
    "ug:credentialHash": s(/^0x[0-9a-f]{64}$/, "a 0x-prefixed sha256"),
    "ug:issuer": s(/^did:ug:org:[A-Za-z0-9_-]{1,64}$/, "a did:ug org DID"),
    "ug:issuerDidDocument": s(
      /^https?:\/\/[A-Za-z0-9.:-]+\/orgs\/[A-Za-z0-9_-]{1,64}\/did\.json$/,
      "the issuer's DID document URL",
    ),
    "ug:verifyUrl": s(
      new RegExp(`^https?://[A-Za-z0-9.:-]+/api/passport/${UUID_RE}/verify$`),
      "the verifier URL for this product",
    ),
    "ug:verifyInstructions": lit(
      CANONICAL_VERIFY_INSTRUCTIONS,
      "the canonical instruction text, pinned verbatim",
    ),
  },
};

/** The anchor block's ENTIRE allowed key set. Same reasoning as above. */
const ANCHOR_SHAPE: ValueShape = {
  kind: "object",
  note: "the on-chain anchor — an enumerated key set, no free text",
  keys: {
    "ug:network": s(
      /^(?=.{1,24}$)[A-Za-z0-9]+( [A-Za-z0-9]+){0,2}$/,
      "a chain name: at most three alphanumeric words",
    ),
    "ug:chainId": int("an EVM chain id"),
    "ug:standard": s(
      /^ERC[0-9]{3,4}Y? \([A-Za-z0-9 ]{1,32}\)$/,
      "an ERC standard label",
    ),
    "ug:universalProfile": s(/^0x[0-9a-fA-F]{40}$/, "an EVM address"),
    "ug:assetContract": s(
      /^[a-z0-9-]{1,32}:0x[0-9a-fA-F]{40}$/,
      "a chain-qualified EVM address",
    ),
    "ug:dataKey": s(/^0x[0-9a-f]{64}$/, "an ERC725Y data key"),
    "ug:committedValue": s(
      /^sha256 hash of the verifiable credential \(0x[0-9a-f]{64}\)$/,
      "the fixed committed-value sentence plus its hash",
    ),
    "ug:explorerUrl": s(
      /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9/_.-]*$/,
      "a block-explorer URL (no spaces, so no prose)",
    ),
  },
};

export const EXEMPTIONS: readonly Exemption[] = [
  // --- identity of the record itself. Three fixtures are three products on a
  // real stack; they cannot share a product id, and the id is echoed into @id
  // as a URL. Both positions are exact and top-of-tree. Neither is DROPPED:
  // only the uuid is masked, so the host and the path around it stay compared.
  // As bare drops, A's `@id` could have named a different host, or carried
  // 4,426 bytes of "NOTICE: this unit is subject to safety recall".
  {
    path: "/@id",
    kind: "mask-product-id",
    shape: s(
      new RegExp(`^https?://[A-Za-z0-9.:-]+/api/passport/${UUID_RE}$`),
      "a passport URL whose path ends in the product uuid",
    ),
    reason:
      "the passport's own IRI — only the embedded productId is masked; the scheme, host and path are compared, and the whole must still be a passport URL ending in a uuid",
  },
  {
    path: "/ug:digitalProductPassport/ug:entityId",
    kind: "mask-product-id",
    shape: s(new RegExp(`^${UUID_RE}$`), "a bare uuid"),
    reason:
      "product id under the DPP entity envelope — masked, not dropped, and still required to be a uuid",
  },

  // --- the product name, in each position the emitter serialises it into.
  // Masked rather than dropped: the SKU is embedded in the name and cannot be
  // equal, but everything around it must be.
  {
    path: "/name",
    kind: "mask-sku",
    reason: "top-level product name — only the embedded per-fixture SKU is exempt; the rest of the name is compared",
  },
  {
    path: "/ug:digitalProductPassport/ug:sections/_identity/title",
    kind: "mask-sku",
    reason: "the same product name in the DPP identity section (currently SKU-free, masked defensively)",
  },
  // These two were added on the day the data behind them was written, which made
  // them a net WIDENING of the gate to accommodate fresh fixtures — the worst
  // reason to widen anything. They were at least made "mask-sku" rather than
  // "drop", so the URN around the SKU stayed compared. They now also carry the
  // URN shape, so the masked region cannot become anything other than a SKU:
  // between the comparison and the shape, the only thing either field is allowed
  // to vary in is the SKU token itself.
  {
    path: "/ug:digitalProductPassport/ug:sections/generalProductInformation/productIdentifier",
    kind: "mask-sku",
    shape: s(
      /^urn:battery:[a-z0-9]{1,32}:[a-z0-9-]{1,32}$/,
      "urn:battery:<namespace>:<sku>",
    ),
    reason: "battery product identifier URN — the SKU is embedded in it; the URN scheme and namespace are compared and the whole must still parse as that URN",
  },
  {
    path: "/ug:digitalProductPassport/ug:sections/generalProductInformation/batteryPassportIdentifier",
    kind: "mask-sku",
    shape: s(
      /^urn:passport:bp-[a-z0-9]{1,24}-[0-9]{4}-[a-z]{2}-[0-9]{5}$/,
      "urn:passport:bp-<sku>-<year>-<country>-<serial>",
    ),
    reason: "battery passport identifier URN — the SKU is embedded in it; the URN scheme, issuing country and serial are compared and the whole must still parse as that URN",
  },

  // --- the identification section. Served only when that section is stored, so
  // these paths are absent from today's payloads; they are listed because the
  // emitter WILL serialise them there. Note `modelNumber` is deliberately absent
  // from this list and stays under comparison, so the section cannot vanish
  // entirely into exemptions.
  {
    path: "/ug:digitalProductPassport/ug:sections/identification/productName",
    kind: "mask-sku",
    reason: "the same product name in the DPP identification section — SKU masked, remainder compared",
  },
  {
    path: "/ug:digitalProductPassport/ug:sections/identification/uniqueProductIdentifier",
    kind: "mask-sku",
    shape: s(/^UG-[A-Z0-9-]{1,32}$/, "UG-<sku>"),
    reason: "per-unit UPI — the SKU is embedded in it; the prefix is compared and the whole must still parse as a UPI",
  },
  {
    path: "/ug:digitalProductPassport/ug:sections/identification/globalTradeItemNumber",
    kind: "shape-only",
    shape: s(/^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$/, "a GTIN-8/12/13/14"),
    reason:
      "GTIN — a per-SKU allocation with its own check digit, so no part of it is stable across fixtures. NOT compared, but still required to be 8/12/13/14 digits: as a bare drop this field carried 4,426 bytes of recall notice past a green gate",
  },

  // --- the independent variable. These blocks MUST differ: they are the
  // difference the study measures, and comparing them would make the gate assert
  // the opposite of parts 3 and 4. But "must differ" is not "may contain
  // anything". They are SHAPE-CHECKED, not dropped: the key set is exhaustive and
  // each value must have its declared primitive form, so the region is bounded
  // even though its contents are uncompared. Their byte cost is reported
  // separately and never asserted.
  {
    path: "/ug:verification",
    kind: "shape-only",
    independentVariable: true,
    shape: VERIFICATION_SHAPE,
    reason:
      "the credential / verification block — the independent variable. Values uncompared; key set and per-key shapes enforced, because as a wholesale drop this subtree carried 265 bytes of marketing prose (a rewritten ug:verifyInstructions plus an invented ug:extraProductData) straight to a naive-mode agent",
  },
  {
    path: "/ug:onChainAnchor",
    kind: "shape-only",
    independentVariable: true,
    shape: ANCHOR_SHAPE,
    reason:
      "the on-chain anchor — present only where a credential is anchored; the independent variable. Values uncompared; key set and per-key shapes enforced, same reasoning as ug:verification",
  },
];

const EXEMPTION_BY_PATH: ReadonlyMap<string, Exemption> = new Map(
  EXEMPTIONS.map((e) => [e.path, e]),
);

/** Paths whose byte cost is the independent variable and is therefore irreducible. */
const INDEPENDENT_VARIABLE_PATHS: ReadonlySet<string> = new Set(
  EXEMPTIONS.filter((e) => e.independentVariable).map((e) => e.path),
);

/**
 * The independent-variable paths that are TOP-LEVEL members, as bare key names.
 * Used to subtract their extent from the RAW served text — see rawDescriptiveBytes.
 */
const INDEPENDENT_VARIABLE_TOP_KEYS: readonly string[] = [
  ...INDEPENDENT_VARIABLE_PATHS,
]
  .filter((p) => p.indexOf("/", 1) === -1)
  .map((p) => p.slice(1));

/** The container under which a DPP "section" lives. */
const SECTIONS_PREFIX = "/ug:digitalProductPassport/ug:sections";

/**
 * Structural invariants on the exemption table, checked at module load so a bad
 * exemption is a startup crash rather than a silent widening of the gate.
 */
function validateExemptions(): void {
  const seen = new Set<string>();
  for (const e of EXEMPTIONS) {
    if (!e.path.startsWith("/")) {
      throw new Error(`preflight exemption "${e.path}" is not an absolute path`);
    }
    if (e.path.includes("*")) {
      throw new Error(
        `preflight exemption "${e.path}" contains a wildcard — exemptions are exact paths only`,
      );
    }
    if (seen.has(e.path)) {
      throw new Error(`preflight exemption "${e.path}" is listed twice`);
    }
    seen.add(e.path);
    if (!e.reason.trim()) {
      throw new Error(`preflight exemption "${e.path}" carries no reason`);
    }
    // ⭐ THE PRINCIPLE, MECHANISED. "shape-only" is the one kind that removes a
    // value from comparison; without a shape it would remove it from ALL
    // scrutiny, which is the unpoliced region every one of the recent leaks came
    // through. There is deliberately no kind that merely deletes, and this check
    // is what stops one being reintroduced by a one-line edit to the table.
    if (e.kind === "shape-only" && !e.shape) {
      throw new Error(
        `preflight exemption "${e.path}" is "shape-only" but declares no shape — ` +
          `an exemption must BOUND what may vary, never merely delete it from ` +
          `comparison. An unshaped uncompared path is a smuggling channel.`,
      );
    }
    // An exemption at exactly /…/ug:sections/<X> would exempt a WHOLE section —
    // which is precisely how "ug:sections.verification: 'A is great, buy it'"
    // got past the old key-scoped rule. No section may be exempt wholesale.
    if (e.path.startsWith(`${SECTIONS_PREFIX}/`)) {
      const rest = e.path.slice(SECTIONS_PREFIX.length + 1);
      if (!rest.includes("/")) {
        throw new Error(
          `preflight exemption "${e.path}" would exempt an ENTIRE DPP section. ` +
            `Sections are never exempt wholesale — exempt the specific field inside it.`,
        );
      }
    }
  }
}
validateExemptions();

const SKU_PLACEHOLDER = "<SKU>";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A pattern matching this fixture's SKU in the forms the emitter writes it:
 * "PC5K-7301", "pc5k-7301", "pc5k7301" (the passport-identifier URN drops the
 * separator and lowercases). Built from the SKU in fixtures/conditions.json, so
 * it can only ever mask the fixture's OWN SKU — never arbitrary text.
 */
function skuPattern(sku: string): RegExp {
  const parts = sku.split(/[^A-Za-z0-9]+/).filter(Boolean).map(escapeRegExp);
  return new RegExp(parts.join("[^A-Za-z0-9]?"), "gi");
}

function maskSku(value: unknown, sku: string): unknown {
  if (typeof value !== "string") return value;
  return value.replace(skuPattern(sku), SKU_PLACEHOLDER);
}

const PRODUCT_ID_PLACEHOLDER = "<PRODUCT_ID>";

/**
 * Replace this fixture's OWN productId with a placeholder, so the rest of the
 * field stays under comparison. Built from the fixtures file, so like maskSku it
 * can only ever mask the fixture's own identifier — never arbitrary text.
 */
function maskProductId(value: unknown, productId: string): unknown {
  if (typeof value !== "string") return value;
  return value.replace(new RegExp(escapeRegExp(productId), "gi"), PRODUCT_ID_PLACEHOLDER);
}

/** Preview of an offending value for a shape-violation message. */
function preview(value: unknown): string {
  const t = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  return t.length > 80 ? `${t.slice(0, 77)}...` : t;
}

/**
 * Assert an exempt value still has its declared shape.
 *
 * This is the counterweight to every exemption: the value is not compared, so
 * the shape is the ONLY thing standing between that position and arbitrary
 * agent-readable content. Object shapes are EXHAUSTIVE — an unexpected key is a
 * failure, not exempt content — which is what turns the credential and anchor
 * blocks from unbounded subtrees into enumerated ones.
 */
function checkShape(value: unknown, shape: ValueShape, path: string): string[] {
  switch (shape.kind) {
    case "string":
      if (typeof value !== "string") {
        return [`${path}: expected a string (${shape.note}), got ${typeof value}`];
      }
      if (!shape.pattern.test(value)) {
        return [
          `${path}: value does not have its declared shape (${shape.note}) — ` +
            `got "${preview(value)}"`,
        ];
      }
      return [];
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return [`${path}: expected an integer (${shape.note}), got ${preview(value)}`];
      }
      return [];
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return [`${path}: expected an object (${shape.note}), got ${preview(value)}`];
      }
      const out: string[] = [];
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const child = shape.keys[key];
        if (!child) {
          out.push(
            `${path}/${key}: UNEXPECTED KEY inside an exempt region. The key set ` +
              `here is enumerated (${Object.keys(shape.keys).join(", ")}); an ` +
              `unlisted key is a FAILURE, not exempt content. Value: ` +
              `"${preview((value as Record<string, unknown>)[key])}"`,
          );
          continue;
        }
        out.push(
          ...checkShape((value as Record<string, unknown>)[key], child, `${path}/${key}`),
        );
      }
      return out;
    }
  }
}

interface NormaliseContext {
  sku: string;
  productId: string;
  /** Exempt values that did not have their declared shape — see checkShape. */
  shapeViolations: string[];
  /**
   * Paths of objects that had fields in the served payload and have NONE left
   * after normalisation. Such an object is not matched; it is UNVERIFIED — the
   * gate looked at nothing and would go on looking at nothing however the
   * fixtures drift underneath it.
   */
  vacuumed: string[];
}

/** Canonical serialisation of an already-normalised value, for array sorting. */
function canonical(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

/**
 * Recursive normalising walk. Applies the exemption table, sorts object keys so
 * key ORDER (which JSON preserves and the emitter does not promise) can never
 * produce a false mismatch, and sorts array ELEMENTS for the same reason.
 *
 * ARRAY ORDER IS DELIBERATELY NOT SIGNIFICANT. Section arrays — certifications,
 * materials, sourcing entries — are assembled from SQL selects with no ORDER BY,
 * so two byte-identical fixtures can serve the same certifications in different
 * orders on two consecutive requests. Comparing positionally made that a FAILED
 * preflight and a non-zero exit: the gate crying wolf over a difference that is
 * not a difference. That matters beyond the annoyance — a gate that fires
 * spuriously at 2am teaches the operator to reach for SKIP_PREFLIGHT=1, and the
 * same reflex then waves through the real abort. Elements are therefore
 * canonically serialised and sorted before comparison, so the check is over the
 * SET of elements. (This includes @context, whose ordering is in principle
 * semantic; an @context that differs only in element order across the three
 * fixtures is not a confound this study can be harmed by.)
 *
 * NUMBERS ARE DELIBERATELY NOT CANONICALISED, AND THIS IS NOT AN OVERSIGHT.
 * `10` vs `10.0`, and `-0` vs `0`, have been probed and are correctly judged
 * BENIGN. Both pairs are the same IEEE-754 double after JSON.parse, so they
 * compare equal here and re-serialise identically; more importantly, neither
 * changes a single character of what a naive-mode agent reads as meaning — an
 * expected lifetime is ten years either way. The only trace they leave is a
 * one- or two-byte wobble in the raw size, which is what the 32 B tolerance is
 * for. A future adversarial pass should NOT "fix" them: adding a numeric
 * canonicalisation step would be new machinery, with its own edge cases, in
 * exchange for closing nothing.
 *
 * Objects are built with Object.create(null). A plain `{}` literal inherits the
 * Object.prototype `__proto__` SETTER, so `out["__proto__"] = …` silently sets
 * the prototype instead of creating an own property — a served key named
 * `__proto__` vanished from the normalised payload entirely, and A could serve
 * `"__proto__":{"smuggled":"A-ONLY DATA"}` with the gate green. Lookups use a
 * Map rather than the `in` operator for the mirror-image reason: `in` walks the
 * prototype chain, so `constructor`, `toString`, `valueOf` and `hasOwnProperty`
 * were treated as exempt at every depth.
 */
function normalise(value: unknown, ctx: NormaliseContext, path = ""): unknown {
  if (Array.isArray(value)) {
    return value
      .map((v) => normalise(v, ctx, `${path}/[]`))
      .map((v) => ({ v, k: canonical(v) }))
      .sort((x, y) => (x.k < y.k ? -1 : x.k > y.k ? 1 : 0))
      .map((x) => x.v);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out = Object.create(null) as Record<string, unknown>;
    const keys = Object.keys(source).sort();
    let kept = 0;
    for (const key of keys) {
      const childPath = `${path}/${key}`;
      const exemption = EXEMPTION_BY_PATH.get(childPath);
      // The shape is asserted on the SERVED value, before any masking and before
      // the value is set aside — an exemption bounds what may vary rather than
      // deleting it from view.
      if (exemption?.shape) {
        ctx.shapeViolations.push(...checkShape(source[key], exemption.shape, childPath));
      }
      if (exemption?.kind === "shape-only") continue;
      const child = normalise(source[key], ctx, childPath);
      out[key] =
        exemption?.kind === "mask-sku"
          ? maskSku(child, ctx.sku)
          : exemption?.kind === "mask-product-id"
            ? maskProductId(child, ctx.productId)
            : child;
      kept++;
    }
    if (keys.length > 0 && kept === 0) ctx.vacuumed.push(path === "" ? "/" : path);
    return out;
  }
  return value;
}

/**
 * Remove only the independent-variable subtrees, leaving everything else — used
 * for the byte accounting in part 5b, never for the structural comparison.
 */
function stripIndependentVariable(value: unknown, path = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => stripIndependentVariable(v, `${path}/[]`));
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      const childPath = `${path}/${key}`;
      if (INDEPENDENT_VARIABLE_PATHS.has(childPath)) continue;
      out[key] = stripIndependentVariable(source[key], childPath);
    }
    return out;
  }
  return value;
}

export interface PathDiff {
  /** JSON path into the NORMALISED payload, array indices included. */
  path: string;
  left: string;
  right: string;
}

const ABSENT = "<absent>";

function show(value: unknown): string {
  const s = JSON.stringify(value) ?? String(value);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

/**
 * Every leaf path at which two normalised payloads disagree.
 *
 * Array indices in the reported path are positions in the SORTED order, not in
 * the served order — see normalise(). Own-property tests use Object.hasOwn
 * rather than `in`: the normalised payloads are null-prototype objects, and a
 * prototype-walking test on a record used as a lookup is the bug this whole
 * section exists to have removed.
 */
function diffPaths(a: unknown, b: unknown, path = ""): PathDiff[] {
  const at = path === "" ? "/" : path;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return [{ path: at, left: show(a), right: show(b) }];
    }
    const out: PathDiff[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= a.length) out.push({ path: `${path}/[${i}]`, left: ABSENT, right: show(b[i]) });
      else if (i >= b.length) out.push({ path: `${path}/[${i}]`, left: show(a[i]), right: ABSENT });
      else out.push(...diffPaths(a[i], b[i], `${path}/[${i}]`));
    }
    return out;
  }
  const aObj = a !== null && typeof a === "object";
  const bObj = b !== null && typeof b === "object";
  if (aObj || bObj) {
    if (!aObj || !bObj) return [{ path: at, left: show(a), right: show(b) }];
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const out: PathDiff[] = [];
    for (const key of [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort()) {
      const childPath = `${path}/${key}`;
      if (!Object.hasOwn(ao, key)) out.push({ path: childPath, left: ABSENT, right: show(bo[key]) });
      else if (!Object.hasOwn(bo, key)) out.push({ path: childPath, left: show(ao[key]), right: ABSENT });
      else out.push(...diffPaths(ao[key], bo[key], childPath));
    }
    return out;
  }
  if (a === b) return [];
  return [{ path: at, left: show(a), right: show(b) }];
}

/* ------------------------------------------------------------------------- *
 * RAW-TEXT AUDIT — what JSON.parse throws away
 * ------------------------------------------------------------------------- */

/**
 * WHY THE RAW TEXT IS SCANNED SEPARATELY.
 *
 * Everything above this point looks at the payload after JSON.parse. Parsing is
 * LOSSY, and the losses are agent-readable:
 *
 *   {"recyclability":"A-ONLY: THIS PRODUCT IS RECALLED","recyclability":"73% ..."}
 *
 * JSON.parse keeps the LAST value, so the recall notice never enters the compared
 * structure. It never enters the descriptive-size figure either, because that
 * figure is computed on a RE-SERIALISATION of the parsed object. Only the bytes
 * on the wire ever contained it — and the wire figure was reported and never
 * asserted. A naive-mode agent, meanwhile, reads the raw text.
 *
 * So the raw text gets its own pass: a scanner that (a) reports duplicate keys at
 * any depth, and (b) records the byte extent of each TOP-LEVEL member, so the
 * independent-variable blocks can be subtracted from the RAW size and the
 * remainder asserted. The scanner is deliberately permissive about grammar —
 * JSON.parse is the authority on validity — and strict about the two things it
 * is here for.
 */
interface RawScan {
  /** Duplicate keys, as paths, in the order encountered. */
  duplicates: string[];
  /** Byte-offset extent of each top-level member, from key quote to value end. */
  topLevelSpans: Map<string, { start: number; end: number }>;
  /** Set when the scan could not complete; a payload we cannot audit is not a pass. */
  error?: string;
}

function scanRawJson(text: string): RawScan {
  const duplicates: string[] = [];
  const topLevelSpans = new Map<string, { start: number; end: number }>();
  let i = 0;

  const ws = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };

  function parseString(): string {
    i++; // opening quote
    let out = "";
    while (i < text.length) {
      const ch = text[i];
      if (ch === '"') {
        i++;
        return out;
      }
      if (ch === "\\") {
        const esc = text[i + 1];
        i += 2;
        if (esc === "u") {
          // Decoded, so "a" and "a" are recognised as the SAME key — an
          // escaped duplicate is still a duplicate.
          out += String.fromCharCode(parseInt(text.slice(i, i + 4), 16));
          i += 4;
        } else if (esc === "n") out += "\n";
        else if (esc === "t") out += "\t";
        else if (esc === "r") out += "\r";
        else if (esc === "b") out += "\b";
        else if (esc === "f") out += "\f";
        else if (esc !== undefined) out += esc; // " \ / and anything JSON.parse accepts
        else throw new Error("unterminated escape");
        continue;
      }
      out += ch;
      i++;
    }
    throw new Error("unterminated string");
  }

  function parseValue(path: string): void {
    ws();
    const ch = text[i];
    if (ch === "{") return parseObject(path, false);
    if (ch === "[") return parseArray(path);
    if (ch === '"') {
      parseString();
      return;
    }
    // A literal (number, true, false, null). Not validated here — JSON.parse is
    // the authority on whether it is well-formed.
    const start = i;
    while (i < text.length && !",}] \t\n\r".includes(text[i])) i++;
    if (i === start) throw new Error(`unexpected character "${text[i] ?? "<eof>"}" at ${i}`);
  }

  function parseArray(path: string): void {
    i++; // [
    ws();
    if (text[i] === "]") {
      i++;
      return;
    }
    for (;;) {
      parseValue(`${path}/[]`);
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return;
      }
      throw new Error(`expected "," or "]" at ${i}`);
    }
  }

  function parseObject(path: string, isRoot: boolean): void {
    i++; // {
    ws();
    if (text[i] === "}") {
      i++;
      return;
    }
    const seen = new Set<string>();
    for (;;) {
      // The span starts BEFORE the member's leading whitespace and ends AFTER
      // its trailing whitespace — i.e. it runs delimiter-to-delimiter. The
      // emitter pretty-prints, so a span measured quote-to-value-end would leave
      // that member's indentation and newline behind in the "descriptive"
      // remainder: a systematic few bytes per credential block, showing up as a
      // spread between the anchored condition and the others that is an artefact
      // of the accounting rather than a difference in the data.
      const memberStart = i;
      ws();
      if (text[i] !== '"') throw new Error(`expected a key at ${i}`);
      const key = parseString();
      if (seen.has(key)) duplicates.push(`${path}/${key}`);
      seen.add(key);
      ws();
      if (text[i] !== ":") throw new Error(`expected ":" at ${i}`);
      i++;
      parseValue(`${path}/${key}`);
      const valueEnd = i;
      ws();
      // Trailing whitespace belongs to this member only when another member
      // follows it; on the LAST member that whitespace is the closing brace's
      // own line, and swallowing it would over-subtract.
      if (isRoot) {
        topLevelSpans.set(key, {
          start: memberStart,
          end: text[i] === "," ? i : valueEnd,
        });
      }
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return;
      }
      throw new Error(`expected "," or "}" at ${i}`);
    }
  }

  try {
    ws();
    if (text[i] === "{") parseObject("", true);
    else parseValue("");
    ws();
    if (i !== text.length) throw new Error(`trailing content at ${i}`);
  } catch (err) {
    return {
      duplicates,
      topLevelSpans,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  return { duplicates, topLevelSpans };
}

/**
 * RAW served bytes MINUS the raw extent of the independent-variable blocks.
 *
 * This is the figure the header comment always claimed to care about: what the
 * agent actually reads, less the part the study is manipulating. Unlike
 * `nonIvBytes` it is measured on the wire, so bytes that JSON.parse discards —
 * duplicate keys, and any other parse-time loss — are counted here and nowhere
 * else.
 *
 * Each span runs from the end of the previous delimiter to the start of the next
 * one, so it carries the member's own indentation with it (the emitter
 * pretty-prints), and one further byte is subtracted for its separating comma.
 * Every member of an object with two or more members has exactly one adjacent
 * comma, before it or after it, so this is EXACT for every payload this study
 * serves — verified against the live stack, where the three raw descriptive
 * figures come out identical to the byte despite C carrying 6 KB of credential.
 * On the degenerate object whose ONLY member is a credential block it
 * over-subtracts by one, well inside the tolerance.
 */
function rawDescriptiveBytes(text: string, scan: RawScan): number {
  let bytes = Buffer.byteLength(text, "utf8");
  for (const key of INDEPENDENT_VARIABLE_TOP_KEYS) {
    const span = scan.topLevelSpans.get(key);
    if (!span) continue;
    bytes -= Buffer.byteLength(text.slice(span.start, span.end), "utf8") + 1;
  }
  return bytes;
}

/** One condition's served passport, as fetched and as normalised. */
export interface ServedPassport {
  condition: Condition;
  productId: string | null;
  /** Bytes the API actually served — the payload the agent reads in naive mode. */
  rawBytes: number | null;
  /**
   * rawBytes MINUS the raw extent of the credential/anchor blocks. ASSERTED —
   * this is the on-the-wire twin of nonIvBytes, and the only figure that can see
   * bytes JSON.parse discards. See rawDescriptiveBytes().
   */
  rawDescriptiveBytes: number | null;
  /** Duplicate JSON keys in the raw text. Any is a failure. */
  duplicateKeys: string[];
  /** Exempt values that no longer have their declared shape. Any is a failure. */
  shapeViolations: string[];
  /**
   * Bytes of the served payload MINUS the independent-variable blocks, measured
   * on a re-serialisation so the three conditions are compared on the same
   * whitespace convention. THIS is the number that is asserted: it is the part
   * of the payload the study controls.
   */
  nonIvBytes: number | null;
  /**
   * Bytes attributable to the credential / anchor blocks. Reported, never
   * asserted — this component IS the independent variable and is irreducible.
   */
  ivBytes: number | null;
  /** Bytes remaining after the exemptions are applied and keys/elements sorted. */
  normalisedBytes: number | null;
  /** Parsed, exempt-stripped, key-sorted structure. null when unfetchable. */
  normalised: unknown | null;
  /** Objects that lost ALL their fields to exemptions — unverifiable, not matched. */
  vacuumed: string[];
  /** Populated when this condition's passport could not be fetched or parsed. */
  error?: string;
}

export interface MatchednessCheck {
  ok: boolean;
  payloads: ServedPassport[];
  /** Pairwise differences between the normalised payloads. */
  diffs: Array<{ left: Condition; right: Condition; paths: PathDiff[] }>;
  /** Part 5b: the non-IV payload sizes agree within tolerance. */
  sizeOk: boolean;
  /** Populated when the size check failed. */
  sizeDetail?: string;
  /** Populated when the check failed; one sentence naming what went wrong. */
  detail?: string;
}

/**
 * Tolerance on the descriptive payload sizes. Deliberately tight: the three
 * payloads differ only in a uuid, a SKU and an exempt identifier, all of fixed
 * width, so in practice the spread is zero. The IV blocks are excluded from both
 * assertions entirely.
 *
 * ABSOLUTE, AND ONLY ABSOLUTE. There used to be a 1% relative term alongside
 * this floor, taking whichever was larger, on the reasoning that it "keeps the
 * tolerance meaningful if the payload grows". It did the opposite: it made the
 * smuggling budget a FUNCTION OF THE PAYLOAD, so an attacker who wanted more
 * room simply took it. Adding one matched 560 KB field to all three fixtures —
 * which by itself is perfectly legitimate and passes every other limb — raised
 * the allowance from 32 B to ~5.6 KB, enough for A's GTIN to carry 4,426 bytes
 * of "NOTICE: this unit is subject to safety recall" with the gate green. A
 * tolerance is a statement about measurement noise, and measurement noise here
 * does not scale with content; it is a handful of bytes at any payload size.
 */
const DESCRIPTIVE_BYTES_ABS_TOLERANCE = 32;

/** Raw served byte size for one condition, for stamping into the trial log. */
export function servedBytesFor(
  result: PreflightResult,
  condition: Condition,
): number | null {
  return (
    result.matchedness.payloads.find((p) => p.condition === condition)?.rawBytes ?? null
  );
}

/** All three raw served byte sizes, for stamping into every trial log row. */
export function servedBytesRecord(
  result: PreflightResult,
): Record<Condition, number | null> {
  return {
    A: servedBytesFor(result, "A"),
    B: servedBytesFor(result, "B"),
    C: servedBytesFor(result, "C"),
  };
}

async function fetchServed(condition: Condition): Promise<ServedPassport> {
  let productId: string;
  let sku: string;
  try {
    const fixture = fixtureFor(condition);
    productId = fixture.productId;
    sku = fixture.sku;
  } catch (err) {
    return {
      condition,
      productId: null,
      rawBytes: null,
      rawDescriptiveBytes: null,
      duplicateKeys: [],
      shapeViolations: [],
      nonIvBytes: null,
      ivBytes: null,
      normalisedBytes: null,
      normalised: null,
      vacuumed: [],
      error: `fixture unusable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // The SAME surface the agent reads in naive mode (rails.ts fetchPassportJsonLd),
  // so what this gate compares is what the agent was actually shown — not some
  // adjacent admin view that could be matched while the served payload is not.
  const url = `${UG_API_BASE}/api/passport/${encodeURIComponent(productId)}?format=jsonld`;
  const fail = (error: string): ServedPassport => ({
    condition,
    productId,
    rawBytes: null,
    rawDescriptiveBytes: null,
    duplicateKeys: [],
    shapeViolations: [],
    nonIvBytes: null,
    ivBytes: null,
    normalisedBytes: null,
    normalised: null,
    vacuumed: [],
    error,
  });

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/ld+json" },
      // Same explicit budget and redirect policy as checkOne: a payload served
      // by a host other than UG_API_BASE is not evidence about UG_API_BASE.
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (err) {
    return fail(
      `passport unreachable: ${err instanceof Error ? err.message : String(err)} ` +
        `(>${FETCH_TIMEOUT_MS}ms, network failure, or a redirect away from ${UG_API_BASE})`,
    );
  }
  if (!res.ok) return fail(`HTTP ${res.status} for ${url}`);

  const text = await res.text();
  const rawBytes = Buffer.byteLength(text, "utf8");

  // The RAW pass, before JSON.parse gets a chance to discard anything.
  const scan = scanRawJson(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      condition,
      productId,
      rawBytes,
      rawDescriptiveBytes: null,
      duplicateKeys: scan.duplicates,
      shapeViolations: [],
      nonIvBytes: null,
      ivBytes: null,
      normalisedBytes: null,
      normalised: null,
      vacuumed: [],
      error: `served passport was not JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // A payload JSON.parse accepts but the raw scanner could not walk is a payload
  // whose wire bytes cannot be audited. Fail closed: an unaudited payload is not
  // a matched payload, for the same reason an unread one is not.
  if (scan.error) {
    return {
      condition,
      productId,
      rawBytes,
      rawDescriptiveBytes: null,
      duplicateKeys: scan.duplicates,
      shapeViolations: [],
      nonIvBytes: null,
      ivBytes: null,
      normalisedBytes: null,
      normalised: null,
      vacuumed: [],
      error: `served passport could not be scanned as raw JSON (${scan.error}) — the wire bytes cannot be audited`,
    };
  }

  // Byte accounting, on a common re-serialisation so the three conditions are
  // measured the same way regardless of the emitter's whitespace.
  const serialisedBytes = Buffer.byteLength(JSON.stringify(parsed) ?? "", "utf8");
  const nonIvBytes = Buffer.byteLength(
    JSON.stringify(stripIndependentVariable(parsed)) ?? "",
    "utf8",
  );

  const ctx: NormaliseContext = { sku, productId, shapeViolations: [], vacuumed: [] };
  const normalised = normalise(parsed, ctx);
  return {
    condition,
    productId,
    rawBytes,
    rawDescriptiveBytes: rawDescriptiveBytes(text, scan),
    duplicateKeys: scan.duplicates,
    shapeViolations: ctx.shapeViolations,
    nonIvBytes,
    ivBytes: serialisedBytes - nonIvBytes,
    normalisedBytes: Buffer.byteLength(JSON.stringify(normalised), "utf8"),
    normalised,
    vacuumed: ctx.vacuumed,
  };
}

/**
 * Fetch all three served passports and assert they are identical once the
 * legitimately-varying parts are removed.
 *
 * The full condition set is required INSIDE this function. It used to return
 * `{ok:true}` for an empty subset — a vacuous pass — leaving the "always all
 * three" invariant to caller discipline. An invariant that lives in the caller
 * is an invariant one refactor away from being gone.
 */
export async function checkMatchedness(
  conditions: readonly Condition[] = PREFLIGHT_CONDITIONS,
): Promise<MatchednessCheck> {
  const missing = PREFLIGHT_CONDITIONS.filter((c) => !conditions.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      payloads: [],
      diffs: [],
      sizeOk: false,
      detail:
        `matchedness was asked to check ${conditions.length === 0 ? "NO conditions" : conditions.join(", ")} ` +
        `— ${missing.join(", ")} missing. Matchedness is a statement about all of ` +
        `${PREFLIGHT_CONDITIONS.join(", ")} at once; over a subset it is not weaker evidence, it is none.`,
    };
  }

  const payloads: ServedPassport[] = [];
  for (const condition of PREFLIGHT_CONDITIONS) payloads.push(await fetchServed(condition));

  const usable = payloads.filter((p) => p.normalised !== null);
  const diffs: MatchednessCheck["diffs"] = [];
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const paths = diffPaths(usable[i].normalised, usable[j].normalised);
      if (paths.length > 0) {
        diffs.push({ left: usable[i].condition, right: usable[j].condition, paths });
      }
    }
  }

  // PART 5b — descriptive payload size, asserted on BOTH figures, because they
  // fail differently. `nonIvBytes` is measured on a re-serialisation of the
  // parsed object, so it sees anything that survives JSON.parse and is blind to
  // everything that does not. `rawDescriptiveBytes` is measured on the wire, so
  // it sees exactly what the parsed figure cannot — duplicate keys and any other
  // parse-time loss. Neither subsumes the other; the header comment's claim that
  // rawBytes is "the payload the agent reads in naive mode" is only true of a
  // file that checks it.
  const spread = (label: string, values: Array<number | null>): string | undefined => {
    const ns = values.filter((n): n is number => n !== null);
    if (ns.length !== PREFLIGHT_CONDITIONS.length) return undefined;
    const max = Math.max(...ns);
    const min = Math.min(...ns);
    if (max - min <= DESCRIPTIVE_BYTES_ABS_TOLERANCE) return undefined;
    return (
      `${label} sizes span ${max - min} B (${min}..${max}), over the ` +
      `${DESCRIPTIVE_BYTES_ABS_TOLERANCE} B tolerance — the conditions carry different ` +
      `amounts of DESCRIPTIVE data, which is the confound part 5 exists to catch. The ` +
      `credential/anchor blocks are excluded from this figure: their size is the ` +
      `independent variable.`
    );
  };
  const detailParsed = spread(
    "non-verification payload",
    payloads.map((p) => p.nonIvBytes),
  );
  const detailRaw = spread(
    "RAW (on-the-wire) non-verification payload",
    payloads.map((p) => p.rawDescriptiveBytes),
  );
  const sizeOk = !detailParsed && !detailRaw;

  // PART 5c — SKU-LENGTH SPREAD, asserted SEPARATELY and reported even when it
  // passes.
  //
  // A mask-sku exemption replaces each fixture's own SKU with a fixed token, so
  // the SKU cannot smuggle content. But masking happens on the PARSED object,
  // while `rawDescriptiveBytes` is measured on the wire — so SKUs of DIFFERENT
  // LENGTHS consume raw-byte tolerance even when the fixtures are perfectly
  // matched. Measured: a 9/13/6-character spread across the mask-sku paths
  // spends 28 of the 32 B budget. Today all three SKUs are 9 characters and the
  // spread is 0 B.
  //
  // ⛔ Left undiagnosed, the failure mode is: someone renames a fixture, the raw
  // figure trips, and it presents as a MATCHEDNESS failure on fixtures that are
  // genuinely matched. That is a cry-wolf failure, and a gate that cries wolf is
  // one an operator learns to bypass — after which the real confound walks back
  // in unchallenged. It is latent rather than present, which makes it worse: it
  // surfaces at the least convenient moment.
  //
  // So it gets its own assertion and its own message, and can never masquerade
  // as drift.
  const sku = skuLengthDiagnostic();
  const sizeDetail =
    [detailParsed, detailRaw, sku.note].filter(Boolean).join(" ALSO: ") || undefined;

  const broken = payloads.filter((p) => p.error);
  if (broken.length > 0) {
    // A passport that could not be fetched is NOT evidence of matchedness, in
    // the same way an unreachable verifier is not evidence of ground truth.
    return {
      ok: false,
      payloads,
      diffs,
      sizeOk,
      sizeDetail,
      detail:
        `could not read the served passport for ${broken.map((p) => p.condition).join(", ")} ` +
        `— an unread payload is NOT a matched payload`,
    };
  }

  // DUPLICATE KEYS. Checked before everything below, because a payload with
  // duplicate keys has already put bytes in front of the agent that no
  // parsed-object comparison can ever see.
  const dupes = payloads.flatMap((p) => p.duplicateKeys.map((k) => `${p.condition}:${k}`));
  if (dupes.length > 0) {
    return {
      ok: false,
      payloads,
      diffs,
      sizeOk,
      sizeDetail,
      detail:
        `${dupes.length} DUPLICATE JSON KEY(S) in the served text: ${dupes.join(", ")}. ` +
        `JSON.parse keeps only the last value, so a duplicated key is content that ` +
        `reaches a naive-mode agent verbatim while being invisible to every check ` +
        `that runs on the parsed object. There is no legitimate reason for the ` +
        `emitter to serve one.`,
    };
  }

  // SHAPE VIOLATIONS. An exempt value that no longer looks like what it claims
  // to be — including an unexpected key inside the credential or anchor block.
  const shapeBad = payloads.flatMap((p) =>
    p.shapeViolations.map((v) => `${p.condition} ${v}`),
  );
  if (shapeBad.length > 0) {
    return {
      ok: false,
      payloads,
      diffs,
      sizeOk,
      sizeDetail,
      detail:
        `${shapeBad.length} exempt value(s) do not have their declared shape: ` +
        `${shapeBad.join(" | ")}. An exemption bounds what may vary; a value that ` +
        `has left its shape is outside what was exempted, whether or not it is ` +
        `compared.`,
    };
  }

  // MATCHED BY VACUUM. A section every one of whose fields is exempt normalises
  // to {} and then compares equal to {} forever — including every field added to
  // it in future. That is not a matched section, it is an UNCHECKED one, and it
  // must read as a failure rather than as three silent green rows.
  const vacuumed = payloads.flatMap((p) =>
    p.vacuumed.map((path) => `${p.condition}${path}`),
  );
  if (vacuumed.length > 0) {
    const unique = [...new Set(payloads.flatMap((p) => p.vacuumed))].sort();
    return {
      ok: false,
      payloads,
      diffs,
      sizeOk,
      sizeDetail,
      detail:
        `${unique.length} object(s) lost EVERY field to exemptions and are therefore ` +
        `UNVERIFIABLE, not matched: ${unique.join(", ")}. Anything added to them in ` +
        `future would be invisible to this gate. Narrow the exemptions (prefer ` +
        `mask-sku over drop) or stop serving the section.`,
    };
  }

  if (diffs.length > 0) {
    const n = diffs.reduce((sum, d) => sum + d.paths.length, 0);
    return {
      ok: false,
      payloads,
      diffs,
      sizeOk,
      sizeDetail,
      detail:
        `${n} differing path(s) across ${diffs.length} condition pair(s) after ` +
        `normalisation — the fixtures are NOT matched`,
    };
  }
  if (!sizeOk) {
    return { ok: false, payloads, diffs, sizeOk, sizeDetail, detail: sizeDetail };
  }
  return { ok: true, payloads, diffs, sizeOk };
}

/** Run the checks without deciding anything. Exposed for tests/inspection. */
export async function checkGroundTruth(
  conditions: readonly Condition[] = PREFLIGHT_CONDITIONS,
): Promise<PreflightResult> {
  // `conditions` is accepted for call-site symmetry, but the full set is what is
  // actually checked — the same reason checkMatchedness() rejects a subset. A
  // preflight scoped to the selected subset passes on whichever condition
  // happens to be correct, which is how a `--conditions B` run once went green.
  void conditions;
  const rows: PreflightRow[] = [];
  for (const condition of PREFLIGHT_CONDITIONS) {
    rows.push(await checkOne(condition));
  }

  const agreementOk = rows.every((r) => r.ok);
  const declaredDistinct = pairwiseDistinct(
    rows.map((r) => ({ condition: r.condition, value: r.groundTruth })),
    "declared ground truth",
  );
  const observedDistinct = pairwiseDistinct(
    rows.map((r) => ({ condition: r.condition, value: r.liveStatus })),
    "observed live status",
  );
  // Runs unconditionally, even when the parts above have already failed: the
  // three served byte sizes are printed on EVERY run, and they are the fastest
  // way for an operator to see the fixtures drifting apart.
  const matchedness = await checkMatchedness(PREFLIGHT_CONDITIONS);

  return {
    apiBase: UG_API_BASE,
    rows,
    agreementOk,
    declaredDistinct,
    observedDistinct,
    matchedness,
    ok: agreementOk && declaredDistinct.ok && observedDistinct.ok && matchedness.ok,
    bypassed: false,
  };
}

function formatReport(result: PreflightResult): string[] {
  const lines: string[] = [];
  lines.push(`API base: ${result.apiBase}`);
  for (const r of result.rows) {
    const live = r.liveStatus ?? `<no status: ${r.transportError ?? "unknown error"}>`;
    lines.push(
      `  condition ${r.condition} (${r.productId ?? "<no productId>"})`,
      `    declared ground truth : ${r.groundTruth ?? "<unresolvable>"}`,
      `    actual live status    : ${live}`,
      `    ${r.ok ? "OK" : `MISMATCH — ${r.detail ?? "no detail"}`}`,
    );
  }
  // Report the counts rather than asserting "three different values" — with a
  // null row, distinctness can pass over only two observable conditions, and
  // claiming three would overstate what was actually checked.
  const say = (c: DistinctnessCheck, noun: string) =>
    c.ok
      ? `OK — ${c.distinct} distinct ${noun} across ${c.observable} observable condition(s)`
      : `FAILED — ${c.detail}`;
  lines.push(
    `  distinctness (declared) : ${say(result.declaredDistinct, "declared value(s)")}`,
    `  distinctness (observed) : ${say(result.observedDistinct, "live status(es)")}`,
  );
  lines.push(...formatMatchedness(result.matchedness));
  lines.push(...formatExemptions());
  return lines;
}

/**
 * The exemption table, printed on EVERY run, pass or fail.
 *
 * This block used to be a promise the file made about itself and did not keep:
 * "every exemption has to carry its reason ... so the reasons can be printed in
 * the report — a reader must be able to audit what was allowed to vary without
 * reading this file." Nothing read them. A green matchedness row means "these
 * payloads agree EXCEPT here", and the "except here" is not optional context —
 * it is the scope of the claim.
 */
function formatExemptions(): string[] {
  const lines: string[] = [
    `  exemptions (${EXEMPTIONS.length}) — what part 5 was allowed NOT to notice:`,
  ];
  for (const e of EXEMPTIONS) {
    const kind =
      e.kind === "mask-sku"
        ? "mask SKU only, remainder COMPARED"
        : e.kind === "mask-product-id"
          ? "mask productId only, remainder COMPARED"
          : e.independentVariable
            ? "not compared [IV] — shape enforced"
            : "not compared — shape enforced";
    lines.push(`    ${e.path}`, `      ${kind} — ${e.reason}`);
    if (e.shape) lines.push(`      shape: ${describeShape(e.shape)}`);
  }
  lines.push(
    "    Exemptions are exact paths; no key name is exempt at variable depth, so an",
    "    unknown key — including an unknown section under ug:sections — is never exempt.",
    "    Every exemption BOUNDS what may vary rather than deleting it: no path is",
    "    removed from comparison without a shape it must still satisfy, and the key",
    "    sets of the credential and anchor blocks are enumerated, so an unlisted key",
    "    anywhere inside them is a failure rather than exempt content.",
  );
  return lines;
}

/** One-line rendering of a shape, so the printed table is auditable without this file. */
function describeShape(shape: ValueShape): string {
  if (shape.kind === "object") {
    return `object with ONLY these keys — ${Object.keys(shape.keys).join(", ")}`;
  }
  if (shape.kind === "integer") return `integer (${shape.note})`;
  return `${shape.note} — /${shape.pattern.source}/`;
}

/** How many differing paths to enumerate per pair before summarising the rest. */
const MAX_DIFF_PATHS_SHOWN = 25;

/**
 * Always printed, pass or fail. A silent pass tells the operator nothing; the
 * served byte sizes are the cheapest possible drift detector.
 *
 * The size line is split in two, because the two halves have opposite meanings.
 * `descriptive` is the payload MINUS the credential/anchor blocks: that is the
 * part the study controls, it is asserted against a tight tolerance, and a
 * spread there is the confound. `verification` is the credential/anchor blocks
 * themselves: that IS the independent variable, it is irreducible, and it is
 * never asserted. Printing only the raw total — as this report used to — meant
 * the part added specifically to make payload-size confounds loud printed "OK"
 * over C being four times the size of A and said nothing about which half that
 * came from.
 */
/**
 * SKU-LENGTH SPREAD — a separate diagnostic, reported on every run.
 *
 * A `mask-sku` exemption replaces each fixture's own SKU with a fixed token, so
 * a SKU cannot smuggle content. But masking happens on the PARSED object while
 * `rawDescriptiveBytes` is measured on the wire — so SKUs of DIFFERENT LENGTHS
 * consume raw-byte tolerance even when the fixtures are perfectly matched.
 * Measured: a 9/13/6-character spread across the masked paths spends 28 of the
 * 32 B budget. Today all three SKUs are 9 characters, so the spread is 0 B.
 *
 * ⛔ Left undiagnosed the failure mode is: someone renames a fixture, the raw
 * figure trips, and it presents as a MATCHEDNESS failure on fixtures that are
 * genuinely matched. That is a cry-wolf failure — and a gate that cries wolf is
 * one an operator learns to bypass, after which the real confound walks back in
 * unchallenged. It is latent rather than present, which makes it worse: it
 * surfaces at the least convenient moment.
 *
 * So it gets its own message and can never masquerade as drift.
 */
export function skuLengthDiagnostic(): {
  lengths: number[];
  spread: number;
  maskedPaths: number;
  worstCaseBytes: number;
  note?: string;
} {
  const lengths = PREFLIGHT_CONDITIONS.map((c) => {
    try {
      return fixtureFor(c).sku?.length ?? null;
    } catch {
      return null;
    }
  }).filter((n): n is number => n !== null);

  const maskedPaths = EXEMPTIONS.filter((e) => e.kind === "mask-sku").length;
  const spread =
    lengths.length === PREFLIGHT_CONDITIONS.length
      ? Math.max(...lengths) - Math.min(...lengths)
      : 0;
  const worstCaseBytes = spread * maskedPaths;
  if (spread === 0) return { lengths, spread, maskedPaths, worstCaseBytes };

  const note =
    `SKU LENGTHS DIFFER by ${spread} character(s) (${lengths.join("/")}). The SKU ` +
    `appears at ${maskedPaths} masked path(s), so this consumes up to ` +
    `${worstCaseBytes} of the ${DESCRIPTIVE_BYTES_ABS_TOLERANCE} B raw-byte tolerance ` +
    `BEFORE any real difference is measured. ` +
    `THIS IS NOT A MATCHEDNESS FAILURE and must not be read as one: the fixtures ` +
    `may be perfectly matched and still trip the raw figure purely because their ` +
    `SKUs are different lengths. The fix is to give the three fixtures ` +
    `EQUAL-LENGTH SKUs — not to widen the tolerance, and not to bypass the preflight.` +
    (worstCaseBytes > DESCRIPTIVE_BYTES_ABS_TOLERANCE
      ? ` THE SPREAD ALONE EXCEEDS THE TOLERANCE — the raw check cannot distinguish ` +
        `SKU length from real drift until the SKUs are equalised.`
      : ` Headroom remaining: ${DESCRIPTIVE_BYTES_ABS_TOLERANCE - worstCaseBytes} B.`);
  return { lengths, spread, maskedPaths, worstCaseBytes, note };
}

function formatMatchedness(m: MatchednessCheck): string[] {
  const lines: string[] = ["  matchedness (served payloads):"];
  const b = (n: number | null) => (n === null ? "<unread>" : `${n} B`);
  for (const p of m.payloads) {
    lines.push(
      `    ${p.condition} (${p.productId ?? "<no productId>"}): served ${b(p.rawBytes)} raw` +
        ` = ${b(p.nonIvBytes)} descriptive + ${b(p.ivBytes)} verification` +
        `; raw descriptive ${b(p.rawDescriptiveBytes)} (ASSERTED)` +
        `; normalised ${b(p.normalisedBytes)}` +
        (p.duplicateKeys.length > 0
          ? ` — DUPLICATE KEYS: ${p.duplicateKeys.join(", ")}`
          : "") +
        (p.shapeViolations.length > 0
          ? ` — SHAPE VIOLATIONS: ${p.shapeViolations.length}`
          : "") +
        (p.error ? ` — ERROR: ${p.error}` : ""),
    );
    for (const v of p.shapeViolations) lines.push(`        shape: ${v}`);
  }
  lines.push(
    m.sizeOk
      ? `    descriptive-size check: OK — the three non-verification payloads agree ` +
          `within ${DESCRIPTIVE_BYTES_ABS_TOLERANCE} B, on BOTH the parsed and the raw ` +
          `on-the-wire figure. The tolerance is absolute, never a percentage: a ` +
          `tolerance that grows with the payload is a smuggling budget that grows with it.`
      : `    descriptive-size check: FAILED — ${m.sizeDetail}`,
    (() => {
      const s = skuLengthDiagnostic();
      return s.spread === 0
        ? `    SKU-length spread: OK — all ${s.lengths.length} SKUs are the same length ` +
            `(${s.lengths.join("/")}), so none of the ${DESCRIPTIVE_BYTES_ABS_TOLERANCE} B ` +
            `raw-byte tolerance is spent before real differences are measured.`
        : `    SKU-length spread: ⚠ ${s.note}`;
    })(),
    "    verification-block bytes above are the INDEPENDENT VARIABLE and are",
    "    deliberately NOT asserted: a credential and an anchor cost bytes that a",
    "    claimed-only fixture cannot be made to spend. That component is",
    "    irreducible; it is reported so a reader can size it, not to be equalised.",
  );
  if (m.ok) {
    lines.push("    OK — the three normalised payloads are byte-identical.");
    return lines;
  }
  lines.push(`    FAILED — ${m.detail}`);
  for (const d of m.diffs) {
    lines.push(`    ${d.left} vs ${d.right}: ${d.paths.length} differing path(s)`);
    for (const p of d.paths.slice(0, MAX_DIFF_PATHS_SHOWN)) {
      lines.push(`      ${p.path}`, `        ${d.left}: ${p.left}`, `        ${d.right}: ${p.right}`);
    }
    if (d.paths.length > MAX_DIFF_PATHS_SHOWN) {
      lines.push(`      ... and ${d.paths.length - MAX_DIFF_PATHS_SHOWN} more differing path(s)`);
    }
  }
  return lines;
}

/** The "why this matters" block, printed on a matchedness failure. */
function matchednessFailureLines(m: MatchednessCheck): string[] {
  // The DESCRIPTIVE sizes, not the raw ones: raw includes the credential and
  // anchor blocks, which are supposed to differ, so quoting raw here would name
  // the independent variable as if it were the confound.
  const size = (c: Condition) =>
    m.payloads.find((p) => p.condition === c)?.nonIvBytes ?? null;
  const a = size("A");
  const b = size("B");
  const contrast =
    a !== null && b !== null
      ? `A serves ${a} bytes of descriptive data and B serves ${b}.`
      : `At least one condition's served payload could not even be read.`;
  return [
    "  UNMATCHED FIXTURES:",
    `      ${m.detail}`,
    "",
    `      ${contrast} STUDY_DESIGN.md:27 requires "matched fixtures,`,
    '      identical descriptive data" — the conditions must differ in their',
    "      verification state and in NOTHING ELSE. They do not.",
    "",
    "      WHY THIS INVALIDATES THE STUDY: the core contrast is A (verifiable)",
    "      against B (claimed-only). If A's served passport also differs from",
    "      B's in size, schema or content, then that contrast is confounded.",
    "      Any difference the trials measure could be explained just as well by",
    '      "A had less data / different fields for the agent to read" as by',
    '      "A was cryptographically verifiable" — and the data cannot tell the',
    "      two explanations apart, no matter how many trials are run. This is",
    "      exactly the confound that sat undetected in production from",
    "      2026-07-23, under four green preflight parts.",
    "",
    "      The paths listed above are the actual differences. Repair the",
    "      FIXTURES until those paths agree (matching the category assignment",
    "      and stored sections across all three products), not this gate. If a",
    "      path listed above is something that genuinely MUST differ between",
    "      conditions, add it to EXEMPTIONS in preflight.ts as an EXACT PATH",
    "      WITH a written reason — every exemption is a thing this study has",
    "      agreed to stop noticing, and the printed table above is the whole of",
    '      what it has stopped noticing. Prefer "mask-sku" over "drop": it exempts',
    "      the SKU and keeps the rest of the field under comparison.",
    "",
  ];
}

/**
 * Assert live ground truth for ALL THREE conditions, whatever subset this
 * invocation selected. Aborts the process with a non-zero exit on any mismatch,
 * unreachable endpoint, non-200, or collapsed (non-distinct) condition set —
 * unless SKIP_PREFLIGHT=1, which downgrades the abort to a loud, unmistakable
 * warning and returns a result marked `bypassed`.
 */
export async function assertGroundTruth(
  selected: readonly Condition[],
): Promise<PreflightResult> {
  const bypass = process.env.SKIP_PREFLIGHT === "1";
  console.log(
    `\n=== PREFLIGHT: ground-truth assertion (${PREFLIGHT_CONDITIONS.join(", ")} — always all three) ===`,
  );

  const partial = PREFLIGHT_CONDITIONS.filter((c) => !selected.includes(c));
  if (partial.length > 0) {
    console.log(
      [
        "",
        "  NOTICE — PARTIAL-CONDITION RUN.",
        `  This invocation selected only: ${selected.join(", ")} (omitting ${partial.join(", ")}).`,
        "  The study measures the CONTRAST between conditions; a run over a subset",
        "  of them cannot establish that contrast, whatever its trials show. The",
        "  preflight below still checks all three, because a preflight scoped to the",
        "  selected subset would pass on whichever condition happens to be correct.",
        "",
      ].join("\n"),
    );
  }

  const result = await checkGroundTruth(PREFLIGHT_CONDITIONS);
  for (const line of formatReport(result)) console.log(line);

  if (result.ok) {
    console.log("=== PREFLIGHT PASSED — the independent variable exists. ===\n");
    return result;
  }

  const bad = result.rows.filter((r) => !r.ok);
  // The headline has to name the part that actually failed. The independent
  // variable can exist perfectly while the fixtures are unmatched — that is
  // precisely the failure mode part 5 was added for, and printing "the
  // independent variable does not exist" over it would misdirect the operator.
  const ivBroken =
    !result.agreementOk || !result.declaredDistinct.ok || !result.observedDistinct.ok;
  const headline = ivBroken
    ? [
        "  PREFLIGHT FAILED — THE EXPERIMENT'S INDEPENDENT VARIABLE DOES NOT",
        "  EXIST. The live verifier does not distinguish the conditions the way",
        "  fixtures/conditions.json declares, so running trials now would measure",
        "  nothing: every agent would be shown the same verification reality under",
        "  three different labels.",
        ...(result.matchedness.ok
          ? []
          : [
              "  AND the fixtures are NOT MATCHED — see UNMATCHED FIXTURES below.",
            ]),
      ]
    : [
        "  PREFLIGHT FAILED — THE FIXTURES ARE NOT MATCHED. The independent",
        "  variable exists (the three conditions do verify differently), but the",
        "  conditions differ in MORE than their verification state, so the",
        "  contrast the study measures is confounded and running trials now would",
        "  produce a difference that cannot be attributed to verifiability.",
      ];
  const failure: string[] = [
    "",
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    ...headline,
    "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!",
    `  API base: ${result.apiBase}`,
    "",
  ];
  for (const r of bad) {
    failure.push(
      `  condition ${r.condition} (${r.productId ?? "<no productId>"}):`,
      `      declared ground truth : ${r.groundTruth ?? "<unresolvable>"}`,
      `      actual live status    : ${r.liveStatus ?? `<none — ${r.transportError}>`}`,
      `      ${r.detail ?? ""}`,
      "",
    );
  }
  if (!result.declaredDistinct.ok) {
    failure.push(
      "  COLLAPSED CONDITIONS (declared):",
      `      ${result.declaredDistinct.detail}`,
      "      Two or more conditions are the same condition. The fixtures file",
      "      declares fewer than three distinct ground truths, so there is no",
      "      independent variable to manipulate — only one level of it, wearing",
      "      more than one label.",
      "",
    );
  }
  if (!result.observedDistinct.ok) {
    failure.push(
      "  COLLAPSED CONDITIONS (observed live):",
      `      ${result.observedDistinct.detail}`,
      "      Two or more conditions are the same condition. Whatever the fixtures",
      "      file declares, the live stack shows the agents the same verification",
      "      reality for these conditions, so the experiment has no independent",
      "      variable and the trials would measure nothing.",
      "",
    );
  }
  if (!result.matchedness.ok) {
    failure.push(...matchednessFailureLines(result.matchedness));
  }
  failure.push(
    "  DO NOT EDIT fixtures/conditions.json TO MAKE THIS PASS. The fixtures",
    "  declare what the experiment requires to be true; they are the",
    "  specification, not the observation. Rewriting a declared groundTruth to",
    "  match whatever the live stack currently returns does not repair the",
    "  experiment — it deletes the measurement while leaving the banner green.",
    "  The correct repairs are to the WORLD, not to the file: re-seed / re-anchor",
    "  the fixtures on the target stack until they behave as declared, or point",
    "  UG_API_BASE at the stack on which they already do. Either way the three",
    "  conditions must end up genuinely distinct, live.",
    "",
    "  To run anyway — deliberately, as a documented methodological choice —",
    `  set SKIP_PREFLIGHT=1. Such a run exits ${BYPASSED_EXIT_CODE}, never 0, and every row it`,
    "  writes is stamped as bypassed.",
    "",
  );

  if (bypass) {
    const warn: string[] = [
      "",
      "######################################################################",
      "#  BYPASSED: SKIP_PREFLIGHT=1 — PREFLIGHT ABORT BYPASSED.            #",
      "#                                                                    #",
      "#  This run is proceeding over a FAILED ground-truth assertion.      #",
      "#  Its output is NOT a clean run and must never be reported as one.  #",
      "#  The conditions below did not match their declared ground truth:   #",
      "######################################################################",
    ];
    for (const r of bad) {
      warn.push(
        `#  ${r.condition}: declared "${r.groundTruth ?? "<unresolvable>"}" but live is ` +
          `"${r.liveStatus ?? `<none — ${r.transportError}>`}"`,
      );
    }
    if (!result.declaredDistinct.ok) {
      warn.push(`#  COLLAPSED (declared): ${result.declaredDistinct.detail}`);
    }
    if (!result.observedDistinct.ok) {
      warn.push(`#  COLLAPSED (observed): ${result.observedDistinct.detail}`);
    }
    if (!result.matchedness.ok) {
      warn.push(
        `#  UNMATCHED FIXTURES: ${result.matchedness.detail}`,
        "#  The A-vs-B contrast in this run is confounded with payload size",
        "#  and content — a measured difference cannot be attributed to",
        "#  verifiability rather than to the conditions carrying different data.",
      );
      for (const p of result.matchedness.payloads) {
        warn.push(`#    ${p.condition} served ${p.rawBytes ?? "<unread>"} bytes`);
      }
    }
    warn.push(
      "######################################################################",
      "#  Every JSONL row from this run carries preflightPassed=false,      #",
      "#  preflightBypassed=true and the observed live status, and the      #",
      `#  process exits ${BYPASSED_EXIT_CODE} rather than 0.                                 #`,
      "######################################################################",
      "",
    );
    // The failure detail goes to stderr; the BYPASSED banner goes to BOTH, so a
    // caller capturing only stdout still sees the token.
    for (const line of failure) console.error(line);
    for (const line of warn) console.error(line);
    for (const line of warn) console.log(line);
    return { ...result, bypassed: true };
  }

  for (const line of failure) console.error(line);
  process.exit(1);
}
