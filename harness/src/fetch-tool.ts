/**
 * Study 2 (A28 §3) — the ONE tool a model gets: `fetch_url(url)`.
 *
 * - Real hosts on the allow-list (ugpdpp.xyz, api.universalgoods.xyz, and
 *   app.universalgoods.xyz under /api/server/api/passport/ only) are fetched live.
 * - The two fictional page hosts return the stored stimulus page (and 404 for any other
 *   path on them). Nothing is ever fetched from a `.example` host.
 * - Every other host returns "host not reachable in this environment".
 * - Redirects are followed manually and ONLY within the allow-list (max 5 hops).
 * - Bodies are truncated at 30,000 characters; the sha256 of the FULL body is logged.
 * - At most 8 calls per trial; later calls are refused without any network access,
 *   logged, and the adapter is told to stop offering the tool.
 *
 * Every attempted call — allowed or not — is logged with url, status, content type and
 * body sha256. A JSON body carrying a top-level string `verdict` (the verifier's
 * response shape, A25) has that verdict extracted onto the log entry, which is what
 * run-native.ts uses for the `instrument_invalid` rule.
 */
import { createHash } from "node:crypto";
import type { ToolSpec } from "./types";

export const FETCH_TOOL_NAME = "fetch_url";
/** A28 §3, verbatim. */
export const FETCH_TOOL_DESCRIPTION =
  "Fetch a web page or file over HTTPS and return its status, content type and body.";
export const REAL_ALLOWED_HOSTS = ["ugpdpp.xyz", "api.universalgoods.xyz", "app.universalgoods.xyz"] as const;
/**
 * Hosts allowed only under a path prefix. A28 §3 names api.universalgoods.xyz; the
 * platform change (universal-goods-testnet PR #354) builds the advertised verification
 * URL from PUBLIC_SERVER_URL, which on testnet is
 * https://app.universalgoods.xyz/api/server/api/passport/<id>/verify. Only the passport
 * API is reachable on that host (everything else there is the console app). This
 * addition is an A29 item: it widens A28's allow-list by one host, path-restricted.
 */
export const PATH_RESTRICTED_HOSTS: Record<string, string> = {
  "app.universalgoods.xyz": "/api/server/api/passport/",
};

/**
 * Study 5 (added; Studies 2-4 never pass it, so their allow-list is unchanged): a trial may
 * give its own real-host allow-list. `pathPrefixes` restricts a host to ANY of its prefixes;
 * a host absent from `pathPrefixes` is allowed on every path.
 */
export interface FetchAllowList {
  realHosts: readonly string[];
  pathPrefixes: Readonly<Record<string, readonly string[]>>;
}

function hostAllowed(u: URL, real: Set<string>, allow?: FetchAllowList): boolean {
  const host = u.hostname.toLowerCase();
  if (!real.has(host)) return false;
  if (allow) {
    const prefixes = allow.pathPrefixes[host];
    return prefixes === undefined || prefixes.some((p) => u.pathname.startsWith(p));
  }
  const prefix = PATH_RESTRICTED_HOSTS[host];
  return prefix === undefined || u.pathname.startsWith(prefix);
}
export const MAX_FETCHES_PER_TRIAL = 8;
export const MAX_BODY_CHARS = 30_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20_000;
/**
 * Request headers. `Accept: *\/*` is what a generic HTTP client sends; with it the
 * resolver returns its JSON payload (measured 2026-10-11: `Accept: text/html` gets the
 * consumer web app's HTML shell instead). Logged on every row via FETCH_REQUEST_HEADERS.
 */
export const FETCH_REQUEST_HEADERS = {
  Accept: "*/*",
  "User-Agent": "Mozilla/5.0 (compatible; fetch_url/1.0)",
} as const;

export const NOT_REACHABLE = "host not reachable in this environment";

export type FetchOutcome =
  | "fetched"
  | "stored_page"
  | "stored_404"
  | "host_not_reachable"
  | "redirect_blocked"
  | "redirect_limit"
  | "invalid_url"
  | "not_https"
  | "call_limit"
  | "network_error";

export interface FetchLogEntry {
  seq: number;
  /** Exactly what the model passed. */
  requestedUrl: string;
  /** URL of the last hop actually requested (after allowed redirects). */
  finalUrl: string | null;
  host: string | null;
  allowed: boolean;
  outcome: FetchOutcome;
  status: number | null;
  contentType: string | null;
  bodySha256: string | null;
  bodyChars: number | null;
  truncated: boolean;
  redirects: Array<{ status: number; location: string }>;
  /** Top-level `verdict` of a JSON body, if present (the verifier's response). */
  verdict: string | null;
  /** Top-level `reason` of a JSON body that carried a verdict. */
  verdictReason: string | null;
  /**
   * Top-level `subject` of a verifier response ({requestedId, requestedKind, productId}
   * since platform PR #354), logged verbatim; null when absent.
   */
  verdictSubject: unknown;
  error: string | null;
  startedAt: string;
  durationMs: number;
}

export interface StoredPage {
  /** Canonical URL (scheme + host + path, no query/fragment). */
  url: string;
  html: string;
  /**
   * Follow-up (condition E's stored passport document): the Content-Type served for this
   * body. Omitted for every Study 2 page, which keeps "text/html; charset=utf-8".
   */
  contentType?: string;
}

export interface FetchToolHandle {
  spec: ToolSpec;
  log: FetchLogEntry[];
  /** True once the per-trial call cap has been reached. */
  exhausted(): boolean;
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function canonical(u: URL): string {
  return `${u.protocol}//${u.host}${u.pathname}`;
}

function extractVerdict(body: string): { verdict: string | null; reason: string | null; subject: unknown } {
  try {
    const j = JSON.parse(body);
    if (j && typeof j === "object" && !Array.isArray(j) && typeof j.verdict === "string") {
      return {
        verdict: j.verdict,
        reason: typeof j.reason === "string" ? j.reason : null,
        subject: j.subject ?? null,
      };
    }
  } catch {
    /* not JSON */
  }
  return { verdict: null, reason: null, subject: null };
}

function format(status: number, contentType: string | null, url: string, body: string): {
  text: string;
  truncated: boolean;
} {
  const truncated = body.length > MAX_BODY_CHARS;
  const shown = truncated ? body.slice(0, MAX_BODY_CHARS) : body;
  return {
    text:
      `URL: ${url}\nStatus: ${status}\nContent-Type: ${contentType ?? "(none)"}\n\n${shown}` +
      (truncated ? `\n\n[body truncated at ${MAX_BODY_CHARS} characters of ${body.length}]` : ""),
    truncated,
  };
}

/**
 * Build a fresh tool for ONE trial. `storedPages` maps the fictional hosts' page URLs
 * to the HTML served for them in this trial.
 */
export function createFetchTool(
  storedPages: StoredPage[],
  fictionalHosts: readonly string[],
  allow?: FetchAllowList,
): FetchToolHandle {
  const log: FetchLogEntry[] = [];
  const pages = new Map(storedPages.map((p) => [p.url, p]));
  const fictional = new Set(fictionalHosts);
  const real = new Set<string>(allow ? allow.realHosts.map((h) => h.toLowerCase()) : REAL_ALLOWED_HOSTS);
  let calls = 0;

  async function execute(input: Record<string, unknown>): Promise<string> {
    const started = Date.now();
    const requestedUrl = typeof input.url === "string" ? input.url : JSON.stringify(input.url ?? null);
    const entry: FetchLogEntry = {
      seq: log.length + 1,
      requestedUrl,
      finalUrl: null,
      host: null,
      allowed: false,
      outcome: "invalid_url",
      status: null,
      contentType: null,
      bodySha256: null,
      bodyChars: null,
      truncated: false,
      redirects: [],
      verdict: null,
      verdictReason: null,
      verdictSubject: null,
      error: null,
      startedAt: new Date(started).toISOString(),
      durationMs: 0,
    };
    const done = (text: string) => {
      entry.durationMs = Date.now() - started;
      log.push(entry);
      return text;
    };

    calls++;
    if (calls > MAX_FETCHES_PER_TRIAL) {
      entry.outcome = "call_limit";
      return done(`fetch_url call limit reached (${MAX_FETCHES_PER_TRIAL} per task). Give your answer now.`);
    }

    let url: URL;
    try {
      url = new URL(requestedUrl);
    } catch {
      entry.error = "unparseable URL";
      return done(`Invalid URL: ${requestedUrl}`);
    }
    entry.host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") {
      entry.outcome = "not_https";
      return done(`Only HTTPS URLs are supported: ${requestedUrl}`);
    }
    if (url.port && url.port !== "443") {
      entry.outcome = "host_not_reachable";
      return done(NOT_REACHABLE);
    }

    if (fictional.has(entry.host)) {
      entry.allowed = true;
      entry.finalUrl = canonical(url);
      const stored = pages.get(canonical(url));
      if (stored === undefined) {
        entry.outcome = "stored_404";
        entry.status = 404;
        entry.contentType = "text/plain; charset=utf-8";
        const body = "Not Found";
        entry.bodySha256 = sha256(body);
        entry.bodyChars = body.length;
        return done(format(404, entry.contentType, entry.finalUrl, body).text);
      }
      const html = stored.html;
      entry.outcome = "stored_page";
      entry.status = 200;
      entry.contentType = stored.contentType ?? "text/html; charset=utf-8";
      entry.bodySha256 = sha256(html);
      entry.bodyChars = html.length;
      const f = format(200, entry.contentType, entry.finalUrl, html);
      entry.truncated = f.truncated;
      return done(f.text);
    }

    if (!hostAllowed(url, real, allow)) {
      entry.outcome = "host_not_reachable";
      return done(NOT_REACHABLE);
    }
    entry.allowed = true;

    let current = url;
    try {
      for (let hop = 0; ; hop++) {
        entry.finalUrl = current.toString();
        const res = await fetch(current, {
          method: "GET",
          headers: FETCH_REQUEST_HEADERS,
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
          const location = res.headers.get("location")!;
          entry.redirects.push({ status: res.status, location });
          await res.body?.cancel();
          let next: URL;
          try {
            next = new URL(location, current);
          } catch {
            entry.outcome = "redirect_blocked";
            entry.status = res.status;
            return done(`Redirect to an invalid location: ${location}`);
          }
          if (next.protocol !== "https:" || !hostAllowed(next, real, allow) || (next.port && next.port !== "443")) {
            entry.outcome = "redirect_blocked";
            entry.status = res.status;
            return done(
              `URL: ${current}\nStatus: ${res.status}\nLocation: ${next}\n\nThe redirect target: ${NOT_REACHABLE}`,
            );
          }
          if (hop + 1 >= MAX_REDIRECTS) {
            entry.outcome = "redirect_limit";
            entry.status = res.status;
            return done(`Too many redirects (more than ${MAX_REDIRECTS}).`);
          }
          current = next;
          continue;
        }
        const body = await res.text();
        entry.outcome = "fetched";
        entry.status = res.status;
        entry.contentType = res.headers.get("content-type");
        entry.bodySha256 = sha256(body);
        entry.bodyChars = body.length;
        const v = extractVerdict(body);
        entry.verdict = v.verdict;
        entry.verdictReason = v.reason;
        entry.verdictSubject = v.subject;
        const f = format(res.status, entry.contentType, current.toString(), body);
        entry.truncated = f.truncated;
        return done(f.text);
      }
    } catch (e) {
      entry.outcome = "network_error";
      entry.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      return done(`Network error fetching ${current}: ${entry.error}`);
    }
  }

  return {
    log,
    exhausted: () => calls >= MAX_FETCHES_PER_TRIAL,
    spec: {
      name: FETCH_TOOL_NAME,
      description: FETCH_TOOL_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "The URL to fetch." } },
        required: ["url"],
        additionalProperties: false,
      },
      execute,
    },
  };
}
