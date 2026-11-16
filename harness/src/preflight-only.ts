/**
 * Run the ground-truth preflight and print everything it measured, without starting a
 * single trial.
 *
 * `run.ts` calls `assertGroundTruth`, which exits the process on failure — correct for a
 * trial run, useless when the point is to READ the failure. In phase 2 of the restart the
 * fixtures are deliberately not yet in their conditions (all three read `unverified`), and
 * the deliverable of that run is part 5's matchedness diff, which is where any new
 * exemption must come from. This entry uses the non-exiting `checkGroundTruth` and prints
 * the whole result, then exits 1 if any part failed so a caller cannot mistake a printed
 * report for a pass.
 *
 * Usage:  cd harness && bun run src/preflight-only.ts
 */
import { checkGroundTruth } from "./preflight";

const r = await checkGroundTruth();

console.log("\n=== PREFLIGHT (read-only) ===");
console.log(`overall ok: ${r.ok}`);
console.log("\n--- parts 1-4: per-condition live status vs declared ---");
for (const row of r.rows) {
  const flag = row.ok ? "ok " : "FAIL";
  console.log(
    `  [${flag}] ${row.condition}  declared=${row.groundTruth}  live=${row.liveStatus ?? "<none>"}` +
      (row.transportError ? `  transport=${row.transportError}` : "") +
      (row.detail ? `\n         ${row.detail}` : ""),
  );
}
console.log(`\n  declared distinct: ${JSON.stringify(r.declaredDistinct)}`);
console.log(`  observed distinct: ${JSON.stringify(r.observedDistinct)}`);

console.log("\n--- part 5: matchedness ---");
console.log(`  ok: ${r.matchedness.ok}`);
if (r.matchedness.detail) console.log(`  ${r.matchedness.detail}`);
for (const p of r.matchedness.payloads ?? []) {
  console.log(`  ${p.condition}: rawBytes=${p.rawBytes ?? "<unread>"}`);
}
const diff = (r.matchedness as { differingPaths?: unknown }).differingPaths;
if (diff) {
  console.log("\n  differing paths (each must be understood before it is exempted):");
  console.log(JSON.stringify(diff, null, 2));
}

process.exit(r.ok ? 0 : 1);
