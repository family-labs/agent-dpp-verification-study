/**
 * Study 7 (DRAFT, not registered): which page format lets AI models finish the check the Study 6 models
 * stopped short of? Built 24 Oct 2026 on James's instruction ("Lets do your recommendation on the
 * necessary next steps on the page so that we can do the next set of trials").
 *
 * What Study 6 showed (interim, 339 trials): every vendor tool reached the live pages; some opened the
 * brand's declaration (Meta spark 24/24, Claude 12/22); NO model ever opened the ledger record; answers
 * stayed "unsure". The models follow about one link and stop. So Study 7 tests formats that put the
 * whole check one link away and speak the vocabulary models already know.
 *
 * Same brand, products, shops, declaration and copycat as Study 6 (stimulus/study6.ts, whose files are
 * NOT changed). Every Study 7 page is a Study 6 D1 page plus the format's additions:
 *
 *   F0  control: the Study 6 D1 page exactly (passport block + "Issuer declaration" line)
 *   F1  + ONE line in the block, "Independent record: <URL>", a page on an independent record service
 *       (CHECKER_HOST, not the brand's domain) that reads the item's holder LIVE from the public ledger
 *       and states, in plain words and as JSON, the holder and the brand's declared website. One link
 *       answers what Study 6 needed two to three for. A copycat copies the line; the answer it leads to
 *       names the brand's website, which is not the copycat's.
 *   F3  F1 + the vocabulary models know: the block titled "EU Digital Product Passport: battery
 *       passport", the regulation named as a property, the item's GS1 Digital Link URI as the JSON-LD
 *       @id, a <link rel="alternate" type="application/ld+json"> in the page head to the passport as a
 *       JSON-LD document (the delivery format of EN 18216), and /llms.txt on the brand's domain.
 *   (F2, the markup alone, is not run: the budget left after Study 6 allows three formats; F3 - F1
 *    shows what the vocabulary adds on top of the single link.)
 *
 * The text rules of Study 6 still hold (no banned word, nothing addressed to a reader or a model, no
 * "check"/"verify" imperative): the new line is a label and a URL.
 */
import {
  blockFacts,
  blockJsonLd,
  BRAND,
  BRAND_ORIGIN,
  D1_FIELD_LINE,
  DECLARATION_URL,
  gtin14,
  gtinOf,
  LOOKALIKE_ORIGIN,
  passportPagePath,
  passportPageUrl,
  PRODUCT_KEYS,
  PRODUCTS,
  renderBlock,
  renderPassportPage,
  renderStorePage,
  type ProductKey,
  type ResolvedFixtures,
} from "./study6";
import { createRequire } from "node:module";

/**
 * The independent record service's host. PROPOSAL, pending James: a neutral domain of its own (the
 * study cannot use the brand's domains for it, and our platform domains carry the Study 5 confound).
 */
export const CHECKER_HOST = process.env.STUDY7_CHECKER_HOST ?? "passportrecord.org";
export const CHECKER_ORIGIN = `https://${CHECKER_HOST}`;
export const recordPath = (p: ProductKey) => `/01/${gtin14(gtinOf(p))}/21/${PRODUCTS[p].serial}`;
export const recordUrl = (p: ProductKey) => `${CHECKER_ORIGIN}${recordPath(p)}`;
export const passportJsonLdPath = (p: ProductKey) => `${passportPagePath(p)}.jsonld`;
export const passportJsonLdUrl = (p: ProductKey) => `${BRAND_ORIGIN}${passportJsonLdPath(p)}`;

export type S7Format = "F0" | "F1" | "F3";

/**
 * F3's QR code (added 24 Oct 2026 after the knowledge probe: models name "a QR code or data carrier with
 * a caption about the Digital Product Passport" as a recognition cue). A real, decodable QR of the item's
 * GS1 Digital Link passport address on the brand's domain, drawn as SVG (qrcode 1.5.4, site/package.json).
 */
const qrLib = createRequire(new URL("../site/package.json", import.meta.url))("qrcode") as { create(text: string, opts: { errorCorrectionLevel: string }): { modules: { size: number; get(r: number, c: number): number } } };
export function qrSvg(text: string): string {
  const m = qrLib.create(text, { errorCorrectionLevel: "M" }).modules;
  const n = m.size;
  const q = 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m.get(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" width="320" height="320" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#111" d="${d}"/></svg>
`;
}
export const qrPath = (p: ProductKey) => `/images/passport-qr-${PRODUCTS[p].slug}.svg`;
export const S7_QR_ALT = (p: ProductKey) => `QR code for the EU Digital Product Passport of ${PRODUCTS[p].name}`;
export const S7_FORMATS: readonly S7Format[] = ["F0", "F1", "F3"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (u: string) => `<a href="${esc(u)}">${esc(u)}</a>`;

export const S7_RECORD_LABEL = "Independent record";
export const S7_TITLE_F3 = "EU Digital Product Passport: battery passport";
export const S7_REGULATION = "Regulation (EU) 2023/1542 (EU Battery Regulation)";

/** The JSON-LD of the block in a format. */
export function s7JsonLd(p: ProductKey, fx: ResolvedFixtures, fmt: S7Format): Record<string, unknown> {
  const j = blockJsonLd(blockFacts(p, fx), "D1") as Record<string, unknown> & { additionalProperty: unknown[] };
  if (fmt === "F0") return j;
  const props = [...j.additionalProperty, { "@type": "PropertyValue", name: S7_RECORD_LABEL, value: recordUrl(p) }];
  if (fmt === "F1") return { ...j, additionalProperty: props };
  return { "@context": j["@context"], "@type": j["@type"], "@id": passportPageUrl(p), ...Object.fromEntries(Object.entries(j).filter(([k]) => k !== "@context" && k !== "@type")), additionalProperty: [...props, { "@type": "PropertyValue", name: "Regulation", value: S7_REGULATION }] };
}

/** The block in a format, on `origin` (only its declaration-of-conformity link follows the host, as in Study 6). */
export function s7Block(p: ProductKey, fx: ResolvedFixtures, fmt: S7Format, origin: string = BRAND_ORIGIN): string {
  const f = blockFacts(p, fx);
  const base = renderBlock(f, "D1", p, origin);
  if (fmt === "F0") return base;
  const oldJson = JSON.stringify(blockJsonLd(f, "D1"), null, 2);
  if (!base.includes(oldJson) || !base.includes(D1_FIELD_LINE)) throw new Error("Study 6 block shape changed");
  let b = base.replace(D1_FIELD_LINE, `${D1_FIELD_LINE}    <dt>${S7_RECORD_LABEL}</dt><dd>${link(recordUrl(p))}</dd>\n`).replace(oldJson, JSON.stringify(s7JsonLd(p, fx, fmt), null, 2));
  if (fmt === "F3") b = b.replace("<h2>Battery passport</h2>", `<h2>${esc(S7_TITLE_F3)}</h2>
  <p class="passport-qr"><a href="${esc(passportPageUrl(p))}"><img src="${qrPath(p)}" alt="${esc(S7_QR_ALT(p))}" width="160" height="160"></a></p>`).replace("    <dt>Brand</dt>", `    <dt>Regulation</dt><dd>${esc(S7_REGULATION)}</dd>\n    <dt>Brand</dt>`);
  return b;
}

/** F3's head line: the passport as a JSON-LD document on the brand's domain (not host-bound: a copy keeps it). */
export const s7Head = (p: ProductKey, fmt: S7Format) => (fmt === "F3" ? `<link rel="alternate" type="application/ld+json" href="${passportJsonLdUrl(p)}" title="${esc(S7_TITLE_F3)}">\n` : "");

/** The passport as a standalone JSON-LD document (F3 only). */
export const s7PassportJsonLd = (p: ProductKey, fx: ResolvedFixtures) => JSON.stringify(s7JsonLd(p, fx, "F3"), null, 2) + "\n";

/** /llms.txt on the brand's domain (F3 only): a plain description of the shop and where its passports live. */
export function s7LlmsTxt(): string {
  return `# ${BRAND}

> ${BRAND} designs lithium batteries in Copenhagen and assembles them in Odense, Denmark: e-bike packs, portable power stations and home storage. The shop is ${BRAND_ORIGIN}.

## Battery passports

Every ${BRAND} battery carries an EU battery passport under ${S7_REGULATION}.

- Issuer declaration (website, ledger account and product collections): ${DECLARATION_URL}
${PRODUCT_KEYS.map((k) => `- ${PRODUCTS[k].name}: passport ${passportPageUrl(k)}, independent record ${recordUrl(k)}`).join("\n")}

## Shop

- ${BRAND_ORIGIN}/
${PRODUCT_KEYS.map((k) => `- ${PRODUCTS[k].name}: ${BRAND_ORIGIN}/products/${PRODUCTS[k].slug}`).join("\n")}
`;
}

export interface S7File {
  text: string;
  url: string;
  contentType: string;
}
/**
 * Every Study 7 stimulus file, keyed `<fmt>/<key>`: per product the brand's product page and passport
 * page, and the copycat's product page; F3 adds the passport JSON-LD documents and /llms.txt. Site pages,
 * declarations of conformity and the declaration file are Study 6's (unchanged) and come from its manifest.
 */
export function buildAll7(fx: ResolvedFixtures): Map<string, S7File> {
  const out = new Map<string, S7File>();
  const html = "text/html; charset=utf-8";
  for (const fmt of S7_FORMATS)
    for (const p of PRODUCT_KEYS) {
      const block = s7Block(p, fx, fmt, BRAND_ORIGIN);
      out.set(`${fmt}/${p}/store-G`, { text: renderStorePage(p, { block }, BRAND_ORIGIN, s7Head(p, fmt) || undefined), url: `${BRAND_ORIGIN}/products/${PRODUCTS[p].slug}`, contentType: html });
      out.set(`${fmt}/${p}/lookalike-F`, { text: renderStorePage(p, { block: s7Block(p, fx, fmt, LOOKALIKE_ORIGIN) }, LOOKALIKE_ORIGIN, s7Head(p, fmt) || undefined), url: `${LOOKALIKE_ORIGIN}/products/${PRODUCTS[p].slug}`, contentType: html });
      out.set(`${fmt}/${p}/passport`, { text: renderPassportPage(p, block), url: passportPageUrl(p), contentType: html });
      if (fmt === "F3") {
        const qr = qrSvg(passportPageUrl(p));
        out.set(`F3/${p}/qr`, { text: qr, url: `${BRAND_ORIGIN}${qrPath(p)}`, contentType: "image/svg+xml" });
        out.set(`F3/${p}/qr-copy`, { text: qr, url: `${LOOKALIKE_ORIGIN}${qrPath(p)}`, contentType: "image/svg+xml" });
      }
      if (fmt === "F3") out.set(`F3/${p}/passport-jsonld`, { text: s7PassportJsonLd(p, fx), url: passportJsonLdUrl(p), contentType: "application/ld+json; charset=utf-8" });
    }
  out.set("F3/llms", { text: s7LlmsTxt(), url: `${BRAND_ORIGIN}/llms.txt`, contentType: "text/plain; charset=utf-8" });
  return out;
}
