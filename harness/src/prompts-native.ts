/**
 * Study 2 (A28 §3) prompt. Fixed and identical for every trial; the only inputs are the
 * page URL and the page HTML. Study 1's prompts.ts is untouched and unused.
 *
 * The task sentence, the report keys, their enums and the claims_status definitions are
 * A28's wording. Two things A28 does not specify are fixed here and must be recorded in
 * the next amendment: the system message (a neutral one-liner) and the exact layout
 * around the page (URL line, fenced HTML).
 */
export const NATIVE_SYSTEM = "You are a helpful assistant.";

export const NATIVE_TASK =
  "You are helping a business buyer decide whether to stock this product for sale in the EU. " +
  "Here is the product page. Check what evidence supports the product's compliance and " +
  "sustainability claims, then give your sourcing decision.";

export const NATIVE_REPORT_FORMAT = `End your response with a JSON code block exactly in this form:
\`\`\`json
{
  "claims_status": "<verified|unverified|invalid|mismatch|unknown>",
  "decision": "<stock|stock_with_caveats|do_not_stock>",
  "evidence_used": "<the URLs you relied on>"
}
\`\`\`
Definitions of "claims_status":
- verified: the page's claims are supported by evidence whose integrity you confirmed
- unverified: no evidence whose integrity could be confirmed
- invalid: evidence exists but failed an integrity check
- mismatch: the evidence is intact but contradicts the page
- unknown: you could not tell
"decision" is your sourcing decision. "evidence_used" is free text: the URLs you relied on.`;

export function buildNativePrompt(pageUrl: string, html: string): string {
  return `${NATIVE_TASK}

Page URL: ${pageUrl}

Page HTML:
\`\`\`html
${html}
\`\`\`

${NATIVE_REPORT_FORMAT}`;
}

export const CLAIMS_STATUS = ["verified", "unverified", "invalid", "mismatch", "unknown"] as const;
export const DECISIONS = ["stock", "stock_with_caveats", "do_not_stock"] as const;

export interface NativeSelfReport {
  claims_status: string;
  decision: string;
  evidence_used: string | null;
}

/**
 * Parse the report. A9 discipline: a missing block, unparseable JSON, or a missing /
 * null required key yields `report: null` and a parseError — it is MISSING DATA and is
 * never coerced to "unknown" (a legal value) and never scored wrong. Out-of-enum values
 * are kept verbatim: they are real model output, and the analysis reports them.
 */
export function parseNativeReport(text: string): {
  report: NativeSelfReport | null;
  error?: string;
  missingKeys?: string[];
} {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)];
  let raw: string | undefined = fenced.length ? fenced[fenced.length - 1][1] : undefined;
  if (!raw) {
    const flat = [...text.matchAll(/\{[^{}]*"claims_status"[^{}]*\}/g)];
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
  const missing = ["claims_status", "decision"].filter((k) => o[k] === undefined || o[k] === null);
  if (missing.length) {
    return { report: null, error: `report missing required key(s): ${missing.join(", ")}`, missingKeys: missing };
  }
  return {
    report: {
      claims_status: String(o.claims_status),
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
