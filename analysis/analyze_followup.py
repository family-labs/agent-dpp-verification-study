"""
Study 2 FOLLOW-UP analysis: arm R (the A28 evidence prompt, re-run) and arm O (the
open-ended prompt), conditions A-E, template S1 by default.

    python -I analysis/analyze_followup.py harness/results/followup-*.jsonl
        [--study2 results-archive/native-2026-10-14T00-39-03-229Z.jsonl]

Standard library only (Wilson and Newcombe intervals are imported from analyze_native.py,
which loads nothing beyond the standard library at import time).

Rules applied before any number (same discipline as A28 §4-§5 and A9):
  * only rows with study="study2-followup" are read from the follow-up files;
  * instrument_invalid rows are EXCLUDED and counted, never scored;
  * an errored trial, or a missing / unparseable report (selfReport null), is MISSING DATA:
    excluded from every denominator and counted;
  * out-of-enum values are real output: kept, scored not-equal, and listed.

Derived from the fetch log (never from the model's own account):
  openedProductLink  a fetch of the row's product link (upi) that was answered (outcome
                     "fetched", or "stored_page" for E's stored document);
  reachedChecker     an answered fetch of the row's advertised verification link. E has no
                     checker: reported as n/a.
Derived from the response text (arm O only), by analysis/followup_rules.py:
  flaggedProblem     C: the C rule; D: the D rule. Also reported jointly with the fetch log
                     (C flagged AND reachedChecker; D flagged AND openedProductLink), and run
                     on the conditions without that problem as a false-positive check.

Outputs: exclusions; arm R accuracy per model x condition, native check rate (A-D;
correct AND product link AND checker), E accuracy and over-trust; arm O opened / reached /
decisions / flaggedProblem; Study 2 vs arm R accuracy (A-D) with Newcombe 95% intervals for
the difference (R minus Study 2), matched on template S1 (Study 2's S1 rows) and, second,
against all Study 2 rows.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_native import fmt, load, newcombe_diff, rule, same_path  # noqa: E402
from followup_rules import FLAGGED_PROBLEM_RULES, flag_matches  # noqa: E402

STUDY = "study2-followup"
STUDY2 = "A28-native-interoperability"
CONDS = ["A", "B", "C", "D", "E"]
TRUTH_R = {"A": "verified", "B": "unverified", "C": "invalid", "D": "mismatch", "E": "unverified"}
CLAIMS = {"verified", "unverified", "invalid", "mismatch", "unknown"}
DECISIONS = ["stock", "stock_with_caveats", "do_not_stock"]
DEFAULT_STUDY2 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results-archive",
                              "native-2026-10-14T00-39-03-229Z.jsonl")
ANSWERED = ("fetched", "stored_page")


# ------------------------------------------------------------------ per-row derivations

def _urls(e):
    return [u for u in (e.get("requestedUrl"), e.get("finalUrl")) if u]


def opened_product_link(r):
    upi = r.get("upi")
    return bool(upi) and any(
        e.get("outcome") in ANSWERED and any(same_path(u, upi) for u in _urls(e)) for e in r.get("fetches") or []
    )


def reached_checker(r):
    """None when the condition has no checker (E: no advertised verification link)."""
    link = r.get("advertisedVerificationLink")
    if not link:
        return None
    return any(e.get("outcome") == "fetched" and any(same_path(u, link) for u in _urls(e)) for e in r.get("fetches") or [])


def claims(r):
    return str(r["selfReport"].get("claims_status", "")).strip().lower()


def decision(r):
    return str(r["selfReport"].get("decision", "")).strip().lower()


def correct_r(r):
    return claims(r) == TRUTH_R[r["condition"]]


def flagged(r, which):
    return bool(flag_matches(which, r.get("responseText") or ""))


# ------------------------------------------------------------------ sections

def exclusions(rows):
    rule("DATA AND EXCLUSIONS (follow-up)")
    malformed = [r for r in rows if r.get("_malformed")]
    mine = [r for r in rows if not r.get("_malformed") and r.get("study") == STUDY]
    other = len(rows) - len(malformed) - len(mine)
    print(f"rows read: {len(rows)}   malformed: {len(malformed)}   other study (ignored): {other}")
    usable = {}
    for arm in ("R", "O"):
        rs = [r for r in mine if r.get("arm") == arm]
        inv = [r for r in rs if r.get("instrumentInvalid")]
        rest = [r for r in rs if not r.get("instrumentInvalid")]
        err = [r for r in rest if r.get("error")]
        miss = [r for r in rest if not r.get("error") and r.get("selfReport") is None]
        ok = [r for r in rest if not r.get("error") and r.get("selfReport") is not None]
        usable[arm] = ok
        print(f"arm {arm}: rows {len(rs)}; instrument_invalid EXCLUDED {len(inv)}; errored {len(err)}; "
              f"no/unparseable report {len(miss)}; USABLE {len(ok)}")
        for r in inv:
            print(f"    invalid: {r.get('modelRequested')} {r.get('condition')}: {'; '.join(r.get('instrumentInvalidReasons', []))}")
        for k, v in Counter(r.get("parseError", "?") for r in miss).most_common():
            print(f"    {v} x {k}")
        ph = sorted({(r.get('promptVersion'), r.get('taskSha256')) for r in rs})
        print(f"    prompt versions / task sha256: {ph}")
    seeds = sorted({r.get("seed") for r in mine})
    print(f"seeds {seeds}; runIds {sorted({r.get('runId') for r in mine})}")
    print(f"templates {sorted({r.get('template') for r in mine})}")
    print(f"computed API cost: ${sum(float(r.get('costUsd') or 0) for r in mine):.4f}")
    return usable


def arm_r(usable, models):
    rule("ARM R (evidence prompt, A28 wording unchanged): claims_status ACCURACY per model x condition")
    out = {"acc": {}, "native": {}, "overtrust": {}}
    for m in models:
        print(m)
        for c in CONDS:
            rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
            k = sum(correct_r(r) for r in rs)
            out["acc"][(m, c)] = (k, len(rs))
            print(f"  {c} ({TRUTH_R[c]}): {fmt(k, len(rs))}")
    rule("ARM R: NATIVE CHECK RATE (correct AND product link AND checker fetched), A-D; E has no checker")
    for m in models:
        print(m)
        for c in ["A", "B", "C", "D"]:
            rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
            k = sum(correct_r(r) and opened_product_link(r) and bool(reached_checker(r)) for r in rs)
            out["native"][(m, c)] = (k, len(rs))
            print(f"  {c}: {fmt(k, len(rs))}")
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] in ("A", "C", "D")]
        k = sum(correct_r(r) and opened_product_link(r) and bool(reached_checker(r)) for r in rs)
        print(f"  A+C+D pooled: {fmt(k, len(rs))}")
        print(f"  E: n/a (no checker)")
    rule("ARM R: OVER-TRUST (claims_status = verified) on B (hosted, checker says unverified) and E (no checker)")
    for m in models:
        for c in ["B", "E"]:
            rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
            k = sum(claims(r) == "verified" for r in rs)
            out["overtrust"][(m, c)] = (k, len(rs))
            print(f"  {m:20} {c}: {fmt(k, len(rs))}")
    print("\nE claims_status distribution and fetch path:")
    for m in models:
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == "E"]
        dist = Counter(claims(r) for r in rs)
        opened = sum(opened_product_link(r) for r in rs)
        print(f"  {m:20} n={len(rs)}  {dict(dist)}  opened E's link {opened}/{len(rs)}")
        ooe = [s for s in dist if s not in CLAIMS]
        if ooe:
            print(f"    out-of-enum (scored not-equal): {ooe}")
    print("\nchain-following (product link then checker), A-D:")
    for m in models:
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] in ("A", "B", "C", "D")]
        k = sum(opened_product_link(r) and bool(reached_checker(r)) for r in rs)
        print(f"  {m:20} {fmt(k, len(rs))}")
    return out


def arm_o(usable, models):
    rule("ARM O (open-ended prompt): fetch path and decisions per model x condition")
    out = {"opened": {}, "reached": {}, "decisions": {}, "flag": {}, "flag_grounded": {}, "fp": {}}
    for m in models:
        print(m)
        for c in CONDS:
            rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
            ko = sum(opened_product_link(r) for r in rs)
            out["opened"][(m, c)] = (ko, len(rs))
            if c == "E":
                reach = "reachedChecker n/a (no checker)"
            else:
                kr = sum(bool(reached_checker(r)) for r in rs)
                out["reached"][(m, c)] = (kr, len(rs))
                reach = f"reachedChecker {fmt(kr, len(rs))}"
            dist = Counter(decision(r) for r in rs)
            out["decisions"][(m, c)] = dist
            ds = "  ".join(f"{d}={dist.get(d, 0)}" for d in DECISIONS)
            extra = [d for d in dist if d not in DECISIONS]
            print(f"  {c}: openedProductLink {fmt(ko, len(rs))}   {reach}")
            print(f"      decisions: {ds}{'  out-of-enum: ' + str({d: dist[d] for d in extra}) if extra else ''}")
    rule("ARM O: flaggedProblem (pre-specified text rules, analysis/followup_rules.py)")
    for w in ("C", "D"):
        print(f"rule {w}: {FLAGGED_PROBLEM_RULES[w]['what']}")
    for m in models:
        print(m)
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == "C"]
        k = sum(flagged(r, "C") for r in rs)
        kg = sum(flagged(r, "C") and bool(reached_checker(r)) for r in rs)
        out["flag"][(m, "C")] = (k, len(rs))
        out["flag_grounded"][(m, "C")] = (kg, len(rs))
        print(f"  C flaggedProblem:                    {fmt(k, len(rs))}")
        print(f"  C flaggedProblem AND reachedChecker: {fmt(kg, len(rs))}")
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == "D"]
        k = sum(flagged(r, "D") for r in rs)
        kg = sum(flagged(r, "D") and opened_product_link(r) for r in rs)
        out["flag"][(m, "D")] = (k, len(rs))
        out["flag_grounded"][(m, "D")] = (kg, len(rs))
        print(f"  D flaggedProblem:                       {fmt(k, len(rs))}")
        print(f"  D flaggedProblem AND openedProductLink: {fmt(kg, len(rs))}")
    print("\nfalse-positive check (each rule on the conditions WITHOUT that problem):")
    for m in models:
        for w, others in (("C", ["A", "B", "E"]), ("D", ["A", "B", "C", "E"])):
            for c in others:
                rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
                k = sum(flagged(r, w) for r in rs)
                out["fp"][(m, w, c)] = (k, len(rs))
            print(f"  {m:20} rule {w}: " + "  ".join(f"{c} {out['fp'][(m, w, c)][0]}/{out['fp'][(m, w, c)][1]}" for c in others))
    return out


def compare(r_usable, s2_rows, models):
    rule("STUDY 2 vs ARM R: claims_status accuracy, A-D (difference = arm R minus Study 2, Newcombe 95%)")
    s2 = [r for r in s2_rows if r.get("study") == STUDY2 and not r.get("pilot") and not r.get("instrumentInvalid")
          and not r.get("error") and r.get("selfReport") is not None]
    out = {}
    if not s2:
        print("no usable Study 2 rows given (--study2); comparison skipped")
        return out
    tmpl_r = sorted({r.get("template") for r in r_usable})
    for label, pool in ((f"matched template ({'/'.join(tmpl_r) or 'S1'}): Study 2 rows on the same template(s)",
                         [r for r in s2 if r.get("template") in (tmpl_r or ["S1"])]),
                        ("all Study 2 rows (S1 + S2)", s2)):
        print(f"\n{label}")
        for m in models:
            print(m)
            for c in ["A", "B", "C", "D"]:
                a = [r for r in pool if r["modelRequested"] == m and r["condition"] == c]
                b = [r for r in r_usable if r["modelRequested"] == m and r["condition"] == c]
                ka = sum(claims(r) == TRUTH_R[c] for r in a)
                kb = sum(correct_r(r) for r in b)
                d, lo, hi = newcombe_diff(kb, len(b), ka, len(a))
                out[(label.split(":")[0].split(" (")[0], m, c)] = (kb, len(b), ka, len(a), d, lo, hi)
                s2s = f"{ka}/{len(a)}" if a else "n=0"
                rs_ = f"{kb}/{len(b)}" if b else "n=0"
                diff = "n/a" if d != d else f"{100*d:+6.1f} [{100*lo:+6.1f}, {100*hi:+6.1f}]"
                print(f"  {c}: Study 2 {s2s:>7}   arm R {rs_:>7}   R - S2 {diff}")
    return out


def main(argv):
    s2_path = None
    files = []
    i = 0
    while i < len(argv):
        if argv[i] == "--study2":
            s2_path = argv[i + 1]
            i += 2
            continue
        files.append(argv[i])
        i += 1
    if not files:
        print(__doc__)
        return 2
    if s2_path is None and os.path.exists(DEFAULT_STUDY2):
        s2_path = DEFAULT_STUDY2
    rows = load(files)
    usable = exclusions(rows)
    models = sorted({r["modelRequested"] for a in usable.values() for r in a})
    res = {"usable": usable}
    if usable["R"]:
        res["R"] = arm_r(usable["R"], models)
    if usable["O"]:
        res["O"] = arm_o(usable["O"], models)
    if usable["R"] and s2_path:
        print(f"\n(Study 2 comparison file: {s2_path})")
        res["compare"] = compare(usable["R"], load([s2_path]), models)
    return res


if __name__ == "__main__":
    r = main(sys.argv[1:])
    sys.exit(r if isinstance(r, int) else 0)
