#!/usr/bin/env bash
# Study 6 LIVE counted run (A36 section 2d): blocks W, D0, D1, then the drift block (W again), each
# after switching the site to that block's phase; the site goes back to "closed" at the end, also if a
# block fails or a budget cap stops it. Counted cap USD 25 (enforced by the runner before every trial).
# Gemini is not run (James, 23 Oct 2026). Run from harness/.
set -u
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
status=0
for block in W D0 D1 drift; do
  phase=$block; [ "$block" = "drift" ] && phase=W
  echo "=== $(date -u +%FT%TZ) block $block: switching the site to phase $phase"
  $B run src/site-admin.ts phase "$phase" "counted block $block" || { status=1; break; }
  sleep 5
  $B run src/run-study6-live.ts --block "$block" --i-have-registered A36 || { status=$?; echo "block $block exited $status"; break; }
done
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "counted run finished (status $status)"
exit $status
