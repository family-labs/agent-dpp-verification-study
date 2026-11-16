#!/usr/bin/env python3
"""Analysis for the Agent DPP Verification Study.

Usage: python analyze.py <trials.jsonl> [more.jsonl ...]

This script implements the analysis changes PRE-COMMITTED in PREREGISTRATION.md.
Two groups, and the distinction matters because only one of them is externally
timestamped:

  * A1-A17 are COMMITTED at ed36035 ("prereg: log amendments A1-A17, all before
    the first trial", 2026-08-07).
  * A18-A24 are logged in PREREGISTRATION.md in the WORKING TREE and are NOT YET
    COMMITTED at the time of writing (`git log -- PREREGISTRATION.md` ends at
    ed36035). Features below that discharge A22 or A23 rest on those uncommitted
    entries and are labelled as such. Claiming them as part of ed36035 would be
    a false provenance claim.

Every citation below is an amendment identifier that EXISTS in
PREREGISTRATION.md. There is no "Item N" numbering scheme anywhere in the
pre-registration; earlier revisions of this file cited "Item 7", "Item 9" and
"Item 11", which pointed at nothing.

  A1  the `decision == "reject"` rate on B is reported as "B-rejection rate",
      NEVER as a test of P9. P9 is not evaluable from the shipped instrument.
  A2  Perplexity's rail-unsupported rows are a STRUCTURAL result, shown in a
      per-agent coverage table rather than silently dropped.
  A4  capability mode enters the primary model with THREE levels (C(mode)),
      not as the pooled binary `equipped`.
  A6  a verification_status x condition x mode table plus an explicit
      uniformity statistic, so P3 is evaluable.
  A8  the propensity cell is verification-primed; the rate is a FLOOR.
  A9  rows with `parseError` (or a null selfReport) are MISSING DATA, excluded,
      and counted per agent x mode. A null self-report is never scored wrong.
  A10 separation is detected before interpretation, with a Firth penalized
      refit; a separated coefficient table is never reported as a valid fit.
  A11 data produced under SKIP_PREFLIGHT=1 "may not be pooled with clean runs":
      bypassed rows are PARTITIONED OUT of every pre-registered table and the
      primary model, and reported separately.
  A14 per-agent/-mode exclusion counts are printed next to every accuracy
      figure, so denominator differences cannot be silent.
  A15 Kimi is EXPLORATORY: labelled everywhere, never pooled into P6/P7.
  A16 no trial may be run against an unmatched fixture set; rows whose
      matchedness check FAILED are partitioned out alongside bypassed rows.
  A17 preflight matchedness provenance is surfaced and acted on, not just
      announced.
  A22 (uncommitted) the payload-size SECONDARY model, Perplexity propensity as
      an explicit MISSING count, the full decision distribution including
      `withhold`, and the per-agent coverage table.
  A23 (uncommitted) an exploratory fourth capability arm is excluded from the
      pre-registered primary and never shown unlabelled beside the three
      locked modes.

Everything else (Wilson CIs, the descriptive tables) is as pre-registered.
"""
import json
import sys
import warnings
from collections import Counter, defaultdict

# A12 fixed the READ side (the JSONL is opened as UTF-8). The WRITE side was
# still the console default, which is cp1252 on this machine. A single agent
# emitting a non-ASCII verification_status (or a fixture title with a CJK
# character, or an emoji anywhere in a value) therefore killed the run with
# UnicodeEncodeError -- and it did so LATE, after the provenance and coverage
# tables had already printed, so the output looked like a complete report right
# up to the traceback. Reconfigure both streams before anything is written.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # pragma: no cover - non-TextIO stream
        pass

# ---------------------------------------------------------------------------
# Locked vocabulary. Anything outside these sets is reported as out-of-enum
# rather than silently absorbed: run.ts deliberately does NOT validate values
# against these enums (an out-of-enum value is real agent output and is reported
# as a coding failure, not discarded), so an unexpected value CAN reach the
# JSONL. What run.ts no longer does is INVENT a value: a missing
# verification_status or decision is now `selfReport: null` + `parseError` +
# `selfReportMissingKeys`, never a manufactured "unknown".
# ---------------------------------------------------------------------------
LOCKED_MODES = ("naive", "tool_available", "tool_instructed")  # types.ts:2
LOCKED_CONDITIONS = ("A", "B", "C")
STATUS_ENUM = ("verified", "unverified", "invalid", "unknown")  # types.ts:16
DECISION_ENUM = ("approve", "approve_with_caveats", "withhold", "reject")

# P1-P11 were locked 2026-07-23 naming these four agents only.
PREREG_AGENTS = ("claude", "chatgpt", "gemini", "perplexity")
# A15: added after lock, carries NO pre-registered prediction.
EXPLORATORY_AGENTS = ("kimi",)

# A6 operationalisations, quoted from the amendment:
#   hedging  := verification_status in {unverified, unknown}
#               AND decision in {withhold, approve_with_caveats}
#   confident mislabeling := verification_status != groundTruth
#               AND decision in {approve, reject}
#   confident rejection of the fraud (P4) := condition == C AND decision ==
#               reject AND verification_status == invalid
HEDGE_STATUSES = ("unverified", "unknown")
HEDGE_DECISIONS = ("withhold", "approve_with_caveats")
TERMINAL_DECISIONS = ("approve", "reject")

# A8, and A22 item 2 which turns it into a decision: the Perplexity adapter
# returns `toolCalls: []` unconditionally (agents/perplexity.ts), so
# `calledVerifier` is FALSE for every Perplexity row regardless of whether the
# model actually browsed to the verifier URL embedded in the JSON-LD. A
# Perplexity propensity of 0 would be a fabricated zero in exactly the arm P11
# is about, so propensity is encoded MISSING for it.
PROPENSITY_UNMEASURABLE_AGENTS = ("perplexity",)

# A single identity convention for every reader in this file. A row's agent and
# mode are read with .get() -> None and are NEVER substituted with a sentinel
# like '?': two readers using two conventions made one malformed row appear
# under two identities in two different tables, which is worse than the
# malformed row itself.
MALFORMED = "<MALFORMED>"


# ---------------------------------------------------------------------------
# formatting helpers
# ---------------------------------------------------------------------------
def wilson_ci(k, n, z=1.96):
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = k / n
    denom = 1 + z**2 / n
    center = (p + z**2 / (2 * n)) / denom
    half = z * ((p * (1 - p) / n + z**2 / (4 * n**2)) ** 0.5) / denom
    return (p, max(0.0, center - half), min(1.0, center + half))


def fmt(k, n):
    if n == 0:
        return "0/0 = n/a (no usable trials)"
    p, lo, hi = wilson_ci(k, n)
    return f"{k}/{n} = {p:.0%} [{lo:.0%}, {hi:.0%}]"


def is_malformed_value(v):
    """A value is malformed when it is absent, null, or not a non-empty string.

    This is the ONLY test used to decide malformedness, so that a row cannot be
    malformed in one table and well-formed in another.
    """
    return not isinstance(v, str) or not v.strip()


def agent_label(agent):
    """A15: Kimi must be VISIBLY labelled wherever it appears.

    A row with no agent is MALFORMED DATA, not a sixth agent.
    """
    if is_malformed_value(agent):
        return MALFORMED
    if agent in EXPLORATORY_AGENTS:
        return f"{agent} [EXPLORATORY]"
    return agent


def mode_label(mode):
    """A23: an exploratory fourth capability arm (the two-turn variant) must
    never appear in the same table as the three locked modes without a visible
    label.

    But a row with an ABSENT or non-string `mode` is MALFORMED DATA and must
    NOT be presented as an exploratory arm. The previous version returned
    "None [EXPLORATORY-ARM]" for such rows, inventing a fourth capability arm
    out of corruption and inviting a reader to interpret it as the A23 arm.
    Malformed is malformed; it is labelled as such and it enters no arm.
    """
    if is_malformed_value(mode):
        return MALFORMED
    if mode not in LOCKED_MODES:
        return f"{mode} [EXPLORATORY-ARM]"
    return mode


def rule(title):
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def status_of(t):
    sr = t.get("selfReport") or {}
    return sr.get("verification_status")


def decision_of(t):
    sr = t.get("selfReport") or {}
    return sr.get("decision")


def is_hedge(t):
    return status_of(t) in HEDGE_STATUSES and decision_of(t) in HEDGE_DECISIONS


# ---------------------------------------------------------------------------
# loading and exclusion accounting (A9, A14, A2)
# ---------------------------------------------------------------------------
EXCLUSION_REASONS = ("rail_unsupported", "error", "parseError")


def exclusion_reason(t):
    """Return None if the row is usable, else the reason it is excluded.

    Order matters: `rail_unsupported` is carried in the `error` field by
    run.ts, so it must be recognised before the generic error case.
    """
    err = t.get("error")
    if err:
        if str(err).startswith("rail_unsupported"):
            return "rail_unsupported"
        return "error"
    # A9: a truncated / unparsed response is MISSING DATA, not a wrong answer.
    if t.get("parseError") or t.get("selfReport") is None:
        return "parseError"
    return None


def load(paths):
    """Returns (all_rows, usable_rows, malformed_line_count).

    A malformed line is counted and skipped rather than crashing the run: a
    single truncated write must not make the whole JSONL unreadable. The count
    is printed, so it is never silent.
    """
    rows, malformed = [], 0
    for path in paths:
        # JSONL is raw UTF-8 from Bun; strict decode so corruption fails loud.
        try:
            with open(path, encoding="utf-8") as f:
                for lineno, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError as e:
                        malformed += 1
                        print(f"  !! malformed JSON at {path}:{lineno}: {e}")
                        continue
                    if not isinstance(obj, dict):
                        malformed += 1
                        print(f"  !! non-object JSON at {path}:{lineno}")
                        continue
                    rows.append(obj)
        except OSError as e:
            print(f"  !! could not read {path}: {e}")
    usable = [t for t in rows if exclusion_reason(t) is None]
    return rows, usable, malformed


def cell_key(t):
    """The ONE identity a row has, everywhere in this file.

    Previously this defaulted to '?' while every other reader used
    `.get(...) -> None`, so a row with an absent `mode` was ('claude', '?') in
    the coverage table and ('claude', None) in the uniformity and model frames —
    one row, two identities, appearing twice and reconciling nowhere. There is
    no default now: an absent field is None, and `mode_label`/`agent_label`
    render None as MALFORMED.
    """
    return (agent_of(t), mode_of(t))


def agent_of(t):
    v = t.get("agent")
    return None if is_malformed_value(v) else v


def mode_of(t):
    v = t.get("mode")
    return None if is_malformed_value(v) else v


def is_malformed_row(t):
    """A row whose agent or mode cannot be read at all.

    Such a row has no cell, so it can carry no pre-registered claim. It is
    counted and shown as malformed, never as an exploratory arm or agent.
    """
    return is_malformed_value(t.get("agent")) or is_malformed_value(t.get("mode"))


# ---------------------------------------------------------------------------
# A11 / A16 / A17 — provenance PARTITION, not a banner
# ---------------------------------------------------------------------------
# A11 is absolute: "any trial data produced under `SKIP_PREFLIGHT=1` is not a
# clean run, may not be pooled with clean runs". A16/A17 are equally plain that
# no trial may be run against an unmatched fixture set, because in unmatched
# rows the A-vs-B contrast — the study's core comparison — is confounded with
# payload size and content.
#
# The previous version printed a banner at the top of the run and then pooled
# the rows anyway: 5 clean + 5 bypassed printed one `5/10 = 50%`, and the
# bypassed rows also entered the uniformity, B-rejection, propensity and
# primary-model frames. A banner is a sentence; the pre-commitment is a
# partition. This implements the partition.
QUARANTINE_REASONS = ("preflight_bypassed", "matchedness_failed")


def quarantine_reasons(t):
    """Reasons this row may not be pooled with clean rows. Empty tuple = clean.

    POSITIVE EVIDENCE ONLY. A row is quarantined because it CARRIES
    `preflightBypassed: true` or `preflightMatchednessPassed: false`, never
    merely because a provenance field is absent. Absent provenance is reported
    separately as UNATTRIBUTABLE (see `report_provenance`): a log written
    before those fields existed is not thereby proven bypassed, and quarantining
    it would be a guard firing on the absence of evidence rather than on
    evidence — the failure mode this file is being repaired for elsewhere.
    """
    out = []
    if t.get("preflightBypassed") is True:
        out.append("preflight_bypassed")
    if t.get("preflightMatchednessPassed") is False:
        out.append("matchedness_failed")
    return tuple(out)


def has_provenance(t):
    return ("preflightBypassed" in t) and ("preflightMatchednessPassed" in t)


# ---------------------------------------------------------------------------
# report sections
# ---------------------------------------------------------------------------
def report_provenance(rows):
    """A11/A12/A17: a bypassed or unmatched run may never be mistaken for a
    clean one, and any analysis touching it must say so."""
    rule("Run provenance (preflight)")
    if not rows:
        print("  no rows.")
        return
    bases = Counter(t.get("apiBase", "<absent>") for t in rows)
    print("  apiBase: " + ", ".join(f"{b} x{n}" for b, n in bases.items()))
    passed = sum(1 for t in rows if t.get("preflightPassed") is True)
    bypassed = sum(1 for t in rows if t.get("preflightBypassed") is True)
    matched = sum(1 for t in rows if t.get("preflightMatchednessPassed") is True)
    n = len(rows)
    print(f"  preflightPassed:            {passed}/{n}")
    print(f"  preflightMatchednessPassed: {matched}/{n}")
    print(f"  preflightBypassed:          {bypassed}/{n}")
    # The PARTITION, stated as counts before any statistic is computed.
    q = Counter()
    for t in rows:
        for r in quarantine_reasons(t):
            q[r] += 1
    n_quar = sum(1 for t in rows if quarantine_reasons(t))
    n_clean = n - n_quar
    unattributable = sum(1 for t in rows if not has_provenance(t))

    print(f"\n  PARTITION (A11 / A16 / A17):")
    print(f"    CLEAN (pooled into the pre-registered tables and the primary model): {n_clean}/{n}")
    print(f"    QUARANTINED (reported separately, pooled into nothing):              {n_quar}/{n}")
    for r in QUARANTINE_REASONS:
        if q[r]:
            print(f"      - {r}: {q[r]} row(s)")
    if unattributable:
        print(f"\n  ** {unattributable}/{n} row(s) carry NO preflight provenance fields at all")
        print("  ** (no preflightBypassed / preflightMatchednessPassed). These are")
        print("  ** UNATTRIBUTABLE: they are not proven bypassed, so they are NOT")
        print("  ** quarantined, but neither can they be confirmed clean. Treat any")
        print("  ** figure resting on them as provenance-unverified.")

    if bypassed:
        print("\n  " + "*" * 70)
        print("  ** SKIP_PREFLIGHT BYPASS PRESENT IN THIS DATA.")
        print("  ** Per A11, rows produced under bypass are NOT a clean run and MAY NOT")
        print("  ** BE POOLED with clean rows. They are therefore PARTITIONED OUT of")
        print("  ** every pre-registered table and out of the primary model below, and")
        print("  ** reported separately under a QUARANTINED heading. Any write-up of")
        print("  ** those numbers must state the bypass and the ground-truth mismatches")
        print("  ** it overrode.")
        print("  " + "*" * 70)
    if any(t.get("preflightMatchednessPassed") is False for t in rows):
        print("\n  " + "*" * 70)
        print("  ** MATCHEDNESS (preflight part 5) FAILED FOR SOME ROWS.")
        print("  ** Per A16/A17 no trial may be run against an unmatched fixture set:")
        print("  ** an A-vs-B difference in such rows is confounded with payload size")
        print("  ** and content, so those rows cannot sit silently in the A-vs-B")
        print("  ** contrast. They are PARTITIONED OUT with the bypassed rows.")
        print("  " + "*" * 70)
    if matched < n:
        print(f"\n  (note: {n - matched} row(s) do not carry preflightMatchednessPassed == true;")
        print("   of those, only the ones explicitly `false` are quarantined — see above.)")

    malformed_rows = sum(1 for t in rows if is_malformed_row(t))
    if malformed_rows:
        print(f"\n  ** {malformed_rows}/{n} row(s) are MALFORMED: `agent` and/or `mode` is")
        print("  ** absent or not a string. They have no cell, carry no pre-registered")
        print(f"  ** claim, and are shown as {MALFORMED} (meaning: the field is absent,")
        print("  ** null, or not a non-empty string).")
        print("  ** They are NOT an exploratory agent and NOT an exploratory capability")
        print("  ** arm (A23); malformed data is not a study arm.")
    # Observed-vs-declared ground truth, per A11's table.
    mism = Counter(
        (t.get("condition"), t.get("groundTruth"), t.get("observedLiveStatus"))
        for t in rows
        if t.get("observedLiveStatus") is not None
        and t.get("observedLiveStatus") != t.get("groundTruth")
    )
    if mism:
        print("\n  observedLiveStatus != groundTruth in these rows:")
        for (cond, gt, obs), k in sorted(mism.items(), key=lambda x: str(x[0])):
            print(f"    condition {cond}: declared {gt!r}, observed {obs!r}  x{k}")


def report_coverage(rows):
    """A2 + A9 + A14: per-agent coverage — attempted, usable, excluded by
    reason. The rail-unsupported cells are a structural fact (P7), not a
    missing row; and a denominator difference between agents must be visible."""
    rule("Coverage and exclusions, per agent x mode (A2, A9, A14)")
    if not rows:
        print("  no rows.")
        return
    attempted = Counter(cell_key(t) for t in rows)
    usable = Counter(cell_key(t) for t in rows if exclusion_reason(t) is None)
    excl = defaultdict(Counter)
    for t in rows:
        r = exclusion_reason(t)
        if r:
            excl[cell_key(t)][r] += 1

    hdr = (f"  {'agent':22s} {'mode':42s} {'attempt':>7s} {'usable':>6s} "
           f"{'error':>5s} {'parseErr':>8s} {'railUnsup':>9s}")
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    for key in sorted(attempted, key=lambda k: (str(k[0]), str(k[1]))):
        agent, mode = key
        e = excl.get(key, Counter())
        print(f"  {agent_label(agent):22s} {mode_label(mode):42s} "
              f"{attempted[key]:7d} {usable.get(key, 0):6d} "
              f"{e['error']:5d} {e['parseError']:8d} {e['rail_unsupported']:9d}")

    # Per-agent totals, which is the level P7 is stated at.
    print("\n  Per-agent totals:")
    a_att, a_use, a_exc = Counter(), Counter(), defaultdict(Counter)
    for t in rows:
        a = agent_of(t)
        a_att[a] += 1
        r = exclusion_reason(t)
        if r:
            a_exc[a][r] += 1
        else:
            a_use[a] += 1
    for a in sorted(a_att, key=str):
        e = a_exc.get(a, Counter())
        print(f"    {agent_label(a):22s} attempted {a_att[a]:4d}  usable {a_use.get(a, 0):4d}"
              f"  excluded: error {e['error']}, parseError {e['parseError']},"
              f" rail_unsupported {e['rail_unsupported']}")
    rail_cells = {k: v for k, v in excl.items() if v["rail_unsupported"]}
    if rail_cells:
        print("\n  STRUCTURAL RESULT (A2 / P7) — rail-unsupported cells, i.e. cells the")
        print("  harness never dispatched because the adapter sets supportsTools:false.")
        print("  P7 is reported as this count, NOT as a measured accuracy difference.")
        for key in sorted(rail_cells, key=lambda k: (str(k[0]), str(k[1]))):
            print(f"    {agent_label(key[0]):22s} {mode_label(key[1]):42s} "
                  f"{rail_cells[key]['rail_unsupported']} cell-row(s)")
    # A9 + the run.ts repair: rows whose JSON block was present but missing a
    # REQUIRED key. These used to be indistinguishable from an agent genuinely
    # answering "unknown", because run.ts manufactured that value. They are now
    # excluded as missing data and counted here on their own.
    mk = Counter()
    for t in rows:
        keys = t.get("selfReportMissingKeys")
        if isinstance(keys, list) and keys:
            mk[", ".join(str(k) for k in keys)] += 1
    if mk:
        print(f"\n  {sum(mk.values())} row(s) had a self-report JSON block with a REQUIRED")
        print("  key ABSENT (harness field `selfReportMissingKeys`):")
        for combo, k in mk.most_common():
            print(f"    missing [{combo}]: {k} row(s)")
        print("  These are MISSING DATA under A9, not a verdict of \"unknown\". run.ts used")
        print("  to write `parsed.verification_status ?? \"unknown\"`, and because \"unknown\"")
        print("  is a LEGAL enum value the row arrived here with a non-null selfReport and")
        print("  no parseError — so it passed exclusion and was scored WRONG against")
        print("  groundTruth. Missing data was reported as 0% accuracy. The harness now")
        print("  records absence as absence, and these rows are excluded.")

    pe = sum(c["parseError"] for c in excl.values())
    if pe:
        print(f"\n  {pe} row(s) excluded as parseError / null selfReport. Per A9 these are")
        print("  MISSING DATA and are never scored as incorrect verdicts. Extended-thinking")
        print("  agents (Claude, Kimi) are expected to lose more rows here; the counts")
        print("  above are what makes that visible rather than a silent denominator shift.")


def report_out_of_enum(usable):
    rule("Out-of-enum values (run.ts records agent values unvalidated, by design)")
    bad_d = Counter(decision_of(t) for t in usable if decision_of(t) not in DECISION_ENUM)
    bad_s = Counter(status_of(t) for t in usable if status_of(t) not in STATUS_ENUM)
    if not bad_d and not bad_s:
        print("  none — every decision and verification_status is in the locked enum.")
        return
    for v, k in bad_d.most_common():
        print(f"  !! decision {v!r} is NOT in {DECISION_ENUM}: {k} row(s)")
    for v, k in bad_s.most_common():
        print(f"  !! verification_status {v!r} is NOT in {STATUS_ENUM}: {k} row(s)")
    print("  These rows are retained in denominators (they are real agent output) but")
    print("  contribute to no pre-registered numerator. Report them as coding failures.")


def report_accuracy(usable, rows):
    """H1 accuracy per agent x mode.

    A14 is about denominators, so the table is indexed by every cell that was
    ATTEMPTED, not by the cells that happened to survive. A cell that lost ALL
    of its rows to exclusion used to VANISH from this table while still
    appearing in coverage — the one table A14 exists for was the one table that
    hid a destroyed cell. It now prints as `0/0 = n/a (no usable trials)` with
    its exclusion count, which is a result (an arm that produced no data) and
    is never confusable with 0% accuracy.
    """
    rule("H1 — verification accuracy (self-reported status == declared groundTruth)")
    if not rows:
        print("  no rows.")
        return
    acc = defaultdict(lambda: [0, 0])
    for t in usable:
        acc[cell_key(t)][1] += 1
        if status_of(t) == t.get("groundTruth"):
            acc[cell_key(t)][0] += 1
    excl_n = Counter()
    attempted = Counter()
    for t in rows:
        attempted[cell_key(t)] += 1
        if exclusion_reason(t):
            excl_n[cell_key(t)] += 1
    destroyed = []
    for key in sorted(attempted, key=lambda k: (str(k[0]), str(k[1]))):
        k, n = acc.get(key, [0, 0])
        if n == 0:
            destroyed.append(key)
        print(f"  {agent_label(key[0]):22s} {mode_label(key[1]):42s} {fmt(k, n)}"
              f"   (attempted {attempted[key]}, excluded {excl_n.get(key, 0)})")
    if destroyed:
        print(f"\n  {len(destroyed)} cell(s) above lost EVERY attempted row to exclusion and")
        print("  print as n/a. Per A9/A2 that is missing data or a structural fact — it is")
        print("  NOT 0% accuracy, and no numerator or denominator may be read from it.")
    print("\n  A14/A9: the attempted and excluded counts are printed beside every figure")
    print("  so that a denominator difference between agents is visible, not silent.")
    print("  A15: Kimi rows are labelled EXPLORATORY and must not be pooled into any")
    print("  figure used to evaluate P6 (Claude/GPT/Gemini) or P7 (Perplexity).")


def report_status_by_condition(usable):
    """A6 / P3 — the table without which P3 is unevaluable."""
    rule("A6 — verification_status x condition x mode  (required to evaluate P3)")
    if not usable:
        print("  no usable trials.")
        return
    statuses = list(STATUS_ENUM) + sorted(
        {status_of(t) for t in usable} - set(STATUS_ENUM) - {None}
    )
    conds = list(LOCKED_CONDITIONS) + sorted(
        {t.get("condition") for t in usable} - set(LOCKED_CONDITIONS) - {None}
    )
    modes = [m for m in LOCKED_MODES if any(mode_of(t) == m for t in usable)]
    modes += sorted({mode_of(t) for t in usable} - set(LOCKED_MODES) - {None})

    def matrix(subset, title):
        counts = Counter((status_of(t), t.get("condition")) for t in subset)
        totals = Counter(t.get("condition") for t in subset)
        print(f"\n  {title}")
        print(f"    {'status':22s}" + "".join(f"{c:>10s}" for c in conds))
        for s in statuses:
            row = [counts.get((s, c), 0) for c in conds]
            if not any(row) and s not in STATUS_ENUM:
                continue
            print(f"    {str(s):22s}" + "".join(f"{v:10d}" for v in row))
        print(f"    {'(n)':22s}" + "".join(f"{totals.get(c, 0):10d}" for c in conds))

    print("\n  Pooled over agents, by mode:")
    for m in modes:
        matrix([t for t in usable if mode_of(t) == m], f"mode = {mode_label(m)}")

    print("\n  Per agent x mode:")
    seen = sorted({(agent_of(t), mode_of(t)) for t in usable},
                  key=lambda k: (str(k[0]), str(k[1])))
    for agent, m in seen:
        matrix([t for t in usable if agent_of(t) == agent and mode_of(t) == m],
               f"{agent_label(agent)} / mode = {mode_label(m)}")


def report_uniformity(usable):
    """A6 / P3 — 'uniform hedging' as a NUMBER rather than an adjective.

    OPERATIONALISATION (pre-committed in A6, implemented here):

      hedging(trial) := verification_status in {unverified, unknown}
                        AND decision in {withhold, approve_with_caveats}

      For each (agent, mode) let h_A, h_B, h_C be the hedging rate in each
      condition. Two statistics are reported:

      1. HEDGE-RANGE = max(h) - min(h), in percentage points. A6 defines
         "uniform" as a range of <= 15 pp *judged on overlapping Wilson
         intervals*, so the flag below requires BOTH: range <= 15 pp AND all
         three pairwise 95% Wilson intervals overlapping. This is the
         pre-registered criterion and is the one P3 is judged on.

      2. MAX-TVD = the largest total-variation distance between any two
         conditions' full verification_status distributions, i.e.
         0.5 * sum_s |p_s(c1) - p_s(c2)|. This is 0 when the agent reports the
         SAME MIX of statuses in every condition (perfect uniformity, whatever
         that mix is) and 1 when two conditions share no status at all. It is
         reported alongside the hedge-range because an agent could hedge at an
         equal rate while still discriminating within the non-hedging rows;
         MAX-TVD catches that, hedge-range does not. MAX-TVD is a supporting
         descriptive statistic, NOT a substitute for the A6 criterion.

      Both require all three conditions to be present; otherwise "n/a".
    """
    rule("A6 — uniformity statistic (makes P3's 'uniform hedging' a number)")
    if not usable:
        print("  no usable trials.")
        return
    print("  hedging := status in {unverified, unknown} AND decision in")
    print("             {withhold, approve_with_caveats}                    (A6)")
    print("  UNIFORM := hedge-range <= 15 pp AND all pairwise Wilson CIs overlap (A6)")
    print("  MAX-TVD := largest total-variation distance between two conditions'")
    print("             full status distributions (0 = identical mix)  [supporting]")
    print()
    hdr = (f"  {'agent':22s} {'mode':42s} {'h_A':>12s} {'h_B':>12s} {'h_C':>12s}"
           f" {'range':>7s} {'TVD':>6s}  verdict")
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    keys = sorted({(agent_of(t), mode_of(t)) for t in usable},
                  key=lambda k: (str(k[0]), str(k[1])))
    for agent, mode in keys:
        sub = [t for t in usable if agent_of(t) == agent and mode_of(t) == mode]
        rates, cis, dists = {}, {}, {}
        for c in LOCKED_CONDITIONS:
            cs = [t for t in sub if t.get("condition") == c]
            n = len(cs)
            k = sum(1 for t in cs if is_hedge(t))
            rates[c] = (k, n)
            cis[c] = wilson_ci(k, n) if n else None
            if n:
                cnt = Counter(status_of(t) for t in cs)
                dists[c] = {s: v / n for s, v in cnt.items()}
        cells = [f"{(rates[c][0] / rates[c][1]):.0%}({rates[c][1]})"
                 if rates[c][1] else "n/a" for c in LOCKED_CONDITIONS]
        present = [c for c in LOCKED_CONDITIONS if rates[c][1]]
        if len(present) < 3:
            verdict, rng_s, tvd_s = "n/a (not all 3 conditions present)", "n/a", "n/a"
        else:
            ps = [rates[c][0] / rates[c][1] for c in LOCKED_CONDITIONS]
            rng = (max(ps) - min(ps)) * 100
            overlap = all(
                cis[a][1] <= cis[b][2] and cis[b][1] <= cis[a][2]
                for i, a in enumerate(LOCKED_CONDITIONS)
                for b in LOCKED_CONDITIONS[i + 1:]
            )
            tvd = 0.0
            for i, a in enumerate(LOCKED_CONDITIONS):
                for b in LOCKED_CONDITIONS[i + 1:]:
                    keys_s = set(dists[a]) | set(dists[b])
                    d = 0.5 * sum(abs(dists[a].get(s, 0) - dists[b].get(s, 0))
                                  for s in keys_s)
                    tvd = max(tvd, d)
            rng_s, tvd_s = f"{rng:.0f}pp", f"{tvd:.2f}"
            if rng <= 15 and overlap:
                verdict = "UNIFORM (A6)"
                if tvd > 0.15:
                    # Equal hedging rates can still hide full discrimination
                    # inside the non-hedging rows. Say so on the same line.
                    verdict += f" but status mix DIFFERS across conditions (TVD {tvd:.2f})"
            elif rng <= 15:
                verdict = "range ok but CIs disjoint -> NOT uniform"
            else:
                verdict = "NOT uniform"
        print(f"  {agent_label(agent):22s} {mode_label(mode):42s} "
              f"{cells[0]:>12s} {cells[1]:>12s} {cells[2]:>12s} {rng_s:>7s} {tvd_s:>6s}"
              f"  {verdict}")
    print("\n  P3 is judged on the naive rows only. Rows for exploratory agents/arms are")
    print("  shown for completeness and are labelled; they carry no pre-registered claim.")


def report_confident_mislabel(usable):
    rule("A6 — confident mislabeling (the alternative P3 contrasts against)")
    if not usable:
        print("  no usable trials.")
        return
    print("  confident mislabeling := status != groundTruth AND decision in")
    print("                           {approve, reject}                     (A6)")
    by = defaultdict(lambda: [0, 0])
    for t in usable:
        by[cell_key(t)][1] += 1
        if status_of(t) != t.get("groundTruth") and decision_of(t) in TERMINAL_DECISIONS:
            by[cell_key(t)][0] += 1
    for key in sorted(by, key=lambda k: (str(k[0]), str(k[1]))):
        k, n = by[key]
        print(f"  {agent_label(key[0]):22s} {mode_label(key[1]):42s} {fmt(k, n)}")


def report_decision_distribution(usable):
    """A22 item 3: all four decision values — approve | approve_with_caveats |
    withhold | reject — are reported as a full distribution per mode x condition
    x framing, never collapsed to a binary without both forms shown. `withhold`
    is the modal predicted naive behaviour under P3 and P5 and appears in no
    numerator anywhere; neither does any out-of-enum value."""
    rule("Full decision distribution (every decision value, not just approve-ish)")
    if not usable:
        print("  no usable trials.")
        return
    vals = list(DECISION_ENUM) + sorted(
        {decision_of(t) for t in usable} - set(DECISION_ENUM) - {None}
    )
    if any(decision_of(t) is None for t in usable):
        vals.append(None)
    framings = sorted({t.get("framing") for t in usable}, key=str)
    for framing in framings:
        print(f"\n  framing = {framing}")
        print(f"    {'mode':42s} {'cond':>4s}" +
              "".join(f"{str(v)[:11]:>12s}" for v in vals) + f"{'n':>6s}")
        keys = sorted({(mode_of(t), t.get("condition")) for t in usable
                       if t.get("framing") == framing}, key=lambda k: (str(k[0]), str(k[1])))
        for mode, cond in keys:
            sub = [t for t in usable if t.get("framing") == framing
                   and mode_of(t) == mode and t.get("condition") == cond]
            cnt = Counter(decision_of(t) for t in sub)
            print(f"    {mode_label(mode):42s} {str(cond):>4s}" +
                  "".join(f"{cnt.get(v, 0):12d}" for v in vals) + f"{len(sub):6d}")

    rule("H2 — approve-ish rate (approve | approve_with_caveats) by framing x mode x condition")
    dec = defaultdict(lambda: [0, 0])
    for t in usable:
        key = (t.get("framing"), mode_of(t), t.get("condition"))
        dec[key][1] += 1
        if decision_of(t) in ("approve", "approve_with_caveats"):
            dec[key][0] += 1
    for key in sorted(dec, key=lambda k: tuple(str(x) for x in k)):
        framing, mode, cond = key
        k, n = dec[key]
        print(f"  {str(framing):10s} {mode_label(mode):42s} {cond}: {fmt(k, n)}")
    print("\n  Note: `withhold` is a legal decision and appears in NO numerator here.")
    print("  Read it from the full distribution above, not from this table.")


def report_fraud_and_b(usable):
    rule("H4 / P4 — fraud-catch on C, and the B-REJECTION RATE (A1: this is NOT P9)")
    if not usable:
        print("  no usable trials.")
        return
    print("  P4 strict (A6): condition C AND decision == reject AND status == invalid")
    strict = defaultdict(lambda: [0, 0])
    loose = defaultdict(lambda: [0, 0])
    for t in usable:
        if t.get("condition") != "C":
            continue
        strict[cell_key(t)][1] += 1
        loose[cell_key(t)][1] += 1
        if decision_of(t) == "reject":
            loose[cell_key(t)][0] += 1
            if status_of(t) == "invalid":
                strict[cell_key(t)][0] += 1
    for key in sorted(strict, key=lambda k: (str(k[0]), str(k[1]))):
        sk, sn = strict[key]
        lk, ln = loose[key]
        print(f"    {agent_label(key[0]):22s} {mode_label(key[1]):42s} "
              f"strict {fmt(sk, sn)} | loose(reject only) {fmt(lk, ln)}")

    print("\n  B-REJECTION RATE (decision == reject on condition B).")
    print("  A1: this is reported under this name ONLY. It is NOT a test of P9.")
    b = defaultdict(lambda: [0, 0])
    for t in usable:
        if t.get("condition") != "B":
            continue
        b[cell_key(t)][1] += 1
        if decision_of(t) == "reject":
            b[cell_key(t)][0] += 1
    for key in sorted(b, key=lambda k: (str(k[0]), str(k[1]))):
        k, n = b[key]
        print(f"    {agent_label(key[0]):22s} {mode_label(key[1]):42s} {fmt(k, n)}")
    print("""
  ** P9 IS NOT EVALUABLE FROM THE SHIPPED INSTRUMENT (A1). **
  P9 predicts an agent calls B *fraudulent/suspicious*. The field STUDY_DESIGN.md
  names for that (`flagged_fraud`) exists nowhere in the implementation. The rate
  above measures REFUSAL TO CLEAR, a behavioural quantity that is systematically
  larger than the semantic one P9 named — an agent that rejects B purely because
  B is unverified (the behaviour P5 and P10 predict) is counted here. Testing P9
  would require a fraud assertion hand-coded from reasoning_summary/responseText
  under the blinding rules in A9; that coding is not implemented and may not be
  introduced after the trials without being logged in PREREGISTRATION.md first.""")


def report_propensity(usable, rows):
    """H5 / P11 propensity, with the missing cells COUNTED.

    The missing-cell branch used to be unreachable for the one agent it was
    written for. `PROPENSITY_UNMEASURABLE_AGENTS` was tested against `usable`
    only — but every Perplexity `tool_available` row carries
    `error: rail_unsupported` and is excluded before this function is called,
    so no Perplexity row ever reached the counter and no Perplexity line ever
    printed. The table showed nothing and a static prose paragraph did the work
    a number was supposed to do.

    A22 item 2 requires the absence to be "reported as an explicit missing-cell
    count", so the denominator of missing cells is taken from the COVERAGE data
    (`rows`, i.e. every attempted row) rather than from the survivors.
    """
    rule("H5 / P11 — verifier-call rate in tool_available mode")
    print("  A8: this is NOT unprompted propensity. REPORT_FORMAT is appended in every")
    print("  mode, so every tool_available trial is already verification-primed. This is")
    print("  a FLOOR on true unprompted propensity, not an estimate of it.")
    print()

    usable_ids = {id(t) for t in usable}
    # Every attempted tool_available row, excluded or not. This is the frame the
    # missing-cell count must be computed over.
    attempted_ta = [t for t in rows if mode_of(t) == "tool_available"]

    prop = defaultdict(lambda: [0, 0, 0])  # called, measured_n, missing
    for t in attempted_ta:
        key = (cell_key(t)[0], t.get("framing"))
        agent = cell_key(t)[0]
        # MISSING when: (a) the agent's calledVerifier is structurally
        # unmeasurable (A22 item 2), (b) the field is absent, or (c) the row was
        # excluded so no propensity observation exists for it at all.
        if (agent in PROPENSITY_UNMEASURABLE_AGENTS
                or "calledVerifier" not in t
                or id(t) not in usable_ids):
            prop[key][2] += 1
            continue
        prop[key][1] += 1
        if t.get("calledVerifier"):
            prop[key][0] += 1

    if not prop:
        print("  no tool_available trials were attempted at all.")
    else:
        print(f"  {'agent':22s} {'framing':10s} rate")
        for key in sorted(prop, key=lambda k: (str(k[0]), str(k[1]))):
            k, n, missing = prop[key]
            agent, framing = key
            if n == 0:
                cell = f"MISSING (n={missing}, not measured)"
            elif missing:
                cell = f"{fmt(k, n)}  + {missing} MISSING"
            else:
                cell = fmt(k, n)
            print(f"  {agent_label(agent):22s} {str(framing):10s} {cell}")

    unmeasurable_total = sum(
        v[2] for key, v in prop.items() if key[0] in PROPENSITY_UNMEASURABLE_AGENTS
    )
    print(f"""
  ** Perplexity propensity is MISSING, never 0 (A8; A22 item 2). **
  MISSING CELL COUNT for {list(PROPENSITY_UNMEASURABLE_AGENTS)}: {unmeasurable_total} attempted
  tool_available row(s) contribute NO numerator and NO denominator here.
  agents/perplexity.ts returns `toolCalls: []` unconditionally, so calledVerifier
  is false on every Perplexity row whether or not the model actually browsed to
  the verifier URL embedded in the JSON-LD. Recording that as a 0 would add BIAS,
  not noise, in exactly the arm P11 is about: it drags the pooled rate downward
  in one direction only and tightens the interval around the wrong value. An
  agent that was never asked did not decline.""")


# ---------------------------------------------------------------------------
# modelling (A4, A10, plus the pre-committed secondary payload model)
# ---------------------------------------------------------------------------
def payload_bytes(t):
    """Served-payload size for THIS row's own condition.

    Provenance order: servedPassportBytes[condition] (types.ts:74), then a
    top-level rawBytes if a future log site writes one. Returns None when the
    field is absent or null — the model then degrades gracefully and says so.
    """
    spb = t.get("servedPassportBytes")
    if isinstance(spb, dict):
        v = spb.get(t.get("condition"))
        if isinstance(v, (int, float)):
            return float(v)
    v = t.get("rawBytes")
    if isinstance(v, (int, float)):
        return float(v)
    return None


def build_frame(usable, pd):
    rows = []
    for t in usable:
        # Same identity convention as every other reader: cell_key, so a
        # malformed agent/mode is None here and nowhere becomes '?' or a
        # spurious extra level.
        agent, mode = cell_key(t)
        rows.append({
            "correct": int(status_of(t) == t.get("groundTruth")),
            "mode": mode,
            "equipped": None if mode is None else int(mode != "naive"),
            "condition": t.get("condition"),
            "agent": agent,
            "framing": t.get("framing"),
            "payload_bytes": payload_bytes(t),
        })
    df = pd.DataFrame(rows)
    if not df.empty:
        df["payload_kb"] = df["payload_bytes"] / 1000.0
    return df


# ---------------------------------------------------------------------------
# A10 — FLAG vs VERDICT. Read this before changing anything below it.
# ---------------------------------------------------------------------------
# A10 step 1 prescribes TWO detectors: a cell scan, and coefficient/SE
# thresholds. It nowhere says that a marginal all-0/all-1 cell invalidates the
# fit. The previous version OR-ed them into one boolean —
# `separated = bool(sep_cells or big or sep_warn)` — and printed "SEPARATION
# DETECTED — THE TABLE ABOVE IS NOT INTERPRETABLE" followed by "REPORTED AS NOT
# ESTIMABLE" whenever ANY cell was uniform.
#
# WHY THAT DESTROYED THE INSTRUMENT. The design is 3 modes x 3 conditions x
# ~4 agents x 2 framings with RUNS_PER_CELL = 5. A 5-trial cell is all-correct
# with probability 0.85^5 = 0.44 at P6's lower bound and 0.98^5 = 0.90 at its
# upper bound; a naive cell at chance is all-0 or all-1 with probability
# 2 * 0.5^5 = 0.06. Over ~54 cells, at the study's OWN predicted rates, at least
# one uniform cell is a near-certainty (Monte Carlo: P = 1.000, mean 18-35
# flagged cells). So the guard fired on essentially every healthy dataset and
# declared the PRIMARY ESTIMAND — P2, the capability x condition interaction,
# held at >90% confidence — unreportable by construction. A guard that fires on
# 100% of healthy data is not a guard; it is a broken instrument.
#
# THE RULE NOW:
#   FLAG   = a property of the DATA. The cell scan. Printed as a descriptive
#            note. It never decides anything.
#   VERDICT = a property of the FITTED MODEL. Only genuine pathology of the fit
#            may declare non-estimability:
#              (a) statsmodels raised (PerfectSeparationError, singular matrix);
#              (b) a PerfectSeparationWarning / singular-matrix warning;
#              (c) the optimiser reported non-convergence;
#              (d) implausible fitted quantities (thresholds below).
#
# THRESHOLDS, stated and justified (these are A10's own numbers, |coef| > 10 and
# SE > 10, kept unchanged):
#   * |coef| > 10 is an odds ratio above e^10 ~ 22,000. With <= 5 trials per cell
#     and ~1,000 rows total, no finite dataset supports an effect of that size:
#     it is the optimiser walking off toward +/-infinity, which is what
#     quasi-complete separation looks like. A healthy fit on this design sits
#     around |coef| < 2.5.
#   * SE > 10 puts the 95% interval at roughly +/-20 on the log-odds scale, i.e.
#     the whole probability scale from ~0 to ~1. The term carries no information;
#     the Hessian is near-singular. A healthy fit here sits around SE < 1.5.
#   * A NaN coefficient or SE is the Hessian having gone singular outright.
# Both thresholds are ~4x above the healthy range, so they separate pathology
# from ordinary sampling variation rather than tripping on it.


def scan_separation(df):
    """A10 step 1, FLAG ONLY: every mode x condition x agent x framing cell that
    is all-0 or all-1 on the outcome.

    The return value is DESCRIPTIVE. It must never be fed into the estimability
    verdict — see the block comment above.
    """
    flagged = []
    grouped = df.groupby(["mode", "condition", "agent", "framing"], dropna=False)
    for key, g in grouped:
        s = g["correct"].sum()
        n = len(g)
        if n and (s == 0 or s == n):
            flagged.append((key, int(s), n))
    return flagged


COEF_ABS_MAX = 10.0   # A10 step 1, justified in the block comment above
SE_MAX = 10.0         # A10 step 1, justified in the block comment above


def coef_flags(res):
    """VERDICT input: fitted terms whose coefficient or SE is implausible."""
    bad = []
    for name, coef, se in zip(res.params.index, res.params.values, res.bse.values):
        coef, se = float(coef), float(se)
        # NaN != NaN — a NaN standard error is the Hessian having gone singular,
        # which is itself a separation signature and must not slip through the
        # comparison operators (NaN > 10 is False).
        nan = coef != coef or se != se
        if nan or abs(coef) > COEF_ABS_MAX or se > SE_MAX:
            bad.append((name, coef, se))
    return bad


def fit_diagnostics(res):
    """Describe the fit's health in numbers, so a reader can check the verdict."""
    coefs = [abs(float(c)) for c in res.params.values]
    ses = [float(s) for s in res.bse.values]
    finite_c = [c for c in coefs if c == c]
    finite_s = [s for s in ses if s == s]
    return (max(finite_c) if finite_c else float("nan"),
            max(finite_s) if finite_s else float("nan"))


def firth_refit(df, formula, smf):
    """A10 step 2: Firth (Jeffreys-prior) penalized logistic regression.

    Uses `firthlogist`; A10 step 3 pre-commits that if no penalized package is
    available the regression is reported as NOT ESTIMABLE and the descriptive
    Wilson tables become the primary report. Reporting the separated
    statsmodels table as a valid fit is prohibited.
    """
    try:
        from firthlogist import FirthLogisticRegression
    except ImportError:
        print("    firthlogist is NOT IMPORTABLE (see analysis/requirements.txt for the")
        print("    exact install line — it needs --ignore-requires-python on Python 3.12")
        print("    and scikit-learn < 1.6).")
        print("    Per A10 step 3, the regression is REPORTED AS NOT ESTIMABLE and the")
        print("    descriptive Wilson-interval tables above become the primary report.")
        print("    The separated coefficient table above must NOT be interpreted.")
        return
    try:
        mod = smf.logit(formula, data=df)
        fl = FirthLogisticRegression(fit_intercept=False)
        fl.fit(mod.exog, mod.endog)
        print("    Firth penalized-likelihood fit (PRIMARY numbers under separation):")
        print(f"    {'term':44s}{'coef':>10s}{'[2.5%':>10s}{'97.5%]':>10s}{'p':>10s}")
        for i, name in enumerate(mod.exog_names):
            lo, hi = fl.ci_[i]
            print(f"    {name[:44]:44s}{fl.coef_[i]:10.3f}{lo:10.3f}{hi:10.3f}"
                  f"{fl.pvals_[i]:10.4f}")
    except Exception as e:
        print(f"    Firth refit failed: {type(e).__name__}: {e}")
        print("    Per A10 step 3 the regression is REPORTED AS NOT ESTIMABLE.")


def print_cell_scan(df):
    """A10 step 1, printed as a NOTE. Purely descriptive — decides nothing."""
    sep_cells = scan_separation(df)
    ncells = df.groupby(["mode", "condition", "agent", "framing"],
                        dropna=False).ngroups
    if sep_cells:
        print(f"  CELL SCAN (A10 step 1, FLAG ONLY): {len(sep_cells)} of {ncells} "
              f"cells are all-0 or all-1:")
        for (mode, cond, agent, framing), s, n in sep_cells[:12]:
            print(f"    {mode_label(mode):42s} {str(cond):>4s} {agent_label(agent):22s} "
                  f"{str(framing):10s} correct={s}/{n}")
        if len(sep_cells) > 12:
            print(f"    ... and {len(sep_cells) - 12} more")
        print("    NOTE: this is a DESCRIPTIVE FLAG, not a verdict. Uniform cells are")
        print("    EXPECTED here by design — P1 predicts naive discrimination at chance")
        print("    and P6 predicts 85-98% tool-instructed accuracy, so with 5 trials per")
        print("    cell a uniform cell arises with probability 0.06 to 0.90 on its own.")
        print("    Estimability is judged on the FITTED MODEL below, never on this scan.")
    else:
        print(f"  CELL SCAN (A10 step 1, FLAG ONLY): no all-0/all-1 cells "
              f"({ncells} cells).")
    return sep_cells


def fit_and_report(df, formula, label, smf, primary):
    print(f"\n  --- {label} ---")
    print(f"  formula: correct ~ {formula.split('~', 1)[1].strip()}")
    if df.empty:
        print("  no rows for this model.")
        return
    for col in ("mode", "condition", "agent", "framing"):
        if col in df and df[col].nunique() < 2:
            print(f"  note: {col} has a single level ({df[col].iloc[0]!r}); its term "
                  f"drops out.")

    # The scan runs FIRST and unconditionally — including in the constant-outcome
    # case. The previous version returned early on a constant outcome, BEFORE the
    # scan and BEFORE firth_refit, so the one situation A10 step 2 most obviously
    # covers (complete separation) was the one situation in which the
    # pre-committed Firth fallback was never attempted.
    sep_cells = print_cell_scan(df)

    if df["correct"].nunique() < 2:
        const = int(df["correct"].iloc[0])
        print(f"\n  " + "!" * 70)
        print(f"  !! MODEL NOT ESTIMABLE BY MAXIMUM LIKELIHOOD (A10): the outcome is")
        print(f"  !! CONSTANT ({const}) over all {len(df)} rows — complete separation.")
        print("  !! This is a genuine pathology of the fit, not a marginal cell: there")
        print("  !! is no variation in `correct` for any term to explain.")
        print("  " + "!" * 70)
        if primary:
            print("  A10 step 2 applies here MOST of all. Attempting the pre-committed")
            print("  Firth penalized-likelihood refit:")
            firth_refit(df, formula, smf)
        else:
            print("  This SECONDARY model is reported as NOT ESTIMABLE. No number from")
            print("  it may be quoted.")
        return

    caught, res, err = [], None, None
    with warnings.catch_warnings(record=True) as w:
        warnings.simplefilter("always")
        try:
            res = smf.logit(formula, data=df).fit(disp=0)
        except Exception as e:  # PerfectSeparationError, singular matrix, ...
            err = e
        caught = list(w)
    warn_names = [type(x.message).__name__ for x in caught]
    sep_warn = [n for n in warn_names if "Separation" in n or "Singular" in n]

    if err is not None:
        print(f"  FIT RAISED: {type(err).__name__}: {err}")
        if primary:
            print("\n  " + "!" * 70)
            print("  !! MODEL NOT ESTIMABLE (A10) — the fit itself failed.")
            print("  " + "!" * 70)
            firth_refit(df, formula, smf)
        else:
            print("  This SECONDARY model is reported as NOT ESTIMABLE. No number from")
            print("  it may be quoted.")
        return

    big = coef_flags(res)
    converged = getattr(res, "mle_retvals", {}).get("converged", True)
    if caught:
        print("  warnings captured during fit: " + ", ".join(sorted(set(warn_names))))
    print(res.summary2().tables[1].to_string())

    max_coef, max_se = fit_diagnostics(res)
    print(f"\n  FIT DIAGNOSTICS: max|coef| = {max_coef:.3f} (threshold {COEF_ABS_MAX:g}), "
          f"max SE = {max_se:.3f} (threshold {SE_MAX:g}), converged = {converged}.")

    # THE VERDICT. Note what is NOT in this expression: `sep_cells`. A cell scan
    # is a property of the data and may never declare a fitted model
    # uninterpretable. See the block comment above scan_separation().
    not_estimable = bool(big or sep_warn or not converged)
    if not_estimable:
        print("\n  " + "!" * 70)
        print("  !! SEPARATION DETECTED IN THE FITTED MODEL — THE TABLE ABOVE IS NOT")
        print("  !! INTERPRETABLE (A10).")
        if sep_warn:
            print(f"  !! statsmodels warned: {', '.join(sorted(set(sep_warn)))}")
        if not converged:
            print("  !! the optimiser reported NON-CONVERGENCE.")
        for name, coef, se in big[:12]:
            print(f"  !!   {name[:50]:50s} coef={coef:>12.3f} se={se:>12.3f}")
        if len(big) > 12:
            print(f"  !!   ... and {len(big) - 12} more implausible term(s)")
        print("  !! .fit(disp=0) RETURNS a result object under quasi-complete")
        print("  !! separation rather than raising, which is why a bare `except`")
        print("  !! never fires. Coefficients are inflated toward +/-inf, standard")
        print("  !! errors are enormous, p-values near 1.")
        print("  " + "!" * 70)
        if primary:
            firth_refit(df, formula, smf)
        else:
            print("    (secondary model — no Firth refit; primary is refit above.)")
    elif sep_cells:
        print("\n  FIT IS HEALTHY AND THE TABLE ABOVE IS INTERPRETABLE.")
        print(f"  {len(sep_cells)} cell(s) are flagged all-0/all-1 above, but every")
        print("  fitted coefficient and standard error is within the plausible range,")
        print("  the optimiser converged, and statsmodels issued no separation warning.")
        print("  Per A10 the flag is recorded and the model is REPORTED. A marginal")
        print("  uniform cell does not make a converged, well-conditioned fit")
        print("  uninterpretable — and at this design's predicted rates such cells are")
        print("  expected in essentially every dataset, so treating them as a verdict")
        print("  would make the primary estimand permanently unreportable.")
    else:
        print("\n  FIT IS HEALTHY: no all-0/all-1 cell, no |coef| or SE past threshold,")
        print("  no separation warning, optimiser converged. The table above stands.")


def report_models(usable):
    rule("Primary model — A4: 3-level C(mode) x C(condition) interaction")
    if not usable:
        print("  no usable trials; no model fitted.")
        return
    try:
        import pandas as pd
        import statsmodels.formula.api as smf
    except ImportError:
        print("  statsmodels/pandas not installed — descriptive tables above only.")
        print("  (Per A10 step 3 those tables are then the primary report.)")
        return

    df = build_frame(usable, pd)

    # A23: an exploratory fourth capability arm is excluded from the
    # pre-registered primary and never pooled with the three locked modes.
    # Malformed rows are counted SEPARATELY from it — a row with no readable
    # mode is not the two-turn arm.
    n_malformed = int(df["mode"].isna().sum())
    if n_malformed:
        print(f"  {n_malformed} MALFORMED row(s) (no readable `mode`) are excluded from")
        print("  every model. They are malformed data, not an exploratory arm (A23).")
    extra_modes = sorted(set(df["mode"].dropna()) - set(LOCKED_MODES))
    if extra_modes:
        print(f"  EXPLORATORY CAPABILITY ARM(S) PRESENT: {extra_modes}. Per A23 these are")
        print("  NOT part of the pre-registered 3x3 design and are EXCLUDED from the")
        print("  primary model. They appear only in tables where they are visibly")
        print("  labelled.")
    locked = df[df["mode"].isin(LOCKED_MODES)]

    # A15: Kimi is exploratory and is not pooled into the pre-registered grid.
    kimi_n = int(locked["agent"].isin(EXPLORATORY_AGENTS).sum())
    primary_df = locked[locked["agent"].isin(PREREG_AGENTS)]
    if kimi_n:
        print(f"  {kimi_n} row(s) from exploratory agent(s) {list(EXPLORATORY_AGENTS)} are")
        print("  EXCLUDED from the primary fit (A15). An exploratory refit including them")
        print("  is reported separately and labelled.")

    formula = "correct ~ C(mode) * C(condition) + C(agent) + C(framing)"
    fit_and_report(primary_df, formula,
                   "PRIMARY (pre-registered agents, three locked modes)",
                   smf, primary=True)
    print("\n  Report the C(mode)[T.*]:C(condition)[T.*] interaction terms with CI.")
    print("  A3: this is a FIXED-effects logit, NOT the pre-registered mixed-effects")
    print("  model. It must be described as such in any write-up. The lme4 fit has not")
    print("  been run here; if it is ever run, A3 requires it be reported whatever the")
    print("  result, including non-convergence.")
    print("  A5: framing is a FIXED effect with `compliance` as reference, pre-committed.")

    # A4 permits the pooled binary contrast as a SECONDARY report only.
    fit_and_report(primary_df, "correct ~ equipped * C(condition) + C(agent) + C(framing)",
                   "SECONDARY (pooled binary `equipped` — A4: NOT the primary estimand)",
                   smf, primary=False)

    if kimi_n:
        fit_and_report(locked, formula,
                       "EXPLORATORY (adds Kimi — A15: carries no pre-registered claim)",
                       smf, primary=False)

    # Pre-committed secondary: payload size as a covariate. The primary above is
    # left EXACTLY as locked — no covariate is added to it.
    rule("SECONDARY — served-payload size as a covariate (A16/A17 confound)")
    print("  The PRIMARY model above is unchanged; this is an additional, clearly")
    print("  labelled SECONDARY model. Source: servedPassportBytes[condition]")
    print("  (types.ts:74), falling back to a top-level rawBytes if present.")
    have = primary_df["payload_bytes"].notna() if not primary_df.empty else None
    if primary_df.empty or not have.any():
        print("\n  PAYLOAD SIZE UNAVAILABLE: no row carries servedPassportBytes for its")
        print("  own condition, and no rawBytes fallback is present. The secondary")
        print("  payload model is NOT FITTED and is reported as such. The A-vs-B")
        print("  confound named in A16/A17 therefore cannot be assessed from this data.")
        return
    n_missing = int((~have).sum())
    if n_missing:
        print(f"\n  {n_missing} of {len(primary_df)} rows lack a payload size and are")
        print("  dropped from THIS model only (they remain in the primary).")
    sub = primary_df[have]
    sizes = sub.groupby("condition", dropna=False)["payload_bytes"].agg(["min", "max", "size"])
    print("\n  Served bytes by condition (in the rows used here):")
    print("    " + sizes.to_string().replace("\n", "\n    "))
    if sub["payload_kb"].nunique() < 2:
        print("\n  Payload size is CONSTANT across the usable rows; it carries no")
        print("  information and the secondary model is not fitted.")
        return
    # Payload size is a property of the served fixture, so in a single clean run
    # it is a DETERMINISTIC FUNCTION OF CONDITION and therefore perfectly
    # collinear with C(condition): the covariate is not separately identifiable
    # and statsmodels would return an arbitrary split of one effect across two
    # terms. Detect and say so rather than printing that split.
    within = sub.groupby("condition", dropna=False)["payload_kb"].nunique()
    if (within <= 1).all():
        print("\n  NOT IDENTIFIABLE: payload size takes exactly one value within each")
        print("  condition, so payload_kb is a deterministic function of condition and")
        print("  perfectly collinear with C(condition). The covariate cannot be")
        print("  separated from the condition effect and the model is NOT fitted.")
        print("  This is the expected state for a single clean run: it means the")
        print("  A16/A17 payload confound is NOT statistically separable from the")
        print("  independent variable, and can only be addressed by matched fixtures")
        print("  (preflight part 5), not by covariate adjustment. Report it that way.")
        return
    print("\n  Payload size varies WITHIN at least one condition (e.g. logs pooled")
    print("  across fixture revisions), so the covariate is identifiable here.")
    fit_and_report(sub, formula + " + payload_kb",
                   "SECONDARY (payload size covariate)", smf, primary=False)


# ---------------------------------------------------------------------------
def run_all_sections(rows, heading):
    """Every pre-registered table plus the models, over ONE provenance stratum.

    Called once for the CLEAN stratum and, if any exist, separately for the
    QUARANTINED stratum. Nothing crosses between the two calls: that separation
    IS the A11 pre-commitment ("may not be pooled with clean runs"), and it is
    what a banner could never provide.
    """
    rule(heading)
    usable = [t for t in rows if exclusion_reason(t) is None]
    print(f"  {len(rows)} row(s) in this stratum, {len(usable)} usable, "
          f"{len(rows) - len(usable)} excluded.")
    report_coverage(rows)
    if not usable:
        print("\n  No USABLE rows in this stratum: every row was excluded (see the")
        print("  coverage table above). Per A9/A2 that is itself the result — an")
        print("  all-excluded arm is reported as missing data and a structural fact,")
        print("  never as 0% accuracy.")
        return
    report_out_of_enum(usable)
    report_accuracy(usable, rows)
    report_status_by_condition(usable)
    report_uniformity(usable)
    report_confident_mislabel(usable)
    report_decision_distribution(usable)
    report_fraud_and_b(usable)
    report_propensity(usable, rows)
    report_models(usable)


def main():
    paths = sys.argv[1:]
    if not paths:
        print(__doc__)
        print("ERROR: no input files given.")
        return 2

    print("Agent DPP Verification Study — analysis")
    print(f"inputs: {', '.join(paths)}")
    rows, usable, malformed = load(paths)
    print(f"\n{len(rows)} row(s) read, {len(usable)} usable, "
          f"{len(rows) - len(usable)} excluded, {malformed} malformed line(s) skipped.")

    if not rows:
        print("\nNo rows to analyse. This is not a failure — it is an empty input.")
        print("Nothing below can be computed; no table is printed rather than printing")
        print("empty tables that could be mistaken for null results.")
        return 0

    report_provenance(rows)

    # THE PARTITION (A11 / A16 / A17). Everything downstream runs per stratum.
    clean = [t for t in rows if not quarantine_reasons(t)]
    quarantined = [t for t in rows if quarantine_reasons(t)]

    if clean:
        run_all_sections(
            clean,
            f"CLEAN STRATUM — {len(clean)} row(s). These are the pre-registered numbers.",
        )
    else:
        rule("CLEAN STRATUM — 0 rows")
        print("  EVERY row in this data is quarantined (bypassed preflight and/or failed")
        print("  matchedness). Per A11 and A16/A17 there are NO pre-registered numbers to")
        print("  report from this input. The quarantined tables below are descriptive")
        print("  only and may not be quoted as a result of the study.")

    if quarantined:
        by_reason = Counter()
        for t in quarantined:
            by_reason[quarantine_reasons(t)] += 1
        run_all_sections(
            quarantined,
            "QUARANTINED STRATUM — NOT A CLEAN RUN, NOT POOLED, NOT A RESULT "
            f"({len(quarantined)} row(s))",
        )
        rule("Quarantine ledger")
        for reasons, k in sorted(by_reason.items(), key=lambda x: str(x[0])):
            print(f"  {', '.join(reasons):40s} {k} row(s)")
        print("""
  A11: "any trial data produced under `SKIP_PREFLIGHT=1` is not a clean run, may
  not be pooled with clean runs, and any analysis touching it must state the
  bypass and the specific ground-truth mismatches that were overridden."
  A16/A17: no trial may be run against an unmatched fixture set; in an unmatched
  row the A-vs-B contrast is confounded with payload size and content.

  Every figure in the QUARANTINED stratum above is therefore DESCRIPTIVE ONLY.
  None of it evaluates P1-P11. None of it may be combined with, averaged into,
  or compared against the CLEAN stratum. The two strata are reported side by
  side precisely so that no reader can do either by accident.""")
    else:
        print("\n  (No quarantined rows: no bypassed preflight, no failed matchedness.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
