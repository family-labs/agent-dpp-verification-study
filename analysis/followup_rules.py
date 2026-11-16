"""
Follow-up arm O: the pre-specified `flaggedProblem` rules (to be quoted in the amendment).

Arm O never asks the model about evidence, so whether it noticed the problem in C (data
edited after it was recorded) or D (the page overstates cycle life) is read off its
response text by these rules, and nothing else. They are deliberately CONSERVATIVE: a
response counts as flagging the problem only if it says so in words these patterns
recognise; a vague worry, a paraphrase they miss, or a negated statement counts as NOT
flagged. False negatives are accepted to keep false positives near zero.

How a rule is applied (`flagged_problem`):
  * text = the row's full `responseText` (including the final JSON block);
  * condition C: flagged if ANY pattern in FLAGGED_PROBLEM_RULES["C"]["patterns"] matches
    at a position whose preceding context in the same sentence (up to
    `negation_window` characters back, cut at the last . ! ? or newline) contains no
    negation token (`negation`). "There is no sign the data was altered" is NOT a flag;
  * condition D: flagged if ANY pattern in FLAGGED_PROBLEM_RULES["D"]["patterns"] matches
    (6000 and 4000, in any of the spellings below, within one paragraph). No negation
    guard: naming both figures is the discrepancy;
  * matching is case-insensitive; patterns use only syntax that Python `re` and
    JavaScript RegExp read identically.
The same rules are also run on the conditions where there is no such problem (C's rule on
A, B, E; D's rule on A, B, C, E) and reported as a false-positive check.
"""
import re

FLAGGED_PROBLEM_RULES = {
    "C": {
        "what": "the response says the passport data changed / was altered after it was recorded, "
                "or that it failed a verification or integrity check",
        "negation_window": 40,
        "negation": r"\b(?:no|not|never|without|cannot|unable|nothing|neither|nor)\b|n['’]t\b",
        "patterns": [
            # C1 the verifier's own reason code, quoted or paraphrased with separators
            r"\bdata[_\s-]+changed[_\s-]+since[_\s-]+anchoring\b",
            # C2 the verifier's boolean, reported as false
            r"\bdata_?\s*matches_?\s*credential\b\W{0,8}(?:is\s+|was\s+|=\s*)?false\b",
            # C3 "<the data> has been changed / was altered / were modified / tampered with"
            r"\b(?:data|passport|record|records|credential|information|content|values?|fields?|figures?)\b"
            r"[^.\n]{0,60}?\b(?:has|have|had|was|were)\s+(?:been\s+)?(?:changed|altered|modified|edited|tampered)\b",
            # C4 "changed/altered ... since/after ... anchored/signed/recorded/published/issued"
            r"\b(?:changed|altered|modified|edited|tampered)\b[^.\n]{0,40}?\b(?:since|after)\b[^.\n]{0,30}?"
            r"\b(?:anchor\w*|sign(?:ed|ing|ature)|record(?:ed|ing)|publi\w+|issu\w+|registered|committed|hashed)\b",
            # C5 "failed (the) verification / integrity (check)"
            r"\b(?:fail(?:s|ed|ing)?|did\s+not\s+pass|does\s+not\s+pass)\b[^.\n]{0,30}?\b(?:verification|integrity)\b",
            # C6 "verification / integrity check failed"
            r"\b(?:verification|integrity)(?:\s+(?:check|test))?\s+(?:has\s+|had\s+)?(?:fail(?:s|ed|ure)?)\b",
            # C7 the checker/verifier reported invalid / failed / tampered
            r"\b(?:verifier|checker|verification\s+(?:endpoint|service|link|url|check|result|response))\b"
            r"[^.\n]{0,60}?\b(?:returns?|returned|reports?|reported|says|said|gave|shows?|showed|indicates|indicated|flags?|flagged|states?|stated)\b"
            r"[^.\n]{0,30}?(?:invalid|failed|failure|tamper\w*)\b",
            # C8 "integrity failure / breach / violation / compromised", "tampering detected"
            r"\b(?:integrity|tamper(?:ing|ed)?)\b[^.\n]{0,20}?\b(?:fail\w*|breach\w*|violat\w*|compromis\w*|detected)\b",
        ],
    },
    "D": {
        "what": "the response names both the page's 6000 cycles and the passport's 4000 cycles "
                "within one paragraph (any order; 6000, 6,000, 6 000, 6.000 and likewise 4000)",
        "negation_window": None,
        "negation": None,
        "patterns": [
            r"\b6[,.\s  ]?000\b(?:(?!\n\s*\n)[\s\S]){0,300}?\b4[,.\s  ]?000\b",
            r"\b4[,.\s  ]?000\b(?:(?!\n\s*\n)[\s\S]){0,300}?\b6[,.\s  ]?000\b",
        ],
    },
}

_COMPILED = {
    k: {
        "patterns": [re.compile(p, re.I) for p in v["patterns"]],
        "negation": re.compile(v["negation"], re.I) if v["negation"] else None,
        "window": v["negation_window"],
    }
    for k, v in FLAGGED_PROBLEM_RULES.items()
}


def _negated(text, start, window, neg):
    before = text[max(0, start - window):start]
    cut = max(before.rfind("."), before.rfind("!"), before.rfind("?"), before.rfind("\n"))
    if cut >= 0:
        before = before[cut + 1:]
    return bool(neg.search(before))


def flag_matches(rule, text):
    """Every (pattern index, matched text) of `rule` ("C" or "D") in `text`, negation-guarded."""
    c = _COMPILED[rule]
    out = []
    for i, rx in enumerate(c["patterns"]):
        for m in rx.finditer(text or ""):
            if c["negation"] is not None and _negated(text, m.start(), c["window"], c["negation"]):
                continue
            out.append((i + 1, m.group(0)[:120]))
    return out


def flagged_problem(rule, text):
    return bool(flag_matches(rule, text))
