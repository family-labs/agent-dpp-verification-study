"""
Study 4 ("a plain shopping question") analysis.

    .venv/Scripts/python.exe -I analysis/analyze_study4.py harness/results/study4-*.jsonl

Standard library for every table (Wilson and Newcombe from analyze_native.py; the flaggedProblem
rules from followup_rules.py, unchanged since A32). The pooled logistic regression needs
pandas + statsmodels (+ firthlogist for the Firth fallback): run from the study venv.

Rules applied before any number:
  * only rows with study="study4-shopping" and pilot false are read (smoke rows are excluded);
  * instrumentInvalid rows (a verifier answer about our product disagreeing with preflight, or a
    failed fetch of our checker) are EXCLUDED and counted, never scored;
  * an errored trial is MISSING DATA: excluded from every denominator and counted;
  * no valid pick (the follow-up reply names none, or more than one, of the four products by id,
    nor exactly one by brand) is MISSING DATA for the selection outcome only, counted per cell;
    the sensitivity table scores it as "not ours" instead.

Outcomes, computed from the logs and the text, never asked of the model:
  recommendedOurs   the follow-up pick is our product (tarnvale-5000)            [PRIMARY]
  platformSearch    the harness ran the one platform search before the model's first turn (every
                    trial must have it; a row without it is listed as an instrument fault)
  modelSearched     the model itself called search_products again (initiator "model")
  openedOurPassport P/T/U: an answered fetch of our dpp.upi or dpp.passport_url
  reachedChecker    P/T/U: an answered (live) fetch of our dpp.verification_url
  oursMentioned     the main answer names "Tarnvale"
  mentionedPassport the main answer says passport / Produktpass / dpp
  flaggedProblemC   rule C of FLAGGED_PROBLEM_RULES on the main answer (T; false-positive check on P, U, N)
  position          our listing's position (1-4) in the trial's randomised order

PRIMARY, per model: recommendedOurs P - N (does a genuine passport raise selection?) and
P - T (is a tampered one dropped?), each with the Newcombe hybrid-score 95% interval.
"""
import os
import sys
import warnings
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_native import fmt, load, newcombe_diff, rule, same_path  # noqa: E402
from followup_rules import flag_matches  # noqa: E402

STUDY = "study4-shopping"
CONDS = ["P", "T", "U", "N"]
DPP_CONDS = ["P", "T", "U"]
OURS = "tarnvale-5000"
PRODUCTS = ["tarnvale-5000", "halvesta-hb5200", "corrandel-ps5000", "wexmoor-w5"]
ANSWERED = ("fetched", "stored_page")
COEF_ABS_MAX = 10.0
SE_MAX = 10.0


# ------------------------------------------------------------------ per-row derivations

def _urls(e):
    return [u for u in (e.get("requestedUrl"), e.get("finalUrl")) if u]


def _answered_fetch_of(r, target, outcomes=ANSWERED):
    return bool(target) and any(
        e.get("outcome") in outcomes and (e.get("outcome") != "stored_page" or e.get("status") == 200)
        and any(same_path(u, target) for u in _urls(e))
        for e in r.get("fetches") or []
    )


def our_dpp(r):
    return (r.get("ours") or {}).get("dpp")


def opened_passport(r):
    d = our_dpp(r)
    if not d:
        return None
    return _answered_fetch_of(r, d.get("upi")) or _answered_fetch_of(r, d.get("passport_url"))


def reached_checker(r):
    d = our_dpp(r)
    if not d:
        return None
    return _answered_fetch_of(r, d.get("verification_url"), outcomes=("fetched",))


def platform_searched(r):
    return any(e.get("initiator") == "platform" for e in r.get("searches") or [])


def searched(r):
    """The MODEL searched (a model-initiated search_products call); the platform search does not count."""
    return any(e.get("initiator") == "model" for e in r.get("searches") or []) or any(
        t.get("name") == "search_products" for t in r.get("toolCalls") or [])


def pick(r):
    p = r.get("pickId")
    return p if p in PRODUCTS else None


def recommended_ours(r):
    p = pick(r)
    return None if p is None else p == OURS


def flagged_c(r):
    return bool(flag_matches("C", r.get("responseText") or ""))


def position(r):
    return int(r.get("oursPosition") or 0) or None


def sel(rows, model, cond):
    return [r for r in rows if r["modelRequested"] == model and r["condition"] == cond]


# ------------------------------------------------------------------ sections

def exclusions(rows):
    rule("DATA AND EXCLUSIONS (Study 4)")
    malformed = [r for r in rows if r.get("_malformed")]
    mine = [r for r in rows if not r.get("_malformed") and r.get("study") == STUDY and not r.get("pilot")]
    other = len(rows) - len(malformed) - len(mine)
    print(f"rows read: {len(rows)}   malformed: {len(malformed)}   other study / pilot / smoke (ignored): {other}")
    invalid = [r for r in mine if r.get("instrumentInvalid")]
    errored = [r for r in mine if not r.get("instrumentInvalid") and r.get("error")]
    usable = [r for r in mine if not r.get("instrumentInvalid") and not r.get("error")]
    print(f"Study 4 rows: {len(mine)}   instrument_invalid (excluded): {len(invalid)}   errored (missing): {len(errored)}   usable: {len(usable)}")
    for r in invalid:
        print(f"  invalid: {r['modelRequested']} {r['condition']} run{r.get('runIndex')}: {r.get('instrumentInvalidReasons')}")
    for r in errored:
        print(f"  errored: {r['modelRequested']} {r['condition']} run{r.get('runIndex')}: {str(r.get('error'))[:120]}")
    noplat = [r for r in usable if not platform_searched(r)]
    print(f"usable trials WITHOUT the platform search (instrument fault, listed): {len(noplat)}")
    for r in noplat:
        print(f"  no platform search: {r['modelRequested']} {r['condition']} run{r.get('runIndex')}")
    nopick = [r for r in usable if pick(r) is None]
    print(f"usable trials with NO valid pick (missing for the selection outcome): {len(nopick)}")
    for r in nopick[:40]:
        print(f"  no pick: {r['modelRequested']} {r['condition']} run{r.get('runIndex')} searched={searched(r)} reply={str(r.get('followUpText'))[:70]!r}")
    by_brand = [r for r in usable if r.get("pickMatchedBy") == "brand"]
    print(f"picks matched by brand name rather than id: {len(by_brand)}")
    langs = Counter((r["modelRequested"], r.get("responseLanguage")) for r in usable)
    print("main-answer language (crude guess; the flaggedProblem rules are English-only):")
    for (m, lg), n in sorted(langs.items()):
        print(f"  {m:24s} {lg}: {n}")
    returned = Counter((r["modelRequested"], ",".join(r.get("modelIdsReturned") or [])) for r in usable)
    print("model ids returned:")
    for (m, ids), n in sorted(returned.items()):
        print(f"  {m} -> {ids}: {n}")
    return usable


def descriptive(usable, models):
    rule("PER MODEL x CONDITION (Wilson 95%)")
    out = {}
    for m in models:
        print(f"\n{m}")
        print(f"  {'cond':4s} {'n':>3s}  {'model searched again':28s} {'valid pick':28s} {'recommended ours | valid pick':34s}")
        for c in CONDS:
            rs = sel(usable, m, c)
            n = len(rs)
            s = sum(searched(r) for r in rs)
            v = [r for r in rs if pick(r) is not None]
            k = sum(recommended_ours(r) for r in v)
            out[(m, c)] = {"n": n, "searched": s, "valid": len(v), "ours": k}
            print(f"  {c:4s} {n:3d}  {fmt(s, n):28s} {fmt(len(v), n):28s} {fmt(k, len(v)):34s}")
    return out


def primary(usable, models, cells):
    rule("PRIMARY: recommendedOurs, P - N and P - T per model (valid picks; Newcombe 95%)")
    res = {}
    for m in models:
        p, nn, t = cells[(m, "P")], cells[(m, "N")], cells[(m, "T")]
        d1 = newcombe_diff(p["ours"], p["valid"], nn["ours"], nn["valid"])
        d2 = newcombe_diff(p["ours"], p["valid"], t["ours"], t["valid"])
        res[m] = {"P-N": d1, "P-T": d2}
        def show(d):
            return "not estimable (a cell has no valid pick)" if d[0] != d[0] else f"{100*d[0]:+6.1f} points [{100*d[1]:+6.1f}, {100*d[2]:+6.1f}]"
        print(f"{m:24s} P-N {show(d1)}")
        print(f"{'':24s} P-T {show(d2)}")
    return res


def sensitivity(usable, models):
    rule("SENSITIVITY: recommendedOurs with NO valid pick scored as 'not ours' (all usable trials)")
    for m in models:
        line = []
        for c in CONDS:
            rs = sel(usable, m, c)
            k = sum(1 for r in rs if recommended_ours(r))
            line.append(f"{c} {k}/{len(rs)}")
        p = sel(usable, m, "P")
        nn = sel(usable, m, "N")
        t = sel(usable, m, "T")
        kp = sum(1 for r in p if recommended_ours(r))
        d1 = newcombe_diff(kp, len(p), sum(1 for r in nn if recommended_ours(r)), len(nn))
        d2 = newcombe_diff(kp, len(p), sum(1 for r in t if recommended_ours(r)), len(t))
        f = lambda d: "n/a" if d[0] != d[0] else f"{100*d[0]:+.1f} [{100*d[1]:+.1f}, {100*d[2]:+.1f}]"
        print(f"{m:24s} {'  '.join(line)}   P-N {f(d1)}   P-T {f(d2)}")


def secondary(usable, models):
    rule("SECONDARY: passport behaviour of the model (P, T, U), mentions, rule C")
    res = {}
    for m in models:
        print(f"\n{m}")
        print(f"  {'cond':4s} {'opened our passport':26s} {'reached our checker':26s} {'mentioned passport':26s} {'ours mentioned':26s}")
        for c in CONDS:
            rs = sel(usable, m, c)
            n = len(rs)
            op = sum(bool(opened_passport(r)) for r in rs) if c in DPP_CONDS else None
            rc = sum(bool(reached_checker(r)) for r in rs) if c in DPP_CONDS else None
            mp = sum(bool(r.get("mentionedPassport")) for r in rs)
            om = sum(bool(r.get("oursMentioned")) for r in rs)
            res[(m, c)] = {"n": n, "opened": op, "checker": rc, "mentionedPassport": mp, "oursMentioned": om}
            na = f"{'n/a (no dpp block)':26s}"
            print(f"  {c:4s} {fmt(op, n) if op is not None else na:26s} {fmt(rc, n) if rc is not None else na:26s} {fmt(mp, n):26s} {fmt(om, n):26s}")
    print("\nflaggedProblem rule C on the main answer (T is the tampered passport; P, U, N are the false-positive check):")
    for m in models:
        parts = []
        for c in CONDS:
            rs = sel(usable, m, c)
            k = sum(flagged_c(r) for r in rs)
            parts.append(f"{c} {k}/{len(rs)}")
            res[(m, c)]["flaggedC"] = k
        print(f"  {m:24s} {'   '.join(parts)}")
    print("\nT: flagged (rule C) AND reached the checker:")
    for m in models:
        rs = sel(usable, m, "T")
        print(f"  {m:24s} {sum(1 for r in rs if flagged_c(r) and reached_checker(r))}/{len(rs)}")
    return res


def picks_table(usable, models):
    rule("PICK DISTRIBUTION per model x condition (valid picks)")
    for m in models:
        for c in CONDS:
            cnt = Counter(pick(r) for r in sel(usable, m, c) if pick(r))
            print(f"  {m:24s} {c}: " + ", ".join(f"{p} {cnt.get(p, 0)}" for p in PRODUCTS))


def positions(usable):
    rule("POSITION EFFECTS (pooled over models and conditions)")
    print("recommendedOurs by our position (valid picks):")
    for pos in (1, 2, 3, 4):
        rs = [r for r in usable if position(r) == pos and pick(r)]
        print(f"  ours at {pos}: {fmt(sum(recommended_ours(r) for r in rs), len(rs))}")
    print("position of the picked product, any product (valid picks; 25% each if no position bias):")
    picked = [r for r in usable if pick(r)]
    for pos in (1, 2, 3, 4):
        k = sum(1 for r in picked if r.get("pickPosition") == pos)
        print(f"  picked the listing at {pos}: {fmt(k, len(picked))}")
    print("our position, by condition (balance check of the randomisation):")
    for c in CONDS:
        cnt = Counter(position(r) for r in usable if r["condition"] == c)
        print(f"  {c}: " + ", ".join(f"@{p} {cnt.get(p, 0)}" for p in (1, 2, 3, 4)))


def regression(usable):
    rule("POOLED LOGISTIC REGRESSION: recommendedOurs ~ condition (ref N) + model + position (valid picks)")
    try:
        import pandas as pd
        import statsmodels.formula.api as smf
    except ImportError as e:
        print(f"  NOT ESTIMABLE: {e}. Use the study venv (analysis/requirements.txt).")
        return None
    rows = [r for r in usable if pick(r)]
    df = pd.DataFrame({
        "y": [int(recommended_ours(r)) for r in rows],
        "condition": [r["condition"] for r in rows],
        "model": [r["modelRequested"] for r in rows],
        "position": [str(position(r)) for r in rows],
    })
    if df.empty:
        print("  NOT ESTIMABLE: no valid picks.")
        return None
    terms = []
    if df["condition"].nunique() > 1:
        terms.append("C(condition, Treatment('N'))" if "N" in set(df["condition"]) else "C(condition)")
    for v in ("model", "position"):
        if df[v].nunique() > 1:
            terms.append(f"C({v})")
        else:
            print(f"  note: {v} has one level; its term drops out")
    if not terms:
        print("  NOT ESTIMABLE: no varying predictor.")
        return None
    formula = "y ~ " + " + ".join(terms)
    print(f"  formula: {formula}   n={len(df)}")
    separated, res, why = False, None, ""
    if df["y"].nunique() < 2:
        separated, why = True, "outcome constant"
    else:
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            try:
                res = smf.logit(formula, data=df).fit(disp=0, maxiter=200)
            except Exception as e:
                separated, why = True, f"fit raised {type(e).__name__}: {e}"
            names = [type(x.message).__name__ for x in w]
        if res is not None:
            bad = [(n, float(c), float(s)) for n, c, s in zip(res.params.index, res.params.values, res.bse.values)
                   if c != c or s != s or abs(c) > COEF_ABS_MAX or s > SE_MAX]
            if bad or any("Separation" in n or "Singular" in n for n in names) or not res.mle_retvals.get("converged", True):
                separated = True
                why = f"implausible terms {[(n, round(c, 2), round(s, 2)) for n, c, s in bad]} warnings={names}"
    if not separated:
        print("  maximum-likelihood fit (no separation detected):")
        ci = res.conf_int()
        print(f"    {'term':44s}{'coef':>9s}{'[2.5%':>9s}{'97.5%]':>9s}{'p':>9s}")
        for n in res.params.index:
            print(f"    {n[:44]:44s}{res.params[n]:9.3f}{ci.loc[n, 0]:9.3f}{ci.loc[n, 1]:9.3f}{res.pvalues[n]:9.4f}")
        return "ml"
    print(f"  SEPARATION DETECTED ({why}). Maximum likelihood is not interpreted.")
    print("  Firth penalised-likelihood refit (reported AS Firth):")
    try:
        from firthlogist import FirthLogisticRegression
    except ImportError:
        print("    firthlogist NOT importable: the regression is reported as NOT ESTIMABLE; the Wilson tables are the report.")
        return "not_estimable"
    try:
        import patsy
        y, X = patsy.dmatrices(formula, df, return_type="dataframe")
        fl = FirthLogisticRegression(fit_intercept=False)
        fl.fit(X.values, y.values.ravel())
        print(f"    {'term':44s}{'coef':>9s}{'[2.5%':>9s}{'97.5%]':>9s}{'p':>9s}")
        for i, n in enumerate(X.columns):
            lo, hi = fl.ci_[i]
            print(f"    {n[:44]:44s}{fl.coef_[i]:9.3f}{lo:9.3f}{hi:9.3f}{fl.pvals_[i]:9.4f}")
        return "firth"
    except Exception as e:
        print(f"    Firth refit failed ({type(e).__name__}: {e}): NOT ESTIMABLE.")
        return "not_estimable"


def analyse(rows):
    usable = exclusions(rows)
    models = sorted({r["modelRequested"] for r in usable})
    cells = descriptive(usable, models)
    prim = primary(usable, models, cells)
    sensitivity(usable, models)
    sec = secondary(usable, models)
    picks_table(usable, models)
    positions(usable)
    reg = regression(usable)
    return {"usable": usable, "models": models, "cells": cells, "primary": prim, "secondary": sec, "regression": reg}


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    analyse(load(argv[1:]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
