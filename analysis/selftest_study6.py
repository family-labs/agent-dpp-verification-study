"""
Study 6 analysis self-test (standard library only). Values below were computed BY HAND (worked
in the comments) or are published reference values, never by the code under test.

    python -I analysis/selftest_study6.py        exit 0 = all pass

The canned rows (analysis/study6-selftest-rows.jsonl) are written by harness/src/selftest-study6.ts
from the same hand-computed design, so the TypeScript aggregate and this analysis are checked
against one set of numbers.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_study6 as a  # noqa: E402

fails = 0


def near(name, got, want, tol=5e-4):
    global fails
    ok = (math.isnan(got) and math.isnan(want)) if isinstance(want, float) and math.isnan(want) else abs(got - want) <= tol
    if not ok:
        fails += 1
    print(f"{'ok  ' if ok else 'FAIL'} {name}: got {got:.4f} want {want:.4f}")


def eq(name, got, want):
    global fails
    ok = got == want
    if not ok:
        fails += 1
    print(f"{'ok  ' if ok else 'FAIL'} {name}{'' if ok else f': got {got!r} want {want!r}'}")


# --- published reference values (Newcombe 1998, Statistics in Medicine 17:857-872)
lo, hi = a.wilson(81, 263)
near("Wilson 81/263 lower (Newcombe 1998: 0.2553)", lo, 0.2553)
near("Wilson 81/263 upper (0.3662)", hi, 0.3662)
d, lo, hi = a.newcombe(56, 70, 48, 80)
near("Newcombe method 10, 56/70 - 48/80 lower (0.0524)", lo, 0.0524)
near("Newcombe method 10 upper (0.3339)", hi, 0.3339)

# --- hand-worked Wilson, z = 1.96, z^2 = 3.8416
# 4/4: den = 1 + 3.8416/4 = 1.9604; centre = (1 + 3.8416/8)/1.9604 = 1.4802/1.9604 = 0.75505
#      half = 1.96 * sqrt(0 + 3.8416/64)/1.9604 = 1.96 * 0.245/1.9604 = 0.24495 -> (0.5101, 1)
lo, hi = a.wilson(4, 4)
near("Wilson 4/4 lower (hand 0.5101)", lo, 0.5101)
near("Wilson 4/4 upper (1)", hi, 1.0)
# 1/4: centre = (0.25 + 0.4802)/1.9604 = 0.37247; half = 1.96 * sqrt(0.046875 + 0.060025)/1.9604
#      = 1.96 * 0.32696/1.9604 = 0.32689 -> (0.0456, 0.6994)
lo, hi = a.wilson(1, 4)
near("Wilson 1/4 lower (hand 0.0456)", lo, 0.0456)
near("Wilson 1/4 upper (hand 0.6994)", hi, 0.6994)
# Newcombe 4/4 - 1/4: d = 0.75; lo = 0.75 - sqrt((1-0.5101)^2 + (0.6994-0.25)^2) = 0.75 - 0.6648 = 0.0852
#                              hi = 0.75 + sqrt(0 + (0.25-0.0456)^2) = 0.75 + 0.2044 = 0.9544
d, lo, hi = a.newcombe(4, 4, 1, 4)
near("Newcombe 4/4 - 1/4 point", d, 0.75)
near("Newcombe 4/4 - 1/4 lower (hand 0.0852)", lo, 0.0852)
near("Newcombe 4/4 - 1/4 upper (hand 0.9544)", hi, 0.9544)
# MOVER: (0.75, 0.0852, 0.9544) minus (0, -0.5, 0.5)  -> g = 0.75
#        lo = 0.75 - sqrt((0.75-0.0852)^2 + (0.5-0)^2) = 0.75 - sqrt(0.44196+0.25) = 0.75 - 0.83184 = -0.0818
#        hi = 0.75 + sqrt((0.9544-0.75)^2 + (0-(-0.5))^2) = 0.75 + sqrt(0.04178+0.25) = 0.75 + 0.54016 = 1.2902
g, lo, hi = a.mover_diff((0.75, 0.0852, 0.9544), (0.0, -0.5, 0.5))
near("MOVER point", g, 0.75)
near("MOVER lower (hand -0.0818)", lo, -0.0818)
near("MOVER upper (hand 1.2902)", hi, 1.2902)
eq("n = 0 -> nan", math.isnan(a.wilson(0, 0)[0]), True)

# --- the canned rows (hand design in harness/src/selftest-study6.ts)
rows = a.load([os.path.join(os.path.dirname(os.path.abspath(__file__)), "study6-selftest-rows.jsonl")])
usable, ex = a.split(rows)
eq("canned rows are mock: excluded by default", (len(usable), sum(ex.values())), (0, 40))
r = a.analyse(rows, include_mock=True)
m1, m2 = r["per"]["m1"], r["per"]["m2"]
eq("m1 G-D0 share", m1["D0"]["G"], (2, 4))
eq("m1 F-D1 share", m1["D1"]["F"], (1, 4))
near("m1 disc D0 = 0", m1["D0"]["disc"][0], 0.0)
near("m1 disc D1 = 0.75", m1["D1"]["disc"][0], 0.75)
near("m1 disc D1 lower = Newcombe 4/4 - 1/4 (0.0852)", m1["D1"]["disc"][1], 0.0852)
near("m1 gain = 0.75", m1["gain"][0], 0.75)
eq("m2 G-D0 missing value excluded (3/3)", m2["D0"]["G"], (3, 3))
near("m2 disc D0 = 1 - 0.75 = 0.25", m2["D0"]["disc"][0], 0.25)
near("m2 gain = 0 - 0.25 = -0.25", m2["gain"][0], -0.25)
eq("worst model", r["worst"], "m2")
near("m1 trust W - G = 1/4 - 4/4 = -0.75", m1["trustW"]["diff"][0], -0.75)
near("m2 trust W - G = 3/4 - 4/4 = -0.25", m2["trustW"]["diff"][0], -0.25)
eq("m1 declaration fetched in D1", m1["declFetchedD1"], (6, 8))
eq("m1 invented", m1["invented"], (1, 20))
eq("m1 explorer JSON (G/F run 0 only)", m1["explorerJson"], (4, 20))
# --- PRIMARY: POOLED over m1 and m2 (every usable trial once), worked by hand, z = 1.96, z^2 = 3.8416
# D0: G yes 2+3 of 4+3 = 5/7; F yes 2+3 of 4+4 = 5/8 -> disc0 = 5/7 - 5/8 = 5/56 = 0.08929
# D1: G yes 4+2 of 8 = 6/8;   F yes 1+2 of 8 = 3/8   -> disc1 = 0.375;  gain = 3/8 - 5/56 = 16/56 = 2/7 = 0.28571
# Wilson n = 8: den = 1 + 3.8416/8 = 1.48020; z^2/(2n) = 0.24010; z^2/(4n^2) = 0.015006
#   6/8: centre = (0.75 + 0.2401)/1.4802 = 0.66890; half = 1.96*sqrt(0.0234375 + 0.015006)/1.4802
#        = 1.96*0.196071/1.4802 = 0.25963 -> (0.4093, 0.9285)
#   3/8: centre = (0.375 + 0.2401)/1.4802 = 0.41555; half = 1.96*sqrt(0.029297 + 0.015006)/1.4802
#        = 1.96*0.210483/1.4802 = 0.27871 -> (0.1368, 0.6943)
#   5/8: centre = (0.625 + 0.2401)/1.4802 = 0.58445; half 0.27871 (same p(1-p) as 3/8) -> (0.3057, 0.8632)
# Wilson 5/7: den = 1 + 3.8416/7 = 1.54880; centre = (0.714286 + 0.274400)/1.5488 = 0.63836;
#   half = 1.96*sqrt(0.029155 + 0.019600)/1.5488 = 1.96*0.220806/1.5488 = 0.27943 -> (0.3589, 0.9178)
# Newcombe disc1 = 6/8 - 3/8: lo = 0.375 - sqrt((0.75-0.4093)^2 + (0.6943-0.375)^2) = 0.375 - sqrt(0.11608+0.10195)
#   = 0.375 - 0.46694 = -0.0919;  hi = 0.375 + sqrt((0.9285-0.75)^2 + (0.375-0.1368)^2) = 0.375 + 0.29765 = 0.6726
# Newcombe disc0 = 5/7 - 5/8: lo = 0.08929 - sqrt((0.71429-0.3589)^2 + (0.8632-0.625)^2) = 0.08929 - 0.42782 = -0.3385
#   hi = 0.08929 + sqrt((0.9178-0.71429)^2 + (0.625-0.3057)^2) = 0.08929 + 0.37863 = 0.4679
# MOVER gain = 0.375 - 0.08929 = 0.28571
#   lo = 0.28571 - sqrt((0.375-(-0.0919))^2 + (0.4679-0.08929)^2) = 0.28571 - sqrt(0.21800+0.14334) = 0.28571 - 0.60112 = -0.3154
#   hi = 0.28571 + sqrt((0.6726-0.375)^2 + (0.08929-(-0.3385))^2) = 0.28571 + sqrt(0.08857+0.18300) = 0.28571 + 0.52113 = 0.8069
P = r["pooled"]
eq("POOLED D0 G and F", (P["D0"]["G"], P["D0"]["F"]), ((5, 7), (5, 8)))
eq("POOLED D1 G and F", (P["D1"]["G"], P["D1"]["F"]), ((6, 8), (3, 8)))
near("POOLED disc D0 = 5/56", P["D0"]["disc"][0], 5 / 56)
near("POOLED disc D0 lower (hand -0.3385)", P["D0"]["disc"][1], -0.3385)
near("POOLED disc D0 upper (hand 0.4679)", P["D0"]["disc"][2], 0.4679)
near("POOLED disc D1 = 0.375", P["D1"]["disc"][0], 0.375)
near("POOLED disc D1 lower (hand -0.0919)", P["D1"]["disc"][1], -0.0919)
near("POOLED disc D1 upper (hand 0.6726)", P["D1"]["disc"][2], 0.6726)
near("POOLED gain = 2/7", P["gain"][0], 2 / 7)
near("POOLED gain MOVER lower (hand -0.3154)", P["gain"][1], -0.3154)
near("POOLED gain MOVER upper (hand 0.8069)", P["gain"][2], 0.8069)
eq("success rule NOT MET (gain 0.286 >= 0.20 but lower bound -0.315 < 0)", r["success"], False)
# success MET on synthetic rows (hand): D0 G 5/10, F 5/10 -> disc0 0, Wilson 5/10 = 0.5 +- 0.26341, Newcombe +-0.3725;
# D1 G 10/10, F 0/10 -> disc1 1, Wilson 10/10 lower = 0.86124 - 0.13877 = 0.7225, Newcombe lower = 1 - 0.3924 = 0.6076;
# MOVER gain 1, lower = 1 - sqrt((1-0.6076)^2 + 0.3725^2) = 1 - 0.5411 = 0.4589 > 0 and 1 >= 0.20 -> MET
syn = []
for cond, yes in (("G-D0", 5), ("F-D0", 5), ("G-D1", 10), ("F-D1", 0)):
    syn += [dict(study=a.STUDY, label="s", condition=cond, product="lmt", pilot=False, mock=False, error=None, sellerHasItem="yes" if i < yes else "no", genuine="yes") for i in range(10)]
rs = a.analyse(syn)
near("synthetic pooled gain lower bound (hand 0.4589)", rs["pooled"]["gain"][1], 0.4589)
eq("success rule MET on the synthetic rows", rs["success"], True)
# --- predictions on the canned data (hand):
# P37 pooled disc0 0.089 <= 0.20 supported; P38 pooled declaration D1 = m1 6 + m2 0 of 16 = 0.375 > 0.20 not supported;
# P39 pooled gain 0.286 > 0.10 not supported; P40 lower bound -0.315 not > 0 not supported;
# P41 worst m2 -0.25 <= 0 supported; P42 m1 0.75 >= 0.25 supported; P43 m1 1/20 = 5%, m2 0 -> not supported;
# P44 pooled W genuine yes 1+3 of 8 = 0.5, G-D0 genuine yes 8/8 = 1 -> |-0.5| > 0.20 not supported
eq("pooled declaration fetched in D1", P["declFetchedD1"], (6, 16))
near("pooled trust W - G-D0 = 4/8 - 8/8", P["trustW"]["diff"][0], -0.5)
pred = {p[0]: p[2] for p in r["predictions"]}
eq("predictions on canned data", [pred[k] for k in ("P37", "P38", "P39", "P40", "P41", "P42", "P43", "P44")],
   ["supported", "not supported", "not supported", "not supported", "supported", "supported", "not supported", "not supported"])

# --- exclusion rules
base = {"study": a.STUDY, "label": "x", "condition": "G-D0", "pilot": False, "mock": False, "error": None}
u, ex = a.split([dict(base), dict(base, pilot=True), dict(base, mock=True), dict(base, error="boom"), dict(base, study="other"), dict(base, modelRequested="meta/muse-spark-1.3", provider={"providersSeen": ["Other"]})])
eq("one usable row of six", len(u), 1)
eq("exclusion reasons", sorted(k[0] for k in ex), sorted(["pilot", "mock", "errored (missing data)", "other study", "OpenRouter provider not the pinned one"]))

print(f"\n{fails} FAILED" if fails else "\nall Study 6 analysis self-tests pass")
sys.exit(1 if fails else 0)
