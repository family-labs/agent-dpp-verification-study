/**
 * Study 6 live sites: the files that are NOT trial stimuli but are served beside them (23 Oct 2026).
 *
 *   /assets/site.css       one stylesheet for both hosts (a modern product page: large gallery, buy box,
 *                          specification table, passport card, four-column footer)
 *   /assets/favicon.svg    the wordmark initial
 *   /images/<slug>-<n>.svg drawn product images (no photos; nothing in them claims anything)
 *   /robots.txt            every fetcher allowed, AI fetchers named
 *   holding page           what both hosts show while the sites are closed (before and after the study)
 *   not-found page         per host, in the shop's own frame
 *   check pages            two neutral pages for the tool check (phase "check" only), unrelated to any product
 *
 * Every text here follows the stimulus text rules (study6.ts textRuleHits: no banned word, nothing
 * addressed to a reader or a model). The site build hashes every file (site/build-site.ts).
 */
import { BRAND, PRODUCT_KEYS, PRODUCTS, renderSitePageFrame, type ProductKey } from "../stimulus/study6";

export const CSS = `:root{--ink:#111;--muted:#6b6b6b;--line:#e5e5e5;--soft:#f5f5f5;--accent:#1f4d3a;--radius:12px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:#fff;color:var(--ink);font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55}
a{color:inherit}
img{display:block;max-width:100%;height:auto}
.announcement{margin:0;background:var(--soft);text-align:center;font-size:13px;padding:8px 16px}
.site-header{border-bottom:1px solid var(--line);position:sticky;top:0;background:#fff;z-index:2}
.header-inner{max-width:1280px;margin:0 auto;display:flex;align-items:center;gap:32px;padding:0 24px;height:64px}
.logo{font-weight:700;letter-spacing:.22em;text-transform:uppercase;text-decoration:none;font-size:18px}
.main-nav{display:flex;gap:24px;flex:1;justify-content:center}
.main-nav a{text-decoration:none;font-weight:500;font-size:15px}
.main-nav a:hover{text-decoration:underline;text-underline-offset:6px}
.basket-link{font-size:14px;color:var(--muted)}
main{max-width:1280px;margin:0 auto;padding:16px 24px 64px}
.breadcrumb{font-size:13px;color:var(--muted);margin:8px 0 24px}
.breadcrumb a{text-decoration:none}
.breadcrumb a:hover{text-decoration:underline}
h1{font-size:28px;line-height:1.2;font-weight:600;margin:0 0 8px}
h2{font-size:20px;font-weight:600;margin:0 0 16px}
.product-top{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(320px,1fr);gap:48px;align-items:start}
.product-gallery{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.product-gallery img{background:var(--soft);border-radius:var(--radius);width:100%}
.product-gallery img:first-child{grid-column:1 / -1}
.product-summary{position:sticky;top:96px}
.product-category{margin:0 0 4px;color:var(--accent);font-weight:600;font-size:14px}
.product-model{margin:0 0 20px;color:var(--muted)}
.product-price{font-size:22px;font-weight:600;margin:0}
.product-tax{margin:0 0 16px;color:var(--muted);font-size:13px}
.product-stock{margin:0 0 16px;font-size:14px}
.product-stock::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#2e8540;margin-right:8px;vertical-align:1px}
.add-to-basket{display:block;width:100%;background:var(--ink);color:#fff;border:0;border-radius:999px;padding:18px 24px;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit}
.add-to-basket:hover{background:#333}
.product-service{list-style:none;padding:0;margin:24px 0 0;border-top:1px solid var(--line)}
.product-service li{padding:12px 0;border-bottom:1px solid var(--line);font-size:14px}
.product-seller{font-size:13px;color:var(--muted);margin-top:16px}
.product-description,.product-specs,.battery-passport,.product-box,.product-warranty,.product-reviews,.authenticity{max-width:820px;margin:48px 0 0;padding-top:32px;border-top:1px solid var(--line)}
.product-specs table,.policy table{border-collapse:collapse;width:100%;font-size:15px}
.product-specs th,.product-specs td,.policy th,.policy td{text-align:left;padding:10px 12px 10px 0;border-bottom:1px solid var(--line);vertical-align:top}
.product-specs th{width:42%;font-weight:500;color:var(--muted)}
.battery-passport{background:var(--soft);border:0;border-radius:var(--radius);padding:28px 32px}
.battery-passport dl{display:grid;grid-template-columns:minmax(160px,34%) 1fr;gap:8px 16px;margin:0;font-size:14px}
.battery-passport dt{color:var(--muted)}
.battery-passport dd{margin:0;overflow-wrap:anywhere}
.authenticity{font-size:15px}
.product-box ul{padding-left:20px;margin:0}
.hero{background:var(--soft);border-radius:var(--radius);padding:72px 48px;margin:8px 0 48px}
.hero h1{font-size:44px;max-width:640px}
.hero p{max-width:620px;color:#333;font-size:18px;margin:0}
.product-grid ul,.collection ul{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}
.product-card img{background:var(--soft);border-radius:var(--radius);margin-bottom:12px}
.card-name{margin:0;font-weight:600}
.card-name a{text-decoration:none}
.card-line{margin:0;color:var(--muted);font-size:14px}
.card-price{margin:4px 0 0;font-weight:500}
.collection-count{color:var(--muted);margin:0 0 24px}
.about{margin-top:64px;max-width:720px}
.policy,.document,.passport{max-width:820px}
.document ol{padding-left:20px}
.document li{margin-bottom:8px}
.document-number{color:var(--muted)}
.holding{min-height:70vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}
.holding .logo{font-size:28px;margin-bottom:12px}
.site-footer{background:var(--soft);margin-top:32px}
.footer-inner{max-width:1280px;margin:0 auto;padding:40px 24px;display:grid;grid-template-columns:2fr 1fr 2fr;gap:32px;font-size:14px}
.footer-inner p{margin:0 0 8px}
.footer-brand{font-weight:700;letter-spacing:.22em;text-transform:uppercase}
.footer-nav{display:flex;flex-direction:column;gap:8px}
.footer-nav a{text-decoration:none}
.footer-nav a:hover{text-decoration:underline}
.copyright{color:var(--muted)}
@media (max-width:900px){
.product-top{grid-template-columns:1fr;gap:24px}
.product-summary{position:static}
.main-nav{display:none}
.header-inner{justify-content:space-between}
.hero{padding:40px 24px}
.hero h1{font-size:32px}
.footer-inner{grid-template-columns:1fr}
.battery-passport{padding:20px}
.battery-passport dl{grid-template-columns:1fr}
.battery-passport dt{margin-top:8px}
}
`;

export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111"/><text x="32" y="44" font-family="Helvetica, Arial, sans-serif" font-size="34" font-weight="700" fill="#fff" text-anchor="middle">O</text></svg>
`;

// ----------------------------------------------------------------- drawn product images (1200 x 1200)

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f7f7"/><stop offset="1" stop-color="#ececec"/></linearGradient>
<linearGradient id="alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a3a"/><stop offset=".45" stop-color="#1c1c1c"/><stop offset="1" stop-color="#0d0d0d"/></linearGradient>
<linearGradient id="grey" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a9fa3"/><stop offset="1" stop-color="#6e7377"/></linearGradient>
<linearGradient id="white" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e3e3"/></linearGradient>
<radialGradient id="shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1200" height="1200" fill="url(#bg)"/>
${body}
</svg>
`;
const shadow = (cx: number, cy: number, rx: number, ry: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#shadow)"/>`;
const wordmark = (x: number, y: number, size: number, fill: string) =>
  `<text x="${x}" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="700" letter-spacing="${size * 0.22}" fill="${fill}" text-anchor="middle">${BRAND.toUpperCase()}</text>`;

const IMAGES: Record<ProductKey, string[]> = {
  lmt: [
    // side view: a long matte black tube with grey end caps
    svg(`${shadow(600, 800, 470, 40)}
<rect x="150" y="500" width="900" height="250" rx="125" fill="url(#alu)"/>
<rect x="130" y="510" width="110" height="230" rx="40" fill="url(#grey)"/>
<rect x="960" y="510" width="110" height="230" rx="40" fill="url(#grey)"/>
<rect x="300" y="540" width="600" height="14" rx="7" fill="#444"/>
${wordmark(600, 660, 44, "#d9d9d9")}
<g fill="#7bd389"><rect x="1000" y="590" width="34" height="14" rx="4"/><rect x="1000" y="614" width="34" height="14" rx="4"/><rect x="1000" y="638" width="34" height="14" rx="4" opacity=".35"/></g>`),
    // end cap close-up: charge indicator and key lock
    svg(`${shadow(600, 930, 360, 40)}
<rect x="260" y="260" width="680" height="640" rx="120" fill="url(#grey)"/>
<rect x="320" y="320" width="560" height="520" rx="90" fill="#82878b"/>
<circle cx="600" cy="690" r="78" fill="#2b2b2b"/><rect x="590" y="640" width="20" height="100" rx="8" fill="#9a9a9a"/>
<g fill="#7bd389"><rect x="470" y="450" width="56" height="22" rx="6"/><rect x="544" y="450" width="56" height="22" rx="6"/><rect x="618" y="450" width="56" height="22" rx="6"/></g>
<rect x="692" y="450" width="56" height="22" rx="6" fill="#555"/>
<circle cx="600" cy="400" r="24" fill="#2b2b2b"/>`),
    // charger brick, cable and EU plug
    svg(`${shadow(560, 840, 330, 34)}
<rect x="300" y="520" width="520" height="300" rx="56" fill="url(#alu)"/>
${wordmark(560, 690, 34, "#bdbdbd")}
<path d="M820 640 C 930 640, 960 500, 880 430 S 820 300, 900 260" stroke="#1a1a1a" stroke-width="18" fill="none" stroke-linecap="round"/>
<rect x="850" y="190" width="120" height="90" rx="20" fill="#1a1a1a"/>
<rect x="878" y="150" width="14" height="50" rx="7" fill="#9a9a9a"/><rect x="928" y="150" width="14" height="50" rx="7" fill="#9a9a9a"/>
<path d="M300 700 C 200 700, 170 820, 250 900" stroke="#1a1a1a" stroke-width="18" fill="none" stroke-linecap="round"/>
<circle cx="268" cy="915" r="30" fill="#1a1a1a"/>`),
  ],
  industrial: [
    // front: grey case, two folding handles, display
    svg(`${shadow(600, 960, 440, 46)}
<rect x="270" y="250" width="70" height="200" rx="30" fill="none" stroke="#2c2c2c" stroke-width="26"/>
<rect x="860" y="250" width="70" height="200" rx="30" fill="none" stroke="#2c2c2c" stroke-width="26"/>
<rect x="180" y="360" width="840" height="580" rx="64" fill="url(#grey)"/>
<rect x="220" y="400" width="760" height="500" rx="44" fill="#4a4e52"/>
<rect x="300" y="460" width="340" height="190" rx="22" fill="#0f1a14"/>
<text x="470" y="580" font-family="Helvetica, Arial, sans-serif" font-size="96" font-weight="700" fill="#7bd389" text-anchor="middle">86%</text>
<g fill="#1e1e1e"><circle cx="760" cy="510" r="44"/><circle cx="880" cy="510" r="44"/><circle cx="760" cy="640" r="44"/><circle cx="880" cy="640" r="44"/></g>
<g fill="#5e6266"><rect x="300" y="720" width="80" height="44" rx="12"/><rect x="400" y="720" width="80" height="44" rx="12"/><rect x="500" y="720" width="120" height="44" rx="12"/></g>
${wordmark(600, 860, 40, "#c7c9cb")}`),
    // rear panel with four 230 V sockets
    svg(`${shadow(600, 960, 440, 46)}
<rect x="180" y="300" width="840" height="640" rx="64" fill="url(#grey)"/>
<rect x="220" y="340" width="760" height="560" rx="44" fill="#55595d"/>
${[0, 1, 2, 3].map((i) => `<g transform="translate(${300 + i * 165} 470)"><circle cx="60" cy="60" r="62" fill="#1d1d1d"/><circle cx="38" cy="60" r="10" fill="#555"/><circle cx="82" cy="60" r="10" fill="#555"/></g>`).join("")}
<g fill="#1d1d1d"><rect x="320" y="700" width="90" height="40" rx="10"/><rect x="430" y="700" width="90" height="40" rx="10"/><rect x="620" y="690" width="140" height="64" rx="32"/></g>
<rect x="800" y="700" width="120" height="40" rx="10" fill="#2e8540"/>`),
    // with its three charging cables
    svg(`${shadow(470, 900, 300, 36)}
<rect x="210" y="420" width="520" height="460" rx="48" fill="url(#grey)"/>
<rect x="240" y="450" width="460" height="400" rx="32" fill="#4a4e52"/>
<rect x="290" y="490" width="200" height="120" rx="16" fill="#0f1a14"/>
${wordmark(470, 800, 28, "#c7c9cb")}
<g fill="none" stroke="#1a1a1a" stroke-width="16" stroke-linecap="round">
<path d="M820 360 c 120 0 120 120 0 120 s -120 120 0 120 s 120 120 0 120"/>
<path d="M960 420 c 90 0 90 90 0 90 s -90 90 0 90"/>
<path d="M880 800 c 100 0 100 70 0 70"/>
</g>
<rect x="800" y="320" width="60" height="60" rx="12" fill="#1a1a1a"/>
<rect x="930" y="380" width="60" height="50" rx="12" fill="#1a1a1a"/>
<rect x="850" y="770" width="60" height="50" rx="12" fill="#2a2a2a"/>`),
  ],
  stationary: [
    // white steel enclosure on a garage wall
    svg(`<rect width="1200" height="1200" fill="#e7e5e1"/>
<rect y="1010" width="1200" height="190" fill="#cfccc6"/>
${shadow(600, 1020, 280, 24)}
<rect x="390" y="230" width="420" height="760" rx="36" fill="url(#white)" stroke="#d2d2d2" stroke-width="4"/>
<rect x="430" y="300" width="340" height="6" rx="3" fill="#dcdcdc"/>
<circle cx="600" cy="420" r="16" fill="#2e8540"/>
${wordmark(600, 560, 30, "#9a9a9a")}
<rect x="560" y="990" width="80" height="20" fill="#bdbdbd"/>`),
    // side view with cable entry
    svg(`<rect width="1200" height="1200" fill="#e7e5e1"/>
<rect x="150" y="150" width="60" height="900" fill="#cfccc6"/>
${shadow(450, 1030, 220, 20)}
<rect x="210" y="230" width="190" height="760" rx="24" fill="url(#white)" stroke="#d2d2d2" stroke-width="4"/>
<rect x="250" y="990" width="40" height="40" rx="8" fill="#555"/><rect x="310" y="990" width="40" height="40" rx="8" fill="#555"/>
<path d="M270 1030 C 270 1110, 520 1110, 720 1090" stroke="#d65a31" stroke-width="16" fill="none" stroke-linecap="round"/>
<path d="M330 1030 C 330 1080, 520 1080, 720 1060" stroke="#222" stroke-width="16" fill="none" stroke-linecap="round"/>`),
    // two units next to a hybrid inverter
    svg(`<rect width="1200" height="1200" fill="#e7e5e1"/>
<rect y="1010" width="1200" height="190" fill="#cfccc6"/>
<rect x="150" y="260" width="300" height="560" rx="28" fill="url(#white)" stroke="#d2d2d2" stroke-width="4"/>
<rect x="480" y="260" width="300" height="560" rx="28" fill="url(#white)" stroke="#d2d2d2" stroke-width="4"/>
<circle cx="300" cy="380" r="13" fill="#2e8540"/><circle cx="630" cy="380" r="13" fill="#2e8540"/>
${wordmark(300, 480, 22, "#9a9a9a")}${wordmark(630, 480, 22, "#9a9a9a")}
<rect x="830" y="300" width="230" height="380" rx="22" fill="#3a3d40"/>
<rect x="870" y="350" width="150" height="80" rx="10" fill="#0f1a14"/>
<g stroke="#555" stroke-width="12" fill="none" stroke-linecap="round"><path d="M300 820 v 80 h 650 v -220"/><path d="M630 820 v 50 h 340 v -190"/></g>`),
  ],
};

// ----------------------------------------------------------------- robots, holding, not found, check pages

/** Every fetcher allowed. The AI fetchers are named so that no default rule of theirs can apply. */
export const ROBOTS_TXT = `User-agent: *
Allow: /

User-agent: ChatGPT-User
User-agent: OAI-SearchBot
User-agent: GPTBot
User-agent: Claude-User
User-agent: Claude-SearchBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: Googlebot
User-agent: PerplexityBot
User-agent: Meta-ExternalFetcher
Allow: /
`;

const holdingFrame = (title: string, inner: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="/assets/site.css">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
</head>
<body>
<main class="holding">
${inner}
</main>
</body>
</html>
`;

/** Both hosts, every path, while the sites are closed (before and after the study). No link, no product. */
export const HOLDING_PAGE = holdingFrame(BRAND, `<p class="logo">${BRAND}</p>
<p>The shop is closed at the moment.</p>`);

/**
 * The tool check (phase "check"): neutral pages, unrelated to any product, on the brand host. Each
 * carries a code word, so a model's answer shows whether its tool really read it:
 *   first  (HTML)  links the second page
 *   second (HTML)  links a small JSON file on our host and the public explorer's network statistics
 *   json   (JSON)  a code word in a JSON file (does the tool read application/json, as the declaration is?)
 * The explorer's /api/v2/stats is public network data, unrelated to Oskvale; it tests whether the tool
 * reaches the explorer's JSON API at all.
 */
export const CHECK_PATHS = { first: "/check/delivery-areas", second: "/check/delivery-areas-2", json: "/check/delivery-areas.json" } as const;
export const CHECK_CODE_WORDS = { first: "lindetrae", second: "havoern", json: "skovsti", long: "fyrtaarn", json2: "egeskov" } as const;
export const CHECK_EXPLORER_URL = "https://explorer.execution.mainnet.lukso.network/api/v2/stats";
export const CHECK_PAGES: Record<string, string> = {
  [CHECK_PATHS.first]: holdingFrame(`Delivery areas | ${BRAND}`, `<h1>Delivery areas</h1>
<p>Orders ship to Denmark, Sweden, Norway, Finland and Germany. Code word for this page: ${CHECK_CODE_WORDS.first}.</p>
<p><a href="https://oskvale.com${CHECK_PATHS.second}">Delivery areas, part 2</a></p>`),
  [CHECK_PATHS.second]: holdingFrame(`Delivery areas, part 2 | ${BRAND}`, `<h1>Delivery areas, part 2</h1>
<p>Orders also ship to the Netherlands and Belgium. Code word for this page: ${CHECK_CODE_WORDS.second}.</p>
<p>Delivery areas as data: <a href="https://oskvale.com${CHECK_PATHS.json}">https://oskvale.com${CHECK_PATHS.json}</a></p>
<p>Network statistics: <a href="${CHECK_EXPLORER_URL}">${CHECK_EXPLORER_URL}</a></p>`),
};
/** A longer neutral page (phase "check" only): tests whether a tool rejects short pages. */
export const CHECK_LONG_PATH = "/check/delivery-guide";
CHECK_PAGES[CHECK_LONG_PATH] = holdingFrame(`Delivery guide | ${BRAND}`, `<h1>Delivery guide</h1>
<p>Code word for this page: ${CHECK_CODE_WORDS.long}.</p>
${[
  "Orders placed before two in the afternoon on a working day leave the warehouse in Odense the same day. Orders placed later, or at the weekend, leave on the next working day. Every parcel is tracked from the moment it is collected, and the tracking link is sent by e-mail when the parcel leaves the warehouse.",
  "Lithium batteries travel as dangerous goods. Each battery is packed at a state of charge below thirty percent, in a box marked with the lithium battery handling label, and it travels by road rather than by air. This is why delivery to some islands takes one or two days longer than delivery to the mainland.",
  "Small batteries, such as e-bike packs, go by parcel courier and are delivered to the door or to a parcel shop chosen at checkout. Power stations travel the same way but need a signature on delivery. Home batteries are heavy and travel on a pallet; the carrier calls the day before delivery to agree a time window.",
  "Delivery within Denmark usually takes one to three working days. Delivery to Sweden, Norway, Finland and Germany usually takes three to five working days, and delivery to the Netherlands and Belgium four to six working days. Pallet deliveries add one or two days to these times.",
  "A parcel that cannot be delivered is held at the local depot for seven days. After that it returns to the warehouse in Odense, and the order is refunded in full once the parcel arrives back. A damaged parcel should be refused at the door or reported within forty-eight hours, with a photograph of the box.",
  "Every delivery is free within the countries listed here. There are no customs charges, because every destination is inside the European Union or the European Economic Area, and all prices include the VAT of the destination country.",
].map((p) => `<p>${p}</p>`).join("\n")}`);
/** A JSON file the size and shape of the declaration (~650 bytes, nested), neutral content: can the tool read it? */
export const CHECK_JSON2_PATH = "/check/stock-levels.json";
export const CHECK_JSON2 =
  JSON.stringify(
    {
      version: 1,
      shop: "Oskvale",
      website: "https://oskvale.com",
      codeWord: CHECK_CODE_WORDS.json2,
      warehouse: { name: "Odense warehouse", country: "DK" },
      items: [
        { sku: "STOCK-A-0001", description: "Spare charger, 42 V 4 A, EU plug", inStock: 14 },
        { sku: "STOCK-B-0002", description: "Wall bracket and fixings", inStock: 32 },
        { sku: "STOCK-C-0003", description: "Communication cable, 2 m", inStock: 51 },
      ],
    },
    null,
    2,
  ) + "\n";
export const CHECK_JSON =JSON.stringify({ areas: ["DK", "SE", "NO", "FI", "DE", "NL", "BE"], codeWord: CHECK_CODE_WORDS.json }, null, 2) + "\n";

/** A 404 in the shop's own frame on `origin` (the same nav and footer as every page there). */
export function notFoundPage(origin: string): string {
  return renderSitePageFrame(origin, {
    title: `Page not found | ${BRAND}`,
    description: `Page not found.`,
    body: `<article class="policy">
  <h1>Page not found</h1>
  <p>This page does not exist. The shop's products are listed on the home page.</p>
</article>`,
  });
}

/** Every static asset: published path -> {text, contentType}. The same bytes on both hosts. */
export function staticAssets(): Map<string, { text: string; contentType: string }> {
  const m = new Map<string, { text: string; contentType: string }>();
  m.set("/assets/site.css", { text: CSS, contentType: "text/css; charset=utf-8" });
  m.set("/assets/favicon.svg", { text: FAVICON, contentType: "image/svg+xml" });
  for (const k of PRODUCT_KEYS) IMAGES[k].forEach((s, i) => m.set(`/images/${PRODUCTS[k].slug}-${i + 1}.svg`, { text: s, contentType: "image/svg+xml" }));
  m.set("/robots.txt", { text: ROBOTS_TXT, contentType: "text/plain; charset=utf-8" });
  return m;
}

// ----------------------------------------------------------------- Study 7: the independent record service's own pages

const recordFrame = (title: string, inner: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{font-family:Helvetica,Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#111;line-height:1.55}h1{font-size:24px}dt{color:#555;margin-top:10px}dd{margin:0;overflow-wrap:anywhere}pre{background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto}</style>
</head>
<body>
${inner}
</body>
</html>
`;
/** The record service's home page (Study 7). Neutral: it reads public records; it is not a brand. */
export const CHECKER_HOME = recordFrame("Passport Record", `<h1>Passport Record</h1>
<p>Passport Record reads the public ledger record of products that carry a digital product passport: which account holds an item now, and which website the issuing brand declares as its own.</p>
<p>Record pages are reached from a product's passport, at the product's GS1 Digital Link path.</p>`);
export const CHECKER_NOT_FOUND = recordFrame("Not found | Passport Record", `<h1>No record at this address</h1>
<p>Passport Record has no product at this path.</p>`);
/** The record page text for one item, filled in live by the Worker (site/worker.ts renderRecord). */
export { recordFrame };
