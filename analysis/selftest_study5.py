"""
Self-test for analyze_study5.py on SYNTHETIC rows (a temporary file, never harness/results/).

    python -I analysis/selftest_study5.py        (or analyze_study5.py --self-test)

Two models (one OpenRouter), all six conditions, plus rows that must be excluded (errored,
instrument invalid, pilot, another study, an OpenRouter row answered by an unpinned provider) and
rows with no follow-up word. Every count is asserted against the count built into the data, and
the Wilson interval against hand-computed values. Exits 0 only if every assertion holds.
"""
import contextlib
import io
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_study5 as a5  # noqa: E402
from analyze_native import load, wilson  # noqa: E402

FAILS = []


def check(cond, what):
    if not cond:
        FAILS.append(what)
    print(("ok   " if cond else "FAIL ") + what)


def row(label, cond, **kw):
    r = {
        "study": a5.STUDY, "pilot": False, "label": label, "condition": cond, "test": a5.test_of(cond),
        "modelRequested": "meta/muse-glimmer-30b" if label == "glimmer" else "gpt-5.4-mini",
        "provider": {"providersSeen": ["DeepInfra"]} if label == "glimmer" else None,
        "error": None, "instrumentInvalid": False, "followUpWord": a5.TRUTH[cond],
        "finalAligned": True, "overTrust": False if cond in a5.OVER_TRUST_CONDS else None,
        "openedPassport": True, "openedIndependentRecord": False, "openedRecordData": False, "openedRecordDataUrl": False,
        "openedProvenance": (False if a5.test_of(cond) == 2 else None),
        "caughtLie": (False if a5.test_of(cond) == 1 else None), "caughtCounterfeit": (False if a5.test_of(cond) == 2 else None),
    }
    r.update(kw)
    return r


def main():
    rows = []
    for lab in ["openai", "glimmer"]:
        for c in a5.CONDS:
            for i in range(5):
                rows.append(row(lab, c))
    # L, openai: 2 of 5 open the explorer, 1 catches the lie, 1 over-trusts (says yes)
    L = [r for r in rows if r["label"] == "openai" and r["condition"] == "L"]
    L[0].update(openedIndependentRecord=True, openedRecordData=True, openedRecordDataUrl=True, caughtLie=True)
    L[1].update(openedIndependentRecord=True)
    L[2].update(followUpWord="yes", finalAligned=False, overTrust=True)
    # F, glimmer: 3 of 5 open provenance; 1 has no parsable word
    F = [r for r in rows if r["label"] == "glimmer" and r["condition"] == "F"]
    for r in F[:3]:
        r.update(openedIndependentRecord=True, openedProvenance=True)
    F[4].update(followUpWord=None, finalAligned=None, overTrust=None)
    # exclusions
    rows.append(row("openai", "H", error="OpenAI 500"))
    rows.append(row("openai", "G", instrumentInvalid=True))
    rows.append(row("openai", "W", pilot=True))
    rows.append(row("openai", "W", study="study4-shopping"))
    rows.append(row("glimmer", "W2", provider={"providersSeen": ["Together"]}))
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "s5.jsonl")
        with open(p, "w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r) + "\n")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            res = a5.analyse(load([p]))
    u = res["usable"]
    check(len(u) == 60, f"usable rows = 60 (got {len(u)})")
    ex = res["excluded"]
    check(sum(n for (w, _, _), n in ex.items() if w.startswith("errored")) == 1, "one errored row excluded")
    check(sum(n for (w, _, _), n in ex.items() if w == "instrument invalid") == 1, "one instrument-invalid row excluded")
    check(sum(n for (w, _, _), n in ex.items() if w == "other study or pilot") == 2, "pilot + other study excluded")
    check(sum(n for (w, _, _), n in ex.items() if w.startswith("OpenRouter provider")) == 1, "unpinned provider excluded")
    Lc = a5.cell(u, "openai", "L")
    check(a5.kn(Lc, "openedIndependentRecord") == (2, 5), "L openai explorer 2/5")
    check(a5.kn(Lc, "openedRecordDataUrl") == (1, 5), "L openai record data url 1/5")
    check(a5.kn(Lc, "caughtLie") == (1, 5), "L openai caughtLie 1/5")
    check(a5.kn(Lc, "overTrust") == (1, 5), "L openai overTrust 1/5")
    check(a5.kn(Lc, "finalAligned") == (4, 5), "L openai aligned 4/5")
    Fc = a5.cell(u, "glimmer", "F")
    check(a5.kn(Fc, "openedProvenance") == (3, 5), "F glimmer provenance 3/5")
    check(a5.kn(Fc, "finalAligned") == (4, 4), "F glimmer aligned 4/4 (one missing word not in n)")
    check(a5.kn(a5.cell(u, None, "H"), "openedIndependentRecord") == (0, 10), "H pooled explorer 0/10")
    check(a5.kn(a5.cell(u, "openai", "H"), "overTrust") == (0, 0), "overTrust not defined on H")
    lo, hi = wilson(1, 5)
    check(abs(lo - 0.0362) < 1e-3 and abs(hi - 0.6245) < 1e-3, f"Wilson 1/5 = [3.6%, 62.4%] (got {lo:.4f}, {hi:.4f})")
    lo, hi = wilson(0, 10)
    check(lo == 0.0 and abs(hi - 0.2775) < 1e-3, f"Wilson 0/10 upper 27.8% (got {hi:.4f})")
    out = buf.getvalue()
    check("openedProvenance (fetch log)" in out and "caughtCounterfeit" in out, "all tables printed")
    print(f"\n{'ALL PASS' if not FAILS else f'{len(FAILS)} FAILED'}")
    return 0 if not FAILS else 1


if __name__ == "__main__":
    sys.exit(main())
