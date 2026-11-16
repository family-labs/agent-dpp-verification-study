#!/usr/bin/env bash
# Study 8 (A41) RESUMED after the OpenRouter credit stop (26 Oct 2026; A42 section 1): runs the trials of the four
# models still pending (OpenAI, Kimi, glimmer, spark) that are in neither earlier output file. Claude is done
# (A42). The errored spark trial stays missing data; nothing is re-run. Switches the site to S7R, runs, closes the
# site. Needs OpenRouter credit. Launched DETACHED. Run from harness/.
set -u
cd "$(dirname "$0")"
B=/c/Users/REDACTED_USER/.bun/bin/bun.exe
export SITE_ADMIN_BASE=https://oskvale-store.com
LOG=results/study8-console.log
DONE=results/study8-live-2026-10-25T23-53-59-448Z.jsonl,results/study8-live-2026-10-26T11-19-41-816Z.jsonl
status=0
{
echo "=== $(date -u +%FT%TZ) Study 8 RESUME (OpenAI, Kimi, Meta): switching the site to S7R"
$B run src/site-admin.ts phase S7R "Study 8 resumed (A41, remaining models)" || status=1
sleep 5
[ $status -eq 0 ] && { $B run src/run-study7r-live.ts --study8 --i-have-registered A37 --amendment A41 --resume "$DONE" --models openai,kimi,glimmer,spark || status=$?; }
echo "=== $(date -u +%FT%TZ) closing the site"
$B run src/site-admin.ts phase closed "Study 8 resume finished (status $status)"
echo "=== $(date -u +%FT%TZ) RUN END status $status"
} >> "$LOG" 2>&1
exit $status
