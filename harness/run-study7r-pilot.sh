#!/usr/bin/env bash
# Study 7 (A37) pilot: 15 trials (LMT; C0-OT, C1-TO, C2-OT; five models), cap USD 0.60. Switches the site to
# phase S7R, runs, then closes the site (also on failure). Launched DETACHED. Run from harness/.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study7r-pilot-console.log
status=0
{
echo "=== $(date -u +%FT%TZ) pilot: switching the site to S7R"
$B run src/site-admin.ts phase S7R "Study 7 pilot" || status=1
sleep 5
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --pilot --i-have-registered A37 || status=$?; }
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "Study 7 pilot finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
