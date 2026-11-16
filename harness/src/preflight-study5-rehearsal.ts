/**
 * Study 5: rehearse preflight gates V1, V2, V3 and V8's copy checks BEFORE the platform contract
 * is live, on the pilot passports (the live resolver JSON plus a synthetic contract block,
 * stimulus/study5-pilot.ts), built exactly as build-study5.ts builds the real ones:
 *   H = neutralise(pilot A), L = transformToL(H), G = neutralise(pilot unit), F = transformToF(G).
 * It proves the gate logic against the REAL explorer: the genuine evidence and provenance check
 * out, L is contradicted by the public record, F is contradicted by the explorer, no copy links to
 * our checker, and it prints the H-vs-L and G-vs-F leaf diffs. NOT a substitute for V0-V8 on live data.
 *
 * Usage (from harness/):  bun run src/preflight-study5-rehearsal.ts    exit 0 = rehearsal passes
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createFetchTool } from "./fetch-tool";
import { checkEvidence, foreignMismatch } from "./preflight-study5";
import { S5_ALLOW } from "./study5-stimulus";
import {
  independentRecordOf,
  leafDiff,
  neutralise,
  passportCheckOf,
  provenanceOf,
  recordedFingerprintOf,
  S5_FICTIONAL_HOSTS,
  S5_PILOT_MANIFEST,
  STIMULUS_DIR,
  transformToF,
  transformToL,
  verifyLinks,
} from "../../stimulus/study5";

const pm = JSON.parse(readFileSync(S5_PILOT_MANIFEST, "utf8"));
const aPilot = readFileSync(join(STIMULUS_DIR, pm.stimuli.T1.passport.file), "utf8");
const uPilot = readFileSync(join(STIMULUS_DIR, pm.stimuli.T2.passport.file), "utf8");
const H = neutralise(aPilot);
const G = neutralise(uPilot);
const L = transformToL(H);
const F = transformToF(G);
let fail = false;

console.log("Neutralise (design fix 2): what each copy changes against its source");
for (const [k, src, copy] of [["H", aPilot, H], ["G", uPilot, G]] as const) console.log(`  ${k}: ${JSON.stringify(leafDiff(JSON.parse(src), JSON.parse(copy)))}`);
for (const [k, t] of [["H", H], ["L", L.text], ["G", G], ["F", F.text]] as const) {
  const v = verifyLinks(t);
  const rc = (passportCheckOf(JSON.parse(t))?.evidence as { recheck_url?: unknown }).recheck_url;
  const ok = v.length === 0 && rc === null;
  fail ||= !ok;
  console.log(`  ${k}: links to /verify ${JSON.stringify(v)}; recheck_url ${JSON.stringify(rc)}  ${ok ? "ok" : "FAIL"}`);
}

const out: string[] = [];
const bad: string[] = [];
await checkEvidence("H", JSON.parse(H), false, out, bad);
await checkEvidence("G", JSON.parse(G), true, out, bad);
fail ||= bad.length > 0;
console.log(`\nV1 (genuine evidence + provenance, on the copies): ${bad.length ? "FAIL" : "PASS"}`);
for (const l of [...bad, ...out]) console.log("   ", l);

const d = leafDiff(JSON.parse(H), JSON.parse(L.text));
const tool = createFetchTool([], S5_FICTIONAL_HOSTS, S5_ALLOW);
const r = await tool.spec.execute({ url: String(independentRecordOf(JSON.parse(L.text))!.record_data_url) });
const body = r.slice(r.indexOf("\n\n") + 2).toLowerCase();
const lOk = JSON.stringify(d) === JSON.stringify(["$.passportCheck.evidence.recorded_fingerprint"]) && !body.includes(L.fake.slice(2)) && body.includes(L.real.slice(2).toLowerCase());
fail ||= !lOk;
console.log(`\nV2 (L): ${lOk ? "PASS" : "FAIL"}`);
console.log(`    H vs L differing leaves: ${JSON.stringify(d)}`);
console.log(`    H ${recordedFingerprintOf(JSON.parse(H))}  ->  L ${recordedFingerprintOf(JSON.parse(L.text))}; the public record holds L: ${body.includes(L.fake.slice(2))}, holds H: ${body.includes(L.real.slice(2).toLowerCase())}`);

const b3: string[] = [];
const notes: string[] = [];
const fd = leafDiff(JSON.parse(G), JSON.parse(F.text));
if (fd.some((p) => !p.startsWith(`${F.path}.`))) b3.push(`F differs outside provenance: ${JSON.stringify(fd)}`);
await foreignMismatch(JSON.parse(F.text), b3, notes);
fail ||= b3.length > 0;
console.log(`\nV3 (F): ${b3.length ? "FAIL" : "PASS"}`);
console.log(`    G vs F differing leaves: ${JSON.stringify(fd)}`);
const gp = provenanceOf(JSON.parse(G))!.value;
const fp = provenanceOf(JSON.parse(F.text))!.value;
for (const k of fd.map((p) => p.split(".").pop()!)) console.log(`      ${k}: ${JSON.stringify(gp[k])}  ->  ${JSON.stringify(fp[k])}`);
for (const x of [...b3, ...notes]) console.log("   ", x);
process.exit(fail ? 1 : 0);
