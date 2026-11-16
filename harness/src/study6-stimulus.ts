/**
 * Study 6: what ONE trial is given, per (product, condition), assembled from the hashed stimulus
 * files of stimulus/study6/manifest.json (or, mock, stimulus/study6/mock/manifest.json). Shared by
 * run-study6.ts and preflight-study6.ts so the preflight checks exactly what a trial gets.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFetchTool, type FetchAllowList, type FetchToolHandle, type StoredPage } from "./fetch-tool";
import { S6_FOLLOW_UP, S6_SYSTEM, s6User } from "./prompts-study6";
import {
  givenKeyOf,
  readS6Manifest,
  S6_FICTIONAL_HOSTS,
  servedKeys,
  sha256,
  STIMULUS_DIR,
  type ProductKey,
  type S6Cond,
  type S6Manifest,
} from "../../stimulus/study6";

export interface S6TrialSetup {
  product: ProductKey;
  condition: S6Cond;
  mock: boolean;
  system: string;
  user: string;
  followUp: string;
  givenUrl: string;
  storedPages: StoredPage[];
  fictionalHosts: readonly string[];
  allow: FetchAllowList;
  explorerHost: string;
  stimulusFiles: Array<{ key: string; file: string; sha256: string; url: string }>;
  manifest: S6Manifest;
}

/** Real hosts reachable in a Study 6 trial: the explorer host ONLY (every path). Our hosts are not on it. */
export function s6Allow(explorerHost: string): FetchAllowList {
  return { realHosts: [explorerHost], pathPrefixes: {} };
}

function load(file: string, want: string): string {
  const text = readFileSync(join(STIMULUS_DIR, file), "utf8");
  if (sha256(text) !== want) throw new Error(`${file} does not match its manifest sha256 (rebuild: stimulus/build-study6.ts)`);
  return text;
}

/** Throws (with the reason) if the stimulus is not built or not intact. */
export function setupFor(product: ProductKey, cond: S6Cond, mock: boolean): S6TrialSetup {
  const m = readS6Manifest(mock);
  if (!m) throw new Error(`${mock ? "stimulus/study6/mock" : "stimulus/study6"}/manifest.json missing (run stimulus/build-study6.ts ${mock ? "--mock" : "--write"})`);
  if (m.mock !== mock) throw new Error(`manifest mock=${m.mock}, wanted mock=${mock}`);
  const pages: StoredPage[] = [];
  const files: S6TrialSetup["stimulusFiles"] = [];
  for (const k of servedKeys(product, cond)) {
    const e = m.stimuli[k];
    if (!e) throw new Error(`stimulus ${k} not built`);
    const text = load(e.file, e.sha256);
    pages.push({ url: e.url, html: text, ...(e.contentType.startsWith("text/html") ? {} : { contentType: e.contentType }) });
    files.push({ key: k, file: e.file, sha256: e.sha256, url: e.url });
  }
  const gk = givenKeyOf(product, cond);
  const given = m.stimuli[gk];
  const givenHtml = pages.find((p) => p.url === given.url && sha256(p.html) === given.sha256)!.html;
  return {
    product,
    condition: cond,
    mock,
    system: S6_SYSTEM,
    user: s6User(given.url, givenHtml),
    followUp: S6_FOLLOW_UP,
    givenUrl: given.url,
    storedPages: pages,
    fictionalHosts: S6_FICTIONAL_HOSTS,
    allow: s6Allow(m.explorerHost),
    explorerHost: m.explorerHost,
    stimulusFiles: files,
    manifest: m,
  };
}

/** fetch_url exactly as a Study 6 trial gets it. `extraStored` is for MOCK-MODEL runs only (canned explorer bodies, offline). */
export function fetchToolFor(s: S6TrialSetup, extraStored: { pages: StoredPage[]; hosts: string[] } | null = null): FetchToolHandle {
  if (!extraStored) return createFetchTool(s.storedPages, s.fictionalHosts, s.allow);
  return createFetchTool([...s.storedPages, ...extraStored.pages], [...s.fictionalHosts, ...extraStored.hosts], { realHosts: [], pathPrefixes: {} });
}
