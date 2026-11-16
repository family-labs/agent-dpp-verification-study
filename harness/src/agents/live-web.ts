/**
 * Study 6 LIVE: one adapter per vendor, each with that vendor's OWN web tool (study6-live-models.ts).
 * The model gets the shopper's message with the page address in it, browses the live sites with its
 * vendor's tool, answers, then gets ONE fixed follow-up in the same conversation with the web tools
 * off (or left out where a vendor has no "off" switch for built-in tools: Gemini, OpenRouter).
 *
 * Every adapter returns, besides the two texts:
 *   webCalls  every web action the VENDOR reports (fetch / search / open_page / find_in_page), with
 *             the URL or query and whether the vendor says it succeeded. This is the vendor's own
 *             record; for our two hosts the Worker's access log is the second, independent record.
 *   fees      tool calls that may be billed, counted conservatively (study6-live-models.ts)
 *   raw       every API response body, unchanged, for audit (saved beside the results, git-ignored)
 *
 * Vendor-default reasoning everywhere (no effort or thinking setting is sent), as in Studies 2-6.
 * Keys come from the environment and are never logged; error strings never carry a URL with a key.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CallUsage } from "../types";
import { postJsonWithRetry } from "./http";
import { LIVE_TOOL_LIMITS, TOOL_FEES_USD, type BillingVendor } from "../study6-live-models";
import type { ProviderPin } from "./openrouter";
import { conversationAdapter } from "./conversation";
import { createFetchTool } from "../fetch-tool";
import { BRAND_HOST, LOOKALIKE_HOST, MAINNET_EXPLORER_HOST } from "../../../stimulus/study6";
import type { ExtraTool } from "../verify-tool";

export type WebAction = "fetch" | "search" | "open_page" | "find_in_page" | "other";
export interface WebCall {
  tool: string;
  action: WebAction;
  url: string | null;
  query: string | null;
  /** true = the vendor reports success; false = the vendor reports an error; null = the vendor does not say. */
  ok: boolean | null;
  detail: string | null;
  turn: number;
}
export interface LiveResult {
  text: string;
  followUpText: string;
  webCalls: WebCall[];
  fees: { searches: number; fetches: number; usd: number };
  mainCalls: number;
  mainLoopLimit: boolean;
  raw: unknown[];
  reportedCostUsd: number | null;
  provider: string[];
}
export interface LiveRunArgs {
  system: string;
  user: string;
  followUp: string;
  onUsage: (u: CallUsage) => void;
  /**
   * Study 8: one client-side tool offered beside the vendor's own web tools (the open verify tool). The
   * harness runs it when the model calls it and returns its output unchanged; its calls are in its own log.
   */
  extraTool?: ExtraTool;
}
/** The extra tool's JSON input schema as vendors take it (the MCP schema minus its "$schema" key). */
const extraParams = (t: ExtraTool) => Object.fromEntries(Object.entries(t.spec.parameters).filter(([k]) => k !== "$schema"));
const parseArgs = (s: string | undefined): unknown => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return { input: s ?? "" };
  }
};
export interface LiveAdapter {
  vendor: BillingVendor;
  modelId: string;
  run(a: LiveRunArgs): Promise<LiveResult>;
}

const LOOP_LIMIT_TEXT = "(no final answer: the tool loop hit its turn limit)";
const isUrl = (s: unknown): s is string => typeof s === "string" && /^https?:\/\//i.test(s);
/** Every URL-valued string under a key named like url/uri/link anywhere in a JSON value (for vendors whose shapes are not fully documented). */
export function urlsDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => urlsDeep(x, out));
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      if (/^(url|uri|link|retrieved_?url|retrievedUrl|source_?url)$/i.test(k) && isUrl(x)) out.push(x);
      else urlsDeep(x, out);
    }
  return out;
}

// ---------------------------------------------------------------- OpenAI (Responses API, web_search)

type OaItem = {
  type: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  status?: string;
  action?: { type?: string; query?: string; url?: string; pattern?: string; sources?: Array<{ url?: string; type?: string }> };
  content?: Array<{ type: string; text?: string; annotations?: unknown[] }>;
};
type OaResp = {
  id: string;
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output: OaItem[];
  usage?: { input_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
};
export function openaiWebCalls(r: OaResp, turn: number): WebCall[] {
  const out: WebCall[] = [];
  for (const it of r.output ?? []) {
    if (it.type !== "web_search_call") continue;
    const t = it.action?.type ?? "other";
    const action: WebAction = t === "search" ? "search" : t === "open_page" ? "open_page" : t === "find_in_page" || t === "find" ? "find_in_page" : "other";
    out.push({ tool: "web_search", action, url: it.action?.url ?? null, query: it.action?.query ?? it.action?.pattern ?? null, ok: it.status ? it.status === "completed" : null, detail: it.action?.sources?.length ? `sources: ${it.action.sources.map((s) => s.url).filter(Boolean).join(" ")}` : null, turn });
  }
  return out;
}
const oaText = (r: OaResp) =>
  r.output
    .filter((i) => i.type === "message")
    .flatMap((i) => i.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("\n");

function openaiLive(model: string): LiveAdapter {
  return {
    vendor: "openai",
    modelId: model,
    async run({ system, user, followUp, onUsage, extraTool }) {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error("OPENAI_API_KEY not set");
      const raw: unknown[] = [];
      const tools: Array<Record<string, unknown>> = [{ type: "web_search" }, ...(extraTool ? [{ type: "function", name: extraTool.spec.name, description: extraTool.spec.description, parameters: extraParams(extraTool) }] : [])];
      const call = async (body: Record<string, unknown>) => {
        const r = (await postJsonWithRetry("OpenAI", "https://api.openai.com/v1/responses", { model, tools, include: ["web_search_call.action.sources"], ...body }, { Authorization: `Bearer ${key}` })) as OaResp;
        raw.push(r);
        const u = r.usage ?? {};
        onUsage({ inputTokens: u.input_tokens ?? 0, cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0, outputTokens: u.output_tokens ?? 0, reasoningTokens: u.output_tokens_details?.reasoning_tokens ?? 0, modelReturned: r.model ?? null });
        if (r.status === "incomplete") throw new Error(`truncated: response incomplete (${r.incomplete_details?.reason ?? "unknown"}). Recorded as missing data.`);
        return r;
      };
      let main = await call({ instructions: system, input: [{ role: "user", content: user }] });
      const webCalls = openaiWebCalls(main, 0);
      // the extra tool: answer each function call and continue the same response chain
      let mainCalls = 1;
      let limit = false;
      const texts = [oaText(main)];
      for (let turn = 1; extraTool && main.output.some((i) => i.type === "function_call"); turn++) {
        if (turn >= LIVE_TOOL_LIMITS.maxTurns) {
          limit = true;
          break;
        }
        const outputs: Array<Record<string, unknown>> = [];
        for (const it of main.output.filter((i) => i.type === "function_call"))
          outputs.push({ type: "function_call_output", call_id: it.call_id, output: it.name === extraTool.spec.name ? await extraTool.call(parseArgs(it.arguments)) : `Unknown tool: ${it.name}` });
        main = await call({ instructions: system, previous_response_id: main.id, input: outputs });
        mainCalls++;
        webCalls.push(...openaiWebCalls(main, turn));
        texts.push(oaText(main));
      }
      const f = await call({ previous_response_id: main.id, input: [{ role: "user", content: followUp }], tool_choice: "none" });
      const n = webCalls.length + openaiWebCalls(f, mainCalls).length;
      const text = texts.filter(Boolean).join("\n") || (limit ? LOOP_LIMIT_TEXT : "");
      return { text, followUpText: oaText(f), webCalls, fees: { searches: n, fetches: 0, usd: n * TOOL_FEES_USD.openaiWebSearchCall }, mainCalls, mainLoopLimit: limit, raw, reportedCostUsd: null, provider: [] };
    },
  };
}

// ---------------------------------------------------------------- Gemini (url_context + google_search)

type GPart = { text?: string; thought?: boolean; [k: string]: unknown };
type GContent = { role: "user" | "model"; parts: GPart[] };
type GResp = {
  modelVersion?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number; toolUsePromptTokenCount?: number };
  candidates?: Array<{
    content?: GContent;
    finishReason?: string;
    urlContextMetadata?: { urlMetadata?: Array<{ retrievedUrl?: string; urlRetrievalStatus?: string }> };
    groundingMetadata?: { webSearchQueries?: string[]; groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
};
export function geminiWebCalls(r: GResp, turn: number): WebCall[] {
  const c = r.candidates?.[0];
  const out: WebCall[] = [];
  for (const m of c?.urlContextMetadata?.urlMetadata ?? []) out.push({ tool: "url_context", action: "fetch", url: m.retrievedUrl ?? null, query: null, ok: m.urlRetrievalStatus ? /SUCCESS/.test(m.urlRetrievalStatus) : null, detail: m.urlRetrievalStatus ?? null, turn });
  for (const q of c?.groundingMetadata?.webSearchQueries ?? []) out.push({ tool: "google_search", action: "search", url: null, query: q, ok: true, detail: null, turn });
  const chunks = (c?.groundingMetadata?.groundingChunks ?? []).map((g) => g.web?.uri).filter(Boolean);
  if (chunks.length) out.push({ tool: "google_search", action: "other", url: null, query: null, ok: true, detail: `grounding sources: ${chunks.join(" ")}`, turn });
  return out;
}
function geminiLive(model: string): LiveAdapter {
  return {
    vendor: "gemini",
    modelId: model,
    async run({ system, user, followUp, onUsage }) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY not set");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const raw: unknown[] = [];
      const contents: GContent[] = [{ role: "user", parts: [{ text: user }] }];
      const call = async (withTools: boolean) => {
        const req: Record<string, unknown> = { systemInstruction: { parts: [{ text: system }] }, contents, ...(withTools ? { tools: [{ url_context: {} }, { google_search: {} }] } : {}) };
        const r = (await postJsonWithRetry("Gemini", url, req, { "x-goog-api-key": key })) as GResp;
        raw.push(r);
        const u = r.usageMetadata ?? {};
        const thoughts = u.thoughtsTokenCount ?? 0;
        onUsage({ inputTokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0), cachedInputTokens: u.cachedContentTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + thoughts, reasoningTokens: thoughts, modelReturned: r.modelVersion ?? null });
        return r;
      };
      const textOf = (c?: GContent) => (c?.parts ?? []).filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("\n");
      const main = await call(true);
      const mc = main.candidates?.[0]?.content;
      const text = mc?.parts ? textOf(mc) : `(no candidates; finishReason=${main.candidates?.[0]?.finishReason ?? "none"})`;
      if (mc?.parts) contents.push({ role: "model", parts: mc.parts });
      contents.push({ role: "user", parts: [{ text: followUp }] });
      const f = await call(false);
      const webCalls = geminiWebCalls(main, 0);
      const searches = webCalls.filter((w) => w.action === "search").length;
      return { text, followUpText: textOf(f.candidates?.[0]?.content), webCalls, fees: { searches, fetches: webCalls.filter((w) => w.action === "fetch").length, usd: searches * TOOL_FEES_USD.geminiSearchQuery }, mainCalls: 1, mainLoopLimit: false, raw, reportedCostUsd: null, provider: [] };
    },
  };
}

// ---------------------------------------------------------------- Anthropic (web_fetch + web_search server tools)

const CLAUDE_MAX_TOKENS = 16000;
export const ANTHROPIC_LIVE_TOOLS = [
  { type: "web_fetch_20260318", name: "web_fetch", max_uses: LIVE_TOOL_LIMITS.maxFetches, use_cache: false },
  { type: "web_search_20260209", name: "web_search", max_uses: LIVE_TOOL_LIMITS.maxSearches },
] as const;
type Block = { type: string; id?: string; name?: string; input?: { url?: string; query?: string }; tool_use_id?: string; content?: unknown; text?: string };
export function anthropicWebCalls(content: Block[], turn: number): WebCall[] {
  const uses = new Map<string, Block>();
  const out: WebCall[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const b = v as Block;
    if (b.type === "server_tool_use" && b.id) uses.set(b.id, b);
    if ((b.type === "web_fetch_tool_result" || b.type === "web_search_tool_result") && b.tool_use_id) {
      const use = uses.get(b.tool_use_id);
      const c = b.content as { type?: string; url?: string; error_code?: string } | unknown[] | undefined;
      const err = c && !Array.isArray(c) && typeof c === "object" && /error/.test(String(c.type)) ? (c.error_code ?? "error") : null;
      if (b.type === "web_fetch_tool_result")
        out.push({ tool: "web_fetch", action: "fetch", url: (c && !Array.isArray(c) && typeof c === "object" ? c.url : undefined) ?? use?.input?.url ?? null, query: null, ok: err === null, detail: err, turn });
      else out.push({ tool: "web_search", action: "search", url: null, query: use?.input?.query ?? null, ok: err === null, detail: err ?? (Array.isArray(c) ? `results: ${urlsDeep(c).join(" ")}` : null), turn });
    }
    for (const x of Object.values(b)) if (x && typeof x === "object") walk(x);
  };
  walk(content);
  // a fetch or search with no result block (e.g. stopped by pause_turn) is still a call
  const seen = new Set(out.map((o) => `${o.tool}|${o.url ?? o.query}`));
  for (const u of uses.values()) {
    const key = `${u.name}|${u.input?.url ?? u.input?.query}`;
    if (!seen.has(key) && (u.name === "web_fetch" || u.name === "web_search")) out.push({ tool: u.name, action: u.name === "web_fetch" ? "fetch" : "search", url: u.input?.url ?? null, query: u.input?.query ?? null, ok: null, detail: "no result block", turn });
  }
  return out;
}
function anthropicLive(model: string): LiveAdapter {
  return {
    vendor: "anthropic",
    modelId: model,
    async run({ system, user, followUp, onUsage, extraTool }) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const tools = [...ANTHROPIC_LIVE_TOOLS, ...(extraTool ? [{ name: extraTool.spec.name, description: extraTool.spec.description, input_schema: extraParams(extraTool) }] : [])];
      const client = new Anthropic({ maxRetries: 2 });
      const raw: unknown[] = [];
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
      let searchRequests = 0;
      let fetchRequests = 0;
      const call = async (noTools: boolean) => {
        const res = (await client.messages.create({
          model,
          max_tokens: CLAUDE_MAX_TOKENS,
          system,
          messages,
          tools: tools as unknown as Anthropic.Messages.ToolUnion[],
          ...(noTools ? { tool_choice: { type: "none" as const } } : {}),
        })) as Anthropic.Message & { usage: Anthropic.Usage & { server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number } } };
        raw.push(res);
        const u = res.usage;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const cacheWrite = u.cache_creation_input_tokens ?? 0;
        searchRequests += u.server_tool_use?.web_search_requests ?? 0;
        fetchRequests += u.server_tool_use?.web_fetch_requests ?? 0;
        onUsage({ inputTokens: u.input_tokens + cacheRead + cacheWrite, cachedInputTokens: cacheRead, cacheWriteInputTokens: cacheWrite, outputTokens: u.output_tokens, reasoningTokens: 0, modelReturned: res.model ?? null });
        if (res.stop_reason === "max_tokens") throw new Error(`truncated: stop_reason=max_tokens at max_tokens=${CLAUDE_MAX_TOKENS}. Recorded as missing data, NOT as a wrong answer.`);
        if (res.stop_reason === "refusal") throw new Error("refused: stop_reason=refusal. Recorded as missing data, not as a verdict.");
        return res;
      };
      const textOf = (r: Anthropic.Message) => r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      let text = LOOP_LIMIT_TEXT;
      let mainCalls = 0;
      let limit = true;
      const assistantBlocks: Block[] = [];
      let lastText = "";
      for (let i = 0; i < LIVE_TOOL_LIMITS.maxTurns; i++) {
        const res = await call(false);
        mainCalls++;
        assistantBlocks.push(...(res.content as unknown as Block[]));
        lastText = textOf(res);
        // pause_turn: the server paused a long tool turn; send the assistant content back to continue it
        if (res.stop_reason === "pause_turn") {
          const prev = messages[messages.length - 1];
          if (prev.role === "assistant" && Array.isArray(prev.content)) (prev.content as Anthropic.ContentBlockParam[]).push(...(res.content as unknown as Anthropic.ContentBlockParam[]));
          else messages.push({ role: "assistant", content: res.content });
          continue;
        }
        const prev = messages[messages.length - 1];
        if (prev.role === "assistant" && Array.isArray(prev.content)) (prev.content as Anthropic.ContentBlockParam[]).push(...(res.content as unknown as Anthropic.ContentBlockParam[]));
        else messages.push({ role: "assistant", content: res.content });
        // the extra tool: answer every tool_use block for it and continue
        if (res.stop_reason === "tool_use" && extraTool) {
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const b of res.content)
            if (b.type === "tool_use") results.push({ type: "tool_result", tool_use_id: b.id, content: b.name === extraTool.spec.name ? await extraTool.call(b.input) : `Unknown tool: ${b.name}` });
          messages.push({ role: "user", content: results });
          continue;
        }
        if (res.stop_reason !== "end_turn" && res.stop_reason !== "stop_sequence") throw new Error(`unexpected stop_reason=${res.stop_reason}. Recorded as missing data.`);
        text = assistantBlocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
        limit = false;
        break;
      }
      if (limit) text = lastText || LOOP_LIMIT_TEXT;
      messages.push({ role: "user", content: followUp });
      const f = await call(true);
      const webCalls = anthropicWebCalls(assistantBlocks, 0);
      return { text, followUpText: textOf(f), webCalls, fees: { searches: searchRequests, fetches: fetchRequests, usd: searchRequests * TOOL_FEES_USD.anthropicWebSearch }, mainCalls, mainLoopLimit: limit, raw, reportedCostUsd: null, provider: [] };
    },
  };
}

// ---------------------------------------------------------------- Kimi (official tools moonshot/fetch + moonshot/web-search)

export const KIMI_FORMULAS = ["moonshot/fetch:latest", "moonshot/web-search:latest"] as const;
type KTool = { type: "function"; function: { name: string; description?: string; parameters?: unknown } };
type KMsg = { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>; tool_call_id?: string; reasoning_content?: string };
const kimiBase = () => process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1";
let kimiToolCache: { tools: KTool[]; byName: Map<string, string> } | null = null;
async function kimiTools(key: string): Promise<{ tools: KTool[]; byName: Map<string, string> }> {
  if (kimiToolCache) return kimiToolCache;
  const tools: KTool[] = [];
  const byName = new Map<string, string>();
  for (const uri of KIMI_FORMULAS) {
    const res = await fetch(`${kimiBase()}/formulas/${uri}/tools`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Kimi formula ${uri} tools: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const j = (await res.json()) as { tools?: KTool[] };
    for (const t of j.tools ?? []) {
      tools.push(t);
      byName.set(t.function.name, uri);
    }
  }
  if (!tools.length) throw new Error("Kimi official tools: no declarations returned");
  kimiToolCache = { tools, byName };
  return kimiToolCache;
}
function kimiLive(model: string): LiveAdapter {
  return {
    vendor: "kimi",
    modelId: model,
    async run({ system, user, followUp, onUsage, extraTool }) {
      const key = process.env.KIMI_API_KEY;
      if (!key) throw new Error("KIMI_API_KEY not set");
      const official = await kimiTools(key);
      const byName = official.byName;
      const tools: KTool[] = [...official.tools, ...(extraTool ? [{ type: "function" as const, function: { name: extraTool.spec.name, description: extraTool.spec.description, parameters: extraParams(extraTool) } }] : [])];
      const raw: unknown[] = [];
      const webCalls: WebCall[] = [];
      let searches = 0;
      let fetches = 0;
      const messages: KMsg[] = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      const call = async (noTools: boolean) => {
        const req: Record<string, unknown> = { model, messages, tools, ...(noTools ? { tool_choice: "none" } : {}) };
        const d = (await postJsonWithRetry("Kimi", `${kimiBase()}/chat/completions`, req, { Authorization: `Bearer ${key}` })) as {
          model?: string;
          usage?: { prompt_tokens?: number; cached_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
          choices: Array<{ message: KMsg; finish_reason: string }>;
        };
        raw.push(d);
        onUsage({ inputTokens: d.usage?.prompt_tokens ?? 0, cachedInputTokens: d.usage?.cached_tokens ?? d.usage?.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0, reasoningTokens: d.usage?.completion_tokens_details?.reasoning_tokens ?? 0, modelReturned: d.model ?? null });
        return d.choices[0].message;
      };
      let text = LOOP_LIMIT_TEXT;
      let mainCalls = 0;
      let limit = true;
      for (let i = 0; i < LIVE_TOOL_LIMITS.maxTurns; i++) {
        const used = fetches >= LIVE_TOOL_LIMITS.maxFetches && searches >= LIVE_TOOL_LIMITS.maxSearches;
        const msg = await call(used);
        mainCalls++;
        messages.push({ role: "assistant", content: msg.content ?? "", ...(msg.tool_calls && msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}), ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });
        if (!msg.tool_calls?.length) {
          text = msg.content ?? "";
          limit = false;
          break;
        }
        for (const c of msg.tool_calls) {
          // the extra tool runs here and is not a web call
          if (extraTool && c.function.name === extraTool.spec.name) {
            messages.push({ role: "tool", content: await extraTool.call(parseArgs(c.function.arguments)), tool_call_id: c.id });
            continue;
          }
          const uri = byName.get(c.function.name);
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(c.function.arguments || "{}");
          } catch {
            /* passed through unparsed */
          }
          const isSearch = uri?.includes("web-search") ?? false;
          const url = Object.values(args).find(isUrl) ?? null;
          const query = isSearch ? (Object.values(args).find((x) => typeof x === "string" && !isUrl(x)) as string | undefined) ?? null : null;
          let result = "";
          let ok: boolean | null = null;
          let detail: string | null = null;
          const over = isSearch ? searches >= LIVE_TOOL_LIMITS.maxSearches : fetches >= LIVE_TOOL_LIMITS.maxFetches;
          if (!uri) result = `Unknown tool: ${c.function.name}`;
          else if (over) {
            result = "Tool limit reached for this conversation.";
            detail = "limit";
            ok = false;
          } else {
            if (isSearch) searches++;
            else fetches++;
            try {
              const fr = (await postJsonWithRetry("Kimi fiber", `${kimiBase()}/formulas/${uri}/fibers`, { name: c.function.name, arguments: c.function.arguments }, { Authorization: `Bearer ${key}` })) as { status?: string; context?: { output?: string; encrypted_output?: string }; error?: unknown };
              raw.push({ fiber: uri, name: c.function.name, status: fr.status, error: fr.error ?? null, outputChars: (fr.context?.output ?? fr.context?.encrypted_output ?? "").length });
              result = fr.context?.output || fr.context?.encrypted_output || "";
              ok = fr.status === "succeeded";
              detail = fr.status ?? null;
            } catch (e) {
              result = "The tool failed.";
              ok = false;
              detail = e instanceof Error ? e.message.slice(0, 200) : String(e);
            }
          }
          webCalls.push({ tool: uri ?? c.function.name, action: isSearch ? "search" : "fetch", url, query, ok, detail, turn: i });
          messages.push({ role: "tool", content: result, tool_call_id: c.id });
        }
      }
      messages.push({ role: "user", content: followUp });
      const f = await call(true);
      return { text, followUpText: f.content ?? "", webCalls, fees: { searches, fetches, usd: searches * TOOL_FEES_USD.kimiWebSearch + fetches * TOOL_FEES_USD.kimiFetch }, mainCalls, mainLoopLimit: limit, raw, reportedCostUsd: null, provider: [] };
    },
  };
}

// ---------------------------------------------------------------- OpenRouter (Meta models, openrouter:web_fetch)

export const OPENROUTER_LIVE_TOOL = { type: "openrouter:web_fetch", parameters: { engine: "openrouter", max_uses: LIVE_TOOL_LIMITS.maxFetches } } as const;
function openrouterLive(model: string, pin: ProviderPin): LiveAdapter {
  return {
    vendor: "openrouter",
    modelId: model,
    async run({ system, user, followUp, onUsage, extraTool }) {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY not set");
      const raw: unknown[] = [];
      const providers: string[] = [];
      let reported = 0;
      type OrCall = { id: string; type: "function"; function: { name: string; arguments: string } };
      const messages: Array<{ role: string; content: string | null; tool_calls?: OrCall[]; tool_call_id?: string }> = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      const fnTool = extraTool ? { type: "function", function: { name: extraTool.spec.name, description: extraTool.spec.description, parameters: extraParams(extraTool) } } : null;
      // the main turns get the web tool (+ the extra tool); the follow-up gets no tools
      const call = async (withTools: boolean) => {
        const req: Record<string, unknown> = { model, messages, provider: pin, max_tokens: 16000, usage: { include: true }, ...(withTools ? { tools: [OPENROUTER_LIVE_TOOL, ...(fnTool ? [fnTool] : [])] } : {}) };
        const d = (await postJsonWithRetry("OpenRouter", "https://openrouter.ai/api/v1/chat/completions", req, { Authorization: `Bearer ${key}` })) as {
          model?: string;
          provider?: string;
          usage?: { prompt_tokens?: number; prompt_tokens_details?: { cached_tokens?: number }; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number }; cost?: number; server_tool_use?: Record<string, number> };
          choices: Array<{ message: { content: string | null; annotations?: unknown[]; tool_calls?: OrCall[] }; finish_reason: string }>;
        };
        raw.push(d);
        if (d.provider) providers.push(d.provider);
        reported += d.usage?.cost ?? 0;
        onUsage({ inputTokens: d.usage?.prompt_tokens ?? 0, cachedInputTokens: d.usage?.prompt_tokens_details?.cached_tokens ?? 0, outputTokens: d.usage?.completion_tokens ?? 0, reasoningTokens: d.usage?.completion_tokens_details?.reasoning_tokens ?? 0, modelReturned: d.model ?? null });
        return d;
      };
      const mains = [await call(true)];
      // the extra tool: answer each function call and continue
      let limit = false;
      for (let turn = 1; extraTool && mains[mains.length - 1].choices?.[0]?.message?.tool_calls?.length; turn++) {
        if (turn >= LIVE_TOOL_LIMITS.maxTurns) {
          limit = true;
          break;
        }
        const msg = mains[mains.length - 1].choices[0].message;
        messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
        for (const c of msg.tool_calls ?? []) messages.push({ role: "tool", tool_call_id: c.id, content: c.function.name === extraTool.spec.name ? await extraTool.call(parseArgs(c.function.arguments)) : `Unknown tool: ${c.function.name}` });
        mains.push(await call(true));
      }
      const text = mains.map((m) => m.choices?.[0]?.message?.content ?? "").filter(Boolean).join("\n") || (limit ? LOOP_LIMIT_TEXT : "");
      // The follow-up carries the answer text only, as it does without the extra tool (server-tool fetches
      // never enter the history either): the extra tool's turns are dropped, because the provider of one
      // pinned model refuses any tool_choice but "auto" and a history with tool calls needs the tool declared.
      for (let k = messages.length - 1; k >= 2; k--) if (messages[k].role === "tool" || messages[k].tool_calls?.length) messages.splice(k, 1);
      messages.push({ role: "assistant", content: text });
      messages.push({ role: "user", content: followUp });
      const f = await call(false);
      // OpenRouter does not document how server-tool fetches appear in the response: every URL-valued
      // field anywhere in it is recorded (ok unknown); our access log is the authority for our hosts.
      const urls = [...new Set(mains.flatMap((m) => urlsDeep(m)))];
      const webCalls: WebCall[] = urls.map((u) => ({ tool: "openrouter:web_fetch", action: "fetch" as const, url: u, query: null, ok: null, detail: "URL found in the response body", turn: 0 }));
      const fetchCount = mains
        .map((m) => (m as { usage?: { server_tool_use?: Record<string, number> } }).usage?.server_tool_use ?? {})
        .flatMap((st) => Object.entries(st))
        .filter(([k]) => /fetch/i.test(k))
        .reduce((s, [, v]) => s + (Number(v) || 0), 0);
      return { text, followUpText: f.choices?.[0]?.message?.content ?? "", webCalls, fees: { searches: 0, fetches: fetchCount, usd: fetchCount * TOOL_FEES_USD.openrouterFetch }, mainCalls: mains.length, mainLoopLimit: limit, raw, reportedCostUsd: reported, provider: [...new Set(providers)] };
    },
  };
}

// ---------------------------------------------------------------- Gemini with a generic LIVE fetch tool (label "geminifetch")

/**
 * Gemini's own URL tool refused the brand-new domains at the tool check, so Gemini also runs with the
 * harness's generic fetch_url (Study 2's tool: GET, no JavaScript, no search, 8 fetches, bodies cut at
 * 30,000 characters), which here fetches the LIVE sites and the live explorer. Allowed hosts: the two
 * shops and the explorer; anything else answers "host not reachable". Reported separately.
 */
export const GEMINI_FETCH_HOSTS = [BRAND_HOST, LOOKALIKE_HOST, MAINNET_EXPLORER_HOST] as const;
function geminiFetchLive(model: string): LiveAdapter {
  return {
    vendor: "gemini",
    modelId: model,
    async run({ system, user, followUp, onUsage }) {
      const tool = createFetchTool([], [], { realHosts: GEMINI_FETCH_HOSTS, pathPrefixes: {} });
      const raw: unknown[] = [];
      const out = await conversationAdapter("gemini", model).run({ system, user, followUp, tools: [tool.spec], onUsage, toolsExhausted: tool.exhausted, maxTurns: LIVE_TOOL_LIMITS.maxTurns });
      raw.push({ fetchLog: tool.log });
      const webCalls: WebCall[] = tool.log.map((e) => ({ tool: "fetch_url", action: "fetch" as const, url: e.requestedUrl, query: null, ok: e.status === 200, detail: `${e.outcome} ${e.status ?? ""}`.trim(), turn: 0 }));
      return { text: out.text, followUpText: out.followUpText, webCalls, fees: { searches: 0, fetches: tool.log.length, usd: 0 }, mainCalls: out.mainCalls, mainLoopLimit: out.mainLoopLimit, raw, reportedCostUsd: null, provider: [] };
    },
  };
}

/** The adapter for a live label: "geminifetch" is Gemini with the generic fetch tool; every other label uses its vendor's own tool. */
export function liveAdapter(vendor: BillingVendor, model: string, pin?: ProviderPin, label?: string): LiveAdapter {
  if (label === "geminifetch") return geminiFetchLive(model);
  if (vendor === "openai") return openaiLive(model);
  if (vendor === "gemini") return geminiLive(model);
  if (vendor === "anthropic") return anthropicLive(model);
  if (vendor === "kimi") return kimiLive(model);
  if (!pin) throw new Error(`no provider pin for ${model}`);
  return openrouterLive(model, pin);
}
