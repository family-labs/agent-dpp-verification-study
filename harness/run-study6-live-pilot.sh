#!/usr/bin/env bash
# Study 6 LIVE pilot (A36 section 2h): one product (lmt), one trial per model per condition, run in its
# own W, D0 and D1 blocks; labelled pilot and excluded from every analysis. The site is switched to each
# block's phase first and back to "closed" at the end (also if a block fails). Cap USD 2 (pilot kind).
# Run from harness/. Keys and SITE_ADMIN_TOKEN come from the repo-root .env (env.ts).
set -u
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
status=0
for block in W D0 D1; do
  echo "=== $(date -u +%FT%TZ) block $block: switching the site"
  $B run src/site-admin.ts phase "$block" "pilot block $block" || { status=1; break; }
  sleep 5
  $B run src/run-study6-live.ts --block "$block" --pilot --i-have-registered A36 --max-usd 2 || { status=$?; echo "block $block exited $status"; break; }
done
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "pilot finished (status $status)"
exit $status
