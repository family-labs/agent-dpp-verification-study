/**
 * Create the A/B/C fixture products on the Universal Goods testnet platform, as V3
 * real-world-asset products, up to the point where a human has to sign.
 *
 * Talks to the platform only via its REST API. Idempotent by recorded id: every step
 * is skipped when conditions.json already carries the id it would create, so a run that
 * dies half way is resumed by running it again.
 *
 * Env (ALL required — there is deliberately no default host, see A16 and A26):
 *   UG_API_BASE   the ALPHA/testnet API origin, e.g. https://api.universalgoods.xyz
 *   UG_API_TOKEN  an Organization-scoped API key from the console (Settings > API Keys)
 *   UG_ORG_ID     the organisation the fixtures are created in
 *
 * What this script does per condition (A, B, C), in order:
 *   1. POST   /api/products                                   categoryId = Industrial battery (A30);
 *                                                             no collectionKind → DB default = v3
 *   2. PUT    /api/metadata/product/{id}/detail/{slug}        × the eight Annex XIII battery sections
 *                                                             in tarnvale-5000.battery.json
 *   3. POST   /api/products/{id}/variants                     one variant
 *   4. PUT    /api/metadata/variant/{vid}/detail/_identity    { gtin } — what SEALING reads
 *   5. POST   /api/products/{id}/batches                      one batch on that variant
 *   6. POST   /api/lifecycle/products/{id}/batches/{bid}/generate-items  { count: 1 }
 *
 * What it deliberately does NOT do, because each needs a customer key in a browser:
 *   - seal + deploy the V3 collection + mint       (console: batch → Tokenise)
 *   - publish the credential                        (console: trust pill)  → A and C only
 *   - anchor it on the organisation's profile       (console: trust pill)  → A and C only
 *   - edit one public section on C after anchoring  (makes C `invalid`)
 * See RUNBOOK-2026-09-22.md for those steps and their gates.
 *
 * A30 (2026-10-12): the fixtures moved from the generic DPP category to the EU Industrial
 * battery category, so the data follows the regulation-grounded battery schema. The
 * generic data file `powercell-5000.sections.json` is kept as history and is no longer
 * read. New SKUs and new GTIN bodies, so no UPI can resolve to a retired generic product.
 *
 * ⛔ GTINs. The July version of this file wrote the GTIN into the `identification`
 * section's `globalTradeItemNumber`, which the platform never reads when it seals a
 * batch — sealing reads `_identity.gtin` on the variant (or the product). And all three
 * hard-coded check digits were wrong. Both are logged as A27. This version computes the
 * check digit and writes `_identity`. The bodies are synthetic; nothing here is a GTIN
 * allocated to anyone, and the platform is never the GTIN issuer.
 */
import batteryFixture from "./tarnvale-5000.battery.json";
import conditions from "./conditions.json";
import { writeFileSync } from "fs";

const BASE = process.env.UG_API_BASE;
const TOKEN = process.env.UG_API_TOKEN;
const ORG = process.env.UG_ORG_ID;
if (!BASE || !TOKEN || !ORG) {
  console.error("Set UG_API_BASE, UG_API_TOKEN and UG_ORG_ID. There is no default host.");
  process.exit(1);
}

// ⛔ Never write to mainnet. Judged on the host string here; the runbook also requires the
// operator to confirm the CNAME target is REDACTED_TEST_HOST, because a .xyz name can be
// pointed anywhere and this check cannot see DNS.
const host = new URL(BASE).host.toLowerCase();
if (/universalgoods\.org$/.test(host) || /REDACTED_PRODUCTION_HOST/.test(host)) {
  console.error(`Refusing to write to ${host}: that is a mainnet name.`);
  process.exit(1);
}
if (!/^https:/.test(BASE) && !/^http:\/\/localhost/.test(BASE)) {
  console.error(`Refusing non-HTTPS host ${BASE}.`);
  process.exit(1);
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      // An API key travels in `x-api-key`. `Authorization: Bearer` is the OAuth-token
      // path and rejects an API key with 401 (measured on testnet 2026-10-12).
      "x-api-key": TOKEN!,
      "x-organization-id": ORG!,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

/** GTIN-14 check digit: weights 3,1,3,1… from the LEFT over the 13 body digits. */
function gtin14(body13: string): string {
  if (!/^\d{13}$/.test(body13)) throw new Error(`GTIN body must be 13 digits: ${body13}`);
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(body13[i]) * (i % 2 === 0 ? 3 : 1);
  return body13 + String((10 - (sum % 10)) % 10);
}

// Synthetic, one per SKU. The 13-digit body is fixed; the check digit is computed.
// A30: a new block (04012346…) so no body repeats the retired generic fixtures' 04012345….
const perUnit: Record<string, { gtinBody: string }> = {
  "TV5K-6271": { gtinBody: "0401234662710" },
  "TV5K-2834": { gtinBody: "0401234628340" },
  "TV5K-8456": { gtinBody: "0401234684560" },
};

const INDUSTRIAL_BATTERY = "c0000000-0000-4000-8000-000000000204";
if (batteryFixture.categoryId !== INDUSTRIAL_BATTERY) {
  console.error(`battery fixture categoryId ${batteryFixture.categoryId} is not Industrial battery`);
  process.exit(1);
}

/** The battery sections for one SKU: identical data, plus the per-unit identifying element. */
function sectionsFor(sku: string): Record<string, { title: string; data: Record<string, unknown> }> {
  const out = structuredClone(batteryFixture.sections) as Record<
    string,
    { title: string; data: Record<string, unknown> }
  >;
  for (const [path, template] of Object.entries(batteryFixture.perUnit)) {
    const [slug, key] = path.split(".");
    out[slug].data[key] = (template as string).replaceAll("<sku>", sku);
  }
  return out;
}

type Assignment = {
  sku: string;
  condition: string;
  groundTruth: string;
  productId: string | null;
  variantId?: string | null;
  batchId?: string | null;
  gtin?: string | null;
};

const updated = structuredClone(conditions) as { _comment: string; assignments: Record<string, Assignment> };
const persist = () =>
  writeFileSync(new URL("./conditions.json", import.meta.url), JSON.stringify(updated, null, 2) + "\n");

for (const [key, a] of Object.entries(updated.assignments)) {
  const { sku } = a;
  const gtin = gtin14(perUnit[sku].gtinBody);
  a.gtin = gtin;

  // 1. product — collectionKind is NOT sent, so the database default (v3) answers.
  //    categoryId puts it under the Industrial battery corpus (A30).
  if (!a.productId) {
    const product = await api(`/api/products`, "POST", {
      organizationId: ORG,
      title: `${batteryFixture.product.title} (${sku})`,
      description: batteryFixture.product.description,
      categoryId: batteryFixture.categoryId,
    });
    if (product.categoryId !== batteryFixture.categoryId) {
      throw new Error(`product ${product.id} came back with categoryId ${product.categoryId}`);
    }
    a.productId = product.id;
    persist();
    console.log(`[${key}] product ${sku} → ${a.productId}`);
  } else {
    console.log(`[${key}] product ${sku} exists → ${a.productId}`);
  }
  const pid = a.productId!;

  // 2. the battery sections (PUT is idempotent; re-run is harmless). A refusal is the
  //    server's AJV 422 with its error paths, printed in full by api().
  for (const [slug, section] of Object.entries(sectionsFor(sku))) {
    await api(`/api/metadata/product/${pid}/detail/${slug}`, "PUT", { title: section.title, data: section.data });
    console.log(`[${key}]   section ${slug} ✓`);
  }

  // 3. one variant
  if (!a.variantId) {
    const variant = await api(`/api/products/${pid}/variants`, "POST", {
      variantKey: { edition: "standard" },
    });
    a.variantId = variant.id;
    persist();
    console.log(`[${key}] variant → ${a.variantId}`);
  }
  const vid = a.variantId!;

  // 4. the GTIN where sealing reads it. Variant first; product as a fallback.
  try {
    await api(`/api/metadata/variant/${vid}/detail/_identity`, "PUT", {
      title: "Identity",
      data: { gtin },
    });
    console.log(`[${key}]   _identity.gtin=${gtin} on variant ✓`);
  } catch (e) {
    console.warn(`[${key}]   variant _identity refused (${(e as Error).message.slice(0, 160)}); trying product`);
    await api(`/api/metadata/product/${pid}/detail/_identity`, "PUT", {
      title: "Identity",
      data: { gtin },
    });
    console.log(`[${key}]   _identity.gtin=${gtin} on product ✓`);
  }

  // 5. one batch on that variant
  if (!a.batchId) {
    const batch = await api(`/api/products/${pid}/batches`, "POST", {
      variantId: vid,
      // A28: neutral. The resolver serves this as identities.batch.batchDescription,
      // so "Study fixture A/B/C" would have named the condition on the page the agent reads.
      description: `Production lot (${sku})`,
    });
    a.batchId = batch.id;
    persist();
    console.log(`[${key}] batch → ${a.batchId}`);
  }
  const bid = a.batchId!;

  // 6. one keyless item, derived server-side as keccak(ug:v3:<batchId>:<i>).
  //    Needs the organisation to hold at least one credit; a fresh org answers 402.
  const items = await api(`/api/products/${pid}/batches/${bid}/items`, "GET").catch(() => null);
  const existing = Array.isArray(items) ? items.length : Array.isArray(items?.items) ? items.items.length : 0;
  if (existing === 0) {
    await api(`/api/lifecycle/products/${pid}/batches/${bid}/generate-items`, "POST", { count: 1 });
    console.log(`[${key}] generated 1 item ✓`);
  } else {
    console.log(`[${key}] batch already holds ${existing} item(s), not generating`);
  }
}

persist();
console.log("\nDone. conditions.json carries productId, variantId, batchId and gtin per condition.");
console.log("Next (needs a browser and a customer key): tokenise A, B, C; publish+anchor A and C; edit C.");
console.log("Then: cd harness && bun run src/preflight-only.ts, and read part 5's diff before adding any exemption.");
