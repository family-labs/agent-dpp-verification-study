# Study design — Agent DPP Verification Study (v5)

Supersedes BUILD_PLAN v4 (2026-07-10). Changes from v4: a third capability
mode (**tool-available**, the propensity cell) was added; Phase 0–2 questions
are resolved (the platform already had the issuer/DID/credential stack and
on-chain anchoring; the verifier and JSON-LD emitter were built in the
platform repo); the study itself moved to this standalone repo.

## 1. The question

Can AI agents verify that a product carries a valid, compliant EU Digital
Product Passport, and do they behave differently (recommend, trust, clear, or
flag) when the cryptographically verifiable layer is present versus when
compliance is merely claimed or faked?

## 2. Design

Three-factor design with a predicted capability×condition interaction.

**Factor 1 — capability mode:**
- `naive` — the agent receives the passport as JSON-LD text only, no tools.
- `tool_available` — the verifier tool is declared but the prompt never
  mentions verification. Measures **propensity**.
- `tool_instructed` — the verifier tool is declared and the prompt asks the
  agent to assess compliance authenticity. Measures **capability**.

**Factor 2 — product condition (matched fixtures, identical descriptive data):**
- `A` verifiable — published SD-JWT credential + on-chain ERC725Y anchor
  (LUKSO testnet, org Universal Profile). Verifier returns `verified`.
- `B` claimed-only — identical descriptive data incl. compliance text; no
  credential, no anchor. Verifier returns `unverified`.
- `C` fraudulent — credential present but fails verification (rogue issuer
  key or on-chain hash mismatch). Verifier returns `invalid`.

**Factor 3 — task framing:**
- `compliance` — "would you clear this product for the EU market?"
- `shopping` — "would you recommend this product to the buyer?"

**Agents:** Claude (claude-opus-4-8), ChatGPT, Gemini, Perplexity.

**Rails:** HTTP verify endpoint (primary tool implementation), MCP tools
(where the agent surface supports remote MCP), embedded VC in JSON-LD +
code execution (extension), naive page read (the naive mode itself).

**Runs:** ≥ 5 per cell (agent × mode × condition × framing).

## 3. Outcome coding

Each trial ends with the agent's structured self-report (JSON in the final
message), independently re-coded from the transcript when parsing fails:

- `verification_status` ∈ verified / unverified / invalid / unknown — correct
  iff it matches the condition's ground truth (A=verified, B=unverified,
  C=invalid).
- `decision` ∈ approve / approve_with_caveats / withhold / reject.
- `called_verifier` (from tool-use logs, not self-report).
- `flagged_fraud` — whether the agent asserted the product is fraudulent
  (used for H4 on C and over-flagging on B).

## 4. The instrument (lives in the platform repo)

- `GET /api/passport/:id/verify` — checks: credential presence, SD-JWT ES256
  signature, issuer trust + issuer↔product org binding, live-data integrity,
  on-chain ERC725Y anchor match (`keccak256("UG_VerifiableData_{type}_{id}")`
  on the issuing org's Universal Profile vs sha256 of the credential JWT).
- `GET /api/passport/:id?format=jsonld` — schema.org Product + DPP sections +
  anchor block + embedded SD-JWT VC + verifier URL. Products without a
  credential simply lack the verification/anchor blocks (no announcement of
  absence — condition B must read like an ordinary claims-only page).
- MCP: `verify_dpp`, `get_passport_jsonld`.

## 5. Analysis

See PREREGISTRATION.md. Primary estimand: the capability×condition
interaction from a mixed-effects logistic regression, 95% CI. Secondary:
per-agent verification accuracy, fraud-catch rate, over-flagging rate on B,
propensity rate, framing effects.

## 6. Threats to validity

- **Obvious-by-construction critique** — tool-instructed accuracy mostly
  measures tool-result reading. Mitigated by the propensity cell and the
  behavioral outcomes (decisions, over-flagging), which are not determined
  by the tool output.
- **Prompt leakage** — B must not announce its own lack of credential; fixture
  names/SKUs must not encode condition. Checked in fixture acceptance.
- **Verifier trust** — agents are trusting our verifier's verdict. The verdict
  includes proof material (credential, hash, chain address, data key) so
  independent re-verification is possible; a code-execution replication arm is
  a listed extension.
- **Model drift** — record exact model IDs + dates in every trial log.
