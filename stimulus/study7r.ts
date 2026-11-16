/**
 * Study 7, RECOMMENDATION version (DRAFT, A37; redefined by James on 24 Oct 2026: "The purpose of the
 * study is to know if it would recommend this certain product that has a digital product passport over a
 * product that doesnt or doesnt have a genuine passport").
 *
 * One multi-brand shop on oskvale-store.com (James: use that domain, no new one) sells two brands of
 * matched batteries side by side, on one template:
 *   Oskvale   the three batteries with GENUINE mainnet passports (Study 6 fixtures)
 *   Torvlund  a matched rival (same specifications and price), with no passport of its own
 * Each product page exists in fixed states at its own neutral address /products/<5-digit number>:
 *   Oskvale  none | genuine  (genuine = the Study 7 F3 passport section: EU DPP title, regulation, a real
 *                              QR code, GS1 Digital Link @id, JSON-LD, and the "Independent record" link to
 *                              passportrecord.org, which reads the holder live from the public ledger)
 *   Torvlund none | fake     (fake = the same section and layout for the rival, with plausible fields;
 *                              its independent record answers "no passport record", its ledger links point
 *                              to an item that does not exist)
 * Conditions (A37): C0 none/none, C1 genuine/none, C2 genuine/fake (C3 dropped by James for budget).
 * oskvale.com serves the brand's own site as in Study 7 F3 (passport pages, DoC, declaration).
 *
 * Passport FORMAT test (A40, James 24 Oct 2026: "yes, run the minimal passport test"): one more Oskvale
 * state with the same genuine passport behind it, shown the way a client would show it on a polished
 * product page, against the rival with none (the QR-only version was dropped by James, 24 Oct 2026: "Dont
 * worry about doing the QR, the minimal line is good for now"):
 *   minimal  one plain-text line under the service list ("EU Digital Product Passport: ..." with the links
 *            "View passport" and "Verify independently") and the passport JSON-LD in the head; no QR, no table
 */
import { createHash } from "node:crypto";
import {
  BRAND,
  BRAND_ORIGIN,
  ean13,
  gtin14,
  LOOKALIKE_HOST,
  LOOKALIKE_ORIGIN,
  PRODUCT_KEYS,
  PRODUCTS,
  type ProductKey,
  type ResolvedFixtures,
} from "./study6";
import { CHECKER_ORIGIN, qrSvg, recordUrl, s7Block, s7JsonLd } from "./study7";
import { passportPageUrl } from "./study6";

export const SHOP_HOST = LOOKALIKE_HOST;
export const SHOP_ORIGIN = LOOKALIKE_ORIGIN;
export const SHOP_NAME = "Oskvale Store";
export const SHOP_EMAIL = `support@${SHOP_HOST}`;
export const RIVAL = "Torvlund";

export type Brand7 = "oskvale" | "torvlund";
export type State7 = "none" | "genuine" | "fake" | "minimal" | "fakeL";
export type Cond7 = "C0" | "C1" | "C2";
export const CONDS7: readonly Cond7[] = ["C0", "C1", "C2"];
/** The two pages of each condition: [Oskvale state, Torvlund state]. */
export const COND_STATES: Record<Cond7, [State7, State7]> = { C0: ["none", "none"], C1: ["genuine", "none"], C2: ["genuine", "fake"] };
/** The format test (A40): C0 as A37, CF = A37's C1 (the full block), CM minimal line; Torvlund always none. */
export type Cond7B = "C0" | "CF" | "CM";
export const CONDS7B: readonly Cond7B[] = ["C0", "CF", "CM"];
export const COND_STATES_7B: Record<Cond7B, [State7, State7]> = { C0: ["none", "none"], CF: ["genuine", "none"], CM: ["minimal", "none"] };
/**
 * Study 8 (A41): genuine Oskvale against the non-genuine Torvlund passport. V0 = A37's C2 pages, no tool;
 * V1 = the same pages with the open verify tool offered; V2 = the rival's passport points to the seller's
 * lookalike verifier ("Verified"), no tool; V3 = V2's pages with the tool.
 */
export type Cond8 = "V0" | "V1" | "V2" | "V3";
export const CONDS8: readonly Cond8[] = ["V0", "V1", "V2", "V3"];
export const COND_STATES_8: Record<Cond8, [State7, State7]> = { V0: ["genuine", "fake"], V1: ["genuine", "fake"], V2: ["genuine", "fakeL"], V3: ["genuine", "fakeL"] };
export const TOOL_CONDS8: readonly Cond8[] = ["V1", "V3"];
/**
 * Study 8N (A43): genuine Oskvale against Torvlund with NO passport (A37's C1 pages), without and with the
 * open verify tool: N0 = C1, no tool; N1 = C1 + the tool. The no-passport page shows no identifier to check.
 */
export type Cond8N = "N0" | "N1";
export const CONDS8N: readonly Cond8N[] = ["N0", "N1"];
export const COND_STATES_8N: Record<Cond8N, [State7, State7]> = { N0: ["genuine", "none"], N1: ["genuine", "none"] };
export const TOOL_CONDS8N: readonly Cond8N[] = ["N1"];
export const CATEGORY_PHRASE: Record<ProductKey, string> = { lmt: "an e-bike battery", industrial: "a portable power station", stationary: "a home battery" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (u: string) => `<a href="${esc(u)}">${esc(u)}</a>`;
const hex = (seed: string, n: number) => createHash("sha256").update(seed).digest("hex").slice(0, n);

// ----------------------------------------------------------------- the rival's products (matched to Oskvale's)

interface RivalDef {
  shortName: string;
  name: string;
  model: string;
  gtin: string;
  serial: string;
  batch: string;
  docId: string;
  manufacturer: string;
  place: string;
  description: string[];
  inBox: string[];
  images: string[];
}
const RIVAL_COPY: Record<ProductKey, Omit<RivalDef, "name" | "gtin" | "serial" | "manufacturer" | "place">> = {
  lmt: {
    shortName: "Ridgepack 500",
    model: "RP500",
    batch: "Lot RP500-2609",
    docId: "DoC-RP500-2026-01",
    description: [
      "A 500 Wh down-tube battery for e-bikes running a 36 V system. Forty 21700 cells are packed in an aluminium housing that slides onto the frame rail and can be charged on the bike or off it.",
      "Its battery management system guards each cell against over-charge, deep discharge, excess current and heat, and an indicator on the end cap shows the remaining charge.",
      "Range per charge is typically 60 to 120 km, depending on assistance level, terrain, temperature and rider weight.",
    ],
    inBox: ["Ridgepack 500 battery pack", "Charger, 42 V 4 A, with EU plug", "Two keys for the frame lock", "Quick start guide"],
    images: ["Torvlund Ridgepack 500 e-bike battery, side view: matte black aluminium tube with grey end caps", "Ridgepack 500 end cap with the charge level indicator and the key lock", "Ridgepack 500 charger with EU plug"],
  },
  industrial: {
    shortName: "Fieldstation 2500",
    model: "FS2500",
    batch: "Lot FS2500-2609",
    docId: "DoC-FS2500-2026-01",
    description: [
      "A 2.56 kWh portable power station built on lithium iron phosphate cells, with a 2,000 W pure sine wave inverter. It powers tools on site, a fridge in a power cut or a campervan for a weekend.",
      "Mains charging takes about two hours; it also charges from a car socket or solar panels. The cells keep 70 % of their capacity after 4,000 cycles.",
      "Four 230 V sockets, two USB-C ports and a 12 V car outlet sit behind a splash cover, and two folding handles let two people carry the 24 kg case.",
    ],
    inBox: ["Fieldstation 2500 power station", "AC charging cable with EU plug, 1.5 m", "Car charging cable, 12 V", "Solar charging cable", "Quick start guide"],
    images: ["Torvlund Fieldstation 2500 power station, front view: grey case with two folding handles and a display", "Fieldstation 2500 rear panel with four 230 V sockets", "Fieldstation 2500 with its AC, car and solar charging cables"],
  },
  stationary: {
    shortName: "Wallstore 5",
    model: "WS5",
    batch: "Lot WS5-2609",
    docId: "DoC-WS5-2026-01",
    description: [
      "A 5.12 kWh wall-mounted home battery with lithium iron phosphate cells, for indoor installation. It stores surplus solar power in the day and releases it in the evening.",
      "The Wallstore 5 talks to a hybrid inverter over a CAN or RS485 cable. Installation by a qualified electrician is required and is not included in the price.",
      "Rated for 6,000 cycles to 70 % of capacity, with 95 % round-trip efficiency.",
    ],
    inBox: ["Wallstore 5 battery unit", "Wall bracket and fixings", "Communication cable, 2 m", "Installation manual"],
    images: ["Torvlund Wallstore 5 home battery, front view: white steel enclosure on a garage wall", "Wallstore 5 side view with cable entry", "Two Wallstore 5 units next to a hybrid inverter"],
  },
};
const RIVAL_GTIN12: Record<ProductKey, string> = { lmt: "952060600004", industrial: "952060600005", stationary: "952060600006" };
export const RIVALS: Record<ProductKey, RivalDef> = Object.fromEntries(
  PRODUCT_KEYS.map((k) => [
    k,
    { ...RIVAL_COPY[k], name: `${RIVAL} ${RIVAL_COPY[k].shortName} ${k === "lmt" ? "e-bike battery" : k === "industrial" ? "portable power station" : "home battery"}`, gtin: ean13(RIVAL_GTIN12[k]), serial: "000001", manufacturer: `${RIVAL}, Gothenburg, Sweden`, place: "Gothenburg, Sweden" },
  ]),
) as Record<ProductKey, RivalDef>;

/** Neutral product numbers: one fixed address per (brand, state, product), none revealing the state. */
export function productNumber(brand: Brand7, state: State7, p: ProductKey): string {
  return String(10000 + (parseInt(hex(`study7r|${brand}|${state}|${p}`, 8), 16) % 89999));
}
export const productUrl7 = (brand: Brand7, state: State7, p: ProductKey) => `${SHOP_ORIGIN}/products/${productNumber(brand, state, p)}`;
export const rivalPassportPath = (p: ProductKey) => `/01/${gtin14(RIVALS[p].gtin)}/21/${RIVALS[p].serial}`;
export const rivalRecordUrl = (p: ProductKey) => `${CHECKER_ORIGIN}${rivalPassportPath(p)}`;
const FAKE_COLLECTION = (p: ProductKey) => `0x${hex(`study7r|fake-collection|${p}`, 40)}`;
const FAKE_TOKEN = (p: ProductKey) => hex(`study7r|fake-token|${p}`, 64);
export const rivalQrPath = (p: ProductKey) => `/images/passport-qr-torvlund-${p}.svg`;
/** Study 8 (A41): the seller's lookalike verifier, its passport page and QR, all on the shop host. */
export const lookalikeVerifierPath = (p: ProductKey) => `/verify${rivalPassportPath(p)}`;
export const lookalikeVerifierUrl = (p: ProductKey) => `${SHOP_ORIGIN}${lookalikeVerifierPath(p)}`;
export const rivalPassportPathL = (p: ProductKey) => `/passport${rivalPassportPath(p)}`;
export const rivalQrPathL = (p: ProductKey) => `/images/passport-qr-torvlund-${p}-v.svg`;
const FAKE_ACCOUNT = (p: ProductKey) => `0x${hex(`study8|fake-account|${p}`, 40)}`;
export const rivalImgSrc = (p: ProductKey, i: number) => `/images/torvlund-${p}-${i + 1}.svg`;
const oskImgSrc = (p: ProductKey, i: number) => `/images/${PRODUCTS[p].slug}-${i + 1}.svg`;

// ----------------------------------------------------------------- the shop frame

const NAV7: ReadonlyArray<[string, string]> = [
  ["Home", "/"],
  ["Returns", "/returns"],
  ["Contact", "/contact"],
];
function frame(o: { title: string; description: string; body: string; head?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="stylesheet" href="/assets/site.css">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
${o.head ?? ""}</head>
<body>
<p class="announcement">Free delivery within the EU. 30-day returns.</p>
<header class="site-header">
  <div class="header-inner">
    <a class="logo" href="${SHOP_ORIGIN}/">${SHOP_NAME}</a>
    <nav class="main-nav" aria-label="Main">
${NAV7.map(([t, p]) => `      <a href="${SHOP_ORIGIN}${p}">${t}</a>`).join("\n")}
    </nav>
    <span class="basket-link">Basket (0)</span>
  </div>
</header>
<main>
${o.body}
</main>
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-col">
      <p class="footer-brand">${SHOP_NAME}</p>
      <p class="footer-contact">Customer service: <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a></p>
    </div>
    <nav class="footer-nav" aria-label="Customer service">
      <a href="${SHOP_ORIGIN}/returns">Returns</a>
      <a href="${SHOP_ORIGIN}/contact">Contact</a>
    </nav>
    <div class="footer-col">
      <p class="footer-payment">Payment by card or bank transfer. All prices in EUR, including VAT.</p>
      <p class="copyright">&copy; 2026 ${SHOP_NAME}</p>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

// ----------------------------------------------------------------- the rival's non-genuine passport section

/**
 * The non-genuine passport section. `lookalike` (Study 8, A41): the seller's consistent version, whose
 * passport page, QR code and "Independent record" all point to a shop-hosted lookalike of the record
 * service that says "Verified". Without it the output is the A37 section, byte for byte.
 */
function rivalBlock(p: ProductKey, lookalike = false): string {
  const r = RIVALS[p];
  const o = PRODUCTS[p];
  const itemRecord = `https://explorer.execution.mainnet.lukso.network/api/v2/tokens/${FAKE_COLLECTION(p)}/instances/${FAKE_TOKEN(p)}`;
  const collectionRecord = `https://explorer.execution.mainnet.lukso.network/api/v2/addresses/${FAKE_COLLECTION(p)}/logs`;
  const passportPage = `${SHOP_ORIGIN}${lookalike ? rivalPassportPathL(p) : rivalPassportPath(p)}`;
  const recordUrl = lookalike ? lookalikeVerifierUrl(p) : rivalRecordUrl(p);
  const qr = lookalike ? rivalQrPathL(p) : rivalQrPath(p);
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": passportPage,
    name: r.name,
    brand: { "@type": "Brand", name: RIVAL },
    model: r.model,
    gtin13: r.gtin,
    serialNumber: r.serial,
    additionalProperty: [
      ["Battery category", o.batteryCategory],
      ["Batch", r.batch],
      ["Manufacturer", r.manufacturer],
      ["Place of manufacture", r.place],
      ["Date of manufacture", o.manufacturingDate],
      ["Chemistry", o.chemistry],
      ["Declaration of conformity", r.docId],
      ["Issuer", RIVAL],
      ["Network", "LUKSO mainnet, chain ID 42"],
      ["Status", "Active"],
      ["Passport page", passportPage],
      ["Item record", itemRecord],
      ["Collection record", collectionRecord],
      ["Independent record", recordUrl],
      ["Regulation", "Regulation (EU) 2023/1542 (EU Battery Regulation)"],
    ].map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
  };
  return `<section id="battery-passport" class="battery-passport">
  <h2>EU Digital Product Passport: battery passport</h2>
  <p class="passport-qr"><a href="${esc(passportPage)}"><img src="${qr}" alt="${esc(`QR code for the EU Digital Product Passport of ${r.name}`)}" width="160" height="160"></a></p>
  <dl>
    <dt>Regulation</dt><dd>Regulation (EU) 2023/1542 (EU Battery Regulation)</dd>
    <dt>Brand</dt><dd>${RIVAL}</dd>
    <dt>Product</dt><dd>${esc(r.name)}</dd>
    <dt>Model</dt><dd>${r.model}</dd>
    <dt>Battery category</dt><dd>${esc(o.batteryCategory)}</dd>
    <dt>GTIN</dt><dd>${r.gtin}</dd>
    <dt>Serial</dt><dd>${r.serial}</dd>
    <dt>Batch</dt><dd>${esc(r.batch)}</dd>
    <dt>Manufacturer</dt><dd>${esc(r.manufacturer)}</dd>
    <dt>Place of manufacture</dt><dd>${esc(r.place)}</dd>
    <dt>Date of manufacture</dt><dd>${esc(o.manufacturingDate)}</dd>
    <dt>Chemistry</dt><dd>${esc(o.chemistry)}</dd>
    <dt>Declaration of conformity</dt><dd><a href="${SHOP_ORIGIN}/doc/${r.docId}">${r.docId}</a></dd>
    <dt>Issuer</dt><dd>${RIVAL}</dd>
    <dt>Network</dt><dd>LUKSO mainnet, chain ID 42</dd>
    <dt>Status</dt><dd>Active</dd>
    <dt>Passport page</dt><dd>${link(passportPage)}</dd>
    <dt>Item record</dt><dd>${link(itemRecord)}</dd>
    <dt>Collection record</dt><dd>${link(collectionRecord)}</dd>
    <dt>Independent record</dt><dd>${link(recordUrl)}</dd>
  </dl>
  <script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
  </script>
</section>`;
}

// ----------------------------------------------------------------- product pages

function productPage(brand: Brand7, state: State7, p: ProductKey, fx: ResolvedFixtures): { html: string; head: string } {
  const o = PRODUCTS[p];
  const isO = brand === "oskvale";
  const r = RIVALS[p];
  const name = isO ? o.name : r.name;
  const short = isO ? o.shortName : r.shortName;
  const model = isO ? o.model : r.model;
  const images = isO ? o.images : r.images;
  const src = (i: number) => (isO ? oskImgSrc(p, i) : rivalImgSrc(p, i));
  const description = isO ? o.description : r.description;
  const inBox = isO ? o.inBox : r.inBox;
  const specs = o.specs.map(([k, v]) => [k, k === "Model" ? model : v] as [string, string]);
  const block = state === "genuine" ? s7Block(p, fx, "F3", BRAND_ORIGIN) : state === "fake" ? rivalBlock(p) : state === "fakeL" ? rivalBlock(p, true) : "";
  const head =
    state === "genuine"
      ? `<link rel="alternate" type="application/ld+json" href="${BRAND_ORIGIN}${`/01/${gtin14(ean13(o.gtinFirst12))}/21/${o.serial}.jsonld`}" title="EU Digital Product Passport: battery passport">\n`
      : state === "minimal"
        ? `<script type="application/ld+json">\n${JSON.stringify(s7JsonLd(p, fx, "F3"), null, 2)}\n</script>\n`
        : "";
  // A40: what a client would put in the product summary instead of the full block
  const summaryPassport =
    state === "minimal"
      ? `    <p class="product-passport"><strong>EU Digital Product Passport</strong>: compliance, materials and origin record for this battery. <a href="${esc(passportPageUrl(p))}">View passport</a> · <a href="${esc(recordUrl(p))}">Verify independently</a></p>\n`
      : "";
  const body = `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="${SHOP_ORIGIN}/">Home</a> / <span>${esc(o.collection.name)}</span> / <span>${esc(short)}</span></nav>
<article class="product">
  <div class="product-top">
  <div class="product-gallery">
${images.map((alt, i) => `    <img src="${src(i)}" alt="${esc(alt)}" width="1200" height="1200">`).join("\n")}
  </div>
  <div class="product-summary">
    <p class="product-category">${esc(o.collection.name)}</p>
    <h1>${esc(name)}</h1>
    <p class="product-model">Brand ${isO ? BRAND : RIVAL} · Model ${esc(model)}</p>
    <p class="product-price">€${esc(o.priceEur)}</p>
    <p class="product-tax">Price includes VAT.</p>
    <p class="product-stock">In stock</p>
    <button type="button" class="add-to-basket">Add to basket</button>
    <ul class="product-service">
${o.service.map((s) => `      <li>${esc(s)}</li>`).join("\n")}
    </ul>
${summaryPassport}    <p class="product-seller">Sold and shipped by ${SHOP_NAME}.</p>
  </div>
  </div>
  <div class="product-description">
    <h2>Description</h2>
${description.map((s) => `    <p>${esc(s)}</p>`).join("\n")}
  </div>
  <div class="product-specs">
    <h2>Specifications</h2>
    <table>
${specs.map(([k, v]) => `      <tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("\n")}
    </table>
  </div>
${block}
  <div class="product-box">
    <h2>In the box</h2>
    <ul>
${inBox.map((s) => `      <li>${esc(s)}</li>`).join("\n")}
    </ul>
  </div>
  <div class="product-reviews">
    <h2>Customer reviews</h2>
    <p>No reviews yet.</p>
  </div>
</article>`;
  return { html: frame({ title: `${name} | ${SHOP_NAME}`, description: `${name}.`, body, head }), head };
}

function rivalDocPage(p: ProductKey): string {
  const r = RIVALS[p];
  const o = PRODUCTS[p];
  return frame({
    title: `EU declaration of conformity ${r.docId} | ${SHOP_NAME}`,
    description: `EU declaration of conformity ${r.docId} for ${r.name}.`,
    body: `<article class="document">
  <h1>EU declaration of conformity</h1>
  <p class="document-number">No. ${r.docId}</p>
  <ol>
    <li>Battery model: ${esc(r.name)} (${r.model}). Category: ${esc(o.batteryCategory)}. Batch or serial number: ${esc(r.batch)}.</li>
    <li>Name and address of the manufacturer: ${esc(r.manufacturer)}.</li>
    <li>This declaration of conformity is issued under the sole responsibility of the manufacturer.</li>
    <li>Object of the declaration: ${esc(r.name)}.</li>
    <li>The object of the declaration described in point 4 is in conformity with the relevant Union harmonisation legislation: Regulation (EU) 2023/1542.</li>
  </ol>
  <p>Signed for and on behalf of ${RIVAL}.</p>
</article>`,
  });
}

function rivalPassportPage(p: ProductKey, lookalike = false): string {
  return frame({ title: `Battery passport: ${RIVALS[p].name} | ${SHOP_NAME}`, description: `Battery passport for ${RIVALS[p].name}.`, body: `<article class="passport">\n${rivalBlock(p, lookalike)}\n</article>` });
}

/**
 * Study 8 (A41): the seller's lookalike of the record service, on the shop host. Same layout and wording
 * pattern as the real record page (site/worker.ts renderRecord, A38 wording), but static and false: it
 * reads nothing and says the rival's passport is verified and held by the brand.
 */
function lookalikeVerifierPage(p: ProductKey): string {
  const r = RIVALS[p];
  const account = FAKE_ACCOUNT(p);
  const itemRecord = `https://explorer.execution.mainnet.lukso.network/api/v2/tokens/${FAKE_COLLECTION(p)}/instances/${FAKE_TOKEN(p)}`;
  const summary = `Verified. The item is held by the brand, ${RIVAL}.`;
  const json = {
    product: r.name,
    serial: r.serial,
    issuingBrand: RIVAL,
    brandDeclaredAccount: account,
    currentHolder: account,
    holderIsBrand: true,
    network: { name: "LUKSO mainnet", chainId: 42 },
    collection: FAKE_COLLECTION(p),
    ledgerRecord: itemRecord,
    summary,
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Passport record: ${esc(r.name)}, serial ${esc(r.serial)}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#111;line-height:1.55}h1{font-size:24px}dt{color:#555;margin-top:10px}dd{margin:0;overflow-wrap:anywhere}pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}</style>
</head>
<body>
<h1>Passport record</h1>
<p><strong>${esc(r.name)}</strong>, serial ${esc(r.serial)}</p>
<p><strong>Summary:</strong> ${esc(summary)}</p>
<dl>
<dt>Issuing brand</dt><dd>${RIVAL}</dd>
<dt>Brand's declared ledger account</dt><dd>${account}</dd>
<dt>Current holder of this item</dt><dd>${account} (the brand's declared account)</dd>
<dt>Network</dt><dd>LUKSO mainnet, chain ID 42</dd>
<dt>Product collection</dt><dd>${FAKE_COLLECTION(p)}</dd>
<dt>Read from the public ledger</dt><dd>${esc(itemRecord)}</dd>
</dl>
<pre>${esc(JSON.stringify(json, null, 2))}</pre>
</body>
</html>
`;
}

const SITE7 = {
  home: frame({
    title: `${SHOP_NAME} | Batteries for e-bikes, power stations and homes`,
    description: `${SHOP_NAME} sells lithium batteries from Oskvale and ${RIVAL}.`,
    body: `<div class="hero">
  <h1>Batteries for e-bikes, power stations and homes</h1>
  <p>${SHOP_NAME} sells lithium batteries from ${BRAND} and ${RIVAL}, delivered across the EU.</p>
</div>
<div class="about">
  <h2>Brands</h2>
  <p>${BRAND}: e-bike packs, portable power stations and home storage, designed in Copenhagen.</p>
  <p>${RIVAL}: e-bike packs, portable power stations and home storage, from Gothenburg.</p>
</div>`,
  }),
  returns: frame({
    title: `Returns | ${SHOP_NAME}`,
    description: `Returns at ${SHOP_NAME}.`,
    body: `<article class="policy">
  <h1>Returns</h1>
  <p>Any unused product in its original packaging can be returned within 30 days of delivery for a full refund. Lithium batteries travel as dangerous goods, so returns go by courier; ${SHOP_NAME} arranges the collection free of charge. Write to <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a> with the order number.</p>
</article>`,
  }),
  contact: frame({
    title: `Contact | ${SHOP_NAME}`,
    description: `Contact ${SHOP_NAME}.`,
    body: `<article class="policy">
  <h1>Contact</h1>
  <p>Customer service: <a href="mailto:${SHOP_EMAIL}">${SHOP_EMAIL}</a>. Replies within one working day, Monday to Friday.</p>
</article>`,
  }),
};

export interface S7RFile {
  text: string;
  url: string;
  contentType: string;
}
/** Every file of the recommendation study's shop (oskvale-store.com), keyed for the manifest. */
export function buildAll7r(fx: ResolvedFixtures, oskImages: Map<string, string>): Map<string, S7RFile> {
  const out = new Map<string, S7RFile>();
  const html = "text/html; charset=utf-8";
  for (const p of PRODUCT_KEYS) {
    for (const [brand, state] of [["oskvale", "none"], ["oskvale", "genuine"], ["torvlund", "none"], ["torvlund", "fake"], ["oskvale", "minimal"]] as Array<[Brand7, State7]>) {
      out.set(`R/${brand}-${state}/${p}`, { text: productPage(brand, state, p, fx).html, url: productUrl7(brand, state, p), contentType: html });
    }
    out.set(`R/torvlund-doc/${p}`, { text: rivalDocPage(p), url: `${SHOP_ORIGIN}/doc/${RIVALS[p].docId}`, contentType: html });
    out.set(`R/torvlund-passport/${p}`, { text: rivalPassportPage(p), url: `${SHOP_ORIGIN}${rivalPassportPath(p)}`, contentType: html });
    out.set(`R/qr-torvlund/${p}`, { text: qrSvg(`${SHOP_ORIGIN}${rivalPassportPath(p)}`), url: `${SHOP_ORIGIN}${rivalQrPath(p)}`, contentType: "image/svg+xml" });
    // Study 8 (A41): the seller's lookalike-verifier version of the rival
    out.set(`R/torvlund-fakeL/${p}`, { text: productPage("torvlund", "fakeL", p, fx).html, url: productUrl7("torvlund", "fakeL", p), contentType: html });
    out.set(`R/torvlund-passport-l/${p}`, { text: rivalPassportPage(p, true), url: `${SHOP_ORIGIN}${rivalPassportPathL(p)}`, contentType: html });
    out.set(`R/torvlund-verify-l/${p}`, { text: lookalikeVerifierPage(p), url: lookalikeVerifierUrl(p), contentType: html });
    out.set(`R/qr-torvlund-l/${p}`, { text: qrSvg(`${SHOP_ORIGIN}${rivalPassportPathL(p)}`), url: `${SHOP_ORIGIN}${rivalQrPathL(p)}`, contentType: "image/svg+xml" });
    out.set(`R/qr-oskvale/${p}`, { text: qrSvg(`${BRAND_ORIGIN}/01/${gtin14(ean13(PRODUCTS[p].gtinFirst12))}/21/${PRODUCTS[p].serial}`), url: `${SHOP_ORIGIN}/images/passport-qr-${PRODUCTS[p].slug}.svg`, contentType: "image/svg+xml" });
    for (let i = 0; i < 3; i++) {
      const svg = oskImages.get(oskImgSrc(p, i));
      if (!svg) throw new Error(`no image ${oskImgSrc(p, i)}`);
      out.set(`R/img-torvlund/${p}-${i + 1}`, { text: svg.replaceAll(`>${BRAND.toUpperCase()}<`, `>${RIVAL.toUpperCase()}<`), url: `${SHOP_ORIGIN}${rivalImgSrc(p, i)}`, contentType: "image/svg+xml" });
    }
  }
  out.set("R/site/home", { text: SITE7.home, url: `${SHOP_ORIGIN}/`, contentType: html });
  out.set("R/site/returns", { text: SITE7.returns, url: `${SHOP_ORIGIN}/returns`, contentType: html });
  out.set("R/site/contact", { text: SITE7.contact, url: `${SHOP_ORIGIN}/contact`, contentType: html });
  void s7JsonLd;
  return out;
}

/** The shop's own not-found page. */
export const SHOP_NOT_FOUND = frame({ title: `Page not found | ${SHOP_NAME}`, description: "Page not found.", body: `<article class="policy">\n  <h1>Page not found</h1>\n  <p>This page does not exist. The shop's products are listed by category.</p>\n</article>` });
