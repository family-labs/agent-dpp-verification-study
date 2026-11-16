"""
Study 6 LIVE (each vendor's own web tool on the live sites) analysis.

    python -I analysis/analyze_study6_live.py harness/results/study6-live-*.jsonl
    python -I analysis/analyze_study6_live.py --include-mock harness/results/mock-study6-live-*.jsonl   (pipeline check only)

Standard library only. The interval methods and the per-model measures are the text-page Study 6
analysis's (analyze_study6.py, imported, not edited). Every per-trial outcome was computed by the
harness (harness/src/study6-score.ts on the live evidence log, harness/src/study6-site.ts) and is
read from the row; nothing is re-judged here.

Rules applied before any number (A36):
  * only rows with study = "study6-live-brand-declaration" are read; pilot and mock rows are
    excluded and counted (mock rows only with --include-mock, then every table is headed MOCK);
  * DRIFT rows (block "drift": W repeated after D1) never enter the primary or secondary measures;
    they are compared with the first W block only;
  * errored trials are missing data; an OpenRouter row answered by another provider is excluded;
    a missing report value is missing data for that key only.

PRIMARY: POOLED over the THREE vendors' own tools that read the shops at the tool check
(gpt-5.4-mini, kimi-k2.6, claude-haiku-5-5) and the three products: share seller_has_item = "yes" on G and F per arm,
discrimination per arm (Newcombe), gain = disc(D1) - disc(D0) (MOVER). Success: gain >= 0.20 and
its 95% lower bound > 0.
SEPARATE: the two Meta models with OpenRouter's fetch tool, never pooled with the three.
POSTPONED: Gemini with its own tools, only if its block runs later (James, 23 Oct 2026: no Gemini trials
until its own URL tool reads the new domains).
SECONDARY (descriptive): per model; the worst of the three; evidence measures (declaration fetched or
attempted, explorer JSON, item record, the given page fetched live, vendor-only fetches of our hosts,
user agents seen, searches); trust in W against G-D0; the drift check.
"""
import math
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_study6 import (  # noqa: E402
    PINNED_PROVIDER,
    fint,
    fshare,
    load,
    model_measures,
    newcombe,
    of,
    true_share,
    yes_share,
)

STUDY = "study6-live-brand-declaration"
CONDS = ["G-D0", "F-D0", "G-D1", "F-D1", "W"]
PRODUCTS = ["lmt", "industrial", "stationary"]
POOLED = ["anthropic", "kimi", "openai"]
SEPARATE = ["glimmer", "spark"]
POSTPONED = ["gemini"]  # Gemini with its own tools: a later block, reported on its own

# Prediction thresholds (A36 section 5)
P37_POOLED_D0_DISC_MAX = 0.20
P38_POOLED_DECL_MAX = 0.20
P39_POOLED_GAIN_MAX = 0.10
P41_WORST_GAIN_MAX = 0.0
P42_MODEL_GAIN_MIN = 0.25
P43_INVENTED_MIN = 0.10
P44_TRUST_GAP_MAX = 0.20
P46_LIVE_MIN = 0.90
P47_DRIFT_MAX = 0.15
SUCCESS_POOLED_GAIN = 0.20


def provider_fault(r):
    pin = PINNED_PROVIDER.get(r.get("modelRequested"))
    return bool(pin) and any(p and p != pin for p in (r.get("provider") or []))


BLOCK_PHASE = {"W": "W", "drift": "W", "D0": "D0", "D1": "D1"}


def phase_fault(r):
    want = BLOCK_PHASE.get(r.get("block"))
    return bool(want) and any(x.get("phase") != want for x in (r.get("siteRows") or []))


def split(rows, include_mock=False):
    ex = Counter()
    main, drift = [], []
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
        elif phase_fault(r):
            ex[("site in another phase during the trial",) + cell] += 1
        elif r.get("drift"):
            drift.append(r)
        else:
            main.append(r)
    return main, drift, ex


def rule(t, mock):
    print(f"\n{'=' * 8} {'MOCK DATA: ' if mock else ''}{t} {'=' * 8}")


def table(rows_of):
    print(f"{'model':<10} {'arm':<4} {'G yes':<26} {'F yes':<26} {'discrimination [Newcombe 95%]':<32}")
    for lab, m in rows_of:
        for a in ("D0", "D1"):
            print(f"{lab:<10} {a:<4} {fshare(*m[a]['G']):<26} {fshare(*m[a]['F']):<26} {fint(m[a]['disc'])}")
        print(f"{lab:<10} gain {'':<53} {fint(m['gain'])}   (MOVER 95%)")


def analyse(rows, include_mock=False):
    main, drift, ex = split(rows, include_mock)
    four = [r for r in main if r.get("label") in POOLED]
    meta = [r for r in main if r.get("label") in ("glimmer", "spark")]
    labels = sorted({r["label"] for r in main})
    rule("Study 6 LIVE data quality", include_mock)
    print(f"rows read {len(rows)}, usable {len(main)} (+ {len(drift)} drift-check rows)")
    for (why, lab, c), n in sorted(ex.items()):
        print(f"  excluded: {why:<40} {lab:<10} {c:<5} {n}")
    miss = Counter((r["label"], r["condition"], k) for r in main for k in ("sellerHasItem", "genuine") if r.get(k) is None)
    for (lab, c, k), n in sorted(miss.items()):
        print(f"  missing report value (missing data for {k} only): {lab} {c} {n}")
    cells = Counter((r.get("product"), r.get("condition")) for r in four)
    print("usable trials of the three vendors per product x condition: " + ", ".join(f"{p}/{c}={n}" for (p, c), n in sorted(cells.items())))

    pooled = model_measures(four)
    per = {lab: model_measures(main, lab) for lab in labels}

    rule("PRIMARY (POOLED over the three vendors' own tools): seller_has_item = yes, G minus F, per arm; gain = D1 - D0", include_mock)
    table([("POOLED-3", pooled)])
    pg = pooled["gain"]
    success = (not math.isnan(pg[0])) and pg[0] >= SUCCESS_POOLED_GAIN and pg[1] > 0
    print("success rule: not computable" if math.isnan(pg[0]) else f"success rule (pooled gain >= {SUCCESS_POOLED_GAIN} and its 95% lower bound > 0): {'MET' if success else 'NOT MET'}")

    clean = [r for r in four if not r.get("vendorOnlySiteFetches") and not r.get("taggedOutsideWindow")]
    sg = model_measures(clean)["gain"]
    print(f"sensitivity: without trials with a vendor-only fetch of our domains or a tagged row outside the window ({len(four) - len(clean)} removed): gain {fint(sg)}")

    rule("SEPARATE: Meta's models with OpenRouter's fetch tool; Gemini's own tool if its postponed block ran (never pooled)", include_mock)
    for lab in POSTPONED:
        if lab in per:
            table([(lab, per[lab])])
    if meta:
        table([("META-2", model_measures(meta))] + [(lab, per[lab]) for lab in SEPARATE if lab in per])
    else:
        print("no Meta rows")

    rule("SECONDARY (descriptive): each of the three pooled vendors", include_mock)
    table([(lab, per[lab]) for lab in POOLED if lab in per])
    gains = {lab: per[lab]["gain"] for lab in POOLED if lab in per and not math.isnan(per[lab]["gain"][0])}
    worst = min(gains, key=lambda k: gains[k][0]) if gains else None
    print(f"\nworst of the three: {worst}  gain {fint(gains[worst])}" if worst else "\nworst of the three: not computable")

    rule("by product (descriptive, the three vendors)", include_mock)
    for p in PRODUCTS:
        m = model_measures(four, product=p)
        print(f"{p:<12} D0 {fint(m['D0']['disc']):<28} D1 {fint(m['D1']['disc']):<28} gain {fint(m['gain'])}")

    rule("SECONDARY: what each tool actually opened (access log + the vendor's own record)", include_mock)
    print(f"{'model':<10} {'page fetched live':<24} {'decl. fetched (D1)':<24} {'decl. tried (D0+W)':<24} {'explorer JSON':<24} {'item record':<24} {'invented':<24}")
    for lab in labels + ["POOLED-3"]:
        rs = four if lab == "POOLED-3" else of(main, lab)
        d1 = of(rs, cond="G-D1") + of(rs, cond="F-D1")
        nod = of(rs, cond="G-D0") + of(rs, cond="F-D0") + of(rs, cond="W")
        print(f"{lab:<10} {fshare(*true_share(rs, 'givenPageFetchedLive')):<24} {fshare(*true_share(d1, 'declarationFetched')):<24} {fshare(*true_share(nod, 'declarationAttempted')):<24} {fshare(*true_share(rs, 'explorerJsonFetched')):<24} {fshare(*true_share(rs, 'explorerItemFetched')):<24} {fshare(*true_share(rs, 'inventedVerification'))}")
    print("\nuser agents seen on our hosts, per model:")
    for lab in labels:
        uas = Counter(ua for r in of(main, lab) for ua in (r.get("siteUserAgents") or []))
        print(f"  {lab:<10} {dict(uas.most_common(4))}")
    print("\nvendor-only fetches of our hosts (no access-log row: vendor cache or out-of-window), and searches, per model:")
    for lab in labels:
        rs = of(main, lab)
        vo = sum(1 for r in rs if r.get("vendorOnlySiteFetches"))
        srch = sum(len(r.get("searches") or []) for r in rs)
        print(f"  {lab:<10} trials with vendor-only fetches {vo}/{len(rs)}; searches {srch}")

    rule("SECONDARY: trust in W against G-D0 (genuine = yes)", include_mock)
    for lab in labels + ["POOLED-3"]:
        m = pooled if lab == "POOLED-3" else per[lab]
        t = m["trustW"]
        print(f"{lab:<10} W {fshare(*t['W']):<26} G-D0 {fshare(*t['G']):<26} W - G {fint(t['diff'])}")

    rule("DRIFT CHECK: the first W block against W repeated after D1 (the three vendors)", include_mock)
    w1 = of(four, cond="W")
    w2 = [r for r in drift if r.get("label") in POOLED]
    drift_diff = (float("nan"), float("nan"), float("nan"))
    for key in ("genuine", "sellerHasItem"):
        k1, n1 = yes_share(w1, key)
        k2, n2 = yes_share(w2, key)
        d = newcombe(k2, n2, k1, n1)
        if key == "genuine":
            drift_diff = d
        print(f"  {key:<15} first W {fshare(k1, n1):<26} drift W {fshare(k2, n2):<26} drift - first {fint(d)}")

    rule("answer distributions per model x condition", include_mock)
    for lab in labels:
        for c in CONDS:
            rs = of(main, lab, c)
            if rs:
                g = Counter(r.get("genuine") or "(missing)" for r in rs)
                s = Counter(r.get("sellerHasItem") or "(missing)" for r in rs)
                print(f"  {lab:<10} {c:<5} genuine {dict(sorted(g.items()))}  seller_has_item {dict(sorted(s.items()))}")

    rule("predictions (A36)", include_mock)
    preds = predictions(pooled, per, gains, worst, main, drift_diff)
    for pid, text, verdict in preds:
        print(f"  {pid}  {verdict:<14} {text}")
    return {"main": main, "drift": drift, "excluded": ex, "pooled": pooled, "per": per, "success": success, "worst": worst, "predictions": preds}


def predictions(pooled, per, gains, worst, main, drift_diff):
    def v(ok):
        return "supported" if ok else "not supported"

    def nc(x):
        return isinstance(x, float) and math.isnan(x)

    out = []
    d0 = pooled["D0"]["disc"]
    out.append(("P37", f"pooled D0 discrimination <= {P37_POOLED_D0_DISC_MAX} ({fint(d0)})", "not computable" if nc(d0[0]) else v(d0[0] <= P37_POOLED_D0_DISC_MAX)))
    k, n = pooled["declFetchedD1"]
    out.append(("P38", f"declaration fetched in <= {P38_POOLED_DECL_MAX:.0%} of pooled D1 trials ({k}/{n})", "not computable" if n == 0 else v(k / n <= P38_POOLED_DECL_MAX)))
    g = pooled["gain"]
    out.append(("P39", f"pooled gain <= {P39_POOLED_GAIN_MAX} ({fint(g)})", "not computable" if nc(g[0]) else v(g[0] <= P39_POOLED_GAIN_MAX)))
    out.append(("P40", f"pooled gain's 95% lower bound > 0 ({fint(g)})", "not computable" if nc(g[0]) else v(g[1] > 0)))
    if worst:
        out.append(("P41", f"the worst of the three vendors' gain <= {P41_WORST_GAIN_MAX} ({worst} {gains[worst][0]:+.3f})", v(gains[worst][0] <= P41_WORST_GAIN_MAX)))
        n42 = sum(1 for gg in gains.values() if gg[0] >= P42_MODEL_GAIN_MIN)
        out.append(("P42", f">= 1 of the three with a gain >= {P42_MODEL_GAIN_MIN} ({n42})", v(n42 >= 1)))
    n43 = sum(1 for lab in POOLED if lab in per and per[lab]["invented"][1] and per[lab]["invented"][0] / per[lab]["invented"][1] >= P43_INVENTED_MIN)
    out.append(("P43", f"invented verification in >= {P43_INVENTED_MIN:.0%} of trials for >= 1 of the three ({n43})", v(n43 >= 1)))
    t = pooled["trustW"]["diff"]
    out.append(("P44", f"pooled |genuine=yes on W - on G-D0| <= {P44_TRUST_GAP_MAX} ({fint(t)})", "not computable" if nc(t[0]) else v(abs(t[0]) <= P44_TRUST_GAP_MAX)))
    gd1 = of(main, "gemini", "G-D1") + of(main, "gemini", "F-D1")
    k45, n45 = true_share(gd1, "declarationFetched")
    out.append(("P45", f"if the postponed Gemini own-tool block runs, Gemini opens the declaration in <= 20% of its D1 trials ({k45}/{n45})", "not run" if n45 == 0 else v(k45 / n45 <= 0.20)))
    low = [lab for lab in per if lab not in POSTPONED and (lambda kn: kn[1] and kn[0] / kn[1] < P46_LIVE_MIN)(true_share(of(main, lab), "givenPageFetchedLive"))]
    out.append(("P46", f"every model's tool fetched the given page live in >= {P46_LIVE_MIN:.0%} of its trials (below: {', '.join(low) or 'none'})", v(not low)))
    out.append(("P47", f"drift: |genuine=yes on drift W - on first W| <= {P47_DRIFT_MAX} ({fint(drift_diff)})", "not computable" if nc(drift_diff[0]) else v(abs(drift_diff[0]) <= P47_DRIFT_MAX)))
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
