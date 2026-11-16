/**
 * Study 6 LIVE: offline selftest of the parts a mock run cannot reach (no network, no API call).
 * Run from harness/:  bun run src/selftest-study6-live.ts      exit 0 only if every check passes
 *
 *   L1  attribute(): rows inside a trial's padded window are its own; a row tagged with the trial's
 *       share tag but outside the window is kept and flagged; a neighbouring trial's rows are not taken
 *   L2  the vendor-record extractors read each vendor's documented response shape: OpenAI
 *       web_search_call actions (search / open_page / find_in_page), Gemini url_context metadata and
 *       search queries, Anthropic server_tool_use + web_fetch / web_search results (errors too),
 *       URL fields anywhere in an OpenRouter body
 *   L3  evidenceLog(): our hosts come from the access log only; a vendor-reported fetch of our host
 *       without a log row is kept and listed as vendor-only; an explorer fetch reported by the vendor
 *       enters as answered JSON; a vendor-reported failure enters as not answered; searches are not fetches
 *   L4  scoring on that evidence: the declaration and the item record count as opened exactly when the
 *       evidence shows them answered
 *   L5  the user message is the question, a blank line and the address; the share tag is 8 [a-z0-9];
 *       the schedule has 375 counted trials, 25 per cell, and each block takes only its conditions
 */
import { anthropicWebCalls, geminiWebCalls, openaiWebCalls, urlsDeep, type WebCall } from "./agents/live-web";
import { S6_QUESTION, s6LiveUser } from "./prompts-study6";
import { scoreTrial } from "./study6-score";
import { attribute, evidenceLog, shareQuery, shareTag, WINDOW_PAD_MS, type LogRow } from "./study6-site";
import { buildSchedule, S6_SEED } from "./study6-schedule";
import { ALL_LABELS } from "./study6-live-models";
import { DECLARATION_URL, itemRecordUrl, PRODUCT_KEYS, readS6Manifest, storeUrl, lookalikeUrl } from "../../stimulus/study6";

const results: Array<{ id: string; bad: string[]; ok: string }> = [];
const check = (id: string, bad: string[], ok: string) => results.push({ id, bad, ok });
const row = (id: number, ts: number, host: string, path: string, query = "", status = 200, phase = "D1"): LogRow => ({ id, ts: new Date(ts).toISOString(), host, raw_host: host, method: "GET", path, query, ua: "UA", status, phase, asn: null, as_org: null, country: null, colo: null, verified_bot: null, verified_bot_category: null, ray: null, referer: null, accept: null });

// L1
{
  const b: string[] = [];
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  const rows = [
    row(1, t0 - WINDOW_PAD_MS - 500, "oskvale.com", "/products/x", "?utm_source=share&utm_id=prevtrial"), // previous trial
    row(2, t0 + 1000, "oskvale.com", "/products/x", "?utm_source=share&utm_id=abcd1234"),
    row(3, t0 + 5000, "oskvale.com", "/.well-known/product-passports.json"),
    row(4, t0 + 20000 + WINDOW_PAD_MS - 100, "oskvale.com", "/01/09520606000019/21/000001"), // inside the pad after the end
    row(5, t0 + 20000 + WINDOW_PAD_MS + 4000, "oskvale.com", "/products/x", "?utm_source=share&utm_id=abcd1234"), // late, tagged
    row(6, t0 + 20000 + WINDOW_PAD_MS + 4000, "oskvale.com", "/"), // late, untagged: the next trial's
  ];
  const a = attribute(rows, { startMs: t0, endMs: t0 + 20000, tag: "abcd1234" });
  const ids = a.rows.map((r) => r.id).join(",");
  if (ids !== "2,3,4,5") b.push(`attributed ${ids}, expected 2,3,4,5`);
  if (a.taggedOutsideWindow.join(",") !== "5") b.push(`tagged outside window ${a.taggedOutsideWindow}`);
  if (!a.tagSeen) b.push("tag not seen");
  // vendor signatures: a scanner inside the window is background; Kimi (no signature) gets only the paths it requested
  const ua = (r: LogRow, u: string) => ({ ...r, ua: u });
  const mixed = [
    ua(row(20, t0 + 1000, "oskvale.com", "/products/x", "?utm_source=share&utm_id=abcd1234"), "Mozilla/5.0 (Windows NT 10.0) Chrome/120"),
    ua(row(21, t0 + 2000, "oskvale.com", "/.env"), "Mozilla/5.0 (l9scan/2.0)"),
    ua(row(22, t0 + 3000, "oskvale.com", "/.well-known/product-passports.json"), "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0)"),
    ua(row(23, t0 + 4000, "oskvale.com", "/.well-known/product-passports.json"), "Mozilla/5.0 (X11; Linux x86_64) Chrome/124"),
  ];
  const an = attribute(mixed, { startMs: t0, endMs: t0 + 20000, tag: "abcd1234", vendor: "anthropic" });
  if (an.rows.map((r) => r.id).join(",") !== "20,22" || an.backgroundRows !== 2) b.push(`anthropic signature: ${an.rows.map((r) => r.id)} background ${an.backgroundRows}`);
  const ki = attribute(mixed, { startMs: t0, endMs: t0 + 20000, tag: "abcd1234", vendor: "kimi", requested: ["https://oskvale.com/.well-known/product-passports.json"] });
  if (ki.rows.map((r) => r.id).join(",") !== "20,22,23" || ki.backgroundRows !== 1) b.push(`kimi by requested path: ${ki.rows.map((r) => r.id)} background ${ki.backgroundRows}`);
  const ki0 = attribute(mixed, { startMs: t0, endMs: t0 + 20000, tag: "abcd1234", vendor: "kimi", requested: [] });
  if (ki0.rows.map((r) => r.id).join(",") !== "20") b.push(`kimi with no requests took ${ki0.rows.map((r) => r.id)}`);
  check("L1 attribution by window and tag", b, "rows 2-5 attributed (row 5 tagged but late, flagged); with a vendor given, a scanner in the window is background, Anthropic is matched by its user agent, Kimi only on paths its own record requested");
}

// L2
const fx = readS6Manifest(false)!;
const f = fx.fixtures.products.lmt;
const ITEM = itemRecordUrl(fx.explorerHost, f.collection, f.tokenId);
const GIVEN = storeUrl("lmt") + shareQuery("abcd1234");
{
  const b: string[] = [];
  const oa = openaiWebCalls(
    {
      id: "r",
      output: [
        { type: "web_search_call", status: "completed", action: { type: "open_page", url: GIVEN } },
        { type: "web_search_call", status: "completed", action: { type: "search", query: "oskvale battery", sources: [{ url: "https://example.org/a" }] } },
        { type: "web_search_call", status: "failed", action: { type: "open_page", url: ITEM } },
        { type: "web_search_call", status: "completed", action: { type: "find_in_page", url: GIVEN, pattern: "GTIN" } },
        { type: "message", content: [{ type: "output_text", text: "x" }] },
      ],
    },
    0,
  );
  if (oa.length !== 4 || oa[0].action !== "open_page" || oa[0].url !== GIVEN || oa[1].query !== "oskvale battery" || oa[2].ok !== false || oa[3].action !== "find_in_page") b.push(`openai: ${JSON.stringify(oa)}`);
  const gm = geminiWebCalls({ candidates: [{ urlContextMetadata: { urlMetadata: [{ retrievedUrl: GIVEN, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }, { retrievedUrl: DECLARATION_URL, urlRetrievalStatus: "URL_RETRIEVAL_STATUS_ERROR" }] }, groundingMetadata: { webSearchQueries: ["oskvale"] } }] }, 0);
  if (gm.length !== 3 || gm[0].ok !== true || gm[1].ok !== false || gm[2].action !== "search") b.push(`gemini: ${JSON.stringify(gm)}`);
  const an = anthropicWebCalls(
    [
      { type: "server_tool_use", id: "s1", name: "web_fetch", input: { url: GIVEN } },
      { type: "web_fetch_tool_result", tool_use_id: "s1", content: { type: "web_fetch_result", url: GIVEN } },
      { type: "server_tool_use", id: "s2", name: "web_fetch", input: { url: ITEM } },
      { type: "web_fetch_tool_result", tool_use_id: "s2", content: { type: "web_fetch_tool_result_error", error_code: "unsupported_content_type" } },
      { type: "server_tool_use", id: "s3", name: "web_search", input: { query: "oskvale" } },
      { type: "web_search_tool_result", tool_use_id: "s3", content: [{ type: "web_search_result", url: "https://example.org/b" }] },
      { type: "server_tool_use", id: "s4", name: "web_fetch", input: { url: DECLARATION_URL } },
    ],
    0,
  );
  const want = [
    ["fetch", GIVEN, true],
    ["fetch", ITEM, false],
    ["search", null, true],
    ["fetch", DECLARATION_URL, null],
  ];
  if (an.length !== 4 || want.some((w, i) => an[i].action !== w[0] || an[i].url !== w[1] || an[i].ok !== w[2])) b.push(`anthropic: ${JSON.stringify(an)}`);
  if (an[1].detail !== "unsupported_content_type") b.push("anthropic: error code lost");
  const deep = urlsDeep({ choices: [{ message: { annotations: [{ type: "url_citation", url_citation: { url: GIVEN } }], x: { link: ITEM } } }], note: "https://not-a-field.example" });
  if (deep.join(" ") !== `${GIVEN} ${ITEM}`) b.push(`urlsDeep: ${deep.join(" ")}`);
  check("L2 vendor-record extractors", b, "OpenAI open_page/search/find_in_page with status; Gemini url_context status and search queries; Anthropic fetch/search results, error codes and a fetch without a result; URL fields deep in an OpenRouter body");
}

// L3 + L4
{
  const b: string[] = [];
  const b4: string[] = [];
  const ct = (host: string, path: string) => (path === "/.well-known/product-passports.json" ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  const rows = [row(10, t0 + 1000, "oskvale.com", "/products/trailcell-500-e-bike-battery", "?utm_source=share&utm_id=abcd1234"), row(11, t0 + 3000, "oskvale.com", "/.well-known/product-passports.json")];
  const calls: WebCall[] = [
    { tool: "t", action: "fetch", url: GIVEN, query: null, ok: true, detail: null, turn: 0 },
    { tool: "t", action: "open_page", url: ITEM, query: null, ok: true, detail: null, turn: 0 },
    { tool: "t", action: "fetch", url: "https://oskvale.com/01/09520606000019/21/000001", query: null, ok: true, detail: null, turn: 0 },
    { tool: "t", action: "fetch", url: "https://explorer.execution.mainnet.lukso.network/api/v2/addresses/0xabc/logs", query: null, ok: false, detail: "error", turn: 0 },
    { tool: "t", action: "search", url: null, query: "oskvale", ok: true, detail: null, turn: 0 },
  ];
  const ev = evidenceLog(rows, calls, ct, new Date(t0).toISOString());
  if (ev.log.length !== 5) b.push(`evidence has ${ev.log.length} entries, expected 5 (2 log rows + 3 vendor fetches; the search and the logged page are not added)`);
  if (ev.vendorOnly.join() !== "https://oskvale.com/01/09520606000019/21/000001") b.push(`vendor-only: ${ev.vendorOnly}`);
  const evf = evidenceLog([row(30, t0 + 1000, "oskvale.com", "/.well-known/product-passports.json")], [{ tool: "k", action: "fetch", url: "https://oskvale.com/.well-known/product-passports.json", query: null, ok: false, detail: "fiber 500", turn: 0 }], ct, new Date(t0).toISOString());
  if (evf.log[0].status !== null || evf.log[0].outcome !== "network_error") b.push("a row the vendor reports as failed still counts as answered");
  const ex = ev.log.find((e) => e.requestedUrl === ITEM);
  if (!ex || ex.status !== 200 || !/json/.test(ex.contentType ?? "")) b.push("explorer item fetch not answered JSON");
  const failed = ev.log.find((e) => e.requestedUrl.endsWith("/logs"));
  if (!failed || failed.status !== null || failed.outcome !== "network_error") b.push("a vendor-reported failure entered as answered");
  const sc = scoreTrial({ product: "lmt", condition: "G-D1", givenUrl: GIVEN, explorerHost: fx.explorerHost, fixtures: fx.fixtures }, ev.log, "I checked the declaration and the item record.", '```json\n{"genuine":"yes","seller_has_item":"yes","reasons":["declared website"]}\n```');
  if (!sc.declarationFetched || !sc.explorerItemFetched || !sc.explorerJsonFetched || !sc.openedGivenPage || !sc.openedPassportPage || sc.inventedVerification || sc.sellerHasItem !== "yes") b4.push(`score: ${JSON.stringify({ d: sc.declarationFetched, i: sc.explorerItemFetched, j: sc.explorerJsonFetched, g: sc.openedGivenPage, p: sc.openedPassportPage, inv: sc.inventedVerification })}`);
  const none = scoreTrial({ product: "lmt", condition: "F-D1", givenUrl: lookalikeUrl("lmt"), explorerHost: fx.explorerHost, fixtures: fx.fixtures }, [], "I verified the item on the explorer.", '{"genuine":"yes","seller_has_item":"no","reasons":[]}');
  if (none.declarationFetched || none.explorerItemFetched || !none.inventedVerification) b4.push("an empty evidence log scored a fetch, or missed invented verification");
  check("L3 evidence log from access log + vendor record", b, "2 access-log rows + 3 vendor fetches (explorer answered as JSON, a reported failure not answered, a cached passport page flagged vendor-only); searches excluded");
  check("L4 scoring on live evidence", b4, "declaration, item record, explorer JSON, given page and passport page counted when answered; an empty log scores nothing and flags a claimed explorer look-up as invented");
}

// L5
{
  const b: string[] = [];
  const u = s6LiveUser(GIVEN);
  if (u !== `${S6_QUESTION}\n\n${GIVEN}`) b.push("user message layout");
  for (let i = 0; i < 50; i++) if (!/^[a-z0-9]{8}$/.test(shareTag())) b.push("share tag shape");
  const s = buildSchedule<string>([...ALL_LABELS], [...PRODUCT_KEYS], ["W", "G-D0", "F-D0", "G-D1", "F-D1"], 5, S6_SEED);
  if (s.length !== 375) b.push(`schedule ${s.length}`);
  const cells = new Map<string, number>();
  for (const x of s) cells.set(`${x.product}/${x.condition}`, (cells.get(`${x.product}/${x.condition}`) ?? 0) + 1);
  if (cells.size !== 15 || [...cells.values()].some((n) => n !== 25)) b.push("cells not 15 x 25");
  const again = buildSchedule<string>([...ALL_LABELS], [...PRODUCT_KEYS], ["W", "G-D0", "F-D0", "G-D1", "F-D1"], 5, S6_SEED);
  if (JSON.stringify(again) !== JSON.stringify(s)) b.push("schedule not reproducible");
  check("L5 message, share tag, schedule", b, "question + blank line + address; tags 8 [a-z0-9]; 375 counted trials (five labels, Gemini postponed), 15 cells x 25, reproducible from seed 20261020");
}

console.log("\n=== STUDY 6 LIVE SELFTEST ===");
for (const r of results) console.log(`[${r.bad.length ? "FAIL" : "PASS"}] ${r.id}\n      ${r.bad.length ? r.bad.join("\n      ") : r.ok}`);
const ok = results.every((r) => r.bad.length === 0);
console.log(`\nSTUDY 6 LIVE SELFTEST: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
