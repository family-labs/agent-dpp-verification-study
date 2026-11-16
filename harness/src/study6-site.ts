/**
 * Study 6 LIVE: the harness's side of the two live sites (site/worker.ts).
 *
 *   SiteClient  the admin door /__s6/ (health, phase, log), either REMOTE (https://oskvale.com with the
 *               key SITE_ADMIN_TOKEN from the study .env, never printed) or LOCAL (the same Worker code
 *               over the built bundle, in memory: --mock-models and the selftests; no network)
 *   shareTag    the per-trial share link tag: ?utm_source=share&utm_id=<8 letters/digits>
 *   attribute   which access-log rows belong to a trial: every row whose time lies inside the trial's
 *               window (trials of one invocation run one at a time, with a gap), plus any row carrying
 *               the trial's tag (flagged if it falls outside the window)
 *   evidenceLog the trial's fetch log for scoring (study6-score.ts, unchanged): our two hosts from the
 *               ACCESS LOG (what the Worker actually served), every other host from the VENDOR's own
 *               record; a vendor-reported fetch of our hosts with no access-log row is kept and flagged
 *               (vendor cache or a fetch from outside the window)
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { FetchLogEntry } from "./fetch-tool";
import type { WebCall } from "./agents/live-web";
import { BRAND_HOST, LOOKALIKE_HOST } from "../../stimulus/study6";

export const SITE_HOSTS = [BRAND_HOST, LOOKALIKE_HOST] as const;
export type Phase = "closed" | "check" | "W" | "D0" | "D1" | "S7F0" | "S7F1" | "S7F3" | "S7R";
export interface LogRow {
  id: number;
  ts: string;
  host: string;
  raw_host: string;
  method: string;
  path: string;
  query: string;
  ua: string;
  status: number;
  phase: string;
  asn: number | null;
  as_org: string | null;
  country: string | null;
  colo: string | null;
  verified_bot: number | null;
  verified_bot_category: string | null;
  ray: string | null;
  referer: string | null;
  accept: string | null;
}
export interface Health {
  ok: boolean;
  phase: Phase;
  bundleSha256: string;
  builtAt: string;
  mock: boolean;
  /** The record service's wording (site/worker.ts RECORD_WORDING); absent before A38. */
  recordWording?: string;
}

export interface SiteClient {
  remote: boolean;
  health(): Promise<Health>;
  setPhase(p: Phase, note: string): Promise<{ from: string; to: string; at: string }>;
  /** Every request row after `sinceId`, paged. */
  logSince(sinceId: number): Promise<{ requests: LogRow[]; phaseChanges: unknown[] }>;
  /** LOCAL only: a request as a vendor's fetcher would make it (mock models and selftests). */
  visit?(url: string, ua: string): Promise<{ status: number; contentType: string | null; body: string }>;
}

async function pagedLog(get: (since: number) => Promise<{ requests: LogRow[]; phaseChanges: unknown[] }>, sinceId: number) {
  const all: LogRow[] = [];
  let phaseChanges: unknown[] = [];
  for (let since = sinceId; ; ) {
    const page = await get(since);
    phaseChanges = page.phaseChanges ?? [];
    if (!page.requests?.length) break;
    all.push(...page.requests);
    since = page.requests[page.requests.length - 1].id;
    if (page.requests.length < 1000) break;
  }
  return { requests: all, phaseChanges };
}

export function remoteSite(base = process.env.SITE_ADMIN_BASE ?? `https://${BRAND_HOST}`): SiteClient {
  const key = process.env.SITE_ADMIN_TOKEN;
  if (!key) throw new Error("SITE_ADMIN_TOKEN is not set (study .env)");
  const req = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`${base}/__s6/${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`site admin ${path.split("?")[0]}: HTTP ${r.status}`);
    return r.json();
  };
  return {
    remote: true,
    health: () => req("health") as Promise<Health>,
    setPhase: (p, note) => req("phase", { method: "PUT", body: JSON.stringify({ phase: p, note }) }) as Promise<{ from: string; to: string; at: string }>,
    logSince: (sinceId) => pagedLog((s) => req(`log?since_id=${s}&limit=1000`) as Promise<{ requests: LogRow[]; phaseChanges: unknown[] }>, sinceId),
  };
}

/** The same Worker over the built bundle, in memory. Needs site/dist/bundle.json. */
export async function localSite(): Promise<SiteClient> {
  const bundle = new URL("../../site/dist/bundle.json", import.meta.url);
  if (!existsSync(bundle)) throw new Error("site/dist/bundle.json missing: run site/build-site.ts first");
  const { handle } = await import("../../site/worker");
  const { localEnv } = await import("../../site/local-env");
  const KEY = randomBytes(16).toString("hex");
  const env = localEnv(KEY);
  const ctx = { waitUntil: (p: Promise<unknown>) => void env.pending.push(p) };
  const adm = async (path: string, init: RequestInit = {}) => {
    const r = await handle(new Request(`https://${BRAND_HOST}/__s6/${path}`, { ...init, headers: { Authorization: `Bearer ${KEY}` } }), env, ctx);
    if (r.status !== 200) throw new Error(`local site admin ${path}: HTTP ${r.status}`);
    return r.json();
  };
  return {
    remote: false,
    health: () => adm("health") as Promise<Health>,
    setPhase: (p, note) => adm("phase", { method: "PUT", body: JSON.stringify({ phase: p, note }) }) as Promise<{ from: string; to: string; at: string }>,
    logSince: async (sinceId) => {
      await Promise.all(env.pending);
      return pagedLog((s) => adm(`log?since_id=${s}&limit=1000`) as Promise<{ requests: LogRow[]; phaseChanges: unknown[] }>, sinceId);
    },
    visit: async (url, ua) => {
      const r = await handle(new Request(url, { headers: { "User-Agent": ua } }), env, ctx);
      return { status: r.status, contentType: r.headers.get("Content-Type"), body: r.body ? await r.text() : "" };
    },
  };
}

export function localBundleSha(): string | null {
  const f = new URL("../../site/dist/bundle.json", import.meta.url);
  if (!existsSync(f)) return null;
  return (JSON.parse(readFileSync(f, "utf8")) as { bundleSha256: string }).bundleSha256;
}

/** 8 characters from [a-z0-9]: a normal-looking share tag, unique per trial. */
export function shareTag(): string {
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...randomBytes(8)].map((b) => a[b % a.length]).join("");
}
export const shareQuery = (tag: string) => `?utm_source=share&utm_id=${tag}`;

/** Padding around a trial's window for clock skew between this machine and Cloudflare (seconds). */
export const WINDOW_PAD_MS = 3000;
/** The pause between two trials of one invocation, so their padded windows never overlap. */
export const TRIAL_GAP_MS = 2 * WINDOW_PAD_MS + 1000;

/**
 * Each vendor's fetcher as the tool check saw it in the access log (23 Oct 2026). A brand-new domain
 * gets a steady stream of unrelated scanners (271 of the first 896 requests probed /.env, /.git and
 * the like), so a row inside a trial's window is the trial's ONLY if it is the vendor's own fetcher:
 *   anthropic  user agent "Claude-User" (network Anthropic, PBC)
 *   gemini     user agent "GoogleAgent-URLContext" (Google LLC)
 *   openrouter user agent "OpenRouter-WebFetch/1.0" (both Meta models)
 *   openai     user agent "ChatGPT-User/1.0" (seen at the tool check with the new key)
 *   geminifetch the harness's own fetch_url ("fetch_url/1.0")
 *   kimi       NO signature: Kimi's fetch arrives from a rotating pool of residential networks with
 *              ordinary browser user agents. A row counts for Kimi only if its path is one Kimi's own
 *              record (the fiber calls the harness made) says it requested in this trial.
 * A row carrying the trial's share tag is always the trial's. Every other row in the window is
 * BACKGROUND: counted, never scored.
 */
export const FETCHER_UA: Record<string, RegExp | null> = {
  anthropic: /Claude-User/i,
  sonnet: /Claude-User/i,
  opus: /Claude-User/i,
  fable: /Claude-User/i,
  gemini: /GoogleAgent-URLContext/i,
  geminifetch: /fetch_url\/1\.0/i,
  glimmer: /OpenRouter-WebFetch/i,
  spark: /OpenRouter-WebFetch/i,
  openrouter: /OpenRouter-WebFetch/i,
  openai: /ChatGPT-User|OAI-SearchBot/i,
  kimi: null,
};
const pathOfUrl = (u: string) => {
  try {
    return new URL(u).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
};
export function attribute(rows: LogRow[], w: { startMs: number; endMs: number; tag: string | string[]; vendor?: string; requested?: Array<string | null> }) {
  const inWindow = (r: LogRow) => {
    const t = Date.parse(r.ts);
    return t >= w.startMs - WINDOW_PAD_MS && t <= w.endMs + WINDOW_PAD_MS;
  };
  const tags = Array.isArray(w.tag) ? w.tag : [w.tag];
  const tagged = (r: LogRow) => tags.some((t) => r.query.includes(`utm_id=${t}`));
  const sig = w.vendor === undefined ? undefined : FETCHER_UA[w.vendor];
  const requested = new Set((w.requested ?? []).filter((u): u is string => !!u).map(pathOfUrl).filter((p): p is string => p !== null));
  const isVendor = (r: LogRow) => {
    if (sig === undefined) return true; // no vendor given: the plain window rule (local mock runs)
    if (sig) return sig.test(r.ua);
    return requested.has(r.path.replace(/\/+$/, "") || "/");
  };
  const mine = rows.filter((r) => tagged(r) || (inWindow(r) && isVendor(r)));
  const background = rows.filter((r) => inWindow(r) && !mine.includes(r));
  return { rows: mine, taggedOutsideWindow: mine.filter((r) => tagged(r) && !inWindow(r)).map((r) => r.id), tagSeen: mine.some(tagged), backgroundRows: background.length };
}

/** The content type a given path is served with in a phase (from the bundle), for the evidence log. */
export type ContentTypeOf = (host: string, path: string, phase: string) => string | null;
export function bundleContentTypes(): ContentTypeOf {
  const f = new URL("../../site/dist/bundle.json", import.meta.url);
  const b = JSON.parse(readFileSync(f, "utf8")) as { files: Record<string, { contentType: string }>; routes: Record<string, Record<string, Record<string, string>>> };
  return (host, path, phase) => {
    const id = b.routes[phase]?.[host]?.[path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path];
    return id ? b.files[id].contentType : null;
  };
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/**
 * The trial's fetch log, in the shape study6-score.ts scores (FetchLogEntry):
 *   - one entry per access-log row on our two hosts (status as served; outcome "fetched")
 *   - one entry per vendor-reported fetch or page opening of ANY OTHER host (outcome "fetched" with
 *     status 200 when the vendor reports success, "network_error" when it reports failure; status null
 *     and outcome "fetched" when the vendor does not say). The content type of an explorer /api/ path
 *     is taken as JSON (the explorer serves JSON there; the vendor does not report it).
 *   - one entry per vendor-reported fetch of OUR hosts with no access-log row for that path in the
 *     window: kept as "fetched" (the model may have read a cached copy) and listed in `vendorOnly`.
 * Searches are not fetches; they are reported beside the log.
 */
export function evidenceLog(rows: LogRow[], calls: WebCall[], ct: ContentTypeOf, startedAt: string): { log: FetchLogEntry[]; vendorOnly: string[] } {
  const log: FetchLogEntry[] = [];
  const base = { allowed: true, finalUrl: null, bodySha256: null, bodyChars: null, truncated: false, redirects: [], verdict: null, verdictReason: null, verdictSubject: null, error: null, durationMs: 0 };
  // A row the site served, but which the vendor's own record says failed (Kimi retried a small JSON
  // file many times and reported failure each time): the model did not receive it.
  const vendorSays = (host: string, path: string) => {
    const mine = calls.filter((c) => c.url && hostOf(c.url) === host && pathOfUrl(c.url) === (path.replace(/\/+$/, "") || "/"));
    return mine.some((c) => c.ok === true) ? true : mine.length && mine.every((c) => c.ok === false) ? false : null;
  };
  for (const r of rows) {
    const failed = r.status === 200 && vendorSays(r.host, r.path) === false;
    log.push({ ...base, seq: log.length, requestedUrl: `https://${r.host}${r.path}${r.query}`, host: r.host, outcome: failed ? "network_error" : "fetched", status: failed ? null : r.status, contentType: r.status === 200 ? ct(r.host, r.path, r.phase) : "text/html; charset=utf-8", startedAt: r.ts, error: failed ? "served by the site, but the vendor's record reports a failure" : null });
  }
  const vendorOnly: string[] = [];
  for (const c of calls) {
    if (!c.url || (c.action !== "fetch" && c.action !== "open_page")) continue;
    const h = hostOf(c.url);
    if (!h) continue;
    if ((SITE_HOSTS as readonly string[]).includes(h)) {
      const p = new URL(c.url).pathname.replace(/\/+$/, "") || "/";
      if (!rows.some((r) => r.host === h && (r.path.replace(/\/+$/, "") || "/") === p)) {
        vendorOnly.push(c.url);
        log.push({ ...base, seq: log.length, requestedUrl: c.url, host: h, outcome: c.ok === false ? "network_error" : "fetched", status: c.ok === false ? null : 200, contentType: ct(h, p, rows[0]?.phase ?? "") ?? null, startedAt });
      }
      continue;
    }
    const isExplorerApi = /\/api\//.test(c.url);
    log.push({ ...base, seq: log.length, requestedUrl: c.url, host: h, outcome: c.ok === false ? "network_error" : "fetched", status: c.ok === false ? null : c.ok === true ? 200 : null, contentType: isExplorerApi ? "application/json (assumed)" : null, startedAt, error: c.detail });
  }
  return { log, vendorOnly };
}
