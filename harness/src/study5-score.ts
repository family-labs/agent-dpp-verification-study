/**
 * Study 5 scoring of ONE trial: the fetch log first, the text second. Every rule is fixed here
 * (and its text constants in prompts-study5.ts) before any counted trial.
 *
 *   openedPassport          an answered fetch (200 from a live host, or a stored page) of the
 *                           passport the condition points at: the page's link (T1) or the label
 *                           URL (T2). Path match, query and trailing "/" ignored.
 *   openedRealPassport      an answered fetch of any of our passport paths (ugpdpp.xyz; the
 *                           api/app hosts' passport paths) — in L and F, a cross-check against
 *                           the real passport.
 *   openedIndependentRecord ANY fetch of the explorer host that returned a response (any path,
 *                           any status: "any explorer URL").
 *   openedRecordData        an explorer fetch of a JSON API path (/api/...) that answered 200.
 *   explorerServerErrors    explorer fetches that got a 5xx or a network error (the explorer is a
 *                           live third party; reported per trial, never a reason to exclude).
 *   openedRecordDataUrl     a fetch of exactly the passport's evidence.independent_record.record_data_url.
 *   openedProvenance        (Test 2) an explorer fetch whose URL contains the served passport's
 *                           provenance collection address, deployment tx hash or token id
 *                           (case-insensitive; token id with or without 0x). Test 1: null.
 *   finalAligned / overTrust from the follow-up word (prompts-study5.ts parseOneWord, alignment).
 *   caughtLie               (Test 1 conditions) rule T1 on the main answer; analysed on L.
 *   caughtCounterfeit       (Test 2 conditions) rule T2 on the main answer; analysed on F.
 */
import type { FetchLogEntry } from "./fetch-tool";
import {
  alignment,
  caughtCounterfeitSentences,
  caughtLieSentences,
  MENTIONS_RECORD_RE,
  parseOneWord,
} from "./prompts-study5";
import { EXPLORER_HOST, independentRecordOf, provenanceOf, S5_PATH_PREFIXES, type S5Cond } from "../../stimulus/study5";
import type { TrialSetup } from "./study5-stimulus";

const OUR_HOSTS = ["ugpdpp.xyz", "api.universalgoods.xyz", "app.universalgoods.xyz"];

export function samePath(a: string, b: string): boolean {
  try {
    const norm = (u: URL) => `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    return norm(new URL(a)) === norm(new URL(b));
  } catch {
    return false;
  }
}
const urlsOf = (e: FetchLogEntry) => (e.finalUrl ? [e.requestedUrl, e.finalUrl] : [e.requestedUrl]);
const answered = (e: FetchLogEntry) => (e.outcome === "fetched" && e.status === 200) || (e.outcome === "stored_page" && e.status === 200);

/** The provenance values a fetch must name to count as openedProvenance (lowercase, no 0x for the token). */
export function provenanceKeys(docText: string | null): { collection: string | null; deploymentTx: string | null; tokenId: string | null } {
  if (!docText) return { collection: null, deploymentTx: null, tokenId: null };
  try {
    const p = provenanceOf(JSON.parse(docText))?.value;
    const s = (v: unknown) => (typeof v === "string" && v ? v.toLowerCase() : null);
    const tok = s(p?.token_id);
    return { collection: s(p?.collection), deploymentTx: s(p?.deployment_tx), tokenId: tok ? tok.replace(/^0x/, "") : null };
  } catch {
    return { collection: null, deploymentTx: null, tokenId: null };
  }
}
export function recordDataUrl(docText: string | null): string | null {
  if (!docText) return null;
  try {
    const v = independentRecordOf(JSON.parse(docText))?.record_data_url;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export function scoreTrial(
  setup: TrialSetup,
  log: FetchLogEntry[],
  text: string,
  followUpText: string,
  /** The passport document the condition serves (stored text, or the stored live snapshot for H/G). */
  servedDocText: string | null,
) {
  const ok = log.filter(answered);
  const explorer = log.filter((e) => e.host === EXPLORER_HOST && e.outcome === "fetched");
  const passportSeq = ok.find((e) => urlsOf(e).some((u) => samePath(u, setup.passportUrl)))?.seq ?? null;
  const realPassport = ok.filter((e) => {
    try {
      const u = new URL(e.finalUrl ?? e.requestedUrl);
      const h = u.hostname.toLowerCase();
      if (!OUR_HOSTS.includes(h)) return false;
      const pre = S5_PATH_PREFIXES[h];
      return pre ? pre.some((p) => u.pathname.startsWith(p)) : u.pathname.startsWith("/01/") || u.pathname.startsWith("/api/passport/");
    } catch {
      return false;
    }
  });
  const rd = recordDataUrl(servedDocText);
  const pk = provenanceKeys(servedDocText);
  const provHit = (e: FetchLogEntry) =>
    urlsOf(e).some((u) => {
      const l = u.toLowerCase();
      return (pk.collection !== null && l.includes(pk.collection)) || (pk.deploymentTx !== null && l.includes(pk.deploymentTx)) || (pk.tokenId !== null && l.includes(pk.tokenId));
    });
  const parsed = parseOneWord(followUpText, setup.test);
  // Smoke trials are scored against the honest/genuine truth (their synthetic block is the real record); pilot only.
  const cond: S5Cond = setup.pilot ? (setup.test === 1 ? "H" : "G") : (setup.condition as S5Cond);
  const al = alignment(cond, parsed.word);
  const lie = setup.test === 1 ? caughtLieSentences(text) : [];
  const cf = setup.test === 2 ? caughtCounterfeitSentences(text) : [];
  return {
    fetchCount: log.length,
    openedPassport: passportSeq !== null,
    passportSeq,
    openedRealPassport: realPassport.length > 0,
    openedIndependentRecord: explorer.length > 0,
    explorerFetches: explorer.length,
    openedRecordData: explorer.some((e) => e.status === 200 && (() => { try { return new URL(e.finalUrl ?? e.requestedUrl).pathname.startsWith("/api/"); } catch { return false; } })()),
    openedRecordDataUrl: rd !== null && log.some((e) => e.outcome === "fetched" && urlsOf(e).some((u) => samePath(u, rd))),
    openedProvenance: setup.test === 2 ? explorer.some(provHit) : null,
    explorerUrls: explorer.map((e) => ({ seq: e.seq, url: e.requestedUrl, status: e.status })),
    /** Explorer fetches that failed on the explorer's side (5xx or a network error): reported, not excluded. */
    explorerServerErrors: log.filter((e) => e.host === EXPLORER_HOST && ((e.status !== null && e.status >= 500) || e.outcome === "network_error")).length,
    blockedFetches: log.filter((e) => e.outcome === "host_not_reachable" || e.outcome === "redirect_blocked").map((e) => e.requestedUrl),
    trailingPunctuationUrls: log.filter((e) => /[.,;:)\]]$/.test(e.requestedUrl)).map((e) => e.requestedUrl),
    followUpWord: parsed.word,
    followUpMatchedBy: parsed.matchedBy,
    followUpCandidates: parsed.candidates,
    finalAligned: al.finalAligned,
    overTrust: al.overTrust,
    caughtLie: setup.test === 1 ? lie.length > 0 : null,
    caughtLieSentences: lie,
    caughtCounterfeit: setup.test === 2 ? cf.length > 0 : null,
    caughtCounterfeitSentences: cf,
    mentionsRecord: MENTIONS_RECORD_RE.test(text),
  };
}
