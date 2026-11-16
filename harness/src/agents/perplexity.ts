import type { AgentAdapter } from "../types";

/**
 * Perplexity adapter (Sonar API — OpenAI-compatible chat shape, no custom
 * function calling). Tool-equipped cells are recorded as rail-unsupported;
 * that IS the H3/H7 data point, not a harness gap. Perplexity can, however,
 * fetch URLs it decides to browse, so the verifier URL embedded in the
 * JSON-LD gives it an organic (unprompted) verification path.
 */
const MODEL = process.env.PERPLEXITY_MODEL ?? "sonar-pro";

export function perplexityAdapter(): AgentAdapter {
  const key = process.env.PERPLEXITY_API_KEY;
  return {
    name: "perplexity",
    modelId: MODEL,
    supportsTools: false,
    async run({ system, user }) {
      if (!key) throw new Error("PERPLEXITY_API_KEY not set");
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Perplexity ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      return { text: data.choices[0]?.message?.content ?? "", toolCalls: [] };
    },
  };
}
