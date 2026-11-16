#!/usr/bin/env bash
# Study 7 counted run, RESUMED after the Kimi budget stop (A39): runs the 91 trials not in the first run's file.
# Switches the site to phase S7R, runs, then closes the site (also on failure). Launched DETACHED. Run from harness/.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study7r-counted-console.log
FIRST=results/study7r-live-2026-10-24T09-36-02-666Z.jsonl
status=0
{
echo "=== $(date -u +%FT%TZ) RESUME (A39): switching the site to S7R"
$B run src/site-admin.ts phase S7R "Study 7 counted run resumed (A39)" || status=1
sleep 5
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --i-have-registered A37 --amendment A38 --resume "$FIRST" || status=$?; }
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "Study 7 counted run (resume) finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
