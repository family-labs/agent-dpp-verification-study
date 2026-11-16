import type { AgentAdapter, ToolSpec } from "../types";
import { postJsonWithRetry } from "./http";

/**
 * Gemini adapter via the Generative Language REST API (function calling).
 * Model configurable via GEMINI_MODEL (Study 1) or the `model` argument
 * (Study 2, NATIVE_GEMINI_MODEL).
 *
 * The key is sent as the x-goog-api-key HEADER, not a `?key=` query parameter,
 * so it cannot appear in any URL that reaches an error message or log.
 *
 * Model turns are pushed back VERBATIM (`content.parts` as received), which
 * keeps Gemini 3's `thoughtSignature` fields: function calling on thinking
 * models fails or degrades if they are dropped.
 */
type Part =
  | { text: string; thought?: boolean }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { result: string } } };
type Content = { role: "user" | "model"; parts: Part[] };

type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
};

export function geminiAdapter(model?: string): AgentAdapter {
  const MODEL = model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-pro";
  const key = process.env.GEMINI_API_KEY;
  return {
    name: "gemini",
    modelId: MODEL,
    supportsTools: true,
    async run({ system, user, tools, onUsage, toolsExhausted, maxTurns }) {
      if (!key) throw new Error("GEMINI_API_KEY not set");
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
      const toolCalls: Array<{ name: string; input: unknown; result?: string }> = [];
      const toolMap = new Map((tools ?? []).map((t) => [t.name, t]));

      const contents: Content[] = [{ role: "user", parts: [{ text: user }] }];
      const base: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: system }] },
      };
      if (tools && tools.length > 0) {
        base.tools = [
          {
            functionDeclarations: tools.map((t: ToolSpec) => {
              // Gemini rejects additionalProperties in schemas
              const { additionalProperties: _omit, ...schema } =
                t.inputSchema as Record<string, unknown>;
              return { name: t.name, description: t.description, parameters: schema };
            }),
          },
        ];
      }

      for (let i = 0; i < (maxTurns ?? 8); i++) {
        const req: Record<string, unknown> = { ...base, contents };
        if (base.tools && toolsExhausted?.()) {
          req.toolConfig = { functionCallingConfig: { mode: "NONE" } };
        }
        const data = (await postJsonWithRetry("Gemini", url, req, {
          "x-goog-api-key": key,
        })) as {
          modelVersion?: string;
          usageMetadata?: UsageMetadata;
          candidates?: Array<{ content: Content; finishReason?: string }>;
        };
        const u = data.usageMetadata ?? {};
        const thoughts = u.thoughtsTokenCount ?? 0;
        onUsage?.({
          // toolUsePromptTokenCount is billed as input; it is 0 for client-side
          // function calling but counted if present.
          inputTokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
          cachedInputTokens: u.cachedContentTokenCount ?? 0,
          // Output price "including thinking tokens": both are billed as output.
          outputTokens: (u.candidatesTokenCount ?? 0) + thoughts,
          reasoningTokens: thoughts,
          modelReturned: data.modelVersion ?? null,
        });
        const content = data.candidates?.[0]?.content;
        if (!content || !content.parts) {
          return {
            text: `(no candidates; finishReason=${data.candidates?.[0]?.finishReason ?? "none"})`,
            toolCalls,
          };
        }
        contents.push({ role: "model", parts: content.parts });

        const calls = content.parts.filter(
          (p): p is Extract<Part, { functionCall: unknown }> => "functionCall" in p,
        );
        if (calls.length === 0) {
          const text = content.parts
            .filter((p): p is { text: string; thought?: boolean } => "text" in p && !("thought" in p && p.thought))
            .map((p) => p.text)
            .join("\n");
          return { text, toolCalls };
        }
        const responses: Part[] = [];
        for (const call of calls) {
          const spec = toolMap.get(call.functionCall.name);
          const input = call.functionCall.args ?? {};
          const result = spec
            ? await spec.execute(input)
            : `Unknown tool: ${call.functionCall.name}`;
          toolCalls.push({ name: call.functionCall.name, input, result });
          responses.push({
            functionResponse: {
              name: call.functionCall.name,
              response: { result },
            },
          });
        }
        contents.push({ role: "user", parts: responses });
      }
      return { text: "(tool loop limit reached)", toolCalls };
    },
  };
}
