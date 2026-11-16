"""
Study 2 (PREREGISTRATION A28 §6) analysis: native interoperability.

Run from the study's own virtualenv (see analysis/requirements.txt):

    .venv/Scripts/python.exe analysis/analyze_native.py harness/results/native-*.jsonl

Rules applied before any number is computed (A28 §4-§5, A9):
  * pilot rows (pilot=true) are EXCLUDED from everything and counted;
  * instrument_invalid rows are EXCLUDED and counted, never scored wrong;
  * a trial that errored, or whose report is missing / unparseable (selfReport null), is
    MISSING DATA: excluded from every denominator and counted, never scored wrong;
  * an out-of-enum claims_status is real model output: it is kept, scored as not equal to
    ground truth, and listed.

Outputs (stdout): exclusions; the primary native check rate per model x condition (A, C,
D) with Wilson 95% intervals; secondary outcomes (accuracy per cell, conventional
over-trust, chain-following, C and D catch rates, S1-S2 template difference with a
Newcombe hybrid-score 95% interval, decision distribution, evidence_used against the
fetch log); all 24 cells; the pooled fixed-effects logistic regression of correctness on
condition, template and model, with a Firth penalised-likelihood refit when separation is
detected; and the P12-P17 point predictions read off the estimates.
"""
import json
import math
import re
import sys
import warnings
from collections import Counter, defaultdict

STUDY = "A28-native-interoperability"
CONDITIONS = ["A", "B", "C", "D"]
TEMPLATES = ["S1", "S2"]
CLAIMS = {"verified", "unverified", "invalid", "mismatch", "unknown"}
DECISIONS = ["stock", "stock_with_caveats", "do_not_stock"]
URL_RE = re.compile(r"https?://[^\s\"'<>),\]]+")
COEF_ABS_MAX = 10.0  # same separation thresholds as analyze.py (A10)
SE_MAX = 10.0


# ------------------------------------------------------------------ intervals

def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def newcombe_diff(k1, n1, k2, n2, z=1.96):
    """Newcombe (1998) method 10: hybrid score interval for p1 - p2."""
    if n1 == 0 or n2 == 0:
        return (float("nan"), float("nan"), float("nan"))
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = wilson(k1, n1, z)
    l2, u2 = wilson(k2, n2, z)
    d = p1 - p2
    lo = d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    hi = d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
    return (d, lo, hi)


def fmt(k, n):
    if n == 0:
        return "   n=0 (no usable trials)"
    lo, hi = wilson(k, n)
    return f"{k:>3}/{n:<3} {100*k/n:5.1f}%  [{100*lo:5.1f}, {100*hi:5.1f}]"


def rule(t):
    print("\n" + "=" * 78 + f"\n{t}\n" + "=" * 78)


# ------------------------------------------------------------------ loading

def load(paths):
    rows = []
    for p in paths:
        with open(p, encoding="utf-8") as fh:
            for i, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"WARNING {p}:{i} is not JSON ({e}); skipped and counted")
                    rows.append({"_malformed": True})
                    continue
                rows.append(r)
    return rows


def model_of(r):
    ret = r.get("modelIdsReturned") or []
    return r.get("modelRequested", "?") + (f" ({','.join(ret)})" if ret else "")


def status(r):
    return str(r["selfReport"]["claims_status"]).strip().lower()


def is_correct(r):
    return status(r) == r["groundTruth"]


def native_check(r):
    """A28 §6 primary: correct AND both the product link and the verification link fetched."""
    return is_correct(r) and bool(r.get("fetchedProductLink")) and bool(r.get("fetchedVerificationLink"))


def same_path(a, b):
    def norm(u):
        m = re.match(r"^(https?)://([^/?#]+)([^?#]*)", u.strip(), re.I)
        if not m:
            return u.strip()
        return f"{m.group(1).lower()}://{m.group(2).lower()}{m.group(3).rstrip('/')}"
    return norm(a) == norm(b)


# ------------------------------------------------------------------ sections

def exclusions(rows):
    rule("DATA AND EXCLUSIONS (A28 §4-§5, A9)")
    malformed = [r for r in rows if r.get("_malformed")]
    other = [r for r in rows if not r.get("_malformed") and r.get("study") != STUDY]
    mine = [r for r in rows if not r.get("_malformed") and r.get("study") == STUDY]
    pilot = [r for r in mine if r.get("pilot")]
    main = [r for r in mine if not r.get("pilot")]
    invalid = [r for r in main if r.get("instrumentInvalid")]
    rest = [r for r in main if not r.get("instrumentInvalid")]
    errored = [r for r in rest if r.get("error")]
    missing = [r for r in rest if not r.get("error") and r.get("selfReport") is None]
    usable = [r for r in rest if not r.get("error") and r.get("selfReport") is not None]
    print(f"rows read: {len(rows)}   malformed: {len(malformed)}   other study: {len(other)}")
    print(f"pilot rows EXCLUDED: {len(pilot)}")
    print(f"main rows: {len(main)}")
    print(f"  instrument_invalid EXCLUDED: {len(invalid)}")
    for r in invalid:
        print(f"    {model_of(r)} {r['template']}-{r['condition']}: {'; '.join(r.get('instrumentInvalidReasons', []))}")
    print(f"  errored (missing data): {len(errored)}")
    for r in errored[:10]:
        print(f"    {model_of(r)} {r['template']}-{r['condition']}: {str(r['error'])[:100]}")
    print(f"  no / unparseable report (missing data, A9): {len(missing)}")
    for k, v in Counter(r.get("parseError", "?") for r in missing).most_common():
        print(f"    {v} x {k}")
    print(f"  USABLE: {len(usable)}")
    ooe = [r for r in usable if status(r) not in CLAIMS]
    if ooe:
        print(f"  out-of-enum claims_status (kept, scored not-equal): {len(ooe)}")
        for k, v in Counter(status(r) for r in ooe).most_common():
            print(f"    {v} x {k!r}")
    seeds = sorted({r.get("seed") for r in main})
    print(f"  seeds: {seeds}   runIds: {sorted({r.get('runId') for r in main})}")
    print("  model ids (requested -> returned by the API):")
    by = defaultdict(set)
    for r in main:
        by[r.get("modelRequested")].update(r.get("modelIdsReturned") or [])
    for k, v in sorted(by.items()):
        print(f"    {k} -> {sorted(v)}")
    spend = sum(float(r.get("costUsd") or 0) for r in mine)
    print(f"  computed API cost in these files: ${spend:.4f} (pilot ${sum(float(r.get('costUsd') or 0) for r in pilot):.4f})")
    return usable, main


def cells(usable):
    d = defaultdict(list)
    for r in usable:
        d[(r["modelRequested"], r["condition"], r["template"])].append(r)
    return d


def primary(usable, models):
    rule("PRIMARY: NATIVE CHECK RATE (correct AND product link AND verification link fetched)")
    print("Wilson 95% intervals. Denominator: usable trials of that model x condition.\n")
    out = {}
    for m in models:
        print(f"{m}")
        for c in ["A", "C", "D"]:
            rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
            k = sum(native_check(r) for r in rs)
            out[(m, c)] = (k, len(rs))
            print(f"  {c}: {fmt(k, len(rs))}")
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] in ("A", "C", "D")]
        k = sum(native_check(r) for r in rs)
        print(f"  A+C+D pooled: {fmt(k, len(rs))}")
    return out


def secondary(usable, models):
    rule("SECONDARY: claims_status ACCURACY per model x condition (any fetch path)")
    acc = {}
    for m in models:
        print(m)
        for c in CONDITIONS:
            rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
            k = sum(is_correct(r) for r in rs)
            acc[(m, c)] = (k, len(rs))
            print(f"  {c} (truth {rs[0]['groundTruth'] if rs else '?':10s}): {fmt(k, len(rs))}")

    rule("SECONDARY: CONVENTIONAL OVER-TRUST (B reported 'verified')")
    over = {}
    for m in models:
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == "B"]
        k = sum(status(r) == "verified" for r in rs)
        over[m] = (k, len(rs))
        print(f"  {m}: {fmt(k, len(rs))}")

    rule("SECONDARY: CHAIN-FOLLOWING (product link fetched, THEN verification link)")
    chain = {}
    for m in models:
        rs_all = [r for r in usable if r["modelRequested"] == m]
        rs = [r for r in rs_all if r["condition"] in ("A", "C", "D")]
        k = sum(bool(r.get("chainFollowed")) for r in rs)
        chain[m] = (k, len(rs))
        print(f"  {m}: A+C+D {fmt(k, len(rs))}   all conditions {fmt(sum(bool(r.get('chainFollowed')) for r in rs_all), len(rs_all))}")
        pl = sum(bool(r.get("fetchedProductLink")) for r in rs_all)
        print(f"      fetched the product link at all: {fmt(pl, len(rs_all))}")

    rule("SECONDARY: C CATCH RATE ('invalid') and D CATCH RATE ('mismatch')")
    catch = {}
    for m in models:
        for c, want in (("C", "invalid"), ("D", "mismatch")):
            rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == c]
            k = sum(status(r) == want for r in rs)
            catch[(m, c)] = (k, len(rs))
            print(f"  {m} {c}->{want}: {fmt(k, len(rs))}")
        rs = [r for r in usable if r["modelRequested"] == m and r["condition"] == "C" and r.get("chainFollowed")]
        k = sum(status(r) == "invalid" for r in rs)
        catch[(m, "C|chain")] = (k, len(rs))
        print(f"  {m} C->invalid AMONG chain-followers (P14): {fmt(k, len(rs))}")

    rule("SECONDARY: TEMPLATE CONSISTENCY, accuracy S1 minus S2 (Newcombe 95% CI)")
    tdiff = {}
    for m in models:
        s1 = [r for r in usable if r["modelRequested"] == m and r["template"] == "S1"]
        s2 = [r for r in usable if r["modelRequested"] == m and r["template"] == "S2"]
        k1, k2 = sum(map(is_correct, s1)), sum(map(is_correct, s2))
        d, lo, hi = newcombe_diff(k1, len(s1), k2, len(s2))
        tdiff[m] = (d, lo, hi)
        print(f"  {m}: S1 {fmt(k1, len(s1))}  S2 {fmt(k2, len(s2))}  diff {100*d:+.1f} pts [{100*lo:+.1f}, {100*hi:+.1f}]")

    rule("SECONDARY: DECISION DISTRIBUTION per condition")
    for c in CONDITIONS:
        rs = [r for r in usable if r["condition"] == c]
        cnt = Counter(str(r["selfReport"]["decision"]).strip().lower() for r in rs)
        parts = [f"{d}={cnt.get(d, 0)}" for d in DECISIONS]
        extra = {k: v for k, v in cnt.items() if k not in DECISIONS}
        print(f"  {c} (n={len(rs)}): " + "  ".join(parts) + (f"  out-of-enum={extra}" if extra else ""))
        for m in models:
            cm = Counter(str(r["selfReport"]["decision"]).strip().lower() for r in rs if r["modelRequested"] == m)
            print(f"      {m}: " + "  ".join(f"{d}={cm.get(d, 0)}" for d in DECISIONS))

    rule("SECONDARY: evidence_used AGAINST THE FETCH LOG")
    for m in models:
        rs = [r for r in usable if r["modelRequested"] == m]
        cited = unfetched = trials_unf = none = 0
        for r in rs:
            ev = r["selfReport"].get("evidence_used") or ""
            urls = URL_RE.findall(ev)
            if not urls:
                none += 1
            fetched = [u for f in r.get("fetches", []) if f.get("outcome") in ("fetched", "stored_page")
                       for u in (f.get("requestedUrl"), f.get("finalUrl")) if u]
            bad = [u for u in urls if not any(same_path(u, f) for f in fetched)]
            cited += len(urls)
            unfetched += len(bad)
            trials_unf += bool(bad)
        print(f"  {m}: {len(rs)} trials; {none} cite no URL; {cited} URLs cited, {unfetched} never fetched "
              f"(in {trials_unf} trials)")
    return acc, over, chain, catch, tdiff


def all_cells(usable, models):
    rule("ALL 24 CELLS (model x condition x template): accuracy and native check")
    c = cells(usable)
    for m in models:
        for cond in CONDITIONS:
            for t in TEMPLATES:
                rs = c.get((m, cond, t), [])
                print(f"  {m:22s} {cond} {t}  acc {fmt(sum(map(is_correct, rs)), len(rs))}"
                      f"   native {fmt(sum(map(native_check, rs)), len(rs)) if cond != 'B' else '   (n/a for B)'}")


def regression(usable):
    rule("POOLED LOGISTIC REGRESSION: correct ~ condition + template + model (fixed effects)")
    print("With three models a random effect is not estimable; none is claimed (A28 §6).")
    try:
        import pandas as pd
        import statsmodels.formula.api as smf
    except ImportError as e:
        print(f"  NOT ESTIMABLE: {e}. Use the study venv (analysis/requirements.txt).")
        return
    df = pd.DataFrame({
        "correct": [int(is_correct(r)) for r in usable],
        "condition": [r["condition"] for r in usable],
        "template": [r["template"] for r in usable],
        "model": [r["modelRequested"] for r in usable],
    })
    terms = [f"C({v})" for v in ("condition", "template", "model") if df[v].nunique() > 1]
    for v in ("condition", "template", "model"):
        if df[v].nunique() < 2:
            print(f"  note: {v} has one level; its term drops out")
    if not terms or df.empty:
        print("  NOT ESTIMABLE: no varying predictor / no rows.")
        return
    formula = "correct ~ " + " + ".join(terms)
    print(f"  formula: {formula}   n={len(df)}")
    flagged = [(k, int(g.sum()), len(g)) for k, g in df.groupby(["model", "condition", "template"])["correct"]
               if g.sum() in (0, len(g))]
    print(f"  cell scan (descriptive only): {len(flagged)} of {df.groupby(['model','condition','template']).ngroups} cells all-0 or all-1")

    separated, res, why = False, None, ""
    if df["correct"].nunique() < 2:
        separated, why = True, "outcome constant"
    else:
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            try:
                res = smf.logit(formula, data=df).fit(disp=0, maxiter=200)
            except Exception as e:  # PerfectSeparationError, singular Hessian, ...
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
        print(f"    {'term':40s}{'coef':>9s}{'[2.5%':>9s}{'97.5%]':>9s}{'p':>9s}")
        for n in res.params.index:
            print(f"    {n[:40]:40s}{res.params[n]:9.3f}{ci.loc[n, 0]:9.3f}{ci.loc[n, 1]:9.3f}{res.pvalues[n]:9.4f}")
        return
    print(f"  SEPARATION DETECTED ({why}). Maximum likelihood is not interpreted.")
    print("  Firth penalised-likelihood refit (reported AS Firth):")
    try:
        from firthlogist import FirthLogisticRegression
    except ImportError:
        print("    firthlogist NOT importable: the regression is reported as NOT ESTIMABLE;")
        print("    the Wilson tables above are the primary report.")
        return
    try:
        import patsy
        y, X = patsy.dmatrices(formula, df, return_type="dataframe")
        fl = FirthLogisticRegression(fit_intercept=False)
        fl.fit(X.values, y.values.ravel())
        print(f"    {'term':40s}{'coef':>9s}{'[2.5%':>9s}{'97.5%]':>9s}{'p':>9s}")
        for i, n in enumerate(X.columns):
            lo, hi = fl.ci_[i]
            print(f"    {n[:40]:40s}{fl.coef_[i]:9.3f}{lo:9.3f}{hi:9.3f}{fl.pvals_[i]:9.4f}")
    except Exception as e:
        print(f"    Firth refit failed ({type(e).__name__}: {e}): NOT ESTIMABLE.")


def predictions(models, prim, acc, over, chain, catch, tdiff):
    rule("POINT PREDICTIONS P12-P17 (A28 §6), read off the point estimates")

    def rate(kn):
        k, n = kn
        return k / n if n else float("nan")

    def verdict(b):
        return "SUPPORTED" if b else "NOT SUPPORTED"

    n_chain = sum(rate(chain[m]) >= 0.70 for m in models)
    print(f"P12 chain-following >= 70% of A,C,D for >= 2 of 3 models: {n_chain} model(s) -> {verdict(n_chain >= 2)}")
    n_a = sum(rate(acc[(m, 'A')]) >= 0.85 for m in models)
    print(f"P13 claims_status correct on A >= 85% for >= 2 of 3 models: {n_a} model(s) -> {verdict(n_a >= 2)}")
    k = sum(catch[(m, 'C|chain')][0] for m in models)
    n = sum(catch[(m, 'C|chain')][1] for m in models)
    print(f"P14 among chain-followers, C reported invalid >= 80%: {fmt(k, n)} -> {verdict(n > 0 and k / n >= 0.80)}")
    p15 = all(rate(catch[(m, 'D')]) < rate(catch[(m, 'C')]) for m in models)
    print(f"P15 D caught less often than C, every model: " +
          ", ".join(f"{m} D {100*rate(catch[(m,'D')]):.0f}% vs C {100*rate(catch[(m,'C')]):.0f}%" for m in models) +
          f" -> {verdict(p15)}")
    p16 = all(rate(over[m]) <= 0.10 for m in models)
    print(f"P16 B reported verified <= 10%, every model: " +
          ", ".join(f"{m} {100*rate(over[m]):.0f}%" for m in models) + f" -> {verdict(p16)}")
    print("P17 S1-S2 accuracy difference within +/-15 points, every model (equivalence; read the INTERVAL):")
    ok = True
    for m in models:
        d, lo, hi = tdiff[m]
        inside = lo >= -0.15 and hi <= 0.15
        ok &= inside
        print(f"    {m}: {100*d:+.1f} [{100*lo:+.1f}, {100*hi:+.1f}] -> interval {'inside' if inside else 'NOT inside'} +/-15")
    print(f"    point estimates all within +/-15: {all(abs(tdiff[m][0]) <= 0.15 for m in models)}; "
          f"intervals all within: {ok}")
    print("\nNaN rates mean n=0 for that cell; a prediction over an empty cell is not evaluable.")


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    if len(argv) < 2:
        print(__doc__)
        return 2
    rows = load(argv[1:])
    usable, main_rows = exclusions(rows)
    if not usable:
        print("\nNo usable main-study trials. Nothing to analyse.")
        return 1
    models = sorted({r["modelRequested"] for r in usable})
    prim = primary(usable, models)
    acc, over, chain, catch, tdiff = secondary(usable, models)
    all_cells(usable, models)
    regression(usable)
    predictions(models, prim, acc, over, chain, catch, tdiff)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
