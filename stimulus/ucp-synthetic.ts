/**
 * SYNTHETIC UCP lookups, shaped exactly as universal-goods-testnet PR #372 (commit bbce142d,
 * apps/server/src/routes/ucp.ts `ucpVariant` / `ucpProduct` / lookup handler, and
 * services/ucp-catalog.service.ts `entryForGtin`) would serve them. NEVER a stimulus of a
 * counted trial. Used for two things only, before the endpoint is deployed:
 *   1. stimulus/ucp-selftest.ts: prove the transform and the invariants on realistic input;
 *   2. the Study 3 smoke trial (run-study3.ts --smoke): a pilot-flagged listing for a retired,
 *      non-fixture product, whose dpp links are the real resolver/verifier links of that
 *      product, built by the same formula the server uses.
 * Counted arm-U trials read only stimulus/ucp/listings/*, built by build-ucp.ts from the
 * live, stored responses.
 */
import { DPP_EXTENSION_NAME, UCP_CATALOG_LOOKUP } from "./ucp";

const NOT_OFFERED_TEXT =
  "Listed for its Digital Product Passport, not offered for sale here. The price is the 0 the " +
  "catalog schema requires, not a real price, and availability is false. Each variant's dpp " +
  "object links the passport and the service that checks it.";

export interface SyntheticEntry {
  productId: string;
  variantId: string;
  gtin: string;
  productTitle: string;
  productDescription: string;
  verificationUrl: string;
  granularity: string;
  /** Default: https://ugpdpp.xyz (the configured UPI origin on testnet). */
  upiOrigin?: string;
  /** Default: https://app.universalgoods.xyz/api/server (publicApiBase on testnet). */
  apiBase?: string;
}

/** The compact bytes the lookup handler would send for one GTIN (Hono c.json = JSON.stringify). */
export function syntheticLookupText(e: SyntheticEntry): string {
  const price = { amount: 0, currency: "EUR" };
  const dpp = {
    upi: `${e.upiOrigin ?? "https://ugpdpp.xyz"}/01/${e.gtin}`,
    passport_url: `${e.apiBase ?? "https://app.universalgoods.xyz/api/server"}/api/passport/${encodeURIComponent(e.variantId)}?kind=variant`,
    verification_url: e.verificationUrl,
    granularity: e.granularity,
  };
  const body = {
    ucp: {
      version: "2026-08-25",
      capabilities: {
        [UCP_CATALOG_LOOKUP]: [{ version: "2026-08-25" }],
        [DPP_EXTENSION_NAME]: [{ version: "2026-10-14" }],
      },
    },
    products: [
      {
        id: e.productId,
        title: e.productTitle,
        description: { plain: e.productDescription },
        price_range: { min: price, max: price },
        variants: [
          {
            id: e.variantId,
            title: e.productTitle,
            description: { plain: e.productDescription },
            barcodes: [{ type: "GTIN", value: e.gtin }],
            price,
            availability: { available: false, status: "not_offered" },
            dpp,
            inputs: [{ id: e.gtin, match: "exact" }],
          },
        ],
      },
    ],
    messages: [{ type: "info", code: "not_offered", path: "$.products[0]", content: NOT_OFFERED_TEXT }],
  };
  return JSON.stringify(body);
}
