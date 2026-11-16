import Anthropic from "@anthropic-ai/sdk";
import type { AgentAdapter, ToolSpec } from "../types";

/**
 * Study 3: Claude through the Anthropic Messages API, with the same contract as the other
 * Study 2 adapters (openai.ts, gemini.ts, kimi.ts): one generic tool, a manual tool loop, usage
 * reported after EVERY call through onUsage, tool_choice "none" once the fetch cap is reached,
 * and the model id the API returns logged per call.
 *
 * Study 1's agents/anthropic.ts (claude-opus-4-8, SDK tool runner) is left unchanged and unused.
 *
 * Settings, matching A29 §2 for the other vendors:
 *   - reasoning: the vendor's DEFAULT. For claude-haiku-5-5 that is adaptive thinking, on by
 *     default, at effort "medium"; neither `thinking` nor `output_config` is sent. Thinking
 *     tokens are billed as output and are included in usage.output_tokens.
 *   - no prompt caching is requested (no cache_control), as no other adapter requests it;
 *     cache fields are still read and costed if the API reports any.
 *   - max_tokens 16000 per call (non-streaming). A response that stops on max_tokens, or is
 *     refused, carries no usable report: the adapter THROWS, so the runner records the trial
 *     with an `error` and the analysis counts it as missing data (A9), never as a wrong answer.
 *   - every assistant turn is sent back with its content blocks UNCHANGED (thinking blocks
 *     included), and all tool results of a turn go back in ONE user message, as the API requires.
 *
 * The key is read by the SDK from ANTHROPIC_API_KEY (loaded from the repo-root .env by env.ts)
 * and never appears in a log or an error string written by this file.
 */
const MAX_TOKENS = Number(process.env.STUDY3_ANTHROPIC_MAX_TOKENS ?? 16000);

export function claudeNativeAdapter(model?: string): AgentAdapter {
  const MODEL = model ?? process.env.NATIVE_ANTHROPIC_MODEL ?? "claude-haiku-5-5";
  return {
    name: "claude",
    modelId: MODEL,
    supportsTools: true,
    async run({ system, user, tools, onUsage, toolsExhausted, maxTurns }) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
      const client = new Anthropic({ maxRetries: 2 });
      const toolCalls: Array<{ name: string; input: unknown; result?: string }> = [];
      const toolMap = new Map((tools ?? []).map((t) => [t.name, t]));
      const apiTools: Anthropic.Tool[] = (tools ?? []).map((t: ToolSpec) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      }));
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: user }];

      for (let i = 0; i < (maxTurns ?? 8); i++) {
        const req: Anthropic.MessageCreateParamsNonStreaming = {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system,
          messages,
          ...(apiTools.length ? { tools: apiTools } : {}),
          ...(apiTools.length && toolsExhausted?.() ? { tool_choice: { type: "none" as const } } : {}),
        };
        const res = await client.messages.create(req);
        const u = res.usage;
        const cacheRead = u.cache_read_input_tokens ?? 0;
        const cacheWrite = u.cache_creation_input_tokens ?? 0;
        onUsage?.({
          // CallUsage.inputTokens INCLUDES cached input; Anthropic's input_tokens excludes both
          // cache reads and cache writes, so all three are summed (the prompt length the
          // >100K-token price tier is judged on, per Anthropic's pricing page).
          inputTokens: u.input_tokens + cacheRead + cacheWrite,
          cachedInputTokens: cacheRead,
          cacheWriteInputTokens: cacheWrite,
          outputTokens: u.output_tokens,
          // Not reported separately by the Messages API; thinking is inside output_tokens.
          reasoningTokens: 0,
          modelReturned: res.model ?? null,
        });
        if (res.stop_reason === "max_tokens") {
          throw new Error(`truncated: stop_reason=max_tokens at max_tokens=${MAX_TOKENS}. Recorded as missing data, NOT as a wrong answer.`);
        }
        if (res.stop_reason === "refusal") {
          throw new Error("refused: stop_reason=refusal. Recorded as missing data, not as a verdict.");
        }
        messages.push({ role: "assistant", content: res.content });
        const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
        if (res.stop_reason !== "tool_use" || uses.length === 0) {
          if (res.stop_reason !== "end_turn" && res.stop_reason !== "stop_sequence") {
            throw new Error(`unexpected stop_reason=${res.stop_reason}. Recorded as missing data.`);
          }
          const text = res.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("\n");
          return { text, toolCalls };
        }
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const call of uses) {
          const spec = toolMap.get(call.name);
          const input = (call.input ?? {}) as Record<string, unknown>;
          const result = spec ? await spec.execute(input) : `Unknown tool: ${call.name}`;
          toolCalls.push({ name: call.name, input, result });
          results.push({ type: "tool_result", tool_use_id: call.id, content: result, ...(spec ? {} : { is_error: true }) });
        }
        messages.push({ role: "user", content: results });
      }
      return { text: "(tool loop limit reached)", toolCalls };
    },
  };
}
