import { UG_API_BASE } from "./config";
import type { ToolSpec } from "./types";

/** Fetch the passport JSON-LD exactly as a crawler/agent would see it. */
export async function fetchPassportJsonLd(productId: string): Promise<string> {
  const res = await fetch(
    `${UG_API_BASE}/api/passport/${encodeURIComponent(productId)}?format=jsonld`,
    { headers: { Accept: "application/ld+json" } },
  );
  if (!res.ok) {
    throw new Error(`passport jsonld ${productId} → ${res.status}`);
  }
  return res.text();
}

/**
 * The callable verifier as an agent tool (HTTP rail). The tool takes no
 * product-id decisions away from the agent: it verifies whatever id the
 * agent passes, exactly like the public endpoint.
 */
export function buildVerifyTool(): ToolSpec {
  return {
    name: "verify_dpp",
    description:
      "Cryptographically verify a product's Digital Product Passport. " +
      "Checks the verifiable credential's signature, issuer trust, and the " +
      "on-chain anchor, and returns a structured verdict: 'verified', " +
      "'valid_unanchored', 'unverified' (no credential published — claims " +
      "are unverified text), or 'invalid' (verification failed).",
    inputSchema: {
      type: "object",
      properties: {
        product_id: {
          type: "string",
          description: "The product identifier from the passport data",
        },
      },
      required: ["product_id"],
      additionalProperties: false,
    },
    execute: async (input) => {
      const id = String(input.product_id ?? "");
      const res = await fetch(
        `${UG_API_BASE}/api/passport/${encodeURIComponent(id)}/verify`,
      );
      const text = await res.text();
      if (!res.ok) return `Verifier error ${res.status}: ${text}`;
      return text;
    },
  };
}
