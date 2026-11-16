import type { AgentAdapter, ToolSpec } from "../types";
import { postJsonWithRetry } from "./http";

/**
 * Kimi (Moonshot AI) adapter via the Kimi Open Platform chat-completions REST
 * API. The API is OpenAI-compatible and supports the same `tools` /
 * `tool_calls` / `role: "tool"` shape as OpenAI, so this adapter is a close
 * copy of openai.ts and carries tools natively — supportsTools is true.
 *
 * Endpoint note: Moonshot runs two SEPARATE platforms with separate account
 * and key systems — api.moonshot.ai (international, platform.kimi.ai) and
 * api.moonshot.cn (mainland China, platform.moonshot.cn). A key issued on one
 * is rejected by the other. This adapter defaults to the international host;
 * override with KIMI_BASE_URL if the study is ever run on a .cn key.
 *
 * kimi-k3 is thinking-only (the /v1/models entry reports
 * supports_thinking_type: "only" with a default reasoning effort of "max"), so
 * latency and output-token cost per trial run higher than a non-reasoning
 * model. Model configurable via KIMI_MODEL (Study 1) or the `model` argument
 * (Study 2, NATIVE_KIMI_MODEL).
 *
 * `reasoning_content` is KEPT on assistant turns that carry tool calls (it used
 * to be dropped): Moonshot's thinking models expect the reasoning of a
 * tool-calling turn to be sent back with it in multi-step tool use.
 */
const API = () => `${process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1"}/chat/completions`;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

export function kimiAdapter(model?: string): AgentAdapter {
  const MODEL = model ?? process.env.KIMI_MODEL ?? "kimi-k3";
  const key = process.env.KIMI_API_KEY;
  return {
    name: "kimi",
    modelId: MODEL,
    supportsTools: true,
    async run({ system, user, tools, onUsage, toolsExhausted, maxTurns }) {
      if (!key) throw new Error("KIMI_API_KEY not set");
      const toolCalls: Array<{ name: string; input: unknown; result?: string }> = [];
      const toolMap = new Map((tools ?? []).map((t) => [t.name, t]));

      const messages: ChatMessage[] = [
        { role: "system", content: system },
        { role: "user", content: user },
      ];
      const body: Record<string, unknown> = { model: MODEL, messages };
      if (tools && tools.length > 0) {
        body.tools = tools.map((t: ToolSpec) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        }));
      }

      for (let i = 0; i < (maxTurns ?? 8); i++) {
        const req: Record<string, unknown> = { ...body, messages };
        if (body.tools && toolsExhausted?.()) req.tool_choice = "none";
        const data = (await postJsonWithRetry("Kimi", API(), req, {
          Authorization: `Bearer ${key}`,
        })) as {
          model?: string;
          usage?: Usage;
          choices: Array<{ message: ChatMessage; finish_reason: string }>;
        };
        onUsage?.({
          inputTokens: data.usage?.prompt_tokens ?? 0,
          cachedInputTokens:
            data.usage?.cached_tokens ?? data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          modelReturned: data.model ?? null,
        });
        const msg = data.choices[0].message;
        messages.push({
          role: "assistant",
          content: msg.content ?? "",
          ...(msg.tool_calls && msg.reasoning_content
            ? { reasoning_content: msg.reasoning_content }
            : {}),
          ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        });

        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          return { text: msg.content ?? "", toolCalls };
        }
        for (const call of msg.tool_calls) {
          const spec = toolMap.get(call.function.name);
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(call.function.arguments || "{}");
          } catch {
            input = { _unparseable_arguments: call.function.arguments };
          }
          const result = spec
            ? await spec.execute(input)
            : `Unknown tool: ${call.function.name}`;
          toolCalls.push({ name: call.function.name, input, result });
          messages.push({ role: "tool", content: result, tool_call_id: call.id });
        }
      }
      return { text: "(tool loop limit reached)", toolCalls };
    },
  };
}
