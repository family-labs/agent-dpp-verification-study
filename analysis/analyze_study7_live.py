"""
Study 7 LIVE (DRAFT, amendment A37): which page format lets AI models finish the check?

    python -I analysis/analyze_study7_live.py harness/results/study7-live-*.jsonl
    python -I analysis/analyze_study7_live.py --include-mock harness/results/mock-study7-live-*.jsonl

Standard library only; interval methods from analyze_study6.py (imported, not edited). Rows are scored
by the harness (study6-score.ts on the live evidence log, plus recordOpened); nothing is re-judged here.

Formats (the site phase of each block): F0 = the Study 6 D1 page (control); F1 = + one "Independent
record" line linking the item's record on the independent record service; F3 = F1 + the standard
vocabulary (EU Digital Product Passport title, regulation property, GS1 Digital Link @id, JSON-LD
alternate link) + /llms.txt. Conditions in every format: G (the brand's shop) and F (the copycat).

PRIMARY: POOLED over the three vendors' own tools (OpenAI, Kimi, Anthropic): discrimination per format
= share seller_has_item = "yes" on G minus on F (Newcombe); gain F1 - F0 (MOVER). Success: gain >= 0.20
with its 95% lower bound > 0.
SECONDARY: gain F3 - F0 and F3 - F1; the record opened per format; per model; Meta separately.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_study6 import PINNED_PROVIDER, fint, fshare, load, mover_diff, newcombe, true_share, yes_share  # noqa: E402

STUDY = "study7-live-page-formats"
FORMATS = ["S7F0", "S7F1", "S7F3"]
POOLED = ["anthropic", "kimi", "openai"]
SEPARATE = ["glimmer", "spark"]
SUCCESS_GAIN = 0.20


def usable(rows, include_mock):
    ex = Counter()
    out = []
    for r in rows:
        if r.get("_malformed") or r.get("study") != STUDY:
            ex["other or malformed"] += 1
        elif r.get("pilot"):
            ex["pilot"] += 1
        elif r.get("mock") and not include_mock:
            ex["mock"] += 1
        elif r.get("error"):
            ex[f"errored {r.get('label')} {r.get('block')}"] += 1
        elif PINNED_PROVIDER.get(r.get("modelRequested")) and any(p and p != PINNED_PROVIDER[r["modelRequested"]] for p in (r.get("provider") or [])):
            ex["provider fault"] += 1
        elif any(x.get("phase") != r.get("block") for x in (r.get("siteRows") or [])):
            ex["site in another phase"] += 1
        else:
            out.append(r)
    return out, ex


def disc(rows, fmt):
    g = yes_share([r for r in rows if r["block"] == fmt and r["condition"].startswith("G")], "sellerHasItem")
    f = yes_share([r for r in rows if r["block"] == fmt and r["condition"].startswith("F")], "sellerHasItem")
    return g, f, newcombe(g[0], g[1], f[0], f[1])


def table(label, rows):
    d = {fmt: disc(rows, fmt) for fmt in FORMATS}
    for fmt in FORMATS:
        g, f, nd = d[fmt]
        rec = true_share([r for r in rows if r["block"] == fmt], "recordOpened")
        print(f"{label:<10} {fmt:<5} G yes {fshare(*g):<24} F yes {fshare(*f):<24} disc {fint(nd):<26} record opened {fshare(*rec)}")
    for a, b in (("S7F1", "S7F0"), ("S7F3", "S7F0"), ("S7F3", "S7F1")):
        print(f"{label:<10} gain {a[2:]}-{b[2:]}: {fint(mover_diff(d[a][2], d[b][2]))}")
    return d


def main(argv):
    include_mock = "--include-mock" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    rows, ex = usable(load(paths), include_mock)
    tag = "MOCK DATA: " if include_mock else ""
    print(f"======== {tag}Study 7 data quality ========\nusable {len(rows)}; excluded {dict(ex)}")
    three = [r for r in rows if r["label"] in POOLED]
    print(f"\n======== {tag}PRIMARY: pooled three vendors ========")
    d = table("POOLED-3", three)
    g = mover_diff(d["S7F1"][2], d["S7F0"][2])
    print("success rule (gain F1-F0 >= 0.20, lower bound > 0):", "not computable" if g[0] != g[0] else ("MET" if g[0] >= SUCCESS_GAIN and g[1] > 0 else "NOT MET"))
    print(f"\n======== {tag}SEPARATE: Meta (OpenRouter fetch) ========")
    table("META-2", [r for r in rows if r["label"] in SEPARATE])
    print(f"\n======== {tag}per model ========")
    for lab in sorted({r["label"] for r in rows}):
        table(lab, [r for r in rows if r["label"] == lab])
    print(f"\n======== {tag}answer distributions ========")
    for lab in sorted({r["label"] for r in rows}):
        for fmt in FORMATS:
            for c in ("G", "F"):
                rs = [r for r in rows if r["label"] == lab and r["block"] == fmt and r["condition"].startswith(c)]
                if rs:
                    print(f"  {lab:<10} {fmt} {c} seller_has_item {dict(Counter(r.get('sellerHasItem') or '(missing)' for r in rs))}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
