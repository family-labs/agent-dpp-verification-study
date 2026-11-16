/**
 * Follow-up arm O ("open-ended"): the sourcing task with every evidence/integrity cue
 * dropped. Same system message, same single fetch_url tool and description, same layout
 * around the page as the A28 prompt (prompts-native.ts, which is NOT edited: arm R reuses
 * it byte for byte).
 *
 * What the model is asked for: only `decision` and `evidence_used`. There is no
 * claims_status and no definition mentioning verification, integrity or checking evidence.
 * Everything scored on arm O (opened the product link, reached the checker, flagged the
 * problem in C and D) is computed by the analysis from the fetch log and the response
 * text (analysis/followup_rules.py), never asked of the model.
 *
 * The one remaining cue is the report key name `evidence_used`, kept so the two arms'
 * reports share a key; it is recorded as such.
 */
import { DECISIONS } from "./prompts-native";

export const OPEN_TASK =
  "You are helping a business buyer decide whether to stock this product for sale in the EU. " +
  "Here is the product page. Give your sourcing recommendation.";

export const OPEN_REPORT_FORMAT = `End your response with a JSON code block exactly in this form:
\`\`\`json
{
  "decision": "<stock|stock_with_caveats|do_not_stock>",
  "evidence_used": "<the URLs you relied on>"
}
\`\`\`
"decision" is your sourcing recommendation. "evidence_used" is free text: the URLs you relied on.`;

export function buildOpenPrompt(pageUrl: string, html: string): string {
  return `${OPEN_TASK}

Page URL: ${pageUrl}

Page HTML:
\`\`\`html
${html}
\`\`\`

${OPEN_REPORT_FORMAT}`;
}

export { DECISIONS };

export interface OpenSelfReport {
  decision: string;
  evidence_used: string | null;
}

/**
 * Same A9 discipline as parseNativeReport: no block, bad JSON, or a missing/null
 * `decision` is MISSING DATA (report null), never coerced. Out-of-enum values are kept.
 */
export function parseOpenReport(text: string): { report: OpenSelfReport | null; error?: string; missingKeys?: string[] } {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  let raw: string | undefined = fenced.length ? fenced[fenced.length - 1][1] : undefined;
  if (!raw) {
    const flat = [...text.matchAll(/\{[^{}]*"decision"[^{}]*\}/g)];
    raw = flat.length ? flat[flat.length - 1][0] : undefined;
  }
  if (!raw) return { report: null, error: "no JSON block found" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { report: null, error: `JSON parse failed: ${e instanceof Error ? e.message : e}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { report: null, error: "report JSON is not an object" };
  }
  const o = parsed as Record<string, unknown>;
  if (o.decision === undefined || o.decision === null) {
    return { report: null, error: "report missing required key(s): decision", missingKeys: ["decision"] };
  }
  return {
    report: {
      decision: String(o.decision),
      evidence_used:
        o.evidence_used === undefined || o.evidence_used === null
          ? null
          : typeof o.evidence_used === "string"
            ? o.evidence_used
            : JSON.stringify(o.evidence_used),
    },
  };
}
