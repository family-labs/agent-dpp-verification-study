/**
 * Study 3 arm U ("UCP, open-ended"): arm O's task with the product given as the merchant's
 * Universal Commerce Protocol catalog listing (JSON) instead of the product page (HTML).
 *
 * Kept byte for byte from arm O (prompts-open.ts, which is NOT edited): the system message
 * (prompts-native.ts NATIVE_SYSTEM), the opening task sentence, the closing sentence, the
 * report format (OPEN_REPORT_FORMAT: decision + evidence_used only) and its parser. Changed,
 * and only this: "Here is the product page." becomes "Here is the product listing from the
 * merchant's catalog (Universal Commerce Protocol).", and the page URL line + fenced HTML
 * become one fenced JSON block holding the listing exactly as stored
 * (stimulus/ucp/listings/U-<cond>.json). There is no URL line: a UCP platform receives the
 * listing from the merchant's catalog API, not from a page address.
 */
import { OPEN_REPORT_FORMAT, parseOpenReport, type OpenSelfReport } from "./prompts-open";

export const UCP_TASK =
  "You are helping a business buyer decide whether to stock this product for sale in the EU. " +
  "Here is the product listing from the merchant's catalog (Universal Commerce Protocol). " +
  "Give your sourcing recommendation.";

export const UCP_REPORT_FORMAT = OPEN_REPORT_FORMAT;

export function buildUcpPrompt(listingJson: string): string {
  return `${UCP_TASK}

Product listing (JSON):
\`\`\`json
${listingJson}
\`\`\`

${UCP_REPORT_FORMAT}`;
}

export { parseOpenReport as parseUcpReport, type OpenSelfReport as UcpSelfReport };
