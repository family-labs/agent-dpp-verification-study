#!/usr/bin/env bash
# Study 7 (A37 + A38) counted run: 180 trials (3 categories x C0-C2 x both orders x 5 models x 2 runs), cap USD 11.
# Switches the site to phase S7R, runs, then closes the site (also on failure). Launched DETACHED. Run from harness/.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study7r-counted-console.log
status=0
{
echo "=== $(date -u +%FT%TZ) counted: switching the site to S7R"
$B run src/site-admin.ts phase S7R "Study 7 counted run (A37 + A38)" || status=1
sleep 5
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --i-have-registered A37 --amendment A38 || status=$?; }
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "Study 7 counted run finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
