"""
Study 7 LIVE, recommendation version (A37): does the product with a genuine passport win the recommendation?

    python -I analysis/analyze_study7r_live.py harness/results/study7r-live-*.jsonl
    python -I analysis/analyze_study7r_live.py --include-mock harness/results/mock-study7r-live-*.jsonl

Standard library only; interval methods from analyze_study6.py. Rows are scored by the harness
(run-study7r-live.ts: recommendation rule R7, records opened from the access log and the vendor's record).

Share(C) = trials recommending the OSKVALE product / trials with a valid answer (1, 2 or neither; "neither"
counts as not Oskvale). Oskvale's page is: none in C0, genuine in C1 and C2. Torvlund's: none in C0 and C1,
non-genuine in C2.
PRIMARY, pooled three vendors (OpenAI, Kimi, Anthropic): H1 effect = Share(C1) - Share(C0), Newcombe 95%.
Success: H1 effect >= 0.20 with its lower bound > 0.
SECONDARY: H2 effect = Share(C2) - Share(C0); "neither" rates; order (first vs second link); records opened;
reasons citing the passport; per model; Meta's two models separately.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_study6 import PINNED_PROVIDER, fint, fshare, load, newcombe, true_share  # noqa: E402

STUDY = "study7r-live-recommendation"
POOLED = ["anthropic", "kimi", "openai"]
SEPARATE = ["glimmer", "spark"]
CONDS = ["C0", "C1", "C2"]


def usable(rows, include_mock):
    ex, out = Counter(), []
    for r in rows:
        if r.get("_malformed") or r.get("study") != STUDY:
            ex["other or malformed"] += 1
        elif r.get("pilot"):
            ex["pilot"] += 1
        elif r.get("mock") and not include_mock:
            ex["mock"] += 1
        elif r.get("error"):
            ex[f"errored {r.get('label')} {r.get('condition')}"] += 1
        elif PINNED_PROVIDER.get(r.get("modelRequested")) and any(p and p != PINNED_PROVIDER[r["modelRequested"]] for p in (r.get("provider") or [])):
            ex["provider fault"] += 1
        else:
            out.append(r)
    return out, ex


def share(rows, cond):
    rs = [r for r in rows if r["condition"] == cond and r.get("chosenBrand") is not None]
    return sum(1 for r in rs if r["chosenBrand"] == "oskvale"), len(rs)


def block(label, rows):
    s = {c: share(rows, c) for c in CONDS}
    for c in CONDS:
        rs = [r for r in rows if r["condition"] == c]
        neither = sum(1 for r in rs if r.get("chosenBrand") == "neither")
        print(f"{label:<10} {c}  Oskvale recommended {fshare(*s[c]):<26} neither {neither}/{len(rs)}   record opened: Oskvale {fshare(*true_share(rs, 'oskvaleRecordOpened')):<22} Torvlund {fshare(*true_share(rs, 'torvlundRecordOpened')):<22} reasons cite passport {fshare(*true_share(rs, 'reasonsCitePassport'))}")
    for c in ("C1", "C2"):
        print(f"{label:<10} effect {c} - C0: {fint(newcombe(s[c][0], s[c][1], s['C0'][0], s['C0'][1]))}")
    return s


def main(argv):
    include_mock = "--include-mock" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    rows, ex = usable(load(paths), include_mock)
    tag = "MOCK DATA: " if include_mock else ""
    print(f"======== {tag}Study 7 (recommendation) data quality ========\nusable {len(rows)}; excluded {dict(ex)}")
    missing = Counter((r["label"], r["condition"]) for r in rows if r.get("chosenBrand") is None)
    for (lab, c), n in sorted(missing.items()):
        print(f"  missing recommendation (missing data): {lab} {c} {n}")
    three = [r for r in rows if r["label"] in POOLED]
    print(f"\n======== {tag}PRIMARY: pooled three vendors ========")
    s = block("POOLED-3", three)
    e = newcombe(s["C1"][0], s["C1"][1], s["C0"][0], s["C0"][1])
    print("success rule (H1 effect >= 0.20, lower bound > 0):", "not computable" if e[0] != e[0] else ("MET" if e[0] >= 0.20 and e[1] > 0 else "NOT MET"))
    print(f"\n======== {tag}order: share recommending the FIRST link, pooled three ========")
    for c in CONDS:
        rs = [r for r in three if r["condition"] == c and r.get("recommendation") in ("1", "2", "neither")]
        print(f"  {c}: first link {fshare(sum(1 for r in rs if r['recommendation'] == '1'), len(rs))}")
    print(f"\n======== {tag}SEPARATE: Meta (OpenRouter fetch) ========")
    block("META-2", [r for r in rows if r["label"] in SEPARATE])
    print(f"\n======== {tag}per model ========")
    for lab in sorted({r["label"] for r in rows}):
        block(lab, [r for r in rows if r["label"] == lab])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
