/**
 * Study 6 LIVE: the operator's command for the live sites' admin door (site/worker.ts /__s6/).
 * Reads SITE_ADMIN_TOKEN (and optionally SITE_ADMIN_BASE) from the study .env; never prints the key.
 *
 *   bun run src/site-admin.ts health
 *   bun run src/site-admin.ts phase <closed|check|W|D0|D1> [note]     switch what the sites show
 *   bun run src/site-admin.ts log [since_id]                          write every request row to results/site-log-<time>.jsonl
 *
 * A phase switch is a public change to the live sites: it is run only at the steps James approved
 * (plan section 5), and every switch is recorded by the Worker in its phase_changes table.
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { localBundleSha, remoteSite, type Phase } from "./study6-site";
import { RESULTS } from "./study5-ledger";

const [cmd, a1, ...rest] = process.argv.slice(2);
const site = remoteSite();
if (cmd === "health") {
  const h = await site.health();
  console.log(JSON.stringify({ ...h, localBundleSha256: localBundleSha(), sameBundle: h.bundleSha256 === localBundleSha() }, null, 2));
} else if (cmd === "phase") {
  const phases: Phase[] = ["closed", "check", "W", "D0", "D1", "S7F0", "S7F1", "S7F3", "S7R"];
  if (!phases.includes(a1 as Phase)) {
    console.error(`phase must be one of ${phases.join(", ")}`);
    process.exit(2);
  }
  console.log(JSON.stringify(await site.setPhase(a1 as Phase, rest.join(" ") || "site-admin"), null, 2));
} else if (cmd === "log") {
  const l = await site.logSince(Number(a1 ?? 0));
  mkdirSync(RESULTS, { recursive: true });
  const f = `${RESULTS}site-log-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  writeFileSync(f, l.requests.map((r) => JSON.stringify(r)).join("\n") + (l.requests.length ? "\n" : ""));
  writeFileSync(f.replace(/\.jsonl$/, ".phases.json"), JSON.stringify(l.phaseChanges, null, 2) + "\n");
  console.log(`${l.requests.length} request rows -> ${f}; ${l.phaseChanges.length} phase changes`);
} else {
  console.error("usage: site-admin.ts health | phase <closed|check|W|D0|D1> [note] | log [since_id]");
  process.exit(2);
}
