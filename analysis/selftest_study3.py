"""
Self-test for analyze_study3.py on SYNTHETIC data (a temporary directory, never harness/results/).

    python -I analysis/selftest_study3.py

A deterministic file with arms U, H and R, conditions A-E, two models, plus rows that must be
excluded (instrument_invalid, errored, unparseable, smoke/pilot, another study). Every count the
analysis returns is asserted against the count built into the data, including: arm U counts a
fetch of dpp.passport_url as following the link; a fetch of the checker that was answered from
a stored page or failed does not count as reaching it; E has no checker; the primary difference
and its Newcombe interval. Exits 0 only if every assertion holds.
"""
import contextlib
import io
import json
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_study3 as a3  # noqa: E402
from analyze_native import newcombe_diff  # noqa: E402

FAILS = []


def check(cond, what):
    if not cond:
        FAILS.append(what)


GT = {"A": "04012346627106", "B": "04012346283401", "C": "04012346845609", "D": "04012346627106"}
VID = {"A": "va", "B": "vb", "C": "vc", "D": "va"}
E_UPI = "https://id.tarnvale.example/01/04012346519005"
FLAG_C = "The checker returned invalid with reason data_changed_since_anchoring."
FLAG_D = "The listing says 6000 cycles but the passport records 4000 cycles."
NEUTRAL = "Looks fine overall."


def links(c):
    if c == "E":
        return None, None, None
    v = VID[c]
    return (f"https://ugpdpp.xyz/01/{GT[c]}",
            f"https://app.universalgoods.xyz/api/server/api/passport/{v}?kind=variant",
            f"https://app.universalgoods.xyz/api/server/api/passport/{v}/verify")


def fetch(url, outcome="fetched", status=200):
    return {"requestedUrl": url, "finalUrl": url, "outcome": outcome, "status": status}


def row(arm, model, c, *, follow=None, reach=False, decision="stock_with_caveats", text=NEUTRAL,
        claims=None, study="study3-ucp", pilot=False, error=None, report=True, invalid=False):
    upi, pp, ver = links(c)
    fetches = []
    if follow == "upi":
        fetches.append(fetch(upi if c != "E" else E_UPI, "fetched" if c != "E" else "stored_page"))
    elif follow == "pp":
        fetches.append(fetch(pp))
    elif follow == "upi404":  # answered from a stored page with 404: not followed
        fetches.append(fetch(upi or E_UPI, "stored_page", 404))
    if reach is True:
        fetches.append(fetch(ver))
    elif reach == "failed":
        fetches.append(fetch(ver, "network_error", None))
    sr = None
    if report:
        sr = {"decision": decision, "evidence_used": ""}
        if claims is not None:
            sr["claims_status"] = claims
    return {
        "study": study, "pilot": pilot, "arm": arm, "modelRequested": model, "vendor": model.split("-")[0],
        "condition": c, "upi": upi if c != "E" else E_UPI, "advertisedVerificationLink": ver,
        "listing": ({"dpp": {"upi": upi, "passport_url": pp, "verification_url": ver}, "variantUrl": None} if c != "E"
                    else {"dpp": None, "variantUrl": E_UPI}) if arm == "U" else None,
        "fetches": fetches, "responseText": text, "selfReport": sr, "error": error,
        "instrumentInvalid": invalid, "instrumentInvalidReasons": ["x"] if invalid else [],
        "costUsd": 0.001, "seed": 1, "runId": "t", "promptVersion": arm, "taskSha256": arm,
    }


rows = []
M1, M2 = "alpha-1", "beta-2"
# ---- arm U, model M1: A-D 4 rows each. Followed: 3 per cond (2 via upi, 1 via passport_url). Reached: 2 per cond.
for c in "ABCD":
    rows.append(row("U", M1, c, follow="upi", reach=True, text=FLAG_C if c == "C" else FLAG_D if c == "D" else NEUTRAL))
    rows.append(row("U", M1, c, follow="pp", reach=True, text=FLAG_C if c == "C" else NEUTRAL))
    rows.append(row("U", M1, c, follow="upi", reach="failed"))
    rows.append(row("U", M1, c, follow="upi404", decision="do_not_stock"))
# E: 3 rows, 2 follow E's url
rows += [row("U", M1, "E", follow="upi"), row("U", M1, "E", follow="upi", decision="stock"), row("U", M1, "E", decision="do_not_stock")]
# ---- arm H, model M1: A-D 4 rows each; followed 2, reached 1
for c in "ABCD":
    rows.append(row("H", M1, c, follow="upi", reach=True, text=FLAG_D if c == "D" else NEUTRAL))
    rows.append(row("H", M1, c, follow="upi"))
    rows.append(row("H", M1, c))
    rows.append(row("H", M1, c))
rows += [row("H", M1, "E", follow="upi"), row("H", M1, "E")]
# ---- model M2: U 2/cond nothing, H 2/cond reached
for c in "ABCD":
    rows += [row("U", M2, c), row("U", M2, c)]
    rows += [row("H", M2, c, follow="upi", reach=True), row("H", M2, c, follow="upi", reach=True)]
rows += [row("U", M2, "E"), row("H", M2, "E")]
# ---- arm R (claude only): A 3 (2 verified with chain, 1 mismatch), B 2 (1 verified = over-trust), E 2 (1 verified)
CL = "claude-x"
rows += [row("R", CL, "A", follow="upi", reach=True, claims="verified"),
         row("R", CL, "A", follow="upi", reach=True, claims="verified"),
         row("R", CL, "A", follow="upi", claims="mismatch"),
         row("R", CL, "B", claims="verified"), row("R", CL, "B", follow="upi", reach=True, claims="unverified"),
         row("R", CL, "C", follow="upi", reach=True, claims="invalid", text=FLAG_C),
         row("R", CL, "D", follow="upi", reach=True, claims="mismatch"),
         row("R", CL, "E", follow="upi", claims="verified"), row("R", CL, "E", follow="upi", claims="unverified")]
# ---- excluded rows
rows += [row("U", M1, "A", follow="upi", reach=True, invalid=True),
         row("U", M1, "A", error="boom"),
         row("H", M1, "A", report=False),
         row("U", M1, "A", follow="upi", reach=True, pilot=True),
         row("U", M1, "A", follow="upi", reach=True, study="study3-ucp-smoke", pilot=True),
         row("O", M1, "A", study="study2-followup")]

with tempfile.TemporaryDirectory() as d:
    p = os.path.join(d, "synthetic.jsonl")
    with open(p, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
        fh.write("not json\n")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        res = a3.main([p])
    out = buf.getvalue()

u = res["usable"]
check(len(u["U"]) == 16 + 3 + 8 + 1, f"usable U {len(u['U'])}")
check(len(u["H"]) == 16 + 2 + 8 + 1, f"usable H {len(u['H'])}")
check(len(u["R"]) == 9, f"usable R {len(u['R'])}")
check("instrument_invalid EXCLUDED 1" in out and "errored 1" in out and "no/unparseable report 1" in out, "exclusions printed")
check("malformed: 1" in out, "malformed line counted")

o = res["open"]
for c in "ABCD":
    check(o["followed"][("U", M1, c)] == (3, 4), f"U followed {c} {o['followed'][('U', M1, c)]}")
    check(o["reached"][("U", M1, c)] == (2, 4), f"U reached {c} {o['reached'][('U', M1, c)]}")
    check(o["followed"][("H", M1, c)] == (2, 4), f"H followed {c}")
    check(o["reached"][("H", M1, c)] == (1, 4), f"H reached {c}")
check(o["followed"][("U", M1, "E")] == (2, 3), "U E followed via variant url")
check(("U", M1, "E") not in o["reached"], "E has no reachedChecker")
check(o["flag"][("U", M1, "C")] == (2, 4) and o["flag_grounded"][("U", M1, "C")] == (2, 4), "U flag C")
check(o["flag"][("U", M1, "D")] == (1, 4), "U flag D")
check(o["flag"][("H", M1, "D")] == (1, 4) and o["flag"][("H", M1, "C")] == (0, 4), "H flags")
check(o["fp"][("U", M1, "C", "A")] == (0, 4), "no false positive of rule C on A")
check(o["decisions"][("U", M1, "E")]["stock"] == 1 and o["decisions"][("U", M1, "E")]["do_not_stock"] == 1, "E decisions")

pr = res["primary"]
check(pr[M1][:4] == (8, 16, 4, 16), f"primary M1 counts {pr[M1][:4]}")
d, lo, hi = newcombe_diff(8, 16, 4, 16)
check(math.isclose(pr[M1][4], d) and math.isclose(pr[M1][5], lo) and math.isclose(pr[M1][6], hi), "primary Newcombe")
check(abs(d - 0.25) < 1e-12 and lo < 0 < hi, "primary difference +25 points, interval spans 0")
check(pr[M2][:4] == (0, 8, 8, 8), f"primary M2 {pr[M2][:4]}")
check(pr[M2][4] == -1.0, "M2 difference -100 points")

se = res["secondary"]
check(se[(M1, "followed")] == (12, 16, 8, 16), f"secondary followed {se[(M1, 'followed')]}")
check(se[(M1, "C")] == (2, 4, 0, 4) and se[(M1, "D")] == (1, 4, 1, 4), "secondary flags")
check(se[(M1, "E", "H")]["stock_with_caveats"] == 2, "E decisions H")

r = res["R"]
check(r["acc"][(CL, "A")] == (2, 3) and r["acc"][(CL, "B")] == (1, 2) and r["acc"][(CL, "E")] == (1, 2), "R accuracy")
check(r["native"][(CL, "A")] == (2, 3) and r["native"][(CL, "ACD")] == (4, 5), f"R native {r['native']}")
check(r["overtrust"][(CL, "B")] == (1, 2) and r["overtrust"][(CL, "E")] == (1, 2), "R over-trust")

print("\n".join(f"FAIL {f}" for f in FAILS) or "all assertions hold")
print(f"STUDY 3 ANALYSIS SELFTEST: {'FAIL' if FAILS else 'PASS'}")
sys.exit(1 if FAILS else 0)
