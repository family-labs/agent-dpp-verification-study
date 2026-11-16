"""
Self-test for analyze_native.py on SYNTHETIC data (never written under harness/results/).

    .venv/Scripts/python.exe analysis/selftest_native.py

Generates two synthetic JSONL files in a temporary directory:
  1. noisy  - realistic rates, no separation: the maximum-likelihood fit must be used;
  2. separated - one model perfect everywhere: separation must be detected and the
     Firth refit attempted.
Each file also carries pilot rows, instrument_invalid rows, errored rows and unparseable
reports, whose EXCLUSION counts are asserted. Exits 0 only if every assertion holds.
"""
import contextlib
import io
import json
import os
import random
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_native  # noqa: E402

TRUTH = {"A": "verified", "B": "unverified", "C": "invalid", "D": "mismatch"}
MODELS = ["gpt-x", "gemini-x", "kimi-x"]
UPI = "https://ugpdpp.xyz/01/04012345730104"
VER = "https://app.universalgoods.xyz/api/server/api/passport/p/verify"


def row(rng, model, cond, tmpl, p_correct, p_chain, **over):
    chain = rng.random() < p_chain
    correct = rng.random() < p_correct
    wrong = [s for s in ["verified", "unverified", "invalid", "mismatch", "unknown"] if s != TRUTH[cond]]
    fetches = []
    if chain:
        fetches = [
            {"seq": 1, "requestedUrl": UPI, "finalUrl": UPI, "outcome": "fetched"},
            {"seq": 2, "requestedUrl": VER, "finalUrl": VER, "outcome": "fetched"},
        ]
    r = {
        "study": "A28-native-interoperability", "pilot": False, "runId": "synthetic", "seed": 1,
        "modelRequested": model, "modelIdsReturned": [model + "-2026"], "template": tmpl,
        "condition": cond, "groundTruth": TRUTH[cond], "costUsd": 0.01,
        "fetchedProductLink": chain, "fetchedVerificationLink": chain, "chainFollowed": chain,
        "instrumentInvalid": False, "fetches": fetches, "error": None,
        "selfReport": {
            "claims_status": TRUTH[cond] if correct else rng.choice(wrong),
            "decision": rng.choice(["stock", "stock_with_caveats", "do_not_stock"]),
            "evidence_used": f"{UPI} {VER}" if chain else "https://never-fetched.example/x",
        },
    }
    r.update(over)
    return r


def build(seed, perfect_model=None):
    rng = random.Random(seed)
    rows = []
    for m in MODELS:
        for c in TRUTH:
            for t in ["S1", "S2"]:
                for _ in range(10):
                    if m == perfect_model:
                        rows.append(row(rng, m, c, t, 1.0, 1.0))
                    else:
                        rows.append(row(rng, m, c, t, {"A": .8, "B": .7, "C": .75, "D": .4}[c], .75))
    # rows that must be excluded
    rows.append(row(rng, MODELS[0], "A", "S1", 1, 1, pilot=True, condition="pilot", groundTruth=None))
    rows.append(row(rng, MODELS[0], "A", "S1", 0, 1, instrumentInvalid=True, instrumentInvalidReasons=["synthetic"]))
    rows.append(row(rng, MODELS[1], "C", "S2", 0, 0, error="synthetic 500", selfReport=None))
    rows.append(row(rng, MODELS[2], "D", "S1", 0, 0, selfReport=None, parseError="no JSON block found"))
    return rows


def run(rows, d, name):
    p = os.path.join(d, f"{name}.jsonl")
    with open(p, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r) + "\n")
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = analyze_native.main(["analyze_native.py", p])
    return code, buf.getvalue()


def main():
    failures = []

    def check(cond, msg):
        print(("ok   " if cond else "FAIL ") + msg)
        if not cond:
            failures.append(msg)

    with tempfile.TemporaryDirectory() as d:
        code, out = run(build(7), d, "noisy")
        check(code == 0, f"noisy: exit 0 (got {code})")
        check("pilot rows EXCLUDED: 1" in out, "noisy: 1 pilot row excluded")
        check("instrument_invalid EXCLUDED: 1" in out, "noisy: 1 instrument_invalid row excluded")
        check("errored (missing data): 1" in out, "noisy: 1 errored row counted as missing")
        check("no / unparseable report (missing data, A9): 1" in out, "noisy: 1 unparseable report counted as missing")
        check("USABLE: 240" in out, "noisy: 240 usable rows")
        check("maximum-likelihood fit (no separation detected)" in out, "noisy: ML fit used")
        check("P17" in out and "P12" in out, "noisy: predictions block printed")
        if code != 0 or failures:
            print(out)

        code2, out2 = run(build(11, perfect_model="gpt-x"), d, "separated")
        check(code2 == 0, f"separated: exit 0 (got {code2})")
        check("SEPARATION DETECTED" in out2, "separated: separation detected")
        check("Firth penalised-likelihood refit" in out2, "separated: Firth refit attempted")
        check("Firth refit failed" not in out2 and "NOT importable" not in out2, "separated: Firth fit produced coefficients")
        if failures:
            print(out2)
        # Print the synthetic noisy report once for a human to read.
        print("\n----- synthetic noisy report (excerpt) -----")
        print("\n".join(out.splitlines()[:60]))
        print("\n----- synthetic separated report: regression section -----")
        i = out2.find("POOLED LOGISTIC")
        print(out2[i - 80: i + 1800])
    print(f"\nSELFTEST {'PASSED' if not failures else 'FAILED'} ({len(failures)} failure(s))")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
