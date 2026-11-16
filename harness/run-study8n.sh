#!/usr/bin/env bash
# Study 8N (A43): 60 trials (N0/N1, both orders, 3 categories, 5 models, 1 run), cap USD 3. Switches the site to
# phase S7R, runs, then closes the site (also on failure). Launched DETACHED. Run from harness/.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study8n-console.log
status=0
{
echo "=== $(date -u +%FT%TZ) Study 8N: switching the site to S7R"
$B run src/site-admin.ts phase S7R "Study 8N (A43)" || status=1
sleep 5
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --study8n --i-have-registered A37 --amendment A43 || status=$?; }
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "Study 8N finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
