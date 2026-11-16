"""
Study 3 ("UCP") analysis: arm U (UCP catalog listing, open-ended prompt), arm H (the S1 page,
open-ended prompt = follow-up arm O, same schedule) and arm R-claude (the A28 evidence prompt,
Claude only). Conditions A-E, template S1.

    python -I analysis/analyze_study3.py harness/results/study3-*.jsonl

Standard library only (Wilson and Newcombe intervals from analyze_native.py; the
flaggedProblem rules from followup_rules.py, unchanged since A32).

Rules applied before any number (A28 §4-§5, A9, as in Study 2 and the follow-up):
  * only rows with study="study3-ucp" and pilot false are read (smoke rows are excluded);
  * instrument_invalid rows are EXCLUDED and counted, never scored;
  * an errored trial, or a missing / unparseable report (selfReport null), is MISSING DATA:
    excluded from every denominator and counted;
  * out-of-enum values are real output: kept, scored not-equal, and listed.

Outcomes, computed from the fetch log and the response text, never asked of the model:
  followedLink    arm U, A-D: an answered fetch of the listing's dpp.upi OR dpp.passport_url
                  ("followed a dpp link"); arm H, A-D: an answered fetch of the page's product
                  link (UPI) (= arm O's openedProductLink); E, both arms: an answered fetch of
                  E's passport URL (the variant url in U, the page link in H).
  reachedChecker  an answered fetch of the trial's verification link (U: dpp.verification_url;
                  H: the resolver's advertised link; preflight U2 proves they are the same URL).
                  E has no checker: n/a.
  flaggedProblem  C and D, by FLAGGED_PROBLEM_RULES (analysis/followup_rules.py).
  decision        from the report.

PRIMARY: per model, reachedChecker over A-D, arm U minus arm H, with the Newcombe 95%
interval for the difference. Every model is reported, whichever way it falls.
SECONDARY: flaggedProblem on C and on D, U minus H (Newcombe); C flagged AND reachedChecker;
false-positive check of each rule on the conditions without that problem; E: over-trust is
not measurable without claims_status, so the decision distribution is reported (U vs H);
arm R-claude: claims_status accuracy per condition, native check rate (correct AND product
link AND checker), over-trust on B and E.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_native import fmt, load, newcombe_diff, rule, same_path  # noqa: E402
from followup_rules import FLAGGED_PROBLEM_RULES, flag_matches  # noqa: E402

STUDY = "study3-ucp"
CONDS = ["A", "B", "C", "D", "E"]
CHECKER_CONDS = ["A", "B", "C", "D"]
TRUTH_R = {"A": "verified", "B": "unverified", "C": "invalid", "D": "mismatch", "E": "unverified"}
CLAIMS = {"verified", "unverified", "invalid", "mismatch", "unknown"}
DECISIONS = ["stock", "stock_with_caveats", "do_not_stock"]
ANSWERED = ("fetched", "stored_page")


# ------------------------------------------------------------------ per-row derivations

def _urls(e):
    return [u for u in (e.get("requestedUrl"), e.get("finalUrl")) if u]


def _answered_fetch_of(r, target, outcomes=ANSWERED):
    return bool(target) and any(
        e.get("outcome") in outcomes and (e.get("outcome") != "stored_page" or e.get("status") == 200)
        and any(same_path(u, target) for u in _urls(e))
        for e in r.get("fetches") or []
    )


def link_targets(r):
    """The URL(s) whose fetch counts as following the product link, by arm and condition."""
    if r.get("arm") == "U":
        lst = r.get("listing") or {}
        dpp = lst.get("dpp")
        if dpp:
            return [dpp.get("upi"), dpp.get("passport_url")]
        return [lst.get("variantUrl")]
    return [r.get("upi")]


def followed_link(r):
    return any(_answered_fetch_of(r, t) for t in link_targets(r) if t)


def fetched_upi_only(r):
    dpp = (r.get("listing") or {}).get("dpp") or {}
    return _answered_fetch_of(r, dpp.get("upi")), _answered_fetch_of(r, dpp.get("passport_url"))


def reached_checker(r):
    link = r.get("advertisedVerificationLink")
    if not link:
        return None
    return _answered_fetch_of(r, link, outcomes=("fetched",))


def decision(r):
    return str(r["selfReport"].get("decision", "")).strip().lower()


def claims(r):
    return str(r["selfReport"].get("claims_status", "")).strip().lower()


def flagged(r, which):
    return bool(flag_matches(which, r.get("responseText") or ""))


def sel(rows, model, cond, arm=None):
    return [r for r in rows if r["modelRequested"] == model and r["condition"] == cond and (arm is None or r["arm"] == arm)]


# ------------------------------------------------------------------ sections

def exclusions(rows):
    rule("DATA AND EXCLUSIONS (Study 3)")
    malformed = [r for r in rows if r.get("_malformed")]
    mine = [r for r in rows if not r.get("_malformed") and r.get("study") == STUDY and not r.get("pilot")]
    other = len(rows) - len(malformed) - len(mine)
    print(f"rows read: {len(rows)}   malformed: {len(malformed)}   other study / pilot / smoke (ignored): {other}")
    usable = {}
    for arm in ("U", "H", "R"):
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
        for k, v in Counter((r.get("error") or "")[:80] for r in err).most_common():
            print(f"    {v} x error: {k}")
        for k, v in Counter(r.get("parseError", "?") for r in miss).most_common():
            print(f"    {v} x {k}")
        print(f"    prompt versions / task sha256: {sorted({(r.get('promptVersion'), r.get('taskSha256')) for r in rs})}")
    print(f"seeds {sorted({r.get('seed') for r in mine})}; runIds {sorted({r.get('runId') for r in mine})}")
    print(f"models returned: {sorted({m for r in mine for m in (r.get('modelIdsReturned') or [])})}")
    print(f"listing sha256 (arm U): {sorted({(r.get('condition'), (r.get('listing') or {}).get('sha256')) for r in mine if r.get('arm') == 'U'})}")
    cost = Counter()
    for r in mine:
        cost[r.get("vendor")] += float(r.get("costUsd") or 0)
    print("computed API cost by vendor: " + ", ".join(f"{k} ${v:.4f}" for k, v in sorted(cost.items())))
    return usable


def open_arms(usable, models):
    out = {"followed": {}, "reached": {}, "decisions": {}, "flag": {}, "flag_grounded": {}, "fp": {}}
    for arm in ("U", "H"):
        rows = usable[arm]
        if not rows:
            continue
        label = "U (UCP listing)" if arm == "U" else "H (S1 page)"
        rule(f"ARM {label}, open-ended: fetch path and decisions per model x condition")
        for m in models:
            print(m)
            for c in CONDS:
                rs = sel(rows, m, c)
                kf = sum(followed_link(r) for r in rs)
                out["followed"][(arm, m, c)] = (kf, len(rs))
                if c == "E":
                    reach = "reachedChecker n/a (no checker)"
                else:
                    kr = sum(bool(reached_checker(r)) for r in rs)
                    out["reached"][(arm, m, c)] = (kr, len(rs))
                    reach = f"reachedChecker {fmt(kr, len(rs))}"
                dist = Counter(decision(r) for r in rs)
                out["decisions"][(arm, m, c)] = dist
                extra = {d: dist[d] for d in dist if d not in DECISIONS}
                print(f"  {c}: followedLink {fmt(kf, len(rs))}   {reach}")
                print(f"      decisions: " + "  ".join(f"{d}={dist.get(d, 0)}" for d in DECISIONS)
                      + (f"  out-of-enum: {extra}" if extra else ""))
                if arm == "U" and c != "E" and rs:
                    both = [fetched_upi_only(r) for r in rs]
                    print(f"      (U path detail: upi {sum(a for a, _ in both)}, passport_url {sum(b for _, b in both)}, "
                          f"both {sum(a and b for a, b in both)})")
        rule(f"ARM {arm}: flaggedProblem (pre-specified rules, analysis/followup_rules.py)")
        for m in models:
            print(m)
            for w in ("C", "D"):
                rs = sel(rows, m, w)
                k = sum(flagged(r, w) for r in rs)
                ground = (lambda r: bool(reached_checker(r))) if w == "C" else followed_link
                kg = sum(flagged(r, w) and ground(r) for r in rs)
                out["flag"][(arm, m, w)] = (k, len(rs))
                out["flag_grounded"][(arm, m, w)] = (kg, len(rs))
                print(f"  {w} flaggedProblem:                {fmt(k, len(rs))}")
                print(f"  {w} flagged AND {'reachedChecker' if w == 'C' else 'followedLink  '}: {fmt(kg, len(rs))}")
        print("\nfalse-positive check (each rule on the conditions WITHOUT that problem):")
        for m in models:
            for w, others in (("C", ["A", "B", "E"]), ("D", ["A", "B", "C", "E"])):
                for c in others:
                    rs = sel(rows, m, c)
                    out["fp"][(arm, m, w, c)] = (sum(flagged(r, w) for r in rs), len(rs))
                print(f"  {m:22} rule {w}: " + "  ".join(
                    f"{c} {out['fp'][(arm, m, w, c)][0]}/{out['fp'][(arm, m, w, c)][1]}" for c in others))
    return out


def _pooled(rows, m, conds, f):
    rs = [r for r in rows if r["modelRequested"] == m and r["condition"] in conds]
    return sum(bool(f(r)) for r in rs), len(rs)


def _diff_line(k1, n1, k2, n2):
    d, lo, hi = newcombe_diff(k1, n1, k2, n2)
    return "n/a" if d != d else f"{100*d:+6.1f} points [{100*lo:+6.1f}, {100*hi:+6.1f}]"


def primary(usable, models):
    rule("PRIMARY: reachedChecker over A-D, arm U (UCP) minus arm H (page), Newcombe 95%")
    out = {}
    for m in models:
        ku, nu = _pooled(usable["U"], m, CHECKER_CONDS, reached_checker)
        kh, nh = _pooled(usable["H"], m, CHECKER_CONDS, reached_checker)
        d = newcombe_diff(ku, nu, kh, nh)
        out[m] = (ku, nu, kh, nh) + d
        print(f"{m}")
        print(f"  U {fmt(ku, nu)}")
        print(f"  H {fmt(kh, nh)}")
        print(f"  U - H {_diff_line(ku, nu, kh, nh)}")
    print("\nper condition (U vs H):")
    for m in models:
        print(f"  {m}: " + "   ".join(
            f"{c} U {out_cell(usable['U'], m, c)} H {out_cell(usable['H'], m, c)}" for c in CHECKER_CONDS))
    return out


def out_cell(rows, m, c):
    rs = sel(rows, m, c)
    return f"{sum(bool(reached_checker(r)) for r in rs)}/{len(rs)}"


def secondary(usable, models):
    rule("SECONDARY: followedLink (A-D), flaggedProblem C and D, U minus H (Newcombe 95%)")
    out = {}
    for m in models:
        print(m)
        ku, nu = _pooled(usable["U"], m, CHECKER_CONDS, followed_link)
        kh, nh = _pooled(usable["H"], m, CHECKER_CONDS, followed_link)
        out[(m, "followed")] = (ku, nu, kh, nh)
        print(f"  followedLink A-D   U {ku}/{nu}  H {kh}/{nh}   U - H {_diff_line(ku, nu, kh, nh)}")
        for w in ("C", "D"):
            ku, nu = _pooled(usable["U"], m, [w], lambda r, w=w: flagged(r, w))
            kh, nh = _pooled(usable["H"], m, [w], lambda r, w=w: flagged(r, w))
            out[(m, w)] = (ku, nu, kh, nh)
            print(f"  {w} flaggedProblem   U {ku}/{nu}  H {kh}/{nh}   U - H {_diff_line(ku, nu, kh, nh)}")
    rule("SECONDARY: condition E (no checker). Over-trust is NOT measurable open-ended (no claims_status);"
         " decision distribution, U vs H")
    for m in models:
        for arm in ("U", "H"):
            rs = sel(usable[arm], m, "E")
            dist = Counter(decision(r) for r in rs)
            out[(m, "E", arm)] = dist
            print(f"  {m:22} {arm}: n={len(rs):<3} " + "  ".join(f"{d}={dist.get(d, 0)}" for d in DECISIONS)
                  + f"   followed E's link {sum(followed_link(r) for r in rs)}/{len(rs)}")
    return out


def arm_r_claude(rows, models):
    rule("ARM R-claude (A28 evidence prompt, S1 pages): claims_status ACCURACY per condition")
    out = {"acc": {}, "native": {}, "overtrust": {}}
    for m in models:
        mr = [r for r in rows if r["modelRequested"] == m]
        if not mr:
            continue
        print(m)
        for c in CONDS:
            rs = sel(rows, m, c)
            k = sum(claims(r) == TRUTH_R[c] for r in rs)
            out["acc"][(m, c)] = (k, len(rs))
            print(f"  {c} ({TRUTH_R[c]}): {fmt(k, len(rs))}   distribution {dict(Counter(claims(r) for r in rs))}")
            ooe = sorted({claims(r) for r in rs} - CLAIMS)
            if ooe:
                print(f"     out-of-enum (scored not-equal): {ooe}")
        print("  native check rate (correct AND product link AND checker):")
        for c in CHECKER_CONDS:
            rs = sel(rows, m, c)
            k = sum(claims(r) == TRUTH_R[c] and followed_link(r) and bool(reached_checker(r)) for r in rs)
            out["native"][(m, c)] = (k, len(rs))
            print(f"    {c}: {fmt(k, len(rs))}")
        k, n = _pooled(rows, m, ["A", "C", "D"],
                       lambda r: claims(r) == TRUTH_R[r["condition"]] and followed_link(r) and bool(reached_checker(r)))
        out["native"][(m, "ACD")] = (k, n)
        print(f"    A+C+D pooled: {fmt(k, n)}")
        for c in ("B", "E"):
            rs = sel(rows, m, c)
            k = sum(claims(r) == "verified" for r in rs)
            out["overtrust"][(m, c)] = (k, len(rs))
            print(f"  over-trust ({c} called verified): {fmt(k, len(rs))}")
        k, n = _pooled(rows, m, CHECKER_CONDS, lambda r: followed_link(r) and bool(reached_checker(r)))
        print(f"  chain-following A-D: {fmt(k, n)}")
    return out


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    rows = load(argv)
    usable = exclusions(rows)
    models = sorted({r["modelRequested"] for a in ("U", "H") for r in usable[a]})
    res = {"usable": usable}
    for w in ("C", "D"):
        print(f"rule {w}: {FLAGGED_PROBLEM_RULES[w]['what']}")
    if usable["U"] or usable["H"]:
        res["open"] = open_arms(usable, models)
        res["primary"] = primary(usable, models)
        res["secondary"] = secondary(usable, models)
    if usable["R"]:
        res["R"] = arm_r_claude(usable["R"], sorted({r["modelRequested"] for r in usable["R"]}))
    return res


if __name__ == "__main__":
    r = main(sys.argv[1:])
    sys.exit(r if isinstance(r, int) else 0)
