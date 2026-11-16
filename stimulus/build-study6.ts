/**
 * Study 6 stimulus builder. Rules: stimulus/study6.ts. No network access in any mode.
 *
 * Usage (from harness/):
 *   bun run ../stimulus/build-study6.ts --write    the COUNTED stimuli from fixtures/study6-conditions.json
 *        (LUKSO mainnet, chain 42). REFUSES (exit 3) while any id there is null (or the network is not
 *        LUKSO mainnet 42), and writes nothing.
 *   bun run ../stimulus/build-study6.ts --mock     MOCK stimuli from the TESTNET collections A/B/C
 *        (stimulus/study6.ts MOCK_FIXTURES), written to stimulus/study6/mock/ with mock=true in the
 *        manifest. Only for exercising the pipeline; no runner counts a mock stimulus.
 *   bun run ../stimulus/build-study6.ts --check [--mock]   rebuild in memory and require the stored
 *        bytes exactly (exit 1 on any difference).
 *
 * Every page and the declaration are written byte for byte (LF line endings; .gitattributes keeps
 * git from rewriting them) and hashed in the manifest.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildAll,
  fileOf,
  fixtureProblems,
  gtinOf,
  MOCK_FIXTURES,
  PRODUCT_KEYS,
  readFixtures,
  resolveFixtures,
  S6_MANIFEST,
  S6_MOCK_MANIFEST,
  sha256,
  STIMULUS_DIR,
  type S6Manifest,
} from "./study6";

function fail(msg: string, code = 1): never {
  console.error(`BUILD-STUDY6 REFUSED: ${msg}`);
  process.exit(code);
}
const argv = process.argv.slice(2);
const MODE = ["--write", "--mock", "--check"].filter((f) => argv.includes(f));
const CHECK = argv.includes("--check");
const MOCK = argv.includes("--mock");
if (!(MODE.length === 1 || (CHECK && MOCK && MODE.length === 2))) fail("give exactly one of --write, --mock, or --check [--mock]", 2);

let fx;
if (MOCK) fx = MOCK_FIXTURES;
else {
  const raw = readFixtures();
  const bad = fixtureProblems(raw);
  if (bad.length) {
    fail(
      `fixtures/study6-conditions.json has ${bad.length} null or malformed id(s): ${bad.join("; ")}.\n` +
        "Counted stimuli are never built from incomplete fixtures. Use --mock to exercise the pipeline on the testnet collections.",
      3,
    );
  }
  fx = resolveFixtures(raw);
}

const { files } = buildAll(fx);
const manifestFile = MOCK ? S6_MOCK_MANIFEST : S6_MANIFEST;

if (CHECK) {
  if (!existsSync(manifestFile)) fail(`${manifestFile} missing (build first)`);
  const m = JSON.parse(readFileSync(manifestFile, "utf8")) as S6Manifest;
  const bad: string[] = [];
  for (const [key, f] of files) {
    const e = m.stimuli[key];
    const rel = fileOf(MOCK, key);
    if (!e) bad.push(`${key}: not in the manifest`);
    else if (e.file !== rel || e.url !== f.url || e.sha256 !== sha256(f.text)) bad.push(`${key}: manifest entry differs from the rebuild`);
    const p = join(STIMULUS_DIR, rel);
    if (!existsSync(p) || readFileSync(p, "utf8") !== f.text) bad.push(`${rel}: stored bytes differ from the rebuild`);
  }
  for (const k of Object.keys(m.stimuli)) if (!files.has(k)) bad.push(`${k}: in the manifest but not built`);
  if (bad.length) fail(`check failed:\n  ${bad.join("\n  ")}`);
  console.log(`Rebuild reproduces all ${files.size} stored Study 6 ${MOCK ? "MOCK " : ""}stimuli byte for byte.`);
  process.exit(0);
}

const stimuli: S6Manifest["stimuli"] = {};
for (const [key, f] of files) {
  const rel = fileOf(MOCK, key);
  const p = join(STIMULUS_DIR, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.text, "utf8");
  stimuli[key] = { file: rel, sha256: sha256(f.text), bytes: Buffer.byteLength(f.text), url: f.url, contentType: f.contentType };
}
const manifest: S6Manifest = {
  _comment: MOCK
    ? "Study 6 MOCK stimuli (stimulus/build-study6.ts --mock): built from the TESTNET Study 2-5 collections A/B/C purely to exercise the pipeline. NEVER counted; run-study6.ts refuses them for any API trial."
    : "Study 6 stimuli (stimulus/build-study6.ts --write, rules in stimulus/study6.ts) from fixtures/study6-conditions.json. sha256 over the exact UTF-8 bytes; url = where fetch_url serves the stimulus.",
  mock: MOCK,
  builtAt: new Date().toISOString(),
  explorerHost: fx.explorerHost,
  explorerVerified: fx.explorerVerified,
  fixtures: fx,
  gtins: Object.fromEntries(PRODUCT_KEYS.map((k) => [k, gtinOf(k)])) as S6Manifest["gtins"],
  stimuli,
};
mkdirSync(dirname(manifestFile), { recursive: true });
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", "utf8");
for (const [k, v] of Object.entries(stimuli)) console.log(`  ${k.padEnd(26)} ${v.sha256.slice(0, 16)}  ${String(v.bytes).padStart(5)} B  ${v.url}`);
console.log(`Wrote ${files.size} files and ${manifestFile}${MOCK ? " (MOCK: testnet collections, never counted)" : ""}.`);
