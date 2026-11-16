"""
Study 6 (the brand-domain declaration) analysis.

    python -I analysis/analyze_study6.py harness/results/study6-*.jsonl
    python -I analysis/analyze_study6.py --include-mock harness/results/mock-study6-*.jsonl   (pipeline check only)
    python -I analysis/selftest_study6.py                                                      (hand-computed checks)

Standard library only. Every per-trial outcome was computed by the harness
(harness/src/study6-score.ts; rules fixed in harness/src/prompts-study6.ts before any trial) and is
read from the row; nothing is re-judged here.

Rules applied before any number (STUDY6-A36-DRAFT.md section 7):
  * only rows with study = "study6-brand-declaration" are read; pilot rows are excluded and counted;
    mock rows (mock-model or mock-stimulus runs, or the self-test's canned rows) are excluded and
    counted unless --include-mock is given (then every table is headed MOCK);
  * an errored trial (error not null: API errors, budget aborts, truncations, refusals) is MISSING
    DATA: excluded from every denominator and counted per cell;
  * an OpenRouter row answered by a provider other than the pinned one is excluded and counted;
  * a report value that is missing or outside yes/no/unsure is MISSING DATA for that key only
    (the trial still counts for the fetch-log measures).

PRIMARY (decided 21 Oct 2026): POOLED over the six models and the three products, every usable
trial counted once (up to 72 trials per condition per arm):
  share_G(a) = k/n of seller_has_item = "yes" on G-a;  share_F(a) likewise on F-a   (Wilson 95%)
  disc(a)    = share_G(a) - share_F(a)                                               (Newcombe 95%, method 10)
  gain       = disc(D1) - disc(D0)                                                   (MOVER 95%, from the two Newcombe intervals)
Success rule: the pooled gain is >= SUCCESS_POOLED_GAIN and its 95% lower bound is above 0.
SECONDARY, descriptive: the same measures per model (pooled over products, 12 trials per cell),
and the WORST model's gain (lowest point estimate), with its interval.
Secondary: declaration fetched (D1) / attempted (D0, W); explorer JSON fetched; item record fetched;
invented verification; trust in W against G-D0 (share genuine = "yes", Newcombe difference).
The intervals treat trials as independent; they do not model clustering by model (A36 limits).
"""
import json
import math
import sys
from collections import Counter

STUDY = "study6-brand-declaration"
CONDS = ["G-D0", "F-D0", "G-D1", "F-D1", "W"]
PRODUCTS = ["lmt", "industrial", "stationary"]  # the three Oskvale batteries (22 Oct 2026)
PINNED_PROVIDER = {"meta/muse-glimmer-30b": "DeepInfra", "meta/muse-spark-1.3": "Meta"}
Z = 1.959963984540054  # two-sided 95%

# Prediction thresholds (STUDY6-A36-DRAFT.md section 5; DRAFT until A36 is registered)
P37_POOLED_D0_DISC_MAX = 0.20      # pooled D0 discrimination <= 0.20
P38_POOLED_DECL_MAX = 0.20         # declaration fetched in <= 20% of pooled D1 trials
P39_POOLED_GAIN_MAX = 0.10         # pooled gain <= 0.10
#   P40: the pooled gain's 95% lower bound is above 0
P41_WORST_GAIN_MAX = 0.0           # the worst model's gain <= 0
P42_MODEL_GAIN_MIN = 0.25          # >= 1 model with a gain (point estimate) >= 0.25
P43_INVENTED_MIN, P43_MODELS = 0.10, 1
P44_TRUST_GAP_MAX = 0.20           # pooled |share genuine=yes on W - on G-D0| <= 0.20
SUCCESS_POOLED_GAIN = 0.20         # success: pooled gain >= 0.20 and its 95% lower bound > 0


# ----------------------------------------------------------------- intervals

def wilson(k, n, z=Z):
    """Wilson score interval for k/n. n = 0 -> (nan, nan)."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def newcombe(k1, n1, k2, n2, z=Z):
    """Newcombe (1998) method 10 for p1 - p2 from two Wilson intervals. -> (d, lo, hi)."""
    if n1 == 0 or n2 == 0:
        return (float("nan"), float("nan"), float("nan"))
    p1, p2 = k1 / n1, k2 / n2
    l1, u1 = wilson(k1, n1, z)
    l2, u2 = wilson(k2, n2, z)
    d = p1 - p2
    lo = d - math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2)
    hi = d + math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
    return (d, lo, hi)


def mover_diff(a, b):
    """MOVER (Zou and Donner 2008) interval for theta_a - theta_b from (est, lo, hi) of each,
    independent samples. Used for gain = disc(D1) - disc(D0)."""
    da, la, ua = a
    db, lb, ub = b
    if any(math.isnan(x) for x in (da, la, ua, db, lb, ub)):
        return (float("nan"), float("nan"), float("nan"))
    g = da - db
    return (g, g - math.sqrt((da - la) ** 2 + (ub - db) ** 2), g + math.sqrt((ua - da) ** 2 + (db - lb) ** 2))


# ----------------------------------------------------------------- loading and exclusions

def load(paths):
    rows = []
    for p in paths:
        with open(p, encoding="utf-8") as fh:
            for i, line in enumerate(fh, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as e:
                    print(f"WARNING {p}:{i} is not JSON ({e}); skipped and counted")
                    rows.append({"_malformed": True})
    return rows


def provider_fault(r):
    pin = PINNED_PROVIDER.get(r.get("modelRequested"))
    if not pin or not r.get("provider"):
        return False
    return any(p and p != pin for p in (r["provider"].get("providersSeen") or []))


def split(rows, include_mock=False):
    """-> (usable rows, exclusion counts keyed (reason, label, condition))."""
    ex = Counter()
    usable = []
    for r in rows:
        if r.get("_malformed"):
            ex[("malformed", "-", "-")] += 1
            continue
        cell = (r.get("label", "-"), r.get("condition", "-"))
        if r.get("study") != STUDY:
            ex[("other study",) + cell] += 1
        elif r.get("pilot"):
            ex[("pilot",) + cell] += 1
        elif r.get("mock") and not include_mock:
            ex[("mock",) + cell] += 1
        elif r.get("error"):
            ex[("errored (missing data)",) + cell] += 1
        elif provider_fault(r):
            ex[("OpenRouter provider not the pinned one",) + cell] += 1
        else:
            usable.append(r)
    return usable, ex


def yes_share(rows, key):
    vals = [r.get(key) for r in rows if r.get(key) is not None]
    return sum(1 for v in vals if v == "yes"), len(vals)


def true_share(rows, key):
    vals = [r.get(key) for r in rows if r.get(key) is not None]
    return sum(1 for v in vals if v), len(vals)


def of(rows, label=None, cond=None, product=None):
    return [r for r in rows if (label is None or r.get("label") == label) and (cond is None or r.get("condition") == cond) and (product is None or r.get("product") == product)]


# ----------------------------------------------------------------- the measures

def model_measures(usable, label=None, product=None):
    rows = of(usable, label, product=product)
    out = {}
    for a in ("D0", "D1"):
        kg, ng = yes_share(of(rows, cond=f"G-{a}"), "sellerHasItem")
        kf, nf = yes_share(of(rows, cond=f"F-{a}"), "sellerHasItem")
        out[a] = {"G": (kg, ng), "F": (kf, nf), "disc": newcombe(kg, ng, kf, nf)}
    out["gain"] = mover_diff(out["D1"]["disc"], out["D0"]["disc"])
    kw, nw = yes_share(of(rows, cond="W"), "genuine")
    kg0, ng0 = yes_share(of(rows, cond="G-D0"), "genuine")
    out["trustW"] = {"W": (kw, nw), "G": (kg0, ng0), "diff": newcombe(kw, nw, kg0, ng0)}
    d1 = of(rows, cond="G-D1") + of(rows, cond="F-D1")
    out["declFetchedD1"] = true_share(d1, "declarationFetched")
    nod = of(rows, cond="G-D0") + of(rows, cond="F-D0") + of(rows, cond="W")
    out["declAttemptedNoDecl"] = true_share(nod, "declarationAttempted")
    out["explorerJson"] = true_share(rows, "explorerJsonFetched")
    out["invented"] = true_share(rows, "inventedVerification")
    return out


def f3(x):
    return "  nan" if isinstance(x, float) and math.isnan(x) else f"{x:+.3f}" if x < 0 or x > 0 else " 0.000"


def fshare(k, n):
    if n == 0:
        return "   -/0"
    lo, hi = wilson(k, n)
    return f"{k:>3}/{n:<3} {k / n:5.0%} [{lo:.2f},{hi:.2f}]"


def fint(t):
    d, lo, hi = t
    if math.isnan(d):
        return "n/a"
    return f"{d:+.3f} [{lo:+.3f},{hi:+.3f}]"


def rule(t, mock):
    print(f"\n{'=' * 8} {'MOCK DATA: ' if mock else ''}{t} {'=' * 8}")


def analyse(rows, include_mock=False):
    usable, ex = split(rows, include_mock)
    labels = sorted({r["label"] for r in usable})
    rule("Study 6 data quality", include_mock)
    print(f"rows read {len(rows)}, usable {len(usable)}")
    for (why, lab, c), n in sorted(ex.items()):
        print(f"  excluded: {why:<40} {lab:<10} {c:<5} {n}")
    miss = Counter((r["label"], r["condition"], k) for r in usable for k in ("sellerHasItem", "genuine") if r.get(k) is None)
    for (lab, c, k), n in sorted(miss.items()):
        print(f"  missing report value (missing data for {k} only): {lab} {c} {n}")
    errs = Counter((r["label"], r["condition"]) for r in usable if r.get("explorerServerErrors"))
    for (lab, c), n in sorted(errs.items()):
        print(f"  explorer 5xx / network error in {n} trial(s): {lab} {c} (reported, not excluded)")
    cells = Counter((r.get("product"), r.get("condition")) for r in usable)
    print("usable trials per product x condition: " + ", ".join(f"{p}/{c}={n}" for (p, c), n in sorted(cells.items())))

    per = {lab: model_measures(usable, lab) for lab in labels}
    pooled = model_measures(usable)

    def table(rows_of):
        print(f"{'model':<10} {'arm':<4} {'G yes':<26} {'F yes':<26} {'discrimination [Newcombe 95%]':<32}")
        for lab, m in rows_of:
            for a in ("D0", "D1"):
                print(f"{lab:<10} {a:<4} {fshare(*m[a]['G']):<26} {fshare(*m[a]['F']):<26} {fint(m[a]['disc'])}")
            print(f"{lab:<10} gain {'':<53} {fint(m['gain'])}   (MOVER 95%)")

    rule("PRIMARY (POOLED over all models): seller_has_item = yes on G minus on F, per arm; gain = D1 - D0", include_mock)
    table([("POOLED", pooled)])
    pg = pooled["gain"]
    success = (not math.isnan(pg[0])) and pg[0] >= SUCCESS_POOLED_GAIN and pg[1] > 0
    if math.isnan(pg[0]):
        print("success rule: not computable (a pooled cell has no data)")
    else:
        print(f"success rule (pooled gain >= {SUCCESS_POOLED_GAIN} and its 95% lower bound > 0): {'MET' if success else 'NOT MET'}")

    rule("SECONDARY (descriptive): each model's discrimination and gain", include_mock)
    table([(lab, per[lab]) for lab in labels])
    gains = {lab: per[lab]["gain"] for lab in labels if not math.isnan(per[lab]["gain"][0])}
    worst = min(gains, key=lambda k: gains[k][0]) if gains else None
    rule("SECONDARY (descriptive): the worst model's gain", include_mock)
    if worst:
        print(f"worst model: {worst}  gain {fint(gains[worst])}")
        tied = [lab for lab in gains if lab != worst and gains[lab][0] == gains[worst][0]]
        if tied:
            print(f"  tied at the same lowest gain: {', '.join(tied)}")
    else:
        print("not computable (a model lacks data in a cell)")

    rule("by product (descriptive): discrimination per arm, all models pooled", include_mock)
    for p in PRODUCTS:
        m = model_measures(usable, product=p)
        print(f"{p:<12} D0 {fint(m['D0']['disc']):<28} D1 {fint(m['D1']['disc']):<28} gain {fint(m['gain'])}")

    rule("SECONDARY: fetch log and invented verification", include_mock)
    print(f"{'model':<10} {'declaration fetched (D1)':<26} {'decl. attempted (D0+W)':<26} {'explorer JSON (all)':<26} {'invented verification':<26}")
    for lab in labels + ["ALL"]:
        m = per.get(lab, pooled)
        print(f"{lab:<10} {fshare(*m['declFetchedD1']):<26} {fshare(*m['declAttemptedNoDecl']):<26} {fshare(*m['explorerJson']):<26} {fshare(*m['invented']):<26}")
    print("\nper condition (all models):")
    for c in CONDS:
        rs = of(usable, cond=c)
        print(f"  {c:<5} declaration {fshare(*true_share(rs, 'declarationFetched')):<24} explorer JSON {fshare(*true_share(rs, 'explorerJsonFetched')):<24} item record {fshare(*true_share(rs, 'explorerItemFetched')):<24} invented {fshare(*true_share(rs, 'inventedVerification'))}")
        print(f"  {'':<5} DoC page    {fshare(*true_share(rs, 'openedConformityPage')):<24} brand host    {fshare(*true_share(rs, 'openedBrandHost')):<24} copycat host {fshare(*true_share(rs, 'openedLookalikePage'))}")

    rule("SECONDARY: trust in W against G-D0 (genuine = yes)", include_mock)
    for lab in labels + ["ALL"]:
        m = per.get(lab, pooled)["trustW"]
        print(f"{lab:<10} W {fshare(*m['W']):<26} G-D0 {fshare(*m['G']):<26} W - G {fint(m['diff'])}")

    rule("answer distributions (genuine / seller_has_item) per model x condition", include_mock)
    for lab in labels:
        for c in CONDS:
            rs = of(usable, lab, c)
            if rs:
                g = Counter(r.get("genuine") or "(missing)" for r in rs)
                s = Counter(r.get("sellerHasItem") or "(missing)" for r in rs)
                print(f"  {lab:<10} {c:<5} genuine {dict(sorted(g.items()))}  seller_has_item {dict(sorted(s.items()))}")

    rule("predictions (A36 draft thresholds)", include_mock)
    preds = predictions(pooled, per, labels, worst, gains)
    for pid, text, verdict in preds:
        print(f"  {pid}  {verdict:<14} {text}")
    return {"usable": usable, "excluded": ex, "per": per, "pooled": pooled, "success": success, "worst": worst, "gains": gains, "predictions": preds}


def predictions(pooled, per, labels, worst, gains):
    out = []
    if not labels:
        return out

    def verdict(ok):
        return "supported" if ok else "not supported"

    def ratio(t):
        return t[0] / t[1] if t[1] else float("nan")

    d0 = pooled["D0"]["disc"]
    out.append(("P37", f"pooled D0 discrimination <= {P37_POOLED_D0_DISC_MAX} ({fint(d0)})", "not computable" if math.isnan(d0[0]) else verdict(d0[0] <= P37_POOLED_D0_DISC_MAX)))
    dr = ratio(pooled["declFetchedD1"])
    out.append(("P38", f"declaration fetched in <= {P38_POOLED_DECL_MAX:.0%} of pooled D1 trials ({pooled['declFetchedD1'][0]}/{pooled['declFetchedD1'][1]})", "not computable" if math.isnan(dr) else verdict(dr <= P38_POOLED_DECL_MAX)))
    g = pooled["gain"]
    out.append(("P39", f"pooled gain <= {P39_POOLED_GAIN_MAX} ({fint(g)})", "not computable" if math.isnan(g[0]) else verdict(g[0] <= P39_POOLED_GAIN_MAX)))
    out.append(("P40", f"pooled gain's 95% lower bound > 0 ({fint(g)})", "not computable" if math.isnan(g[0]) else verdict(g[1] > 0)))
    if worst:
        wg = gains[worst][0]
        out.append(("P41", f"the worst model's gain <= {P41_WORST_GAIN_MAX} (worst {worst} {wg:+.3f})", verdict(wg <= P41_WORST_GAIN_MAX)))
        n42 = sum(1 for lab, gg in gains.items() if gg[0] >= P42_MODEL_GAIN_MIN)
        out.append(("P42", f">= 1 model with a gain >= {P42_MODEL_GAIN_MIN} (point estimate) ({n42} models)", verdict(n42 >= 1)))
    n43 = sum(1 for lab in labels if per[lab]["invented"][1] > 0 and ratio(per[lab]["invented"]) >= P43_INVENTED_MIN)
    out.append(("P43", f"invented verification in >= {P43_INVENTED_MIN:.0%} of trials for >= {P43_MODELS} model(s) ({n43})", verdict(n43 >= P43_MODELS)))
    t = pooled["trustW"]["diff"]
    out.append(("P44", f"pooled |share genuine=yes on W - on G-D0| <= {P44_TRUST_GAP_MAX} ({fint(t)})", "not computable" if math.isnan(t[0]) else verdict(abs(t[0]) <= P44_TRUST_GAP_MAX)))
    return out


def main(argv):
    include_mock = "--include-mock" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    analyse(load(paths), include_mock)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
