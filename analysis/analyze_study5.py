"""
Study 5 (interoperability unique to smart contracts) analysis.

    python -I analysis/analyze_study5.py harness/results/study5-*.jsonl
    python -I analysis/analyze_study5.py --self-test        (runs analysis/selftest_study5.py)

Standard library only (Wilson from analyze_native.py). Every outcome was computed per trial by
the harness (harness/src/study5-score.ts, rules fixed in harness/src/prompts-study5.ts before any
counted trial) and is read from the row; nothing is re-judged here.

Rules applied before any number:
  * only rows with study="study5-interop" and pilot false are read (smoke rows are excluded);
  * an errored trial (error not null, budget aborts and truncations included) is MISSING DATA:
    excluded from every denominator and counted per cell;
  * instrumentInvalid rows (a live passport read during the trial did not say "verified") are
    EXCLUDED and counted, never scored;
  * an OpenRouter row answered by any provider other than the pinned one is EXCLUDED and counted;
  * no parsable one-word follow-up (followUpWord null) is MISSING DATA for finalAligned and
    overTrust only, counted per cell.

Tables, each as k/n, %, Wilson 95% interval, per model x test x condition and pooled:
  fetch log  openedPassport, openedIndependentRecord (any explorer URL), openedRecordData
             (explorer JSON 200), openedRecordDataUrl, openedProvenance (Test 2)
  answer     finalAligned (follow-up word = truth: H yes, L no, W unsure; G genuine,
             F counterfeit, W2 unsure), overTrust (yes on L/W, genuine on F/W2)
  text       caughtLie on L (rule T1; its rate on H and W is the false-positive check),
             caughtCounterfeit on F (rule T2; G and W2 the false-positive check)
  words      the follow-up word distribution per cell
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_native import fmt, load, rule, wilson  # noqa: E402,F401

STUDY = "study5-interop"
T1 = ["H", "L", "W"]
T2 = ["G", "F", "W2"]
CONDS = T1 + T2
TRUTH = {"H": "yes", "L": "no", "W": "unsure", "G": "genuine", "F": "counterfeit", "W2": "unsure"}
OVER_TRUST_CONDS = ["L", "W", "F", "W2"]
PINNED_PROVIDER = {"meta/muse-glimmer-30b": "DeepInfra", "meta/muse-spark-1.3": "Meta"}

FETCH_OUTCOMES = ["openedPassport", "openedIndependentRecord", "openedRecordData", "openedRecordDataUrl", "openedProvenance"]


def test_of(c):
    return 1 if c in T1 else 2


def provider_fault(r):
    pin = PINNED_PROVIDER.get(r.get("modelRequested"))
    if not pin or not r.get("provider"):
        return False
    seen = [p for p in (r["provider"].get("providersSeen") or []) if p]
    return any(p != pin for p in seen)


def split(rows):
    """-> (usable rows, exclusion counts by reason and cell)."""
    ex = Counter()
    usable = []
    for r in rows:
        if r.get("_malformed"):
            ex[("malformed", "-", "-")] += 1
            continue
        if r.get("study") != STUDY or r.get("pilot"):
            ex[("other study or pilot", r.get("label", "-"), r.get("condition", "-"))] += 1
            continue
        cell = (r.get("label"), r.get("condition"))
        if r.get("error"):
            ex[("errored (missing data)",) + cell] += 1
            continue
        if r.get("instrumentInvalid"):
            ex[("instrument invalid",) + cell] += 1
            continue
        if provider_fault(r):
            ex[("OpenRouter provider not the pinned one",) + cell] += 1
            continue
        usable.append(r)
    return usable, ex


def kn(rows, key):
    vals = [r.get(key) for r in rows if r.get(key) is not None]
    return sum(1 for v in vals if v), len(vals)


def cell(rows, label, cond):
    return [r for r in rows if r.get("condition") == cond and (label is None or r.get("label") == label)]


def table(usable, labels, key, conds, title):
    rule(title)
    print(f"{'model':<12}" + "".join(f"{c:>34}" for c in conds))
    for lab in labels + [None]:
        line = f"{(lab or 'ALL'):<12}"
        for c in conds:
            k, n = kn(cell(usable, lab, c), key)
            line += f"{fmt(k, n):>34}"
        print(line)


def analyse(rows, out=print):
    usable, ex = split(rows)
    labels = sorted({r["label"] for r in usable})
    rule("Study 5 — data quality")
    print(f"rows read {len(rows)}, usable {len(usable)}")
    for (why, lab, c), n in sorted(ex.items()):
        print(f"  excluded: {why:<40} {lab:<10} {c:<4} {n}")
    missing = Counter((r["label"], r["condition"]) for r in usable if r.get("followUpWord") is None)
    for (lab, c), n in sorted(missing.items()):
        print(f"  no parsable follow-up word (missing for finalAligned/overTrust): {lab} {c} {n}")
    models = sorted({(r["label"], r["modelRequested"]) for r in usable})
    print("models: " + ", ".join(f"{l}={m}" for l, m in models))
    errs = Counter()
    for r in usable:
        if r.get("explorerServerErrors"):
            errs[(r["label"], r["condition"])] += 1
    for (lab, c), n in sorted(errs.items()):
        print(f"  explorer 5xx / network error in {n} trial(s): {lab} {c} (reported, not excluded)")
    provs = Counter((r["modelRequested"], p) for r in usable if r.get("provider") for p in (r["provider"].get("providersSeen") or []))
    for (m, p), n in sorted(provs.items()):
        print(f"  provider {m}: {p} in {n} trial(s)")

    for key in FETCH_OUTCOMES:
        conds = T2 if key == "openedProvenance" else CONDS
        table(usable, labels, key, conds, f"{key} (fetch log)")
    table(usable, labels, "finalAligned", CONDS, "finalAligned (follow-up word = truth)")
    table(usable, labels, "overTrust", OVER_TRUST_CONDS, "overTrust (yes on L/W, genuine on F/W2)")
    table(usable, labels, "caughtLie", T1, "caughtLie (rule T1; target L, H and W = false-positive check)")
    table(usable, labels, "caughtCounterfeit", T2, "caughtCounterfeit (rule T2; target F, G and W2 = false-positive check)")

    rule("follow-up words per cell")
    for lab in labels:
        for c in CONDS:
            words = Counter(r.get("followUpWord") or "(none)" for r in cell(usable, lab, c))
            if words:
                print(f"  {lab:<10} {c:<3} truth={TRUTH[c]:<12} " + ", ".join(f"{w}:{n}" for w, n in sorted(words.items())))
    return {"usable": usable, "excluded": ex, "labels": labels}


def main(argv):
    if "--self-test" in argv:
        import selftest_study5  # noqa: F401  (its main() runs the synthetic-data checks)
        return selftest_study5.main()
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    analyse(load(paths))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
