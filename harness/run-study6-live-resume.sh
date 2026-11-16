#!/usr/bin/env bash
# Study 6 LIVE counted run, RESUMED after the interruption of 23 Oct 2026 ~15:33 UTC (the session that
# launched it ended and took the process with it, during block D0 after 40 of 150 trials). Continues D0
# with --resume (finished trials skipped), then D1 and drift, each after switching the site to its
# phase; closes the site at the end. Launched DETACHED (Start-Process) so it survives a session ending.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study6-live-counted-console.log
status=0
{
for step in "D0 --resume results/study6-live-D0-2026-10-23T14-49-23-377Z.jsonl" "D1" "drift"; do
  block=${step%% *}; extra=""; [ "$step" != "$block" ] && extra=${step#* }
  phase=$block; [ "$block" = "drift" ] && phase=W
  echo "=== $(date -u +%FT%TZ) block $block: switching the site to phase $phase ${extra:+(resume)}"
  $B run src/site-admin.ts phase "$phase" "counted block $block ${extra:+resumed}" || { status=1; break; }
  sleep 5
  $B run src/run-study6-live.ts --block "$block" --i-have-registered A36 $extra || { status=$?; echo "block $block exited $status"; break; }
done
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "counted run finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
