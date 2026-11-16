import type { AgentAdapter, ToolSpec } from "../types";
import { postJsonWithRetry } from "./http";

/**
 * ChatGPT adapter via the OpenAI Chat Completions REST API (function
 * calling). Uses fetch directly — no SDK dependency. Model configurable via
 * OPENAI_MODEL (Study 1) or the `model` argument (Study 2's run-native.ts,
 * which reads NATIVE_OPENAI_MODEL). The id the API RETURNS is reported per
 * call through onUsage; that, not the requested alias, is what gets logged.
 */
const API = "https://api.openai.com/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
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
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

export function chatgptAdapter(model?: string): AgentAdapter {
  const MODEL = model ?? process.env.OPENAI_MODEL ?? "gpt-5.1";
  const key = process.env.OPENAI_API_KEY;
  return {
    name: "chatgpt",
    modelId: MODEL,
    supportsTools: true,
    async run({ system, user, tools, onUsage, toolsExhausted, maxTurns }) {
      if (!key) throw new Error("OPENAI_API_KEY not set");
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
        const data = (await postJsonWithRetry("OpenAI", API, req, {
          Authorization: `Bearer ${key}`,
        })) as {
          model?: string;
          usage?: Usage;
          choices: Array<{ message: ChatMessage; finish_reason: string }>;
        };
        onUsage?.({
          inputTokens: data.usage?.prompt_tokens ?? 0,
          cachedInputTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: data.usage?.completion_tokens ?? 0,
          reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          modelReturned: data.model ?? null,
        });
        const msg = data.choices[0].message;
        messages.push(msg);

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
