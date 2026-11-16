import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import type { AgentAdapter, ToolSpec } from "../types";

const MODEL = "claude-opus-4-8";

/**
 * max_tokens caps extended thinking AND visible text TOGETHER, and thinking
 * bills as output. The required self-report is a JSON code block at the very
 * END of the response, so a budget consumed by thinking truncates the response
 * before the closing fence — and a truncated response used to be scored as a
 * WRONG ANSWER rather than as missing data, a systematic accuracy penalty
 * applied only to the one agent running with extended thinking. Raised from
 * 16000 to 32000 on 2026-08-07, before the first trial; see amendment A14.
 *
 * Raising the ceiling does not by itself cost more — it is a limit, not a
 * target. Requests stream, because a non-streaming request with a budget this
 * large risks an HTTP timeout.
 */
const MAX_TOKENS = Number(process.env.ANTHROPIC_MAX_TOKENS ?? 32000);

/**
 * A response that hit the ceiling, or was refused, carries no usable
 * self-report. Throwing here makes run.ts record the trial with an `error`
 * field, which analyze.py excludes — so it is counted as MISSING DATA rather
 * than as an incorrect verdict. That is the pre-committed treatment in A9.
 */
function assertUsable(stopReason: string | null | undefined): void {
  if (stopReason === "max_tokens") {
    throw new Error(
      `truncated: stop_reason=max_tokens at max_tokens=${MAX_TOKENS}. The ` +
        `self-report block is emitted last, so this response cannot contain ` +
        `one. Recorded as missing data, NOT as a wrong verdict.`,
    );
  }
  if (stopReason === "refusal") {
    throw new Error(
      "refused: stop_reason=refusal. Recorded as missing data, not as a verdict.",
    );
  }
}

export function claudeAdapter(): AgentAdapter {
  const client = new Anthropic();
  return {
    name: "claude",
    modelId: MODEL,
    supportsTools: true,
    async run({ system, user, tools }) {
      const toolCalls: Array<{ name: string; input: unknown; result?: string }> = [];

      if (!tools || tools.length === 0) {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          thinking: { type: "adaptive" },
          system,
          messages: [{ role: "user", content: user }],
        });
        const response = await stream.finalMessage();
        assertUsable(response.stop_reason);
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return { text, toolCalls };
      }

      const runnerTools = tools.map((t: ToolSpec) =>
        betaTool({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as never,
          run: async (input: Record<string, unknown>) => {
            const result = await t.execute(input);
            toolCalls.push({ name: t.name, input, result });
            return result;
          },
        }),
      );

      const finalMessage = await client.beta.messages.toolRunner({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system,
        tools: runnerTools,
        messages: [{ role: "user", content: user }],
      });
      assertUsable(finalMessage.stop_reason);

      const text = finalMessage.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return { text, toolCalls };
    },
  };
}
