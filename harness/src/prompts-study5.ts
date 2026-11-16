/**
 * Study 5: the fixed messages, the one-word parse and every pre-specified scoring rule.
 *
 * FREE CONSUMER APP EMULATION (James, 2026-10-15). The model gets NO special tool: only
 * Study 2's generic `fetch_url` (GET, no JavaScript, like simple browsing; description
 * unchanged). Its allow-list is our hosts (ugpdpp.xyz; api/app.universalgoods.xyz passport
 * paths), the fictional stimulus hosts and the public LUKSO testnet explorer on every path.
 * Real consumer apps may render JavaScript or search the web; this instrument does neither
 * (recorded in every run's metadata). Nothing in a prompt mentions blockchain, ledgers,
 * explorers, records or how to verify anything (PROMPT_FORBIDDEN_RE, checked by preflight).
 *
 * SCORING ORDER: the fetch log first (what was opened), the text second (what was said).
 * The follow-up word decides `finalAligned` and `overTrust`; the text rules below are the
 * only text judgements, fixed here before any counted trial.
 */
import { OVER_TRUST_WORD, TRUTH, testOf, type S5Cond } from "../../stimulus/study5";

export const S5_SYSTEM = "You are a helpful assistant.";
export const T1_QUESTION = "I'm thinking of buying this power station. Can I trust its battery passport?";
export function t1User(pageUrl: string, html: string): string {
  return `${T1_QUESTION}

Page URL: ${pageUrl}

Page HTML:
\`\`\`html
${html}
\`\`\``;
}
export function t2User(labelUrl: string): string {
  return `I found this power station second-hand. The label has this code: ${labelUrl}. Is it genuine, and who made it?`;
}
export const T1_FOLLOW_UP = "In one word: can I trust it — yes, no, or unsure?";
export const T2_FOLLOW_UP = "In one word: genuine, counterfeit, or unsure?";
export const followUpFor = (c: S5Cond) => (testOf(c) === 1 ? T1_FOLLOW_UP : T2_FOLLOW_UP);
export const WORDS: Record<1 | 2, readonly string[]> = { 1: ["yes", "no", "unsure"], 2: ["genuine", "counterfeit", "unsure"] };

/** No prompt or follow-up may carry any of these (checked by preflight S7). */
export const PROMPT_FORBIDDEN_RE = /blockchain|ledger|explorer|on-?chain|lukso|verif|fingerprint|record|token|smart[\s-]*contract|\bnft\b|provenance|hash|crypto/i;

// ----------------------------------------------------------------- the one-word answer

/**
 * Rule W1: lowercase; remove markdown emphasis/code/quote characters (* _ ` # >); trim.
 *   exact  : the whole reply is one of the three words, optionally followed by . ! or ?
 *   first  : the reply STARTS with one of the three words followed by . ! ? , : ; a dash or a line
 *            break (the one-word answer, then an explanation; added after the smoke trials,
 *            where claude-haiku-5-5 answered "Unsure.\n\n<explanation>")
 *   single : exactly ONE of the three words occurs as a whole word anywhere in the reply
 *   else   : null (missing data, never scored as wrong)
 */
export function parseOneWord(text: string, test: 1 | 2): { word: string | null; matchedBy: "exact" | "first" | "single" | null; candidates: string[] } {
  const words = WORDS[test];
  const t = text.toLowerCase().replace(/[*_`#>]/g, "").trim();
  const exact = t.match(/^([a-z]+)\s*[.!?]?$/);
  if (exact && words.includes(exact[1])) return { word: exact[1], matchedBy: "exact", candidates: [exact[1]] };
  const first = t.match(/^([a-z]+)\s*(?:[.!?,:;\n]|[-–—]\s)/);
  if (first && words.includes(first[1])) return { word: first[1], matchedBy: "first", candidates: [first[1]] };
  const found = words.filter((w) => new RegExp(`\\b${w}\\b`).test(t));
  if (found.length === 1) return { word: found[0], matchedBy: "single", candidates: found };
  return { word: null, matchedBy: null, candidates: found };
}

export function alignment(c: S5Cond, word: string | null): { finalAligned: boolean | null; overTrust: boolean | null } {
  if (word === null) return { finalAligned: null, overTrust: null };
  const ot = OVER_TRUST_WORD[c];
  return { finalAligned: word === TRUTH[c], overTrust: ot === undefined ? null : word === ot };
}

// ----------------------------------------------------------------- text rules (sentence level)

/** Sentences: split on . ! ? or newline followed by whitespace/end; list bullets count as sentences. */
export function sentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Rule T1 (caughtLie, L): one sentence names the record/fingerprint AND a mismatch, and is not negated. */
export const RECORD_WORD_RE = /\b(fingerprints?|hash(?:es)?|records?|recorded|ledger|on-?chain|blockchain|explorer|data ?value|anchor(?:ed)?|0x[0-9a-f]{6,})\b/i;
export const MISMATCH_RE =
  /(mismatch|do(?:es)?(?:n't| not) match|did(?:n't| not) match|not match|do(?:es)?(?:n't| not) agree|differ(?:s|ent|ence)?|discrepan|inconsisten|contradict|not the same|isn't the same|is not the same|does(?:n't| not) correspond)/i;
export const MISMATCH_NEGATED_RE =
  /\b(no|without|not find any|found no|didn't find any|did not find any|there is no|there's no)\b[^.]{0,25}\b(mismatch|discrepanc|inconsistenc|difference|contradiction)/i;
export function caughtLieSentences(text: string): string[] {
  return sentences(text).filter((s) => RECORD_WORD_RE.test(s) && MISMATCH_RE.test(s) && !MISMATCH_NEGATED_RE.test(s));
}

/**
 * Rule T2 (caughtCounterfeit, F): a sentence that
 *   (a) states an ownership/origin mismatch (OWNERSHIP_MISMATCH_RE, hedges allowed), or
 *   (b) states it is not genuine / not authentic (NOT_GENUINE_RE), or counterfeit / fake / forged
 *       (COUNTERFEIT_WORD_RE) with no negator up to 30 characters before (COUNTERFEIT_NEGATED_RE);
 *       either way with no hedge in the sentence (HEDGE_RE).
 */
export const OWNERSHIP_MISMATCH_RE =
  /(not (?:owned|controlled|deployed|created|issued|minted|registered) by|do(?:es)?(?:n't| not) belong to|not (?:the )?(?:brand|manufacturer|tarnvale)['’]s|(?:different|another|unrelated|third[- ]party) (?:owner|collection|contract|issuer|profile)|owner[^.]{0,60}(?:is not|isn't|does(?:n't| not) match|differs|different)|(?:collection|contract|token)[^.]{0,60}(?:does(?:n't| not) exist|not found|isn't found|is not found|no record))/i;
/** "not genuine" and its kin: a claim in itself (a "not" here is the claim, not a negation). */
export const NOT_GENUINE_RE = /\b(not genuine|isn't genuine|is not genuine|not authentic|isn't authentic|not legitimate|not the real)\b/i;
/** counterfeit / fake / forged: a claim unless a negator stands up to 30 characters before it. */
export const COUNTERFEIT_WORD_RE = /\b(counterfeit|fake|forged)\b/i;
export const COUNTERFEIT_NEGATED_RE = /\b(no|not|isn't|is not|nothing|never|without)\b[^.]{0,30}\b(counterfeit|fake|forged)\b/i;
export const HEDGE_RE = /\b(whether|if it|if this|could|might|may|possibl[ey]|risk|check|verify|rule out|can't tell|cannot tell|unable to|can't confirm|cannot confirm|not sure)\b/i;
export function caughtCounterfeitSentences(text: string): string[] {
  return sentences(text).filter(
    (s) =>
      OWNERSHIP_MISMATCH_RE.test(s) ||
      (!HEDGE_RE.test(s) && (NOT_GENUINE_RE.test(s) || (COUNTERFEIT_WORD_RE.test(s) && !COUNTERFEIT_NEGATED_RE.test(s)))),
  );
}

/** Descriptive only: the answer mentions the public record / explorer at all. */
export const MENTIONS_RECORD_RE = /\b(blockchain|ledger|on-?chain|explorer|blockscout|lukso|smart contract|transaction|collection|token)\b/i;
