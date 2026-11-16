"""
Self-test for analyze_followup.py and followup_rules.py on SYNTHETIC data (written only to a
temporary directory, never under harness/results/).

    python -I analysis/selftest_followup.py

1. The flaggedProblem rules: positive and negative sentences, including negations, the
   granularity notice wording, and the cycle figures in their spellings.
2. A deterministic synthetic follow-up file (both arms, A-E, three models) plus a synthetic
   Study 2 file, with excluded rows (instrument_invalid, errored, unparseable). Every count
   the analysis returns is asserted against the count built into the data.
Exits 0 only if every assertion holds.
"""
import contextlib
import io
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_followup as af  # noqa: E402
from followup_rules import flagged_problem  # noqa: E402

FAILS = []


def check(cond, what):
    if not cond:
        FAILS.append(what)


# ------------------------------------------------------------------ 1. rules
C_POS = [
    'The checker returned "invalid" with reason data_changed_since_anchoring.',
    "dataMatchesCredential: false, so the record is not intact.",
    "The passport data has been changed since it was anchored on chain.",
    "Its values were altered after they were signed.",
    "The product failed the integrity check run by the verification service.",
    "Verification failed for this passport.",
    "The verifier reports the passport as invalid.",
    "Integrity compromised: tampering detected.",
]
C_NEG = [
    "There is no sign the data was altered.",
    "I could not confirm whether the data has been changed.",
    "A battery passport is per individual battery, so it cannot be served at variant level as a conformant DPP.",
    "The passport is served at model level rather than per battery; this is a conformity caveat.",
    "The verifier returned verified: the anchor matches and the data is unchanged.",
    "No verification link was available, so integrity could not be checked.",
    "The data was not changed since anchoring.",
]
D_POS = [
    "The page claims 6000 cycles but the passport records 4000 cycles.",
    "| Expected lifetime | 6,000 cycles | 4,000 cycles |",
    "Passport: 4 000 cycles. The listing says 6 000.",
    "- Page: 6000 cycles\n- Passport: 4000 cycles",
]
D_NEG = [
    "Expected lifetime: 4000 cycles, matching the passport.",
    "Continuous output 5000 W; 4000 cycles expected lifetime.",
    "The page claims 6000 cycles.\n\nSeparately, the passport is served at model level.",
    "60000 and 40000 are not the figures here.",
]
for t in C_POS:
    check(flagged_problem("C", t), f"C rule missed: {t!r}")
for t in C_NEG:
    check(not flagged_problem("C", t), f"C rule false positive: {t!r}")
for t in D_POS:
    check(flagged_problem("D", t), f"D rule missed: {t!r}")
for t in D_NEG:
    check(not flagged_problem("D", t), f"D rule false positive: {t!r}")

# ------------------------------------------------------------------ 2. synthetic data
MODELS = ["gemini-x", "gpt-x", "kimi-x"]
UPI = {"A": "https://ugpdpp.xyz/01/1", "B": "https://ugpdpp.xyz/01/2", "C": "https://ugpdpp.xyz/01/3",
       "D": "https://ugpdpp.xyz/01/1", "E": "https://id.tarnvale.example/01/04012346519005"}
VER = {"A": "https://app.universalgoods.xyz/api/server/api/passport/a/verify",
       "B": "https://app.universalgoods.xyz/api/server/api/passport/b/verify",
       "C": "https://app.universalgoods.xyz/api/server/api/passport/c/verify",
       "D": "https://app.universalgoods.xyz/api/server/api/passport/a/verify", "E": None}
RUNS = {"R": 8, "O": 6}
# Deterministic plan: per model, how many of each cell's runs are "good" (opened + reached +
# correct / flagged). gemini all, gpt 2, kimi 4.
GOOD = {"gemini-x": 99, "gpt-x": 2, "kimi-x": 4}


def fetches(c, opened, reached):
    out = []
    if opened:
        out.append({"seq": 1, "requestedUrl": UPI[c], "finalUrl": UPI[c],
                    "outcome": "stored_page" if c == "E" else "fetched", "status": 200})
    if reached and VER[c]:
        out.append({"seq": 2, "requestedUrl": VER[c], "finalUrl": VER[c], "outcome": "fetched", "status": 200})
    # an unanswered attempt never counts
    out.append({"seq": 3, "requestedUrl": "https://elsewhere.example/x", "finalUrl": None,
                "outcome": "host_not_reachable", "status": None})
    return out


def row(arm, m, c, i, **over):
    good = i < GOOD[m]
    r = {"study": "study2-followup", "arm": arm, "promptVersion": "A28-evidence" if arm == "R" else "O-open-ended",
         "taskSha256": arm, "pilot": False, "runId": "synthetic", "seed": 1, "modelRequested": m, "template": "S1",
         "condition": c, "runIndex": i, "upi": UPI[c], "advertisedVerificationLink": VER[c], "costUsd": 0.01,
         "instrumentInvalid": False, "error": None, "fetches": fetches(c, good or i % 2 == 0, good)}
    if arm == "R":
        r["groundTruth"] = af.TRUTH_R[c]
        r["selfReport"] = {"claims_status": af.TRUTH_R[c] if good else ("verified" if c in ("B", "E") else "unknown"),
                           "decision": "do_not_stock", "evidence_used": UPI[c]}
        r["responseText"] = "..."
    else:
        r["groundTruth"] = None
        r["selfReport"] = {"decision": "stock" if c == "A" else "stock_with_caveats", "evidence_used": UPI[c]}
        if c == "C" and good:
            text = "The verifier returned invalid: data_changed_since_anchoring."
        elif c == "D" and good:
            text = "The page says 6000 cycles; the passport says 4000 cycles."
        else:
            text = "A battery passport is per individual battery, so it is not a conformant DPP at variant level."
        r["responseText"] = text + '\n```json\n{"decision": "stock_with_caveats"}\n```'
    r.update(over)
    return r


rows = []
for arm in ("R", "O"):
    for m in MODELS:
        for c in af.CONDS:
            for i in range(RUNS[arm]):
                rows.append(row(arm, m, c, i))
# Excluded rows (one of each kind), and a row of another study that must be ignored.
rows.append(row("R", "gpt-x", "A", 99, instrumentInvalid=True, instrumentInvalidReasons=["synthetic"]))
rows.append(row("R", "gpt-x", "A", 98, error="synthetic API error", selfReport=None))
rows.append(row("O", "kimi-x", "C", 97, selfReport=None, parseError="no JSON block found"))
rows.append({"study": "A28-native-interoperability", "pilot": False})

s2 = []
for m in MODELS:
    for c in ["A", "B", "C", "D"]:
        for t in ("S1", "S2"):
            for i in range(10):
                ok = i < (10 if m == "gemini-x" else 3)
                s2.append({"study": "A28-native-interoperability", "pilot": False, "modelRequested": m, "condition": c,
                           "template": t, "instrumentInvalid": False, "error": None,
                           "selfReport": {"claims_status": af.TRUTH_R[c] if ok else "unknown", "decision": "stock"}})

with tempfile.TemporaryDirectory() as d:
    fp = os.path.join(d, "followup-synthetic.jsonl")
    sp = os.path.join(d, "study2-synthetic.jsonl")
    with open(fp, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
    with open(sp, "w", encoding="utf-8") as fh:
        for r in s2:
            fh.write(json.dumps(r) + "\n")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        res = af.main([fp, "--study2", sp])
    text = buf.getvalue()

check(len(res["usable"]["R"]) == 3 * 5 * 8, f"arm R usable {len(res['usable']['R'])} != 120")
check(len(res["usable"]["O"]) == 3 * 5 * 6, f"arm O usable {len(res['usable']['O'])} != 90")
check("instrument_invalid EXCLUDED 1" in text, "instrument_invalid exclusion not counted")
check("errored 1" in text, "errored row not counted")
check("no/unparseable report 1" in text, "unparseable report not counted")


def good(m, n):
    return min(GOOD[m], n)


R, O, CMP = res["R"], res["O"], res["compare"]
for m in MODELS:
    for c in af.CONDS:
        check(R["acc"][(m, c)] == (good(m, 8), 8), f"R acc {m} {c} {R['acc'][(m, c)]}")
    for c in ["A", "B", "C", "D"]:
        check(R["native"][(m, c)] == (good(m, 8), 8), f"R native {m} {c} {R['native'][(m, c)]}")
    for c in ["B", "E"]:
        check(R["overtrust"][(m, c)] == (8 - good(m, 8), 8), f"R over-trust {m} {c} {R['overtrust'][(m, c)]}")
    for c in af.CONDS:
        opened = sum(1 for i in range(6) if i < GOOD[m] or i % 2 == 0)
        check(O["opened"][(m, c)] == (opened, 6), f"O opened {m} {c} {O['opened'][(m, c)]} != {opened}")
        if c != "E":
            check(O["reached"][(m, c)] == (good(m, 6), 6), f"O reached {m} {c}")
        check((m, c) not in O["reached"] or c != "E", "E must have no reachedChecker cell")
    check(O["flag"][(m, "C")] == (good(m, 6), 6), f"O flag C {m} {O['flag'][(m, 'C')]}")
    check(O["flag_grounded"][(m, "C")] == (good(m, 6), 6), f"O flag C grounded {m}")
    check(O["flag"][(m, "D")] == (good(m, 6), 6), f"O flag D {m} {O['flag'][(m, 'D')]}")
    for (mm, w, c), v in O["fp"].items():
        check(v[0] == 0, f"false-positive check fired: {mm} rule {w} on {c}")
    check(O["decisions"][(m, "A")]["stock"] == 6, f"O decisions {m} A")
    # Comparison: matched (S1 only, 10 per cell) and all (20 per cell).
    for c in ["A", "B", "C", "D"]:
        kb, nb, ka, na, d, lo, hi = CMP[("matched template", m, c)]
        check((kb, nb) == (good(m, 8), 8) and (ka, na) == ((10 if m == "gemini-x" else 3), 10),
              f"compare matched {m} {c} {(kb, nb, ka, na)}")
        check(lo <= d <= hi, f"Newcombe interval does not contain the difference {m} {c}")
        kb, nb, ka, na, *_ = CMP[("all Study 2 rows", m, c)]
        check(na == 20 and ka == (20 if m == "gemini-x" else 6), f"compare all {m} {c} {(ka, na)}")

if FAILS:
    print("SELFTEST FAILED")
    for f in FAILS:
        print("  " + f)
    sys.exit(1)
print(f"SELFTEST PASSED: {len(C_POS) + len(C_NEG) + len(D_POS) + len(D_NEG)} rule cases; "
      f"{len(rows)} synthetic follow-up rows, {len(s2)} synthetic Study 2 rows; every count matched.")
