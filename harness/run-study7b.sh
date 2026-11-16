#!/usr/bin/env bash
# Study 7 passport FORMAT test (A40): 90 trials (C0 / CF / CM, both orders, 3 categories, 5 models, 1 run),
# cap USD 3. Switches the site to phase S7R, runs, then closes the site (also on failure). Launched DETACHED. Run from harness/.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study7b-console.log
status=0
{
echo "=== $(date -u +%FT%TZ) format test: switching the site to S7R"
$B run src/site-admin.ts phase S7R "Study 7 format test (A40)" || status=1
sleep 5
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --format-test --i-have-registered A37 --amendment A40 || status=$?; }
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "Study 7 format test finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
