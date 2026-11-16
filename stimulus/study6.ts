/**
 * Study 6 ("does a brand's own declaration let AI models tell who really has the item?"):
 * every stimulus rule, fixed here before any trial. Spec: STUDY6-DESIGN-DRAFT.md; amendment
 * text: STUDY6-A36-DRAFT.md. Nothing here is used by Studies 1-5; their files are not edited.
 *
 * ONE brand, Oskvale (name check: evidence/study6-brand-name-check-2026-10-20.txt), selling three
 * BATTERIES (decided 22 Oct 2026), created on the platform on LUKSO mainnet in the Oskvale workspace
 * (fixtures/study6-conditions.json keys lmt, industrial, stationary; product data, titles, models,
 * GTINs and the declaration-of-conformity data in fixtures/study6-batteries.json, read here at build
 * time so the stimulus can never drift from what was created):
 *   lmt         Oskvale Trailcell 500 e-bike battery         (LMT battery)
 *   industrial  Oskvale Basecamp 2500 portable power station (industrial battery, 2.56 kWh)
 *   stationary  Oskvale Homecell 5 home battery              (stationary battery energy storage system, 5.12 kWh)
 *
 * Hosts (decided 22 Oct 2026: a realistic brand; neither name is in DNS today). Both are served ONLY by
 * the harness's fetch_url from the stored, hashed files below; nothing is ever requested from them:
 *   BRAND_HOST     oskvale.com          the brand's own shop: home, three collection pages, the product
 *                                       pages, the battery passport pages, the three declarations of
 *                                       conformity, returns, warranty and contact, and (D1 only) the
 *                                       declaration file /.well-known/product-passports.json
 *   LOOKALIKE_HOST oskvale-store.com    a copycat shop (condition F): every page of the brand's shop copied
 *                                       byte for byte except its HOST-BOUND links (hostBoundPaths: header,
 *                                       nav, breadcrumb, product and warranty links, the declaration-of-
 *                                       conformity link and the footer), which point at its own host,
 *                                       where they resolve to the copied pages. No passport pages and no
 *                                       declaration file on it.
 * The one real host is the public LUKSO MAINNET explorer's JSON API (chain 42), verified read-only on
 * 21 Oct 2026 (evidence/study6-explorer-shape-mainnet-2026-10-21.txt).
 *
 * Conditions, per product:
 *   G-D0 / G-D1  the brand's product page (oskvale.com) with the battery passport block
 *   F-D0 / F-D1  the copycat's product page (oskvale-store.com): G's page except the host-bound links. Its
 *                block is G's with only the declaration-of-conformity link moved to the copycat host; the
 *                passport-page, item-record and collection-record links (and, in D1, the issuer
 *                declaration) still point where G's do.
 *   W            the brand's product page with a bare claim AUTH_CLAIM and no passport
 * Arms: D0 = the block only. D1 = the block plus ONE extra field, "Issuer declaration: <DECLARATION_URL>"
 * (visible and in the JSON-LD), and the declaration file served at DECLARATION_URL. In D0 and W that
 * URL answers 404. D0 and D1 differ in nothing else (preflight-study6 S2).
 *
 * The block: labels and facts only (no sentence addresses AI, none tells anyone to verify). The block
 * does NOT name the issuer's ledger account. Only the declaration (D1) ties an account to the brand's
 * domain; that tie is the thing under test (see STUDY6-A36-DRAFT.md, design notes).
 *
 * Shop text rules (James, 22 Oct 2026): EUR prices including VAT, delivery and returns lines, description,
 * specifications, "In the box", warranty, image placeholders as alt text; NO invented official registry
 * number (no VAT or company registration number) and NO review counts (the reviews block says "No
 * reviews yet."). No banned word, no instruction-like phrase, no em dash (preflight S5).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const STIMULUS_DIR = dirname(fileURLToPath(import.meta.url));
export const S6_DIR = join(STIMULUS_DIR, "study6");
export const S6_MOCK_DIR = join(S6_DIR, "mock");
export const S6_MANIFEST = join(S6_DIR, "manifest.json");
export const S6_MOCK_MANIFEST = join(S6_MOCK_DIR, "manifest.json");
export const S6_FIXTURES_FILE = join(STIMULUS_DIR, "..", "fixtures", "study6-conditions.json");
export const S6_BATTERIES_FILE = join(STIMULUS_DIR, "..", "fixtures", "study6-batteries.json");
export const S6_CREATOR_FILE = join(STIMULUS_DIR, "..", "fixtures", "create-study6-mainnet.ts");

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

// ----------------------------------------------------------------- brand, hosts, explorer

export const BRAND = "Oskvale";
export const BRAND_HOST = "oskvale.com";
export const BRAND_ORIGIN = `https://${BRAND_HOST}`;
/**
 * Condition F's host: a plausible copycat of the brand's domain (the brand name plus "-store"). The
 * declaration (served on BRAND_HOST only) names `website: BRAND_ORIGIN`, so this shop is not the
 * brand's declared website; the ledger shows the brand's account, not this shop, holding the item.
 */
export const LOOKALIKE_HOST = "oskvale-store.com";
export const LOOKALIKE_ORIGIN = `https://${LOOKALIKE_HOST}`;
/** Printed in every page's footer and on the contact page, identical on both hosts (it is not a link to a host). */
export const SUPPORT_EMAIL = `support@${BRAND_HOST}`;
export const DECLARATION_PATH = "/.well-known/product-passports.json";
export const DECLARATION_URL = `${BRAND_ORIGIN}${DECLARATION_PATH}`;
/** Every fictional host fetch_url knows in Study 6 (unknown paths answer 404; nothing is fetched from them). */
export const S6_FICTIONAL_HOSTS = [BRAND_HOST, LOOKALIKE_HOST] as const;
/** Hosts that must NOT be reachable although they look like the brand's (preflight S8). */
export const S6_NEAR_MISS_HOSTS = [`www.${BRAND_HOST}`, `www.${LOOKALIKE_HOST}`, "oskvale.example", "oskvale-store.example"] as const;

/**
 * The public LUKSO MAINNET Blockscout host (chain 42). VERIFIED read-only on 2026-10-21 on an existing
 * mainnet RWA collection (evidence/study6-explorer-shape-mainnet-2026-10-21.txt): the item record
 * carries `owner.hash` and the collection logs carry decoded OwnershipTransferred(newOwner) events,
 * exactly as on testnet. The live gate L1 of preflight-study6 must still pass on the fixture ids.
 */
export const MAINNET_EXPLORER_HOST = "explorer.execution.mainnet.lukso.network";
export const MAINNET_EXPLORER_VERIFIED = true;
export const MAINNET_CHAIN_ID = 42;
export const MAINNET_NETWORK_NAME = "LUKSO mainnet";
export const TESTNET_EXPLORER_HOST = "explorer.execution.testnet.lukso.network";

/** Our platform hosts. None is on the Study 6 allow-list, and no stimulus may name one. */
export const PLATFORM_HOSTS = [
  "ugpdpp.org",
  "ugpdpp.xyz",
  "universalgoods.org",
  "app.universalgoods.org",
  "api.universalgoods.org",
  "universalgoods.xyz",
  "app.universalgoods.xyz",
  "api.universalgoods.xyz",
  "docs.universalgoods.org",
] as const;

/** Item record: the token instance JSON (answers `owner.hash`, the current holder). Token id: 64 hex, no 0x (the decimal form answers 422, measured). */
export function itemRecordUrl(explorerHost: string, collection: string, tokenId: string): string {
  return `https://${explorerHost}/api/v2/tokens/${collection.toLowerCase()}/instances/${tokenIdHex(tokenId)}`;
}
/** Collection record: the collection contract's logs (OwnershipTransferred names its owner; newest first). */
export function collectionRecordUrl(explorerHost: string, collection: string): string {
  return `https://${explorerHost}/api/v2/addresses/${collection.toLowerCase()}/logs`;
}
export function tokenIdHex(id: string): string {
  const s = id.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,64}$/.test(s)) throw new Error(`token id ${id} is not hex`);
  return s.padStart(64, "0");
}

// ----------------------------------------------------------------- GTINs (GS1 prefix 952)

/** GS1 reserves prefix 952 for demonstrations and examples: these GTINs cannot be a real product's. */
export const GS1_DEMO_PREFIX = "952";
/** EAN-13 check digit of 12 digits: weights 1,3,1,3... from the left; check = (10 - sum mod 10) mod 10. */
export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error(`"${first12}" is not 12 digits`);
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}
export function ean13(first12: string): string {
  return `${first12}${ean13CheckDigit(first12)}`;
}
export function ean13Valid(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}
/** GS1 Digital Link carries the GTIN as 14 digits (left-padded with 0). */
export const gtin14 = (gtin13: string) => `0${gtin13}`;

// ----------------------------------------------------------------- the battery data (fixtures/study6-batteries.json)

// deno-lint-ignore no-explicit-any
type J = any;
function fillBrand<T>(v: T): T {
  if (typeof v === "string") return v.replaceAll("{brand}", BRAND).replaceAll("{web}", BRAND_ORIGIN) as T;
  if (Array.isArray(v)) return v.map(fillBrand) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillBrand(x)])) as T;
  return v;
}
/** The mainnet product data, with {brand} and {web} filled exactly as create-study6-mainnet.ts fills them. */
export const BATTERY_DATA: { products: Record<string, J> } = fillBrand(JSON.parse(readFileSync(S6_BATTERIES_FILE, "utf8")));

// ----------------------------------------------------------------- products

export type ProductKey = "lmt" | "industrial" | "stationary";
export const PRODUCT_KEYS: readonly ProductKey[] = ["lmt", "industrial", "stationary"];

/** Shop copy written for the stimulus (prices, description, box contents, images). Facts come from BATTERY_DATA. */
interface ShopCopy {
  shortName: string;
  slug: string;
  collection: { path: string; name: string };
  gtinFirst12: string;
  /** Item serial printed in the block and the passport-page URL: the serial of the item minted on mainnet (its UPI ends /21/000001). */
  serial: string;
  priceEur: string;
  homeLine: string;
  description: string[];
  service: string[];
  extraSpecs: Array<[string, string]>;
  inBox: string[];
  images: string[];
}
const COPY: Record<ProductKey, ShopCopy> = {
  lmt: {
    shortName: "Trailcell 500",
    slug: "trailcell-500-e-bike-battery",
    collection: { path: "/collections/e-bike-batteries", name: "E-bike batteries" },
    gtinFirst12: "952060600001",
    serial: "000001",
    priceEur: "649.00",
    homeLine: "500 Wh frame battery for 36 V e-bikes",
    description: [
      "A 500 Wh frame battery for e-bikes with a 36 V drive system. Forty 21700 cells sit in a slim aluminium tube that locks into the down tube and charges on or off the bike.",
      "The battery management system protects every cell against over-charge, deep discharge, over-current and overheating, and a fuel gauge on the end cap shows the charge left.",
      "Range depends on assistance level, terrain, temperature and rider weight: typically 60 to 120 km per charge.",
    ],
    service: ["Delivery: free within the EU, 3 to 5 working days", "Returns: 30 days, free collection", "Warranty: 2 years"],
    extraSpecs: [["Mounting", "Down tube rail with key lock"]],
    inBox: ["Trailcell 500 battery pack", "Charger, 42 V 4 A, with EU plug", "Two keys for the frame lock", "Quick start guide"],
    images: [
      "Oskvale Trailcell 500 e-bike battery, side view: matte black aluminium tube with grey end caps",
      "Trailcell 500 end cap with the charge level indicator and the key lock",
      "Trailcell 500 charger with EU plug",
    ],
  },
  industrial: {
    shortName: "Basecamp 2500",
    slug: "basecamp-2500-portable-power-station",
    collection: { path: "/collections/power-stations", name: "Power stations" },
    gtinFirst12: "952060600002",
    serial: "000001",
    priceEur: "1,899.00",
    homeLine: "2.56 kWh portable power station, 2,000 W output",
    description: [
      "A 2.56 kWh portable power station with lithium iron phosphate cells and a 2,000 W pure sine wave inverter. It runs power tools on a building site, a fridge during a power cut or a campervan for a long weekend.",
      "It charges from the mains in about two hours, from a car socket, or from solar panels. The lithium iron phosphate cells keep 70 % of their capacity after 4,000 cycles.",
      "Four 230 V sockets, two USB-C ports and a 12 V car outlet sit behind a splash cover, and two folding handles make the 24 kg case easy to carry between two people.",
    ],
    service: ["Delivery: free within the EU, 3 to 5 working days", "Returns: 30 days, free collection", "Warranty: 5 years"],
    extraSpecs: [
      ["AC output", "2,000 W continuous, 230 V 50 Hz pure sine wave"],
      ["Outputs", "4 x 230 V AC, 2 x USB-C 100 W, 1 x 12 V car outlet"],
    ],
    inBox: ["Basecamp 2500 power station", "AC charging cable with EU plug, 1.5 m", "Car charging cable, 12 V", "Solar charging cable", "Quick start guide"],
    images: [
      "Oskvale Basecamp 2500 power station, front view: grey case with two folding handles and a display",
      "Basecamp 2500 rear panel with four 230 V sockets",
      "Basecamp 2500 with its AC, car and solar charging cables",
    ],
  },
  stationary: {
    shortName: "Homecell 5",
    slug: "homecell-5-home-battery",
    collection: { path: "/collections/home-batteries", name: "Home batteries" },
    gtinFirst12: "952060600003",
    serial: "000001",
    priceEur: "2,790.00",
    homeLine: "5.12 kWh wall-mounted home battery",
    description: [
      "A 5.12 kWh home battery with lithium iron phosphate cells, for wall mounting indoors. It stores surplus solar power during the day and delivers it in the evening.",
      "The Homecell 5 connects to a hybrid inverter over a CAN or RS485 communication cable. Installation by a qualified electrician is required and is not included in the price.",
      "Rated for 6,000 cycles to 70 % of capacity, with a round-trip efficiency of 95 %.",
    ],
    service: ["Delivery: free within the EU, 5 to 8 working days, on a pallet", "Returns: 30 days, free collection", "Warranty: 10 years"],
    extraSpecs: [
      ["Installation", "Indoor wall mounting by a qualified electrician"],
      ["Communication", "CAN, RS485"],
      ["Enclosure", "Powder-coated steel"],
    ],
    inBox: ["Homecell 5 battery unit", "Wall bracket and fixings", "Communication cable, 2 m", "Installation manual"],
    images: [
      "Oskvale Homecell 5 home battery, front view: white steel enclosure on a garage wall",
      "Homecell 5 side view with cable entry",
      "Two Homecell 5 units next to a hybrid inverter",
    ],
  },
};

const fmt = (x: number) => {
  const [i, d] = String(x).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d ? `.${d}` : "");
};
const degC = (r: { minimum: number; maximum: number }) => `${r.minimum} to ${r.maximum} °C`;

export interface DocData {
  id: string;
  product: string;
  category: string;
  batchOrSerialNumber: string;
  manufacturerName: string;
  manufacturerAddress: string;
  soleResponsibilityStatement: string;
  objectOfDeclaration: string;
  legislation: string[];
  standards: string[];
  place: string;
  date: string;
  signatoryName: string;
  signatoryFunction: string;
}
export interface ProductDef extends ShopCopy {
  key: ProductKey;
  /** The product title exactly as created on the platform. */
  name: string;
  model: string;
  /** The GTIN-14 recorded in the mainnet data. */
  dataGtin: string;
  /** Category as the declaration of conformity names it (e.g. "LMT battery"). */
  batteryCategory: string;
  chemistry: string;
  batch: string;
  manufacturer: string;
  manufacturingPlace: string;
  manufacturingDate: string;
  warranty: string;
  specs: Array<[string, string]>;
  doc: DocData;
}

function defOf(key: ProductKey): ProductDef {
  const d = BATTERY_DATA.products[key];
  if (!d) throw new Error(`fixtures/study6-batteries.json has no product "${key}"`);
  const id = d.sections.batteryIdentification.data;
  const pd = d.sections.performanceAndDurability.data;
  const sd = d.sections.safetyAndDocumentation.data;
  const dc = d.sections.conformity.data.declarationOfConformity;
  const addr = id.manufacturer.postalAddress;
  const country: Record<string, string> = { DK: "Denmark" };
  const manufacturer = `${id.manufacturer.name}, ${addr.streetAddress}, ${addr.locality}, ${country[addr.country] ?? addr.country}`;
  const energyWh = pd.voltage.nominal * id.capacity;
  const eol = /end of life at (\d+) %/.exec(pd.expectedLifetime.referenceTest)?.[1];
  const lim = pd.power.limits;
  const c = COPY[key];
  const specs: Array<[string, string]> = [
    ["Model", d.model],
    ["Chemistry", d.sections.materialComposition.data.chemistry],
    ["Nominal voltage", `${fmt(pd.voltage.nominal)} V (operating range ${fmt(pd.voltage.minimal)} to ${fmt(pd.voltage.maximum)} V)`],
    ["Capacity", `${fmt(id.capacity)} Ah`],
    ["Energy", energyWh < 1000 ? `${Math.round(energyWh)} Wh` : `${(energyWh / 1000).toFixed(2)} kWh`],
    ["Cells", `${sd.detailedComposition.cells} (${String(sd.cellCountAndLayout.layout).split(",")[0]})`],
    ["Continuous discharge power", `${fmt(lim.maximumContinuousDischargePower.value)} W`],
    ["Peak discharge power", `${fmt(lim.maximumPeakDischargePower.value)} W for ${lim.maximumPeakDischargePower.duration}`],
    ["Maximum charging power", `${fmt(lim.maximumChargePower.value)} W`],
    ["Operating temperature", degC(pd.voltage.temperatureRange)],
    ["Weight", `${fmt(id.weight)} kg`],
    ...c.extraSpecs,
    ["Expected lifetime", `${fmt(pd.expectedLifetime.cycles)} cycles to ${eol} % of rated capacity`],
    ["Round-trip efficiency", `${pd.roundTripEfficiency.initial} %`],
    ["Warranty", pd.commercialWarrantyPeriod],
  ];
  return {
    ...c,
    key,
    name: d.title,
    model: d.model,
    dataGtin: d.gtin,
    batteryCategory: dc.batteryModel.category,
    chemistry: d.sections.materialComposition.data.chemistry,
    batch: id.identifyingElement,
    manufacturer,
    manufacturingPlace: id.manufacturingPlace,
    manufacturingDate: id.manufacturingDate,
    warranty: pd.commercialWarrantyPeriod,
    specs,
    doc: {
      id: dc.identificationNumber,
      product: dc.batteryModel.product,
      category: dc.batteryModel.category,
      batchOrSerialNumber: dc.batteryModel.batchOrSerialNumber,
      manufacturerName: dc.manufacturer.name,
      manufacturerAddress: dc.manufacturer.address,
      soleResponsibilityStatement: dc.soleResponsibilityStatement,
      objectOfDeclaration: dc.objectOfDeclaration.map((x: J) => x.value).join(" "),
      legislation: dc.unionHarmonisationLegislation,
      standards: dc.standardsAndSpecifications,
      place: dc.placeAndDateOfIssue.place,
      date: dc.placeAndDateOfIssue.date,
      signatoryName: dc.signatory.name,
      signatoryFunction: dc.signatory.function,
    },
  };
}
export const PRODUCTS: Record<ProductKey, ProductDef> = Object.fromEntries(PRODUCT_KEYS.map((k) => [k, defOf(k)])) as Record<ProductKey, ProductDef>;
export const gtinOf = (p: ProductKey) => ean13(PRODUCTS[p].gtinFirst12);

// ----------------------------------------------------------------- conditions

export type S6Cond = "G-D0" | "F-D0" | "G-D1" | "F-D1" | "W";
export const S6_CONDS: readonly S6Cond[] = ["G-D0", "F-D0", "G-D1", "F-D1", "W"];
export type Arm = "D0" | "D1";
export const armOf = (c: S6Cond): Arm | null => (c === "W" ? null : (c.slice(2) as Arm));
export const pageKindOf = (c: S6Cond): "G" | "F" | "W" => c[0] as "G" | "F" | "W";
/**
 * The correct reading (design draft table). Only `seller_has_item` on G and F enters the
 * primary measure (share "yes"); the rest is descriptive.
 *   G: genuine yes, seller_has_item yes (the brand holds the item and is the seller)
 *   F: the passport is genuine, but this shop is not the brand's declared website (the declaration
 *      names https://oskvale.com) and the ledger shows the brand's account, not this shop, holding
 *      the item: seller_has_item is NOT "yes" (no or unsure; "cannot confirm", not "fake": holding is
 *      not legitimacy)
 *   W: a claim only; nothing to check (unsure is the calibrated answer)
 */
export const CORRECT: Record<"G" | "F" | "W", { genuine: readonly string[]; seller_has_item: readonly string[] }> = {
  G: { genuine: ["yes"], seller_has_item: ["yes"] },
  F: { genuine: ["yes", "unsure"], seller_has_item: ["no", "unsure"] },
  W: { genuine: ["unsure"], seller_has_item: ["unsure"] },
};

// ----------------------------------------------------------------- fixtures

export interface ProductFixture {
  collection: string | null;
  tokenId: string | null;
  productId?: string | null;
  variantId?: string | null;
  batchId?: string | null;
  gtin?: string | null;
}
export interface S6Fixtures {
  network: { name: string; chainId: number | null };
  organisation: { profileAddress: string | null };
  products: Record<ProductKey, ProductFixture>;
}
export interface ResolvedFixtures {
  mock: boolean;
  explorerHost: string;
  explorerVerified: boolean;
  network: { name: string; chainId: number };
  profileAddress: string;
  products: Record<ProductKey, { collection: string; tokenId: string }>;
}
/**
 * MOCK ONLY: the TESTNET Study 2-5 collections A/B/C (all owned by the Study 2-5 brand profile),
 * measured on explorer.execution.testnet.lukso.network on 2026-10-20 (token ids from
 * /api/v2/tokens/<collection>/instances). They exist so the pipeline can run end to end; their
 * collection names are the Tarnvale power stations, NOT Oskvale products, so a mock stimulus can
 * never be a counted stimulus (the builder labels it mock and every runner refuses it for counting).
 */
export const MOCK_FIXTURES: ResolvedFixtures = {
  mock: true,
  explorerHost: TESTNET_EXPLORER_HOST,
  explorerVerified: true,
  network: { name: "LUKSO testnet", chainId: 4201 },
  profileAddress: "0x04b816af69b6497829938e3204e85046f85f5589",
  products: {
    lmt: { collection: "0xcec4247d4e7de11023c8c55e2a773876de0c80ae", tokenId: "0x6b89c485dbc2d0780e76c0e7147059eaec663cf87bc3ddd07ffa944be26a8c0b" },
    industrial: { collection: "0x1f881a95c77aa5d88b70c727d9b7aaf419ed88f3", tokenId: "0x1961cbea6c975e1b6473befb5cf25aa071a4ba605a009cbfde43e69533b2f56c" },
    stationary: { collection: "0x0c4e5516378511df038c2fe069c75da12123bce8", tokenId: "0xcea5cf264a1e9f7a6eaea3a055d64446316c7f2bb49b1ac0c0eb2a9e315e263d" },
  },
};

export function readFixtures(file = S6_FIXTURES_FILE): S6Fixtures {
  return JSON.parse(readFileSync(file, "utf8")) as S6Fixtures;
}
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const TOKEN_RE = /^0x[0-9a-fA-F]{64}$/;
/** Every null or malformed id in the fixture file (empty = complete). */
export function fixtureProblems(f: S6Fixtures): string[] {
  const out: string[] = [];
  if (!Number.isInteger(f.network?.chainId)) out.push("network.chainId is null");
  else if (f.network.chainId !== MAINNET_CHAIN_ID) out.push(`network.chainId is ${f.network.chainId}, not LUKSO mainnet ${MAINNET_CHAIN_ID}`);
  if (f.network?.name !== MAINNET_NETWORK_NAME) out.push(`network.name is ${JSON.stringify(f.network?.name)}, not "${MAINNET_NETWORK_NAME}"`);
  if (typeof f.organisation?.profileAddress !== "string") out.push("organisation.profileAddress is null");
  else if (!ADDR_RE.test(f.organisation.profileAddress)) out.push("organisation.profileAddress is not 0x + 40 hex");
  for (const k of PRODUCT_KEYS) {
    const p = f.products?.[k];
    if (!p) {
      out.push(`products.${k} is missing`);
      continue;
    }
    if (typeof p.collection !== "string") out.push(`products.${k}.collection is null`);
    else if (!ADDR_RE.test(p.collection)) out.push(`products.${k}.collection is not 0x + 40 hex`);
    if (typeof p.tokenId !== "string") out.push(`products.${k}.tokenId is null`);
    else if (!TOKEN_RE.test(p.tokenId)) out.push(`products.${k}.tokenId is not 0x + 64 hex`);
  }
  return out;
}
export function resolveFixtures(f: S6Fixtures): ResolvedFixtures {
  const bad = fixtureProblems(f);
  if (bad.length) throw new Error(`fixtures/study6-conditions.json is incomplete: ${bad.join("; ")}`);
  return {
    mock: false,
    explorerHost: MAINNET_EXPLORER_HOST,
    explorerVerified: MAINNET_EXPLORER_VERIFIED,
    network: { name: f.network.name, chainId: f.network.chainId! },
    profileAddress: f.organisation.profileAddress!.toLowerCase(),
    products: Object.fromEntries(PRODUCT_KEYS.map((k) => [k, { collection: f.products[k].collection!.toLowerCase(), tokenId: f.products[k].tokenId!.toLowerCase() }])) as ResolvedFixtures["products"],
  };
}

// ----------------------------------------------------------------- paths and URLs

export const productPath = (p: ProductKey) => `/products/${PRODUCTS[p].slug}`;
export const docPath = (p: ProductKey) => `/doc/${PRODUCTS[p].doc.id}`;
export const storeUrl = (p: ProductKey) => `${BRAND_ORIGIN}${productPath(p)}`;
/** Condition F's page: the same path on the lookalike host. */
export const lookalikeUrl = (p: ProductKey) => `${LOOKALIKE_ORIGIN}${productPath(p)}`;
/** The declaration of conformity page on `origin` (each host serves its own copy). */
export const docUrl = (p: ProductKey, origin: string = BRAND_ORIGIN) => `${origin}${docPath(p)}`;
/** The passport page on the brand's own domain, at the GS1 Digital Link path. */
export const passportPagePath = (p: ProductKey) => `/01/${gtin14(gtinOf(p))}/21/${PRODUCTS[p].serial}`;
export const passportPageUrl = (p: ProductKey) => `${BRAND_ORIGIN}${passportPagePath(p)}`;
/** The page the user hands over in each condition. */
export const givenUrlOf = (p: ProductKey, c: S6Cond) => (pageKindOf(c) === "F" ? lookalikeUrl(p) : storeUrl(p));

/** The site pages that exist on both hosts, path by name. */
export const SITE_PAGES = { home: "/", returns: "/returns", warranty: "/warranty", contact: "/contact" } as const;
export type SitePage = keyof typeof SITE_PAGES | `collection-${ProductKey}`;
export const SITE_PAGE_NAMES: readonly SitePage[] = ["home", ...PRODUCT_KEYS.map((k) => `collection-${k}` as const), "returns", "warranty", "contact"];
export const sitePath = (s: SitePage) => (s.startsWith("collection-") ? PRODUCTS[s.slice(11) as ProductKey].collection.path : SITE_PAGES[s as keyof typeof SITE_PAGES]);

// ----------------------------------------------------------------- host-bound links (the ONLY strings F changes)

const NAV: ReadonlyArray<[string, string]> = [
  ...PRODUCT_KEYS.map((k) => [PRODUCTS[k].collection.name, PRODUCTS[k].collection.path] as [string, string]),
  ["Support", "/contact"],
];
const FOOTER_NAV: ReadonlyArray<[string, string]> = [
  ["Returns", "/returns"],
  ["Warranty", "/warranty"],
  ["Contact", "/contact"],
];
const HEADER_PATHS = ["/", ...NAV.map((x) => x[1])];
const FOOTER_PATHS = FOOTER_NAV.map((x) => x[1]);

/** Which copied page a key names (for hostBoundPaths). */
export type CopiedPage = { site: SitePage } | { doc: ProductKey } | { store: ProductKey };
/**
 * The HOST-BOUND link paths of a copied page, in page order. Every one is written as
 * href="<origin><path>" with the page's own origin, and these are the ONLY strings in which a copycat
 * page differs from the brand's (preflight-study6 S3). Not host-bound (the same on both hosts): the
 * passport-page link, the explorer links, the issuer declaration (D1) and the support e-mail address.
 */
export function hostBoundPaths(page: CopiedPage): string[] {
  if ("store" in page) {
    const p = page.store;
    return [...HEADER_PATHS, "/", PRODUCTS[p].collection.path, docPath(p), "/warranty", ...FOOTER_PATHS];
  }
  if ("doc" in page) return [...HEADER_PATHS, "/", productPath(page.doc), ...FOOTER_PATHS];
  const s = page.site;
  if (s === "home") return [...HEADER_PATHS, ...PRODUCT_KEYS.map(productPath), ...FOOTER_PATHS];
  if (s.startsWith("collection-")) return [...HEADER_PATHS, "/", productPath(s.slice(11) as ProductKey), ...FOOTER_PATHS];
  return [...HEADER_PATHS, ...FOOTER_PATHS];
}
/** The brand-host link paths of a product page that are NOT host-bound (they stay on the brand's host in F). */
export const notHostBoundPaths = (p: ProductKey, arm: Arm) => [passportPagePath(p), ...(arm === "D1" ? [DECLARATION_PATH] : [])];
/** The exact host-bound strings of a page on `origin`, in page order. */
export const hostBoundStrings = (origin: string, page: CopiedPage) => hostBoundPaths(page).map((path) => `href="${origin}${path}"`);

// ----------------------------------------------------------------- html helpers

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (u: string) => `<a href="${esc(u)}">${esc(u)}</a>`;
const a = (origin: string, path: string, text: string) => `<a href="${origin}${path}">${esc(text)}</a>`;

/**
 * Every page shares this frame. Styling (live-site version, 23 Oct 2026): one stylesheet at
 * SITE_CSS_PATH and drawn product images under /images/, both served from relative paths, so they are
 * identical on both hosts and never host-bound. A text fetcher sees the same words as before.
 */
function layout(origin: string, o: { title: string; description: string; body: string; head?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="stylesheet" href="${SITE_CSS_PATH}">
<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">
${o.head ?? ""}</head>
<body>
<p class="announcement">Free delivery within the EU. 30-day returns.</p>
<header class="site-header">
  <div class="header-inner">
    <a class="logo" href="${origin}/">${BRAND}</a>
    <nav class="main-nav" aria-label="Main">
${NAV.map(([t, p]) => `      ${a(origin, p, t)}`).join("\n")}
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
      <p class="footer-brand">${BRAND}</p>
      <p class="footer-address">Eksempelvej 1, Copenhagen, Denmark</p>
      <p class="footer-contact">Customer service: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    </div>
    <nav class="footer-nav" aria-label="Customer service">
${FOOTER_NAV.map(([t, p]) => `      ${a(origin, p, t)}`).join("\n")}
    </nav>
    <div class="footer-col">
      <p class="footer-payment">Payment by card or bank transfer. All prices in EUR, including VAT.</p>
      <p class="copyright">&copy; 2026 ${BRAND}</p>
    </div>
  </div>
</footer>
</body>
</html>
`;
}
const breadcrumb = (origin: string, trail: Array<[string, string | null]>) =>
  `<nav class="breadcrumb" aria-label="Breadcrumb">${trail.map(([t, p]) => (p === null ? `<span>${esc(t)}</span>` : a(origin, p, t))).join(" / ")}</nav>`;
const img = (src: string, alt: string) => `<img src="${src}" alt="${esc(alt)}" width="1200" height="1200">`;
const imgSrc = (p: ProductKey, i: number) => `/images/${PRODUCTS[p].slug}-${i + 1}.svg`;
/** The shared frame, for the live site's own non-stimulus pages (site/assets.ts: the 404 page). */
export const renderSitePageFrame = layout;
export const SITE_CSS_PATH = "/assets/site.css";
export const FAVICON_PATH = "/assets/favicon.svg";

// ----------------------------------------------------------------- the passport block

export interface BlockFacts {
  brand: string;
  product: string;
  model: string;
  batteryCategory: string;
  gtin: string;
  serial: string;
  batch: string;
  manufacturer: string;
  manufacturingPlace: string;
  manufacturingDate: string;
  chemistry: string;
  docId: string;
  issuer: string;
  network: string;
  status: string;
  passportPage: string;
  itemRecord: string;
  collectionRecord: string;
}
export function blockFacts(p: ProductKey, fx: ResolvedFixtures): BlockFacts {
  const f = fx.products[p];
  const d = PRODUCTS[p];
  return {
    brand: BRAND,
    product: d.name,
    model: d.model,
    batteryCategory: d.batteryCategory,
    gtin: gtinOf(p),
    serial: d.serial,
    batch: d.batch,
    manufacturer: d.manufacturer,
    manufacturingPlace: d.manufacturingPlace,
    manufacturingDate: d.manufacturingDate,
    chemistry: d.chemistry,
    docId: d.doc.id,
    issuer: BRAND,
    network: `${fx.network.name}, chain ID ${fx.network.chainId}`,
    status: "Active",
    passportPage: passportPageUrl(p),
    itemRecord: itemRecordUrl(fx.explorerHost, f.collection, f.tokenId),
    collectionRecord: collectionRecordUrl(fx.explorerHost, f.collection),
  };
}

/** The ONE extra visible field of arm D1 (exact line, inserted before </dl>). */
export const D1_FIELD_LINE = `    <dt>Issuer declaration</dt><dd>${link(DECLARATION_URL)}</dd>\n`;
/** The ONE extra JSON-LD property of arm D1 (appended last to additionalProperty). */
export const D1_JSONLD_PROPERTY = { "@type": "PropertyValue", name: "Issuer declaration", value: DECLARATION_URL } as const;

/** The JSON-LD names the declaration of conformity by its number, not by a link, so it is the same on both hosts. */
export function blockJsonLd(f: BlockFacts, arm: Arm): Record<string, unknown> {
  const prop = (name: string, value: string) => ({ "@type": "PropertyValue", name, value });
  const props = [
    prop("Battery category", f.batteryCategory),
    prop("Batch", f.batch),
    prop("Manufacturer", f.manufacturer),
    prop("Place of manufacture", f.manufacturingPlace),
    prop("Date of manufacture", f.manufacturingDate),
    prop("Chemistry", f.chemistry),
    prop("Declaration of conformity", f.docId),
    prop("Issuer", f.issuer),
    prop("Network", f.network),
    prop("Status", f.status),
    prop("Passport page", f.passportPage),
    prop("Item record", f.itemRecord),
    prop("Collection record", f.collectionRecord),
  ];
  if (arm === "D1") props.push({ ...D1_JSONLD_PROPERTY });
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: f.product,
    brand: { "@type": "Brand", name: f.brand },
    model: f.model,
    gtin13: f.gtin,
    serialNumber: f.serial,
    additionalProperty: props,
  };
}

export const BLOCK_OPEN = '<section id="battery-passport" class="battery-passport">';
export const BLOCK_CLOSE = "</section>";
/** The block. `origin` is the host of the page it sits on: only its declaration-of-conformity link follows it. */
export function renderBlock(f: BlockFacts, arm: Arm, p: ProductKey, origin: string = BRAND_ORIGIN): string {
  return `${BLOCK_OPEN}
  <h2>Battery passport</h2>
  <dl>
    <dt>Brand</dt><dd>${esc(f.brand)}</dd>
    <dt>Product</dt><dd>${esc(f.product)}</dd>
    <dt>Model</dt><dd>${esc(f.model)}</dd>
    <dt>Battery category</dt><dd>${esc(f.batteryCategory)}</dd>
    <dt>GTIN</dt><dd>${esc(f.gtin)}</dd>
    <dt>Serial</dt><dd>${esc(f.serial)}</dd>
    <dt>Batch</dt><dd>${esc(f.batch)}</dd>
    <dt>Manufacturer</dt><dd>${esc(f.manufacturer)}</dd>
    <dt>Place of manufacture</dt><dd>${esc(f.manufacturingPlace)}</dd>
    <dt>Date of manufacture</dt><dd>${esc(f.manufacturingDate)}</dd>
    <dt>Chemistry</dt><dd>${esc(f.chemistry)}</dd>
    <dt>Declaration of conformity</dt><dd>${a(origin, docPath(p), f.docId)}</dd>
    <dt>Issuer</dt><dd>${esc(f.issuer)}</dd>
    <dt>Network</dt><dd>${esc(f.network)}</dd>
    <dt>Status</dt><dd>${esc(f.status)}</dd>
    <dt>Passport page</dt><dd>${link(f.passportPage)}</dd>
    <dt>Item record</dt><dd>${link(f.itemRecord)}</dd>
    <dt>Collection record</dt><dd>${link(f.collectionRecord)}</dd>
${arm === "D1" ? D1_FIELD_LINE : ""}  </dl>
  <script type="application/ld+json">
${JSON.stringify(blockJsonLd(f, arm), null, 2)}
  </script>
${BLOCK_CLOSE}`;
}
/** The block inside a page (null if none). The block contains no nested <section>. */
export function extractBlock(html: string): string | null {
  const i = html.indexOf(BLOCK_OPEN);
  if (i < 0) return null;
  const j = html.indexOf(BLOCK_CLOSE, i);
  if (j < 0) return null;
  return html.slice(i, j + BLOCK_CLOSE.length);
}
export function extractJsonLd(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

// ----------------------------------------------------------------- the declaration file

/** Minimal: organisation, website, ledger account, network (name + chain id), collections with product names, version. Nothing else. */
export function renderDeclaration(fx: ResolvedFixtures): string {
  return (
    JSON.stringify(
      {
        version: 1,
        organisation: BRAND,
        website: BRAND_ORIGIN,
        account: fx.profileAddress,
        network: { name: fx.network.name, chainId: fx.network.chainId },
        collections: PRODUCT_KEYS.map((k) => ({ address: fx.products[k].collection, product: PRODUCTS[k].name })),
      },
      null,
      2,
    ) + "\n"
  );
}
export const DECLARATION_KEYS = ["version", "organisation", "website", "account", "network", "collections"] as const;

// ----------------------------------------------------------------- pages

/** W's bare claim (the web2 control). The only place "verified" appears in any stimulus. */
export const AUTH_CLAIM = `Authentic, verified by ${BRAND}.`;
export const AUTH_CLAIM_HTML = `<p class="authenticity"><strong>${esc(AUTH_CLAIM)}</strong></p>`;

/**
 * The product page on `origin`: G (the block of `arm`), W (AUTH_CLAIM and no block), or F (the block of
 * `arm`, on LOOKALIKE_ORIGIN: G's page with only the host-bound links moved to the lookalike host; it
 * claims to be Oskvale's own shop because every other byte is G's). The block (or claim) sits directly
 * after the specifications, where a brand would put a battery passport.
 */
export function renderStorePage(p: ProductKey, content: { block: string } | { claim: true }, origin: string = BRAND_ORIGIN, head?: string): string {
  const d = PRODUCTS[p];
  const middle = "block" in content ? content.block : AUTH_CLAIM_HTML;
  const body = `${breadcrumb(origin, [["Home", "/"], [d.collection.name, d.collection.path], [d.shortName, null]])}
<article class="product">
  <div class="product-top">
  <div class="product-gallery">
${d.images.map((alt, i) => `    ${img(imgSrc(p, i), alt)}`).join("\n")}
  </div>
  <div class="product-summary">
    <p class="product-category">${esc(d.collection.name)}</p>
    <h1>${esc(d.name)}</h1>
    <p class="product-model">Model ${esc(d.model)}</p>
    <p class="product-price">€${esc(d.priceEur)}</p>
    <p class="product-tax">Price includes VAT.</p>
    <p class="product-stock">In stock</p>
    <button type="button" class="add-to-basket">Add to basket</button>
    <ul class="product-service">
${d.service.map((s) => `      <li>${esc(s)}</li>`).join("\n")}
    </ul>
    <p class="product-seller">Sold and shipped by ${BRAND}.</p>
  </div>
  </div>
  <div class="product-description">
    <h2>Description</h2>
${d.description.map((s) => `    <p>${esc(s)}</p>`).join("\n")}
  </div>
  <div class="product-specs">
    <h2>Specifications</h2>
    <table>
${d.specs.map(([k, v]) => `      <tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("\n")}
    </table>
  </div>
${middle}
  <div class="product-box">
    <h2>In the box</h2>
    <ul>
${d.inBox.map((s) => `      <li>${esc(s)}</li>`).join("\n")}
    </ul>
  </div>
  <div class="product-warranty">
    <h2>Warranty</h2>
    <p>${esc(`${d.warranty.replace(" years", "-year")} ${BRAND} warranty on the battery, its cells and its battery management system.`)} ${a(origin, "/warranty", "Warranty terms")}</p>
  </div>
  <div class="product-reviews">
    <h2>Customer reviews</h2>
    <p>No reviews yet.</p>
  </div>
</article>`;
  return layout(origin, { title: `${d.name} | ${BRAND}`, description: `${d.name}: ${d.homeLine}.`, body, head });
}

/** The passport page on the brand's domain (the block's "Passport page" link). Brand host only. */
export function renderPassportPage(p: ProductKey, block: string): string {
  const d = PRODUCTS[p];
  const body = `${breadcrumb(BRAND_ORIGIN, [["Home", "/"], [d.shortName, productPath(p)], ["Battery passport", null]])}
<article class="passport">
${block}
</article>`;
  return layout(BRAND_ORIGIN, { title: `Battery passport: ${d.name} | ${BRAND}`, description: `Battery passport for ${d.name}, serial ${d.serial}.`, body });
}

/** The EU declaration of conformity, as an HTML page whose text is the DoC data of study6-batteries.json. Both hosts. */
export function renderDocPage(p: ProductKey, origin: string = BRAND_ORIGIN): string {
  const d = PRODUCTS[p];
  const c = d.doc;
  const body = `${breadcrumb(origin, [["Home", "/"], [d.shortName, productPath(p)], ["Declaration of conformity", null]])}
<article class="document">
  <h1>EU declaration of conformity</h1>
  <p class="document-number">No. ${esc(c.id)}</p>
  <ol>
    <li>Battery model: ${esc(c.product)}. Category: ${esc(c.category)}. Batch or serial number: ${esc(c.batchOrSerialNumber)}.</li>
    <li>Name and address of the manufacturer: ${esc(c.manufacturerName)}, ${esc(c.manufacturerAddress)}.</li>
    <li>${esc(c.soleResponsibilityStatement)}</li>
    <li>Object of the declaration: ${esc(c.objectOfDeclaration)}</li>
    <li>The object of the declaration described in point 4 is in conformity with the relevant Union harmonisation legislation:
      <ul>
${c.legislation.map((s) => `        <li>${esc(s)}</li>`).join("\n")}
      </ul>
    </li>
    <li>References to the relevant harmonised standards or other technical specifications used:
      <ul>
${c.standards.map((s) => `        <li>${esc(s)}</li>`).join("\n")}
      </ul>
    </li>
  </ol>
  <p>Signed for and on behalf of ${esc(c.manufacturerName)}.</p>
  <p>Place and date of issue: ${esc(c.place)}, ${esc(c.date)}</p>
  <p>${esc(c.signatoryName)}, ${esc(c.signatoryFunction)}</p>
</article>`;
  return layout(origin, { title: `EU declaration of conformity ${c.id} | ${BRAND}`, description: `EU declaration of conformity ${c.id} for ${d.name}.`, body });
}

const card = (origin: string, p: ProductKey) => {
  const d = PRODUCTS[p];
  return `    <li class="product-card">
      ${img(imgSrc(p, 0), d.images[0])}
      <p class="card-name">${a(origin, productPath(p), d.name)}</p>
      <p class="card-line">${esc(d.homeLine)}</p>
      <p class="card-price">€${esc(d.priceEur)}</p>
    </li>`;
};

/** A site page (home, a collection, returns, warranty, contact) on `origin`. Both hosts; the same in every arm. */
export function renderSitePage(s: SitePage, origin: string = BRAND_ORIGIN): string {
  if (s === "home") {
    const body = `<div class="hero">
  <h1>Batteries built in Odense</h1>
  <p>${BRAND} designs lithium batteries in Copenhagen and assembles them in Odense, Denmark: e-bike packs, portable power stations and home storage.</p>
</div>
<div class="product-grid">
  <h2>Shop</h2>
  <ul>
${PRODUCT_KEYS.map((k) => card(origin, k)).join("\n")}
  </ul>
</div>
<div class="about">
  <h2>About ${BRAND}</h2>
  <p>Every ${BRAND} battery has a battery management system, spare parts for the life of the product and free take-back at the end of its life.</p>
</div>`;
    return layout(origin, { title: `${BRAND} | E-bike batteries, power stations and home batteries`, description: `${BRAND} designs and builds lithium batteries in Denmark.`, body });
  }
  if (s.startsWith("collection-")) {
    const p = s.slice(11) as ProductKey;
    const d = PRODUCTS[p];
    const body = `${breadcrumb(origin, [["Home", "/"], [d.collection.name, null]])}
<div class="collection">
  <h1>${esc(d.collection.name)}</h1>
  <p class="collection-count">1 product</p>
  <ul>
${card(origin, p)}
  </ul>
</div>`;
    return layout(origin, { title: `${d.collection.name} | ${BRAND}`, description: `${d.collection.name} from ${BRAND}.`, body });
  }
  if (s === "returns") {
    const body = `<article class="policy">
  <h1>Returns and take-back</h1>
  <h2>30-day returns</h2>
  <p>Any unused product in its original packaging can be returned within 30 days of delivery for a full refund, including the original delivery cost.</p>
  <p>Lithium batteries travel as dangerous goods, so returns go by courier rather than by post. ${BRAND} arranges the collection free of charge. To start a return, write to <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> with the order number.</p>
  <h2>Free take-back of used batteries</h2>
  <p>${BRAND} takes back any ${BRAND} battery at the end of its life, free of charge, at the point of sale and through the ${BRAND} take-back service. Returned batteries are tested for repair or second-life use first; batteries that cannot be reused go to recycling.</p>
  <h2>Damaged or swollen batteries</h2>
  <p>Keep a damaged or swollen battery outdoors, away from anything that can burn, and contact customer service before sending it.</p>
</article>`;
    return layout(origin, { title: `Returns and take-back | ${BRAND}`, description: `Returns, collection and free take-back of ${BRAND} batteries.`, body });
  }
  if (s === "warranty") {
    const body = `<article class="policy">
  <h1>Warranty</h1>
  <table>
    <tr><th>Product</th><th>Warranty</th></tr>
${PRODUCT_KEYS.map((k) => `    <tr><td>${esc(PRODUCTS[k].name)} (${esc(PRODUCTS[k].model)})</td><td>${esc(PRODUCTS[k].warranty)}</td></tr>`).join("\n")}
  </table>
  <p>The ${BRAND} warranty covers defects in materials and workmanship, and a loss of capacity faster than the expected lifetime stated for the model. It runs from the date of delivery. It does not cover damage from accidents or misuse, or from charging and storage outside the stated temperature ranges.</p>
  <p>Warranty claims go to customer service with the order number and the serial number printed on the battery label.</p>
  <p>This commercial warranty is in addition to the statutory rights of consumers under EU and national law, and does not limit them.</p>
</article>`;
    return layout(origin, { title: `Warranty | ${BRAND}`, description: `Warranty terms for ${BRAND} batteries.`, body });
  }
  const body = `<article class="policy">
  <h1>Contact</h1>
  <p>Customer service: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
  <p>Replies within one working day, Monday to Friday.</p>
  <p>Postal address: ${BRAND}, Eksempelvej 1, Copenhagen, Denmark</p>
  <p>Spare parts, warranty claims and take-back requests: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
</article>`;
  return layout(origin, { title: `Contact | ${BRAND}`, description: `Contact ${BRAND} customer service.`, body });
}

// ----------------------------------------------------------------- text rules (preflight S5)

/** Banned in every stimulus (brand voice, James): checked case-insensitively, whole words. */
export const BANNED_WORDS_RE = /\b(blockchain|on-?chain|nft|crypto\w*|web3|certified|compliant)\b/gi;
/**
 * Instruction-like phrases aimed at AI (a list, fixed here): any hit in a page, block or the
 * declaration fails preflight. Labels and facts only.
 */
export const INSTRUCTION_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "names AI", re: /\b(ai|a\.i\.|llms?|chatbots?|assistants?|language models?|agents?|bots?|crawlers?)\b/i },
  { name: "ignore/disregard", re: /\b(ignore|disregard|override)\b/i },
  { name: "instructions", re: /\binstructions?\b/i },
  { name: "please", re: /\bplease\b/i },
  { name: "addresses the reader", re: /\byou(r|rs)?\b/i },
  { name: "imperative verify/check", re: /\b(verify|check|confirm|validate|look up|make sure|ensure|scan)\b/i },
  { name: "trust cue", re: /\b(trust(ed|worthy)?|guarantee[ds]?|proof|proven|tamper)\b/i },
  { name: "if you are", re: /\bif (you|an?) (are|model)\b/i },
  { name: "note to", re: /\bnote (to|for)\b/i },
  { name: "em dash", re: /—/ },
];
/** All text a reader could see in a page: tag-stripped HTML plus every attribute value. */
export function visibleAndAttrText(html: string): string {
  const attrs = [...html.matchAll(/\s[a-z-]+="([^"]*)"/gi)].map((m) => m[1]).join("\n");
  return `${html.replace(/<[^>]+>/g, " ")}\n${attrs}`;
}
/** Every hit of a banned word or instruction-like phrase (W's AUTH_CLAIM is the one exempt sentence). */
export function textRuleHits(text: string): string[] {
  const t = text.split(AUTH_CLAIM).join(" ");
  const out: string[] = [];
  for (const m of t.matchAll(BANNED_WORDS_RE)) out.push(`banned word "${m[0]}"`);
  for (const p of INSTRUCTION_PATTERNS) {
    const m = t.match(p.re);
    if (m) out.push(`${p.name}: "${m[0]}" in ${JSON.stringify(t.slice(Math.max(0, m.index! - 30), m.index! + 30))}`);
  }
  return out;
}
/** Every absolute URL in a text (href values, visible text and JSON strings). */
export function urlsIn(text: string): string[] {
  return [...new Set([...text.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0].replace(/&amp;/g, "&")))];
}
/** Every href="<origin>/..." path in a page, in page order. */
export function hrefPathsOn(html: string, origin: string): string[] {
  const q = origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...html.matchAll(new RegExp(`href="${q}(/[^"]*)"`, "g"))].map((m) => m[1]);
}

// ----------------------------------------------------------------- manifest

export interface S6FileEntry {
  file: string;
  sha256: string;
  bytes: number;
  url: string;
  contentType: string;
}
export interface S6Manifest {
  _comment: string;
  mock: boolean;
  builtAt: string;
  explorerHost: string;
  explorerVerified: boolean;
  fixtures: ResolvedFixtures;
  gtins: Record<ProductKey, string>;
  /**
   * keys: `brand/<site page>` and `lookalike/<site page>` (home, collection-<p>, returns, warranty, contact);
   * `<p>/store-G-D0|store-G-D1|store-W|lookalike-F-D0|lookalike-F-D1|passport-D0|passport-D1|doc-G|doc-F`;
   * and "declaration".
   */
  stimuli: Record<string, S6FileEntry>;
}
export const HTML_CT = "text/html; charset=utf-8";
export const JSON_CT = "application/json; charset=utf-8";

export function readS6Manifest(mock: boolean): S6Manifest | null {
  const f = mock ? S6_MOCK_MANIFEST : S6_MANIFEST;
  if (!existsSync(f)) return null;
  return JSON.parse(readFileSync(f, "utf8")) as S6Manifest;
}

/** Every copied page: the brand's key, the copycat's key, and which page it is (preflight S3). */
export function copiedPairs(): Array<{ g: string; f: string; page: CopiedPage; arm: Arm | null }> {
  const out: Array<{ g: string; f: string; page: CopiedPage; arm: Arm | null }> = SITE_PAGE_NAMES.map((s) => ({ g: `brand/${s}`, f: `lookalike/${s}`, page: { site: s }, arm: null }));
  for (const p of PRODUCT_KEYS) {
    out.push({ g: `${p}/doc-G`, f: `${p}/doc-F`, page: { doc: p }, arm: null });
    for (const arm of ["D0", "D1"] as const) out.push({ g: `${p}/store-G-${arm}`, f: `${p}/lookalike-F-${arm}`, page: { store: p }, arm });
  }
  return out;
}

/** What one build produces, in memory (the builder writes it; the preflight re-derives and compares). */
export function buildAll(fx: ResolvedFixtures): { files: Map<string, { text: string; url: string; contentType: string }> } {
  const files = new Map<string, { text: string; url: string; contentType: string }>();
  for (const s of SITE_PAGE_NAMES) {
    files.set(`brand/${s}`, { text: renderSitePage(s, BRAND_ORIGIN), url: `${BRAND_ORIGIN}${sitePath(s)}`, contentType: HTML_CT });
    files.set(`lookalike/${s}`, { text: renderSitePage(s, LOOKALIKE_ORIGIN), url: `${LOOKALIKE_ORIGIN}${sitePath(s)}`, contentType: HTML_CT });
  }
  for (const p of PRODUCT_KEYS) {
    const facts = blockFacts(p, fx);
    for (const arm of ["D0", "D1"] as const) {
      const block = renderBlock(facts, arm, p, BRAND_ORIGIN);
      files.set(`${p}/store-G-${arm}`, { text: renderStorePage(p, { block }), url: storeUrl(p), contentType: HTML_CT });
      files.set(`${p}/lookalike-F-${arm}`, { text: renderStorePage(p, { block: renderBlock(facts, arm, p, LOOKALIKE_ORIGIN) }, LOOKALIKE_ORIGIN), url: lookalikeUrl(p), contentType: HTML_CT });
      files.set(`${p}/passport-${arm}`, { text: renderPassportPage(p, block), url: passportPageUrl(p), contentType: HTML_CT });
    }
    files.set(`${p}/store-W`, { text: renderStorePage(p, { claim: true }), url: storeUrl(p), contentType: HTML_CT });
    files.set(`${p}/doc-G`, { text: renderDocPage(p, BRAND_ORIGIN), url: docUrl(p, BRAND_ORIGIN), contentType: HTML_CT });
    files.set(`${p}/doc-F`, { text: renderDocPage(p, LOOKALIKE_ORIGIN), url: docUrl(p, LOOKALIKE_ORIGIN), contentType: HTML_CT });
  }
  files.set("declaration", { text: renderDeclaration(fx), url: DECLARATION_URL, contentType: JSON_CT });
  return { files };
}
export const fileOf = (mock: boolean, key: string) => `${mock ? "study6/mock" : "study6"}/${key === "declaration" ? "well-known/product-passports.json" : `pages/${key}.html`}`;

const BRAND_SITE = SITE_PAGE_NAMES.map((s) => `brand/${s}`);
const LOOKALIKE_SITE = SITE_PAGE_NAMES.map((s) => `lookalike/${s}`);
/** The brand's whole shop as served in arm `arm` (null = condition W: product pages carry the claim; no passport pages, no DoC pages). */
function brandSiteKeys(arm: Arm | null): string[] {
  if (arm === null) return [...BRAND_SITE, ...PRODUCT_KEYS.map((k) => `${k}/store-W`)];
  return [
    ...BRAND_SITE,
    ...PRODUCT_KEYS.map((k) => `${k}/store-G-${arm}`),
    ...PRODUCT_KEYS.map((k) => `${k}/passport-${arm}`),
    ...PRODUCT_KEYS.map((k) => `${k}/doc-G`),
    ...(arm === "D1" ? ["declaration"] : []),
  ];
}
/**
 * The stored pages a trial of (product, condition) is served, by key: a whole shop, so every link a
 * shopper could follow on a fictional host resolves (preflight S8). G-a: the brand's shop of arm a
 * (all three product pages of that arm, their passport pages, the three declarations of conformity,
 * the site pages) and, in D1 only, the declaration file. F-a: the copycat's shop (its copies of the
 * product pages of arm a, the declarations of conformity and the site pages) PLUS the brand's shop of
 * arm a (the block links the brand's passport page; in D1 the brand's declaration). The declaration
 * path on the copycat answers 404, as every unknown path does. W: the brand's shop with the W product
 * pages only (no passport page, no DoC page; the declaration URL 404s). The same for every product:
 * only the given page differs.
 */
export function servedKeys(_p: ProductKey, c: S6Cond): string[] {
  if (c === "W") return brandSiteKeys(null);
  const arm = armOf(c)!;
  if (pageKindOf(c) === "G") return brandSiteKeys(arm);
  return [...LOOKALIKE_SITE, ...PRODUCT_KEYS.map((k) => `${k}/lookalike-F-${arm}`), ...PRODUCT_KEYS.map((k) => `${k}/doc-F`), ...brandSiteKeys(arm)];
}
export const givenKeyOf = (p: ProductKey, c: S6Cond) => (c === "W" ? `${p}/store-W` : pageKindOf(c) === "F" ? `${p}/lookalike-F-${armOf(c)}` : `${p}/store-G-${armOf(c)}`);
