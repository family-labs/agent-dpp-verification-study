#!/usr/bin/env bash
# Study 8, Claude only (James, 26 Oct 2026: "Focus solely on claude for now"): first the 15 remaining Claude Haiku
# trials of A41 (resume, --models anthropic), then the A42 Claude ladder (Sonnet 5.5, Opus 5.5, Fable 5.1; per-model
# caps). Switches the site to S7R, runs both, then closes the site (also on failure). Launched DETACHED. Run from harness/.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study8-console.log
FIRST=results/study8-live-2026-10-25T23-53-59-448Z.jsonl
status=0
{
echo "=== $(date -u +%FT%TZ) Study 8 Claude: switching the site to S7R"
$B run src/site-admin.ts phase S7R "Study 8 Claude only (A41 Haiku resume + A42 ladder)" || status=1
sleep 5
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --study8 --i-have-registered A37 --amendment A41 --resume "$FIRST" --models anthropic || status=$?; }
echo "=== $(date -u +%FT%TZ) A41 Haiku resume status $status; A42 ladder next"
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --claude-ladder --i-have-registered A37 --amendment A42 || status=$?; }
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "Study 8 Claude only finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
