"""
Self-test for analyze_study4.py on SYNTHETIC data (a temporary directory, never harness/results/).

    .venv/Scripts/python.exe -I analysis/selftest_study4.py

A deterministic file with two models and conditions P, T, U, N, plus rows that must be excluded
(instrument_invalid, errored, smoke/pilot, another study) and rows with no valid pick. Every
count the analysis returns is asserted against the count built into the data, including: a
fetch of dpp.passport_url counts as opening the passport; a checker fetch answered from a
stored page does not count as reaching it; N has no passport outcomes; a pick matched by an
unknown product id is no pick; the primary P-N and P-T differences equal newcombe_diff on the
built-in counts; rule C fires on the flagged T texts and on nothing else; the regression runs.
Exits 0 only if every assertion holds.
"""
import contextlib
import io
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_study4 as a4  # noqa: E402
from analyze_native import newcombe_diff  # noqa: E402

FAILS = []


def check(cond, what):
    if not cond:
        FAILS.append(what)


VID = {"P": "8ed4bcee-c922-45d4-aeea-94c70e806dc7", "T": "e1402ddf-f5a8-454c-b375-e6e330691c84", "U": "be54f83c-5057-443c-97bc-ac58fb3121d5"}
GT = {"P": "04012346627106", "T": "04012346845609", "U": "04012346283401"}
FLAG_C = "The checker returned invalid with reason data_changed_since_anchoring, so I would avoid the Tarnvale."
NEUTRAL = "All four are similar; the Tarnvale 5000 is a balanced choice."
OTHER = ["halvesta-hb5200", "corrandel-ps5000", "wexmoor-w5"]


def dpp(c):
    if c == "N":
        return None
    v = VID[c]
    return {"upi": f"https://ugpdpp.xyz/01/{GT[c]}",
            "passport_url": f"https://app.universalgoods.xyz/api/server/api/passport/{v}?kind=variant",
            "verification_url": f"https://app.universalgoods.xyz/api/server/api/passport/{v}/verify",
            "granularity": "model"}


def fetch(url, outcome="fetched", status=200):
    return {"requestedUrl": url, "finalUrl": url, "outcome": outcome, "status": status}


def row(model, c, i, *, pick, opened=None, checker=None, text=NEUTRAL, searched=True, position=1,
        study="study4-shopping", pilot=False, error=None, invalid=False):
    d = dpp(c)
    fetches = []
    if opened == "upi":
        fetches.append(fetch(d["upi"]))
    elif opened == "pp":
        fetches.append(fetch(d["passport_url"] + "&x=1"))
    if checker == "live":
        fetches.append(fetch(d["verification_url"]))
    elif checker == "stored":
        fetches.append(fetch(d["verification_url"], outcome="stored_page"))
    order = ["tarnvale-5000"] + OTHER
    order = order[1:position] + ["tarnvale-5000"] + order[position:] if position > 1 else order
    return {
        "study": study, "pilot": pilot, "modelRequested": model, "condition": c, "runIndex": i,
        "ours": {"dpp": d}, "fetches": fetches, "responseText": text, "followUpText": pick or "no idea",
        "pickId": pick, "pickMatchedBy": "id" if pick else None, "order": order, "oursPosition": position,
        "pickPosition": (order.index(pick) + 1) if pick in order else None,
        "searches": [{"initiator": "platform", "query": "Help me decide which battery to buy for backup power at home."}]
                    + ([{"initiator": "model", "query": "battery"}] if searched else []),
        "toolCalls": [{"name": "search_products"}] if searched else [],
        "mentionedPassport": "passport" in text.lower(), "oursMentioned": "tarnvale" in text.lower(),
        "responseLanguage": "en", "modelIdsReturned": [model],
        "instrumentInvalid": invalid, "instrumentInvalidReasons": ["x"] if invalid else [], "error": error,
    }


def build():
    rows = []
    # M1: P 8/10 ours, N 3/10, T 1/9 valid (+1 no pick), U 5/10.
    plan = {"P": (10, 8, 0), "N": (10, 3, 0), "T": (10, 1, 1), "U": (10, 5, 0)}
    for c, (n, k, nopick) in plan.items():
        for i in range(n):
            if i < nopick:
                p = None
            elif i < nopick + k:
                p = "tarnvale-5000"
            else:
                p = OTHER[i % 3]
            opened = checker = None
            text = NEUTRAL
            if c == "P":
                opened = "upi" if i < 4 else ("pp" if i < 6 else None)
                checker = "live" if i < 3 else ("stored" if i == 3 else None)
            if c == "T":
                opened = "upi" if i < 7 else None
                checker = "live" if i < 7 else None
                text = FLAG_C if i < 6 else NEUTRAL
            rows.append(row("m1", c, i, pick=p, opened=opened, checker=checker, text=text, position=1 + i % 4))
    # M2: half its trials never search and give no pick; P 4/5 valid ours, N 1/5, T 0/5, U 2/5.
    plan2 = {"P": 4, "N": 1, "T": 0, "U": 2}
    for c, k in plan2.items():
        for i in range(10):
            if i >= 5:
                rows.append(row("m2", c, i, pick=None, searched=False, position=1 + i % 4))
            else:
                rows.append(row("m2", c, i, pick="tarnvale-5000" if i < k else OTHER[i % 3], position=1 + i % 4))
    # An unknown id is no pick.
    rows.append(row("m2", "U", 99, pick="ecoflow-delta-pro-3", searched=False))
    # Excluded rows.
    rows.append(row("m1", "P", 50, pick="tarnvale-5000", invalid=True))
    rows.append(row("m1", "P", 51, pick="tarnvale-5000", error="boom"))
    rows.append(row("m1", "P", 52, pick="tarnvale-5000", pilot=True))
    rows.append(row("m1", "P", 53, pick="tarnvale-5000", study="study3-ucp"))
    return rows


def main():
    rows = build()
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "synthetic.jsonl")
        with open(p, "w", encoding="utf-8") as fh:
            for r in rows:
                fh.write(json.dumps(r) + "\n")
            fh.write("{not json\n")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            out = a4.analyse(a4.load([p]))
    text = buf.getvalue()
    usable = out["usable"]
    check(len(usable) == 81, f"usable rows {len(usable)} != 81")
    check("malformed: 1" in text, "malformed row not counted")
    check("instrument_invalid (excluded): 1" in text and "errored (missing): 1" in text, "exclusion counts wrong")
    check("NO valid pick (missing for the selection outcome): 22" in text, "no-pick count wrong")
    check("WITHOUT the platform search (instrument fault, listed): 0" in text, "platform-search check wrong")
    cells = out["cells"]
    exp = {("m1", "P"): (10, 10, 8), ("m1", "N"): (10, 10, 3), ("m1", "T"): (10, 9, 1), ("m1", "U"): (10, 10, 5),
           ("m2", "P"): (10, 5, 4), ("m2", "N"): (10, 5, 1), ("m2", "T"): (10, 5, 0), ("m2", "U"): (11, 5, 2)}
    for k, (n, v, o) in exp.items():
        c = cells[k]
        check((c["n"], c["valid"], c["ours"]) == (n, v, o), f"cell {k} = {(c['n'], c['valid'], c['ours'])}, expected {(n, v, o)}")
    check(cells[("m2", "P")]["searched"] == 5 and cells[("m1", "P")]["searched"] == 10, "searched counts wrong")
    prim = out["primary"]
    check(prim["m1"]["P-N"] == newcombe_diff(8, 10, 3, 10), "m1 P-N not newcombe(8/10, 3/10)")
    check(prim["m1"]["P-T"] == newcombe_diff(8, 10, 1, 9), "m1 P-T not newcombe(8/10, 1/9)")
    check(prim["m2"]["P-N"] == newcombe_diff(4, 5, 1, 5), "m2 P-N not newcombe(4/5, 1/5)")
    sec = out["secondary"]
    check(sec[("m1", "P")]["opened"] == 6, f"m1 P opened {sec[('m1', 'P')]['opened']} != 6 (upi 4 + passport_url 2)")
    check(sec[("m1", "P")]["checker"] == 3, f"m1 P checker {sec[('m1', 'P')]['checker']} != 3 (stored-page answer must not count)")
    check(sec[("m1", "T")]["checker"] == 7, "m1 T checker != 7")
    check(sec[("m1", "N")]["opened"] is None and sec[("m1", "N")]["checker"] is None, "N must have no passport outcome")
    check(sec[("m1", "T")]["flaggedC"] == 6, f"m1 T flaggedC {sec[('m1', 'T')]['flaggedC']} != 6")
    for c in ("P", "U", "N"):
        check(sec[("m1", c)]["flaggedC"] == 0, f"rule C false positive on m1 {c}")
    check("T: flagged (rule C) AND reached the checker" in text and "m1                       6/10" in text, "flagged AND checker line wrong")
    check(out["regression"] in ("ml", "firth", "not_estimable"), f"regression returned {out['regression']}")
    check("recommendedOurs by our position" in text, "position section missing")
    if FAILS:
        print("SELF-TEST FAILED:")
        for f in FAILS:
            print("  -", f)
        print(text[-3000:])
        return 1
    print(f"selftest_study4: all assertions hold ({len(rows)} synthetic rows; regression: {out['regression']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
