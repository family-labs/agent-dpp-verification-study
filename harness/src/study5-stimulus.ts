/**
 * Study 5: what ONE trial is given, per condition, assembled from the hashed stimulus files
 * (stimulus/study5/manifest.json) — shared by run-study5.ts and preflight-study5.ts so the
 * preflight checks exactly what a trial gets.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFetchTool, type FetchToolHandle, type StoredPage } from "./fetch-tool";
import { followUpFor, S5_SYSTEM, t1User, t2User } from "./prompts-study5";
import {
  MIRROR_T1_URL,
  MIRROR_T2_URL,
  PAGE_URL,
  PILOT_T1_URL,
  PILOT_T2_URL,
  readS5Manifest,
  S5_FICTIONAL_HOSTS,
  S5_PATH_PREFIXES,
  S5_PILOT_FICTIONAL_HOSTS,
  S5_PILOT_MANIFEST,
  S5_REAL_HOSTS,
  sha256,
  STIMULUS_DIR,
  testOf,
  W2_URL,
  W_PASSPORT_URL,
  type S5Cond,
} from "../../stimulus/study5";

export const S5_ALLOW = { realHosts: S5_REAL_HOSTS, pathPrefixes: S5_PATH_PREFIXES };

export type SetupCond = S5Cond | "smoke-T1" | "smoke-T2";
export interface TrialSetup {
  condition: SetupCond;
  test: 1 | 2;
  pilot: boolean;
  system: string;
  user: string;
  followUp: string;
  /** The URL the user handed over (T1: the page; T2: the label code). */
  givenUrl: string;
  /** The passport the condition's link / label points at (the page link in T1, the label URL in T2). */
  passportUrl: string;
  /** Live (real host) or stored (fictional host). */
  passportLive: boolean;
  storedPages: StoredPage[];
  fictionalHosts: readonly string[];
  stimulusFiles: Array<{ key: string; file: string; sha256: string; url: string }>;
  /** The served passport text when stored (L, F, W, W2, smoke), for scoring facts. */
  storedPassportText: string | null;
}

function load(file: string, want: string): string {
  const text = readFileSync(join(STIMULUS_DIR, file), "utf8");
  if (sha256(text) !== want) throw new Error(`${file} does not match its manifest sha256 (rebuild: stimulus/build-study5.ts)`);
  return text;
}

/** Throws (with the reason) if the stimulus for this condition is not built or not intact. */
export function setupFor(cond: S5Cond): TrialSetup {
  const m = readS5Manifest();
  if (!m) throw new Error("stimulus/study5/manifest.json missing (run stimulus/build-study5.ts --write)");
  const s = m.stimuli;
  const need = (k: string) => {
    const e = s[k];
    if (!e) throw new Error(`stimulus ${k} not built${m.contractLive ? "" : " (the platform contract is not live: " + m.contractProblems.join("; ") + ")"}`);
    return { e, text: load(e.file, e.sha256) };
  };
  const files: TrialSetup["stimulusFiles"] = [];
  const pages: StoredPage[] = [];
  const add = (k: string) => {
    const { e, text } = need(k);
    files.push({ key: k, file: e.file, sha256: e.sha256, url: e.url });
    pages.push({ url: e.url, html: text, ...(e.contentType.startsWith("text/html") ? {} : { contentType: e.contentType }) });
    return text;
  };
  const base = { condition: cond, test: testOf(cond), pilot: false, system: S5_SYSTEM, followUp: followUpFor(cond), fictionalHosts: S5_FICTIONAL_HOSTS, storedPages: pages, stimulusFiles: files };
  switch (cond) {
    case "H":
    case "L": {
      const page = add(`T1-${cond}-page`);
      const pp = add(`${cond}-passport`);
      return { ...base, user: t1User(PAGE_URL, page), givenUrl: PAGE_URL, passportUrl: MIRROR_T1_URL, passportLive: false, storedPassportText: pp };
    }
    case "W": {
      const page = add("T1-W-page");
      const pp = add("W-passport");
      add("W-passport-id");
      return { ...base, user: t1User(PAGE_URL, page), givenUrl: PAGE_URL, passportUrl: W_PASSPORT_URL, passportLive: false, storedPassportText: pp };
    }
    case "G":
    case "F": {
      const pp = add(`${cond}-passport`);
      return { ...base, user: t2User(MIRROR_T2_URL), givenUrl: MIRROR_T2_URL, passportUrl: MIRROR_T2_URL, passportLive: false, storedPassportText: pp };
    }
    case "W2": {
      const pp = add("W2-page");
      return { ...base, user: t2User(W2_URL), givenUrl: W2_URL, passportUrl: W2_URL, passportLive: false, storedPassportText: pp };
    }
  }
}

/** SMOKE ONLY: the pilot stimuli (synthetic contract block on the current live JSON). */
export function pilotSetup(test: 1 | 2): TrialSetup {
  const pm = JSON.parse(readFileSync(S5_PILOT_MANIFEST, "utf8")) as {
    stimuli: {
      T1: { page: { file: string; sha256: string; url: string }; passport: { file: string; sha256: string; url: string; contentType: string } };
      T2: { passport: { file: string; sha256: string; url: string; contentType: string } };
    };
  };
  const files: TrialSetup["stimulusFiles"] = [];
  const pages: StoredPage[] = [];
  const pp = test === 1 ? pm.stimuli.T1.passport : pm.stimuli.T2.passport;
  const ppText = load(pp.file, pp.sha256);
  pages.push({ url: pp.url, html: ppText, contentType: pp.contentType });
  files.push({ key: `pilot-T${test}-passport`, file: pp.file, sha256: pp.sha256, url: pp.url });
  const common = { test, pilot: true, system: S5_SYSTEM, fictionalHosts: S5_PILOT_FICTIONAL_HOSTS, storedPages: pages, stimulusFiles: files, passportLive: false, storedPassportText: ppText };
  if (test === 1) {
    const pg = pm.stimuli.T1.page;
    const html = load(pg.file, pg.sha256);
    pages.push({ url: pg.url, html });
    files.push({ key: "pilot-T1-page", file: pg.file, sha256: pg.sha256, url: pg.url });
    return { ...common, condition: "smoke-T1", user: t1User(PAGE_URL, html), followUp: followUpFor("H"), givenUrl: PAGE_URL, passportUrl: PILOT_T1_URL };
  }
  return { ...common, condition: "smoke-T2", user: t2User(PILOT_T2_URL), followUp: followUpFor("G"), givenUrl: PILOT_T2_URL, passportUrl: PILOT_T2_URL };
}

/** fetch_url exactly as a Study 5 trial gets it. */
export function fetchToolFor(setup: TrialSetup): FetchToolHandle {
  return createFetchTool(setup.storedPages, setup.fictionalHosts, S5_ALLOW);
}
