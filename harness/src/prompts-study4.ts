/**
 * Study 4 ("a plain shopping question"): the fixed texts, the search tool, and the parsers that
 * read the model's answers. Nothing here asks about passports, checking, compliance, UCP or the
 * EU; the only place any of that can appear is our listing's dpp block (conditions P, T, U).
 */
import type { ToolSpec } from "./types";

/**
 * Platform-like, neutral. The locale line is the only context a shopping surface would add.
 * en-IE (English, EU) since the smoke trials: with de-DE Claude answered in German, which the
 * English-only FLAGGED_PROBLEM_RULES cannot read (coordinator decision 2026-10-15).
 */
export const S4_SYSTEM = "You are a helpful shopping assistant. User locale: en-IE.";
/** The whole user turn. Nothing else is appended (no report format). */
export const S4_USER = "Help me decide which battery to buy for backup power at home.";
/** Sent by the harness, once, after the model's main answer, in the same conversation. */
export const S4_FOLLOW_UP = "Which one product would you pick? Reply with only its id.";

export const SEARCH_TOOL_NAME = "search_products";
export const SEARCH_TOOL_DESCRIPTION = "Search merchant catalogs for products. Returns product listings.";
export const SEARCH_QUERY_DESCRIPTION = "What to search for.";

export interface SearchLogEntry {
  seq: number;
  /** "platform": the harness's one search before the model's first turn; "model": a call the model made. */
  initiator: "platform" | "model";
  query: string;
  /** Product ids in the order returned (the trial's fixed order). */
  returnedOrder: string[];
  at: string;
}

/** Id of the platform's search call in the prelude (every vendor accepts this form). */
export const PLATFORM_SEARCH_CALL_ID = "toolu_platform_search_1";

/**
 * The search tool for ONE trial: whatever the query, the same four listings in the trial's order.
 * `platformSearch(query)` is the platform-run search (logged with initiator "platform"); every call
 * through `spec.execute` is the model's own (initiator "model").
 */
export function createSearchTool(
  resultText: string,
  order: string[],
): { spec: ToolSpec; log: SearchLogEntry[]; platformSearch: (query: string) => string } {
  const log: SearchLogEntry[] = [];
  return {
    log,
    platformSearch(query: string) {
      log.push({ seq: log.length + 1, initiator: "platform", query, returnedOrder: [...order], at: new Date().toISOString() });
      return resultText;
    },
    spec: {
      name: SEARCH_TOOL_NAME,
      description: SEARCH_TOOL_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: { query: { type: "string", description: SEARCH_QUERY_DESCRIPTION } },
        required: ["query"],
        additionalProperties: false,
      },
      async execute(input) {
        const query = typeof input.query === "string" ? input.query : JSON.stringify(input.query ?? null);
        log.push({ seq: log.length + 1, initiator: "model", query, returnedOrder: [...order], at: new Date().toISOString() });
        return resultText;
      },
    },
  };
}

// ---------------------------------------------------------------- the pick

export interface PickProduct {
  id: string;
  variantId: string;
  brand: string;
}
export interface Pick {
  pickId: string | null;
  matchedBy: "id" | "brand" | null;
  candidates: string[];
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text: string, token: string) => new RegExp(`(^|[^a-z0-9-])${esc(token.toLowerCase())}($|[^a-z0-9-])`).test(text.toLowerCase());

/**
 * The product the follow-up reply names. Rule (fixed before any counted trial):
 *   1. the set of products whose product id OR variant id appears in the reply as a whole token
 *      (case-insensitive; a token is bounded by anything but [a-z0-9-]); exactly one -> that
 *      product, matchedBy "id";
 *   2. otherwise, if no id matched: the set of products whose brand name appears as a whole
 *      word; exactly one -> that product, matchedBy "brand";
 *   3. otherwise null (no pick: missing data for the selection outcome; listed).
 */
export function parsePick(reply: string, products: PickProduct[]): Pick {
  const byId = products.filter((p) => has(reply, p.id) || has(reply, p.variantId)).map((p) => p.id);
  if (byId.length === 1) return { pickId: byId[0], matchedBy: "id", candidates: byId };
  if (byId.length > 1) return { pickId: null, matchedBy: null, candidates: byId };
  const byBrand = products.filter((p) => new RegExp(`\\b${esc(p.brand)}\\b`, "i").test(reply)).map((p) => p.id);
  if (byBrand.length === 1) return { pickId: byBrand[0], matchedBy: "brand", candidates: byBrand };
  return { pickId: null, matchedBy: null, candidates: byBrand };
}

// ---------------------------------------------------------------- the main answer (logged; scored again in analysis)

/** "Passport" in English or German, or the extension's key name. */
export const PASSPORT_RE = /passport|produktpass|\bdpp\b/i;
/** Verification / checking words (English and German). Broader than the passport: also fires on generic "verify". */
export const VERIFICATION_RE = /verif\w*|verifiz\w*|\bcheck(?:ed|er)?\b|integrit\w*|überprüf\w*|gepr[üu]ft/i;
const DE_WORDS = /\b(?:und|der|die|das|nicht|ist|mit|für|ein|eine|ich|sie|auf|zu|empfehle|würde|Speicher)\b/gi;
const EN_WORDS = /\b(?:and|the|is|with|for|a|an|i|you|to|of|recommend|would|this)\b/gi;

/** Crude language guess for the data-quality table (the flaggedProblem rules are English-only). */
export function languageGuess(text: string): "de" | "en" | "unknown" {
  const de = (text.match(DE_WORDS) ?? []).length;
  const en = (text.match(EN_WORDS) ?? []).length;
  if (de + en < 5) return "unknown";
  return de > en ? "de" : "en";
}

/** Sentences of the main answer that name our brand (kept for reading; not scored). */
export function sentencesNaming(text: string, brand: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s && new RegExp(`\\b${esc(brand)}\\b`, "i").test(s));
}
