/**
 * Study 5 SMOKE ONLY: a synthetic passportCheck block in the PR #382 contract shape, built from
 * values measured on the public explorer, so the smoke trials can exercise the whole chain
 * (passport -> explorer JSON) before the platform change is deployed.
 *
 * Never used by a counted trial. The pilot passports are the CURRENT live resolver JSON of
 * fixture A (Test 1) and of the unit UPI (Test 2) with this block inserted after `links`, served
 * from PILOT_HOST by fetch_url, written to stimulus/study5/pilot/ and flagged pilot.
 *
 *   status verified, the platform's own meaning sentence, issuer = the brand profile,
 *   evidence.recorded_fingerprint = A_RECORD_VALUE (the DataChanged value in A_ANCHOR_TX),
 *   evidence.independent_record = the explorer's JSON for A_ANCHOR_TX's logs, its tx page,
 *     and the brand profile's address JSON,
 *   evidence.provenance (Test 2 only; where PR #382 commit ead186d0 puts it) = collection A,
 *     its owner (the brand), the factory, the collection's deployment tx and its logs JSON, the
 *     token JSON, and unit 000001's token (id 0x6b89...8c0b, as PR #382 serves it at item level).
 */
import {
  A_ANCHOR_TX,
  A_COLLECTION_DEPLOY_TX,
  A_RECORD_KEY,
  A_RECORD_VALUE,
  BRAND_PROFILE,
  EXPLORER,
  FACTORY,
  type Json,
} from "./study5";

export const PILOT_TOKEN_ID = "0x6b89c485dbc2d0780e76c0e7147059eaec663cf87bc3ddd07ffa944be26a8c0b";
/** Collection A as the explorer spells it (EIP-55), as PR #382 serves it. */
export const PILOT_COLLECTION_CHECKSUM = "0xCEC4247d4e7dE11023c8c55e2A773876De0c80ae";
export const PILOT_CHECKED_AT = "2026-10-15T12:00:00.000Z";

export function pilotPassportCheck(opts: { productId: string; recheckUrl: string; withProvenance: boolean }): Record<string, Json> {
  const block: Record<string, Json> = {
    status: "verified",
    meaning: "The passport data is unchanged since the brand recorded it on the public ledger. This is not a compliance certificate.",
    checked_at: PILOT_CHECKED_AT,
    issuer: { name: "Family Labs Energy Systems", profile: BRAND_PROFILE },
    evidence: {
      chain: "lukso-testnet",
      chain_id: 4201,
      public_rpc: "https://rpc.testnet.lukso.network",
      profile: BRAND_PROFILE,
      record_key: A_RECORD_KEY,
      record_key_preimage: `UG_VerifiableData_product_${opts.productId}`,
      read: "getData(bytes32 record_key) on profile; value is 0x || sha256(credential)",
      credential_url: null,
      recheck_url: opts.recheckUrl,
      recorded_fingerprint: A_RECORD_VALUE,
      independent_record: {
        explorer: EXPLORER,
        record_data_url: `${EXPLORER}/api/v2/transactions/${A_ANCHOR_TX}/logs`,
        record_page_url: `${EXPLORER}/tx/${A_ANCHOR_TX}`,
        profile_data_url: `${EXPLORER}/api/v2/addresses/${BRAND_PROFILE}`,
        anchor_tx: A_ANCHOR_TX,
      },
    },
  };
  if (opts.withProvenance)
    (block.evidence as Record<string, Json>).provenance = {
      collection: PILOT_COLLECTION_CHECKSUM,
      collection_owner_profile: BRAND_PROFILE,
      factory: FACTORY,
      deployment_tx: A_COLLECTION_DEPLOY_TX,
      deployment_record_url: `${EXPLORER}/api/v2/transactions/${A_COLLECTION_DEPLOY_TX}/logs`,
      collection_data_url: `${EXPLORER}/api/v2/tokens/${PILOT_COLLECTION_CHECKSUM}`,
      token_id: PILOT_TOKEN_ID,
      token_data_url: `${EXPLORER}/api/v2/tokens/${PILOT_COLLECTION_CHECKSUM}/instances/${PILOT_TOKEN_ID.slice(2)}`,
    };
  return block;
}

/** Insert `passportCheck` right after `links` (where PR #382 puts it), compact JSON. */
export function withPassportCheck(liveText: string, block: Record<string, Json>): string {
  const doc = JSON.parse(liveText) as Record<string, Json>;
  if ("passportCheck" in doc) throw new Error("live passport already carries passportCheck: the pilot must not overwrite a live block");
  const out: Record<string, Json> = {};
  for (const [k, v] of Object.entries(doc)) {
    out[k] = v;
    if (k === "links") out.passportCheck = block;
  }
  if (!("passportCheck" in out)) out.passportCheck = block;
  return JSON.stringify(out);
}
