"""
Study 7 passport FORMAT test (A40): does a minimal passport mention still win the recommendation?

    python -I analysis/analyze_study7b_live.py harness/results/study7b-live-*.jsonl
    python -I analysis/analyze_study7b_live.py --include-mock harness/results/mock-study7b-live-*.jsonl

Standard library only; interval methods from analyze_study6.py. Rows are scored by the harness
(run-study7r-live.ts --format-test). Torvlund's page never carries a passport. Oskvale's page is:
none (C0), the full block (CF, = A37's C1), one plain-text line + JSON-LD (CM). (The QR-only version was dropped by James before registration.)

Share(C) = trials recommending the OSKVALE product / trials with a valid answer ("neither" counts as not Oskvale).
PRIMARY, pooled three vendors (OpenAI, Kimi, Anthropic): CM effect = Share(CM) - Share(C0), Newcombe 95%.
Success: CM effect >= 0.20 with its lower bound > 0.
SECONDARY: CF - C0 (replication of A37's H1); CM - CF; "neither"; records and passport page
opened; reasons citing the passport; per model; Meta's two models separately.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_study6 import PINNED_PROVIDER, fint, fshare, load, newcombe, true_share  # noqa: E402

STUDY = "study7b-live-passport-format"
POOLED = ["anthropic", "kimi", "openai"]
SEPARATE = ["glimmer", "spark"]
CONDS = ["C0", "CF", "CM"]


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
        print(f"{label:<10} {c}  Oskvale recommended {fshare(*s[c]):<26} neither {neither}/{len(rs)}   record opened {fshare(*true_share(rs, 'oskvaleRecordOpened')):<22} passport page opened {fshare(*true_share(rs, 'oskvalePassportPageOpened')):<22} reasons cite passport {fshare(*true_share(rs, 'reasonsCitePassport'))}")
    for c in ("CF", "CM"):
        print(f"{label:<10} effect {c} - C0: {fint(newcombe(s[c][0], s[c][1], s['C0'][0], s['C0'][1]))}")
    print(f"{label:<10} effect CM - CF: {fint(newcombe(s['CM'][0], s['CM'][1], s['CF'][0], s['CF'][1]))}")
    return s


def main(argv):
    include_mock = "--include-mock" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    rows, ex = usable(load(paths), include_mock)
    tag = "MOCK DATA: " if include_mock else ""
    print(f"======== {tag}Study 7 format test data quality ========\nusable {len(rows)}; excluded {dict(ex)}")
    missing = Counter((r["label"], r["condition"]) for r in rows if r.get("chosenBrand") is None)
    for (lab, c), n in sorted(missing.items()):
        print(f"  missing recommendation (missing data): {lab} {c} {n}")
    three = [r for r in rows if r["label"] in POOLED]
    print(f"\n======== {tag}PRIMARY: pooled three vendors ========")
    s = block("POOLED-3", three)
    e = newcombe(s["CM"][0], s["CM"][1], s["C0"][0], s["C0"][1])
    print("success rule (CM effect >= 0.20, lower bound > 0):", "not computable" if e[0] != e[0] else ("MET" if e[0] >= 0.20 and e[1] > 0 else "NOT MET"))
    print(f"\n======== {tag}order: share recommending the FIRST link, pooled three ========")
    for c in CONDS:
        rs = [r for r in three if r["condition"] == c and r.get("recommendation") in ("1", "2")]
        print(f"  {c}: first link {fshare(sum(1 for r in rs if r['recommendation'] == '1'), len(rs))} of answers naming a product")
    print(f"\n======== {tag}SEPARATE: Meta (OpenRouter fetch) ========")
    block("META-2", [r for r in rows if r["label"] in SEPARATE])
    print(f"\n======== {tag}per model ========")
    for lab in sorted({r["label"] for r in rows}):
        block(lab, [r for r in rows if r["label"] == lab])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
