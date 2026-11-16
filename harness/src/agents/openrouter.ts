/**
 * Study 5: OpenRouter (OpenAI-compatible chat completions, https://openrouter.ai/api/v1) with
 * the same tool loop and ONE fixed follow-up as agents/conversation.ts's chatAdapter (which is
 * NOT edited), plus:
 *
 *   provider  a pinned provider routing object sent on EVERY call, with allow_fallbacks false
 *             and data_collection "deny" (OPENROUTER_PINS in run-study5.ts);
 *   per call  the provider OpenRouter actually routed to (`provider` in the response), the
 *             model id it returned, the generation id and OpenRouter's own reported cost
 *             (`usage.cost`, USD) are passed to `onCall`, so every row logs them;
 *   history   an assistant turn is sent back with its content, tool_calls and, when present,
 *             `reasoning_details` unchanged (OpenRouter's rule for reasoning models that call
 *             tools); `reasoning` text is not resent.
 *
 * Usage accounting matches the other adapters: inputTokens includes cached tokens, outputTokens
 * includes reasoning tokens. The key is read from OPENROUTER_API_KEY and never logged.
 */
import type { CallUsage, ToolSpec } from "../types";
import type { ConversationResult, PreludeCall } from "./conversation";
import { postJsonWithRetry } from "./http";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MAX_TOKENS = Number(process.env.STUDY5_OPENROUTER_MAX_TOKENS ?? 16000);

export interface ProviderPin {
  order: string[];
  only?: string[];
  allow_fallbacks: false;
  data_collection: "deny";
  quantizations?: string[];
}
export interface OrCallMeta {
  provider: string | null;
  modelReturned: string | null;
  generationId: string | null;
  reportedCostUsd: number | null;
}

type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  reasoning_details?: unknown;
};

export type ToolsOffMode = "tool_choice_none" | "omit_tools";
export function openRouterConversation(model: string, pin: ProviderPin, onCall: (m: OrCallMeta) => void, toolsOff: ToolsOffMode = "tool_choice_none") {
  return {
    vendor: "openrouter" as const,
    modelId: model,
    async run({
      system,
      user,
      followUp,
      tools,
      onUsage,
      toolsExhausted,
      maxTurns,
      prelude = [],
    }: {
      system: string;
      user: string;
      followUp: string;
      tools: ToolSpec[];
      onUsage: (u: CallUsage) => void;
      toolsExhausted: () => boolean;
      maxTurns: number;
      prelude?: PreludeCall[];
    }): Promise<ConversationResult> {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY not set");
      const toolCalls: ConversationResult["toolCalls"] = [];
      const toolMap = new Map(tools.map((t) => [t.name, t]));
      const messages: Msg[] = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      if (prelude.length) {
        messages.push({ role: "assistant", content: null, tool_calls: prelude.map((p) => ({ id: p.id, type: "function" as const, function: { name: p.name, arguments: JSON.stringify(p.input) } })) });
        for (const p of prelude) messages.push({ role: "tool", content: p.result, tool_call_id: p.id });
      }
      const body: Record<string, unknown> = {
        model,
        provider: pin,
        usage: { include: true },
        // Without it OpenRouter reserves the model's full output limit (65,536) against the
        // balance and refuses with 402 on a small balance (smoke trial, 2026-10-15). 16,000 is
        // Claude's max_tokens in agents/conversation.ts.
        max_tokens: OPENROUTER_MAX_TOKENS,
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
      };
      const call = async (noTools: boolean) => {
        const req: Record<string, unknown> = { ...body, messages };
        if (noTools) {
          // "Tools off": tool_choice none where the endpoint accepts it; Meta's endpoint accepts
          // only "auto" (400 in the smoke trial, 2026-10-15), so there the tools are left out of
          // the request instead (checked: the endpoint accepts a history with tool calls and no tools).
          if (toolsOff === "omit_tools") delete req.tools;
          else req.tool_choice = "none";
        }
        const data = (await postJsonWithRetry("OpenRouter", OPENROUTER_URL, req, { Authorization: `Bearer ${key}` })) as {
          id?: string;
          model?: string;
          provider?: string;
          error?: { message?: string; code?: number };
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            cost?: number;
            prompt_tokens_details?: { cached_tokens?: number };
            completion_tokens_details?: { reasoning_tokens?: number };
          };
          choices?: Array<{ message: Msg & { reasoning?: string }; finish_reason: string; error?: { message?: string } }>;
        };
        if (data.error || !data.choices?.length) throw new Error(`OpenRouter error: ${JSON.stringify(data.error ?? "no choices").slice(0, 500)}`);
        onCall({ provider: data.provider ?? null, modelReturned: data.model ?? null, generationId: data.id ?? null, reportedCostUsd: typeof data.usage?.cost === "number" ? data.usage.cost : null });
        onUsage({
          inputTokens: data.usage?.prompt_tokens ?? 0,
          cachedInputTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          modelReturned: data.model ?? null,
        });
        const c = data.choices[0];
        if (c.error) throw new Error(`OpenRouter provider error: ${JSON.stringify(c.error).slice(0, 500)}`);
        if (c.finish_reason === "length") throw new Error(`truncated: finish_reason=length at max_tokens=${OPENROUTER_MAX_TOKENS}. Recorded as missing data, NOT as a wrong answer.`);
        return c.message;
      };
      const push = (msg: Msg) =>
        messages.push({
          role: "assistant",
          content: msg.content ?? "",
          ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
          ...(msg.reasoning_details ? { reasoning_details: msg.reasoning_details } : {}),
        });
      let text = "(tool loop limit reached)";
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

/** One minimal call to confirm a pin is accepted and which provider answers (no tools). */
export async function pingPin(model: string, pin: ProviderPin): Promise<{ ok: boolean; status: string; meta: OrCallMeta | null; usage: CallUsage | null }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { ok: false, status: "OPENROUTER_API_KEY not set", meta: null, usage: null };
  try {
    const data = (await postJsonWithRetry(
      "OpenRouter",
      OPENROUTER_URL,
      { model, provider: pin, usage: { include: true }, max_tokens: 64, messages: [{ role: "user", content: "Reply with the single word OK." }] },
      { Authorization: `Bearer ${key}` },
      { retries: 0 },
    )) as { id?: string; model?: string; provider?: string; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } } };
    const meta = { provider: data.provider ?? null, modelReturned: data.model ?? null, generationId: data.id ?? null, reportedCostUsd: data.usage?.cost ?? null };
    const usage: CallUsage = { inputTokens: data.usage?.prompt_tokens ?? 0, cachedInputTokens: 0, outputTokens: data.usage?.completion_tokens ?? 0, reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0, modelReturned: data.model ?? null };
    return { ok: true, status: "200", meta, usage };
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message.slice(0, 400) : String(e), meta: null, usage: null };
  }
}
