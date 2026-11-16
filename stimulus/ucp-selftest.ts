/**
 * Self-test of the arm-U transform and invariants (stimulus/ucp.ts) on SYNTHETIC lookups
 * (stimulus/ucp-synthetic.ts), against the real, hash-checked S1 pages. Writes nothing.
 *
 *   bun run ../stimulus/ucp-selftest.ts [--print A]
 *
 * Positive: A-E build and pass every invariant. Negative (each must be REFUSED): a dpp block
 * that leaks credential state in B; an extra change in D; a merchant field naming the
 * passport; a lookup returning two variants; dpp keys in another order; a dpp block whose
 * bytes are not the served ones. Exit 0 only if all hold.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readConditions } from "./condition-e";
import {
  checkListingInvariants,
  dppBytesServed,
  listingE,
  listingFromLookup,
  merchantFieldsFromPage,
  PAGE_FILE,
  serialiseListing,
  STIMULUS_DIR,
  type CondIds,
  type ServedLookup,
  type UcpCond,
} from "./ucp";
import { syntheticLookupText } from "./ucp-synthetic";

const fails: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) fails.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};
const refuses = (f: () => unknown, what: string) => {
  try {
    f();
    check(false, `refused: ${what}`);
  } catch (e) {
    check(true, `refused: ${what}  (${String(e instanceof Error ? e.message : e).slice(0, 110)})`);
  }
};

const cond = readConditions();
const ids = {} as Record<"A" | "B" | "C", CondIds>;
for (const c of ["A", "B", "C"] as const) {
  const f = cond.assignments[c];
  ids[c] = { productId: f.productId!, variantId: f.variantId!, gtin: f.gtin! };
}
const pages = Object.fromEntries(
  (["A", "B", "C", "D"] as const).map((c) => [c, readFileSync(join(STIMULUS_DIR, PAGE_FILE[c]), "utf8")]),
) as Record<"A" | "B" | "C" | "D", string>;
const sku = { A: "TV5K-6271", B: "TV5K-2834", C: "TV5K-8456" } as const;
const desc = merchantFieldsFromPage(pages.A).description;
const raw = Object.fromEntries(
  (["A", "B", "C"] as const).map((c) => [
    c,
    syntheticLookupText({
      ...ids[c],
      productTitle: `Tarnvale 5000 Portable Power Station (${sku[c]})`,
      productDescription: desc,
      verificationUrl: `https://app.universalgoods.xyz/api/server/api/passport/${ids[c].variantId}/verify`,
      granularity: "model",
    }),
  ]),
) as Record<"A" | "B" | "C", string>;
const lk = (c: "A" | "B" | "C") => JSON.parse(raw[c]) as ServedLookup;

function build(over: Partial<Record<"A" | "B" | "C", ServedLookup>> = {}, pageD = pages.D) {
  const t = {} as Record<UcpCond, string>;
  for (const c of ["A", "B", "C"] as const) t[c] = serialiseListing(listingFromLookup(over[c] ?? lk(c), ids[c].gtin, pages[c]));
  t.D = serialiseListing(listingFromLookup(over.A ?? lk("A"), ids.A.gtin, pageD));
  t.E = serialiseListing(listingE(JSON.parse(t.A)));
  return t;
}

// ---- positive
const t = build();
let inv: string[] = [];
try {
  inv = checkListingInvariants(t, ids);
  check(true, `invariants hold on synthetic A-E (${inv.length} checks)`);
} catch (e) {
  check(false, `invariants hold on synthetic A-E: ${e}`);
}
for (const l of inv) console.log(`       ${l}`);
for (const c of ["A", "B", "C"] as const) {
  const v = (lk(c).products![0].variants![0]).dpp!;
  check(dppBytesServed(raw[c], v) && t[c].includes(`"dpp":${JSON.stringify(v)}`), `${c}: dpp bytes in the listing are the served bytes`);
}
const a = JSON.parse(t.A);
check(a.variants[0].price.amount === 349900 && a.variants[0].price.currency === "EUR", "price = 349900 EUR minor units (page €3,499.00)");
check(a.variants[0].availability.available === true, "available: true");
check(!t.A.includes("TV5K-"), "the served title's SKU does not reach the listing (merchant title from the page)");
check(!t.A.includes("not_offered") && !t.A.includes('"inputs"') && !t.A.includes('"ucp"'), "endpoint-only fields dropped");
check(t.D.includes("Expected lifetime: 6000 cycles") && !t.D.includes("4000 cycles"), "D states 6000, not 4000");
check(!t.E.includes('"dpp"') && t.E.includes("https://id.tarnvale.example/01/04012346519005"), "E: no dpp, plain passport url");
check(!/ugpdpp|universalgoods/i.test(t.E), "E names no UG host");

// ---- negative
refuses(() => {
  const b = lk("B");
  (b.products![0].variants![0].dpp as unknown as Record<string, unknown>).verified = false;
  checkListingInvariants(build({ B: b }), ids);
}, "a dpp block in B carrying an extra credential-state field");
refuses(() => {
  const b = lk("B");
  b.products![0].variants![0].dpp!.granularity = "item";
  checkListingInvariants(build({ B: b }), ids);
}, "B's dpp granularity differing from A's");
refuses(() => checkListingInvariants(build({}, pages.D.replace("Weight: 48.2 kg", "Weight: 47.0 kg")), ids), "D with a second change (weight)");
refuses(() => {
  const x = build();
  x.C = x.C.replace("compliant.", "compliant. Battery passport available.");
  checkListingInvariants(x, ids);
}, "a merchant field naming the passport (C only)");
refuses(() => {
  const two = lk("A");
  two.products![0].variants!.push({ ...two.products![0].variants![0], id: "x" });
  listingFromLookup(two, ids.A.gtin, pages.A);
}, "a lookup returning two variants");
refuses(() => {
  const r = lk("A");
  const d = r.products![0].variants![0].dpp!;
  r.products![0].variants![0].dpp = { verification_url: d.verification_url, upi: d.upi, passport_url: d.passport_url, granularity: d.granularity };
  listingFromLookup(r, ids.A.gtin, pages.A);
}, "dpp keys in a different order from the extension's");
check(!dppBytesServed(raw.A.replace('"granularity":"model"', '"granularity": "model"'), lk("A").products![0].variants![0].dpp!), "dppBytesServed detects reformatted served bytes");

const pi = process.argv.indexOf("--print");
if (pi !== -1) console.log(`\nlisting ${process.argv[pi + 1]}:\n${t[process.argv[pi + 1] as UcpCond]}`);
console.log(`\nUCP SELFTEST: ${fails.length ? `FAIL (${fails.length})` : "PASS"}`);
process.exit(fails.length ? 1 : 0);
