/**
 * Study 4: the four vendor adapters with ONE fixed follow-up user turn.
 *
 * The Study 2/3 adapters (openai.ts, gemini.ts, kimi.ts, anthropic-native.ts) are NOT edited;
 * they end a trial at the model's first answer without tool calls. Study 4 must ask one more
 * question after that answer ("Which one product would you pick? Reply with only its id."),
 * in the SAME conversation, so this file repeats their tool loops call for call (same
 * endpoints, same request bodies, same usage accounting, same verbatim history rules: Gemini
 * parts with thoughtSignature, Kimi reasoning_content on tool-calling turns, Claude content
 * blocks unchanged, vendor-default reasoning everywhere) and adds:
 *
 *   after the main answer: the final assistant turn is kept in the history exactly as
 *   returned, the follow-up text is sent as the next user turn, and ONE more API call is
 *   made with the same tools declared but tool use switched OFF (OpenAI/Kimi tool_choice
 *   "none", Gemini functionCallingConfig mode NONE, Claude tool_choice none). The tools stay
 *   declared because the history contains tool calls (Claude requires the definitions then).
 *   If the main loop hit maxTurns (the last turn is tool results), the follow-up text is
 *   appended to that same user turn (Claude, Gemini) or sent as a user message after the
 *   tool messages (OpenAI, Kimi), and `mainLoopLimit` is true.
 *
 * PLATFORM-RUN SEARCH (Study 4 after the smoke trials, coordinator decision 2026-10-15): a
 * shopping surface such as Google AI Mode fetches product data behind the scenes before the
 * model answers. When `prelude` is given, the conversation starts with that already-completed
 * tool call and its result, written in each vendor's NATIVE tool-call format, between the user
 * turn and the model's first turn:
 *   OpenAI   {role:"assistant", content:null, tool_calls:[{id, type:"function",
 *             function:{name, arguments:JSON.stringify(input)}}]}, then {role:"tool", tool_call_id, content:result}
 *   Kimi     the same, with content "" (Kimi's own assistant turns are sent back that way)
 *   Gemini   {role:"model", parts:[{functionCall:{name,args:input}, thoughtSignature:
 *             "skip_thought_signature_validator"}]} (Google's documented placeholder for a
 *             function call the model did not generate), then {role:"user",
 *             parts:[{functionResponse:{name, response:{result}}}]}
 *   Claude   {role:"assistant", content:[{type:"tool_use", id, name, input}]}, then
 *             {role:"user", content:[{type:"tool_result", tool_use_id:id, content:result}]}
 * The model keeps both tools: it may search again or fetch. No text is put in the model's voice.
 *
 * Usage of EVERY call (main and follow-up) goes through onUsage, so spend and the budget
 * abort cover the follow-up too. Keys are read from the environment and never logged.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CallUsage, ToolSpec } from "../types";
import { postJsonWithRetry } from "./http";

export type S4Vendor = "openai" | "gemini" | "kimi" | "anthropic";

export interface ConversationResult {
  /** The model's main answer (the first turn with no tool calls). */
  text: string;
  /** The model's reply to the follow-up question ("" if the call returned no text). */
  followUpText: string;
  toolCalls: Array<{ name: string; input: unknown; result?: string; turn: number }>;
  /** API calls in the main loop (excluding the follow-up call). */
  mainCalls: number;
  mainLoopLimit: boolean;
}

/** An already-completed tool call the platform made before the model's first turn. */
export interface PreludeCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result: string;
}
/** Gemini's documented placeholder signature for a function call the model did not generate. */
export const GEMINI_INJECTED_SIGNATURE = "skip_thought_signature_validator";

export interface ConversationAdapter {
  vendor: S4Vendor;
  modelId: string;
  run(opts: {
    system: string;
    user: string;
    followUp: string;
    tools: ToolSpec[];
    onUsage: (u: CallUsage) => void;
    toolsExhausted: () => boolean;
    maxTurns: number;
    prelude?: PreludeCall[];
  }): Promise<ConversationResult>;
}

const LOOP_LIMIT_TEXT = "(tool loop limit reached)";

// ---------------------------------------------------------------- OpenAI + Kimi (chat completions)

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};
type ChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

function chatAdapter(vendor: "openai" | "kimi", model: string): ConversationAdapter {
  const label = vendor === "openai" ? "OpenAI" : "Kimi";
  const url = () => (vendor === "openai" ? "https://api.openai.com/v1/chat/completions" : `${process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1"}/chat/completions`);
  const keyName = vendor === "openai" ? "OPENAI_API_KEY" : "KIMI_API_KEY";
  return {
    vendor,
    modelId: model,
    async run({ system, user, followUp, tools, onUsage, toolsExhausted, maxTurns, prelude = [] }) {
      const key = process.env[keyName];
      if (!key) throw new Error(`${keyName} not set`);
      const toolCalls: ConversationResult["toolCalls"] = [];
      const toolMap = new Map(tools.map((t) => [t.name, t]));
      const messages: ChatMessage[] = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      if (prelude.length) {
        messages.push({
          role: "assistant",
          content: vendor === "openai" ? null : "",
          tool_calls: prelude.map((p) => ({ id: p.id, type: "function" as const, function: { name: p.name, arguments: JSON.stringify(p.input) } })),
        });
        for (const p of prelude) messages.push({ role: "tool", content: p.result, tool_call_id: p.id });
      }
      const body: Record<string, unknown> = {
        model,
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
      };
      const call = async (noTools: boolean) => {
        const req: Record<string, unknown> = { ...body, messages };
        if (noTools) req.tool_choice = "none";
        const data = (await postJsonWithRetry(label, url(), req, { Authorization: `Bearer ${key}` })) as {
          model?: string;
          usage?: ChatUsage;
          choices: Array<{ message: ChatMessage; finish_reason: string }>;
        };
        onUsage({
          inputTokens: data.usage?.prompt_tokens ?? 0,
          cachedInputTokens: data.usage?.cached_tokens ?? data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          modelReturned: data.model ?? null,
        });
        return data.choices[0].message;
      };
      const push = (msg: ChatMessage) => {
        if (vendor === "openai") messages.push(msg);
        else
          messages.push({
            role: "assistant",
            content: msg.content ?? "",
            ...(msg.tool_calls && msg.reasoning_content ? { reasoning_content: msg.reasoning_content } : {}),
            ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
          });
      };
      let text = LOOP_LIMIT_TEXT;
      let mainCalls = 0;
      let limit = true;
      for (let i = 0; i < maxTurns; i++) {
        const msg = await call(toolsExhausted());
        mainCalls++;
        push(msg);
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          text = msg.content ?? "";
          limit = false;
          break;
        }
        for (const c of msg.tool_calls) {
          const spec = toolMap.get(c.function.name);
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(c.function.arguments || "{}");
          } catch {
            input = { _unparseable_arguments: c.function.arguments };
          }
          const result = spec ? await spec.execute(input) : `Unknown tool: ${c.function.name}`;
          toolCalls.push({ name: c.function.name, input, result, turn: i });
          messages.push({ role: "tool", content: result, tool_call_id: c.id });
        }
      }
      messages.push({ role: "user", content: followUp });
      const f = await call(true);
      return { text, followUpText: f.content ?? "", toolCalls, mainCalls, mainLoopLimit: limit };
    },
  };
}

// ---------------------------------------------------------------- Gemini

type Part =
  | { text: string; thought?: boolean }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: { result: string } } };
type Content = { role: "user" | "model"; parts: Part[] };
type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
};

function geminiConversation(model: string): ConversationAdapter {
  return {
    vendor: "gemini",
    modelId: model,
    async run({ system, user, followUp, tools, onUsage, toolsExhausted, maxTurns, prelude = [] }) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error("GEMINI_API_KEY not set");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const toolCalls: ConversationResult["toolCalls"] = [];
      const toolMap = new Map(tools.map((t) => [t.name, t]));
      const contents: Content[] = [{ role: "user", parts: [{ text: user }] }];
      if (prelude.length) {
        contents.push({ role: "model", parts: prelude.map((p) => ({ functionCall: { name: p.name, args: p.input }, thoughtSignature: GEMINI_INJECTED_SIGNATURE })) });
        contents.push({ role: "user", parts: prelude.map((p) => ({ functionResponse: { name: p.name, response: { result: p.result } } })) });
      }
      const base: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: system }] },
        tools: [
          {
            functionDeclarations: tools.map((t) => {
              const { additionalProperties: _omit, ...schema } = t.inputSchema as Record<string, unknown>;
              return { name: t.name, description: t.description, parameters: schema };
            }),
          },
        ],
      };
      const call = async (noTools: boolean) => {
        const req: Record<string, unknown> = { ...base, contents };
        if (noTools) req.toolConfig = { functionCallingConfig: { mode: "NONE" } };
        const data = (await postJsonWithRetry("Gemini", url, req, { "x-goog-api-key": key })) as {
          modelVersion?: string;
          usageMetadata?: UsageMetadata;
          candidates?: Array<{ content: Content; finishReason?: string }>;
        };
        const u = data.usageMetadata ?? {};
        const thoughts = u.thoughtsTokenCount ?? 0;
        onUsage({
          inputTokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
          cachedInputTokens: u.cachedContentTokenCount ?? 0,
          outputTokens: (u.candidatesTokenCount ?? 0) + thoughts,
          reasoningTokens: thoughts,
          modelReturned: data.modelVersion ?? null,
        });
        return { content: data.candidates?.[0]?.content, finish: data.candidates?.[0]?.finishReason };
      };
      const textOf = (c: Content) =>
        c.parts
          .filter((p): p is { text: string; thought?: boolean } => "text" in p && !("thought" in p && p.thought))
          .map((p) => p.text)
          .join("\n");
      let text = LOOP_LIMIT_TEXT;
      let mainCalls = 0;
      let limit = true;
      for (let i = 0; i < maxTurns; i++) {
        const { content, finish } = await call(toolsExhausted());
        mainCalls++;
        if (!content || !content.parts) {
          text = `(no candidates; finishReason=${finish ?? "none"})`;
          limit = false;
          // Nothing to keep in the history; the follow-up is appended to the last user turn.
          break;
        }
        contents.push({ role: "model", parts: content.parts });
        const calls = content.parts.filter((p): p is Extract<Part, { functionCall: unknown }> => "functionCall" in p);
        if (calls.length === 0) {
          text = textOf(content);
          limit = false;
          break;
        }
        const responses: Part[] = [];
        for (const c of calls) {
          const spec = toolMap.get(c.functionCall.name);
          const input = c.functionCall.args ?? {};
          const result = spec ? await spec.execute(input) : `Unknown tool: ${c.functionCall.name}`;
          toolCalls.push({ name: c.functionCall.name, input, result, turn: i });
          responses.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
        }
        contents.push({ role: "user", parts: responses });
      }
      const last = contents[contents.length - 1];
      if (last.role === "user") last.parts.push({ text: followUp });
      else contents.push({ role: "user", parts: [{ text: followUp }] });
      const f = await call(true);
      return { text, followUpText: f.content?.parts ? textOf(f.content) : "", toolCalls, mainCalls, mainLoopLimit: limit };
    },
  };
}

// ---------------------------------------------------------------- Claude

const CLAUDE_MAX_TOKENS = Number(process.env.STUDY3_ANTHROPIC_MAX_TOKENS ?? 16000);

function claudeConversation(model: string): ConversationAdapter {
  return {
    vendor: "anthropic",
    modelId: model,
    async run({ system, user, followUp, tools, onUsage, toolsExhausted, maxTurns, prelude = [] }) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const client = new Anthropic({ maxRetries: 2 });
      const toolCalls: ConversationResult["toolCalls"] = [];
      const toolMap = new Map(tools.map((t) => [t.name, t]));
      const apiTools: Anthropic.Tool[] = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool.InputSchema }));
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];
      if (prelude.length) {
        messages.push({ role: "assistant", content: prelude.map((p) => ({ type: "tool_use" as const, id: p.id, name: p.name, input: p.input })) });
        messages.push({ role: "user", content: prelude.map((p) => ({ type: "tool_result" as const, tool_use_id: p.id, content: p.result })) });
      }
      const call = async (noTools: boolean) => {
        const res = await client.messages.create({
          model,
          max_tokens: CLAUDE_MAX_TOKENS,
          system,
          messages,
          tools: apiTools,
          ...(noTools ? { tool_choice: { type: "none" as const } } : {}),
        });
        const u = res.usage;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const cacheWrite = u.cache_creation_input_tokens ?? 0;
        onUsage({
          inputTokens: u.input_tokens + cacheRead + cacheWrite,
          cachedInputTokens: cacheRead,
          cacheWriteInputTokens: cacheWrite,
          outputTokens: u.output_tokens,
          reasoningTokens: 0,
          modelReturned: res.model ?? null,
        });
        if (res.stop_reason === "max_tokens") throw new Error(`truncated: stop_reason=max_tokens at max_tokens=${CLAUDE_MAX_TOKENS}. Recorded as missing data, NOT as a wrong answer.`);
        if (res.stop_reason === "refusal") throw new Error("refused: stop_reason=refusal. Recorded as missing data, not as a verdict.");
        return res;
      };
      const textOf = (res: Anthropic.Message) =>
        res.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
      let text = LOOP_LIMIT_TEXT;
      let mainCalls = 0;
      let limit = true;
      for (let i = 0; i < maxTurns; i++) {
        const res = await call(toolsExhausted());
        mainCalls++;
        messages.push({ role: "assistant", content: res.content });
        const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (res.stop_reason !== "tool_use" || uses.length === 0) {
          if (res.stop_reason !== "end_turn" && res.stop_reason !== "stop_sequence") throw new Error(`unexpected stop_reason=${res.stop_reason}. Recorded as missing data.`);
          text = textOf(res);
          limit = false;
          break;
        }
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const c of uses) {
          const spec = toolMap.get(c.name);
          const input = (c.input ?? {}) as Record<string, unknown>;
          const result = spec ? await spec.execute(input) : `Unknown tool: ${c.name}`;
          toolCalls.push({ name: c.name, input, result, turn: i });
          results.push({ type: "tool_result", tool_use_id: c.id, content: result, ...(spec ? {} : { is_error: true }) });
        }
        messages.push({ role: "user", content: results });
      }
      const last = messages[messages.length - 1];
      if (last.role === "user" && Array.isArray(last.content)) (last.content as Anthropic.ContentBlockParam[]).push({ type: "text", text: followUp });
      else messages.push({ role: "user", content: followUp });
      const f = await call(true);
      return { text, followUpText: textOf(f), toolCalls, mainCalls, mainLoopLimit: limit };
    },
  };
}

export function conversationAdapter(vendor: S4Vendor, model: string): ConversationAdapter {
  if (vendor === "openai" || vendor === "kimi") return chatAdapter(vendor, model);
  if (vendor === "gemini") return geminiConversation(model);
  return claudeConversation(model);
}
