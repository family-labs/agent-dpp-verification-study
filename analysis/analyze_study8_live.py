"""
Study 8 LIVE (A41): does giving a model the open verify tool make it pick the genuine passport over a
convincing fake, and does a seller's lookalike verifier fool it?

    python -I analysis/analyze_study8_live.py harness/results/study8-live-*.jsonl
    python -I analysis/analyze_study8_live.py --include-mock harness/results/mock-study8-live-*.jsonl
    python -I analysis/analyze_study8_live.py --ladder harness/results/study8c-live-*.jsonl      (A42: per model only)
    python -I analysis/analyze_study8_live.py --no-passport harness/results/study8n-live-*.jsonl (A43)

Standard library only; interval methods from analyze_study6.py. Oskvale's page always carries the genuine
passport, Torvlund's a non-genuine one:
  V0  A37's C2 pages (the rival's "Independent record" answers "no record"), no tool
  V1  V0's pages + the open verify tool (MCP verify_product_passport)
  V2  the rival's passport points to the seller's lookalike verifier ("Verified"), no tool
  V3  V2's pages + the tool

Share(C) = trials recommending OSKVALE / trials with a valid answer ("neither" counts as not Oskvale).
PRIMARY, pooled three vendors (OpenAI, Kimi, Anthropic): tool effect = Share(V1) - Share(V0), Newcombe 95%.
Success: tool effect >= 0.20 with its lower bound > 0.
SECONDARY: V2 - V0 (the lookalike); V3 - V2 (the tool against the lookalike); tool use (offered trials
with a call; calls per status); the fake chosen; lookalike verifier opened; reasons citing a check;
per model; Meta's two models separately.

--no-passport (A43, Study 8N): Torvlund has NO passport (A37's C1 pages). N0 = no tool, N1 = the tool.
PRIMARY: Share(N1) - Share(N0), same interval and descriptive rule; tool calls by what was passed (the
genuine passport address, the rival's product page, anything else) and the answer after each.
"""
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyze_study6 import PINNED_PROVIDER, fint, fshare, load, newcombe, true_share  # noqa: E402

STUDY = "study8-live-verify-tool"
POOLED = ["anthropic", "kimi", "openai"]
SEPARATE = ["glimmer", "spark"]
CONDS = ["V0", "V1", "V2", "V3"]
TOOL = ["V1", "V3"]
EFFECTS = (("V1", "V0"), ("V2", "V0"), ("V3", "V2"), ("V3", "V0"))
NOPASS_STUDY = "study8n-live-verify-tool-no-passport"


LADDER_STUDY = "study8-live-claude-ladder"


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


def share(rows, cond, brand="oskvale"):
    rs = [r for r in rows if r["condition"] == cond and r.get("chosenBrand") is not None]
    return sum(1 for r in rs if r["chosenBrand"] == brand), len(rs)


def block(label, rows):
    s = {c: share(rows, c) for c in CONDS}
    for c in CONDS:
        rs = [r for r in rows if r["condition"] == c]
        neither = sum(1 for r in rs if r.get("chosenBrand") == "neither")
        fake = share(rows, c, "torvlund")
        used = sum(1 for r in rs if r.get("toolCalls"))
        tool = f"tool used {fshare(used, len(rs)):<22}" if c in TOOL else f"{'':<32}"
        print(f"{label:<10} {c}  Oskvale {fshare(*s[c]):<24} fake {fshare(*fake):<22} neither {neither}/{len(rs):<3} {tool} record opened {fshare(*true_share(rs, 'oskvaleRecordOpened')):<22} lookalike opened {fshare(*true_share(rs, 'lookalikeVerifierOpened')):<22} reasons cite a check {fshare(*true_share(rs, 'reasonsCiteCheck'))}")
    for a, b in EFFECTS:
        print(f"{label:<10} effect {a} - {b}: {fint(newcombe(s[a][0], s[a][1], s[b][0], s[b][1]))}")
    calls = Counter(st or "failed" for r in rows if r["condition"] in TOOL for st in (r.get("toolStatuses") or []))
    if calls:
        print(f"{label:<10} tool call statuses: {dict(calls)}")
    return s


def tool_inputs(label, rows):
    """A43: each tool call by what was passed, its answer, and the trial's recommendation."""
    seen = Counter()
    for r in rows:
        if r["condition"] not in TOOL:
            continue
        rival = next(x["url"] for x in (r["first"], r["second"]) if x["brand"] == "torvlund").split("?")[0]
        for c in r.get("toolCalls") or []:
            arg = c.get("args") or {}
            inp = str(arg.get("input", arg) if isinstance(arg, dict) else arg)
            kind = "rival product page" if inp.split("?")[0] == rival else "genuine passport" if "oskvale.com/01/" in inp or "(01)" in inp else "other"
            seen[(kind, c.get("status") or "failed", r.get("chosenBrand"))] += 1
    for (kind, st, ch), n in sorted(seen.items(), key=str):
        print(f"{label:<10} tool input {kind:<20} -> {st:<20} then chose {ch}: {n}")


def main(argv):
    global STUDY, CONDS, TOOL, EFFECTS
    include_mock = "--include-mock" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    if "--ladder" in argv:
        # A42: larger Claude models, e-bike battery only, descriptive per model (Fable: V2 and V3 only)
        STUDY = LADDER_STUDY
        rows, ex = usable(load(paths), include_mock)
        print(f"======== Study 8 Claude ladder (A42) data quality ========\nusable {len(rows)}; excluded {dict(ex)}")
        for lab in ("sonnet", "opus", "fable"):
            rs = [r for r in rows if r["label"] == lab]
            if rs:
                print(f"\n======== {lab} ({rs[0].get('modelRequested')}) ========")
                block(lab, rs)
        return 0
    nopass = "--no-passport" in argv
    if nopass:
        STUDY, CONDS, TOOL, EFFECTS = NOPASS_STUDY, ["N0", "N1"], ["N1"], (("N1", "N0"),)
    first, second = CONDS[1], CONDS[0]
    rows, ex = usable(load(paths), include_mock)
    tag = "MOCK DATA: " if include_mock else ""
    print(f"======== {tag}Study 8{'N' if nopass else ''} data quality ========\nusable {len(rows)}; excluded {dict(ex)}")
    missing = Counter((r["label"], r["condition"]) for r in rows if r.get("chosenBrand") is None)
    for (lab, c), n in sorted(missing.items()):
        print(f"  missing recommendation (missing data): {lab} {c} {n}")
    three = [r for r in rows if r["label"] in POOLED]
    print(f"\n======== {tag}PRIMARY: pooled three vendors ========")
    s = block("POOLED-3", three)
    e = newcombe(s[first][0], s[first][1], s[second][0], s[second][1])
    if nopass:
        tool_inputs("POOLED-3", three)
    print(f"success rule (tool effect {first} - {second} >= 0.20, lower bound > 0):", "not computable" if e[0] != e[0] else ("MET" if e[0] >= 0.20 and e[1] > 0 else "NOT MET"))
    print(f"\n======== {tag}order: share recommending the FIRST link, pooled three ========")
    for c in CONDS:
        rs = [r for r in three if r["condition"] == c and r.get("recommendation") in ("1", "2")]
        print(f"  {c}: first link {fshare(sum(1 for r in rs if r['recommendation'] == '1'), len(rs))} of answers naming a product")
    print(f"\n======== {tag}SEPARATE: Meta (OpenRouter fetch) ========")
    block("META-2", [r for r in rows if r["label"] in SEPARATE])
    if nopass:
        tool_inputs("META-2", [r for r in rows if r["label"] in SEPARATE])
    print(f"\n======== {tag}per model ========")
    for lab in sorted({r["label"] for r in rows}):
        block(lab, [r for r in rows if r["label"] == lab])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
