# Orchestrator handoff: DPPs and AI-agent interoperability

This note carries the conversation context into the Universal Goods research work. The authoritative study files are `STUDY_DESIGN.md` and `PREREGISTRATION.md`; read those before changing the experiment. This note adds the broader whitepaper and agent-discovery questions, not a replacement study design.

## Goal

Refine the Agent DPP Verification Study so its methods and findings can inform the Universal Goods Protocol Whitepaper. The broader thesis is that a product's Unique Product Identifier (UPI) can lead an agent to a Digital Product Passport (DPP), where the agent can inspect claims and use interoperable verification or other product utilities.

Example UPI discussed: <https://ugpdpp.xyz/01/293959384059/21/000004>.

Treat the thesis as something to test. A public blockchain passport does not by itself guarantee an agent can discover it, choose to use it, or establish that a physical object is authentic. On-chain token ownership/provenance, issuer claims, credential validity, and physical-to-digital binding are distinct assertions with different evidence requirements.

## What we concluded about agent behavior

- The most reliable way to make an agent perform an action is to control its runtime: resolve the UPI, provide an approved tool, require the appropriate verification call in the workflow, and validate that the tool result is bound to the same product before the model makes claims. A prompt or passive metadata cannot guarantee a tool call.
- For third-party agents whose hosts we do not control, we can improve discovery and interoperability but cannot compel use.
- WebMCP is a promising browser-side path: a DPP page can expose narrowly scoped tools to a compatible agent while it visits the page. It is page/tab-contextual and support is still developing. It is not a universal guarantee.
- UPI pages should have clear visible links and machine-readable passport references, and can progressively expose tools such as `dpp.get`, `dpp.verify`, and `dpp.provenance`. Keep capability descriptions declarative and schemas constrained; do not execute arbitrary code stored in passport metadata.
- Read-only verification may be automated by a host policy. Transfers or other consequential operations should require wallet/user authorization.

References for current tool-discovery framing: [Chrome WebMCP overview](https://developer.chrome.com/docs/ai/agents), [WebMCP implementation status](https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md), [WebMCP security guidance](https://developer.chrome.com/docs/agents/security), and [Gemini function-calling modes](https://ai.google.dev/gemini-api/docs/function-calling?authuser=451499271) as one concrete example of host-side constrained function calling.

## Research questions to add or align

The existing repo tests verification when passport information or verifier tools are supplied. Consider a companion discovery experiment that varies how the UPI/DPP is presented and measures:

1. **Recognition:** Does the agent identify that the product has a DPP?
2. **Retrieval:** Does it resolve the UPI and fetch the correct passport?
3. **Tool discovery and invocation:** Does it find and call an available verifier without being explicitly told to, and does this vary by surface (page metadata, WebMCP, MCP/API host integration)?
4. **Correctness and calibration:** Does it distinguish valid, missing, invalid, stale, or mismatched evidence, and express uncertainty appropriately?
5. **Safety and authority:** Does it avoid treating tool availability as permission to transfer or mutate ownership?
6. **Robustness/interoperability:** Do behavior and outcomes persist across agent providers, page layouts, metadata signals, and model versions?

Possible staged framing: (1) recognition/retrieval, (2) tool discovery/use and verification accuracy, (3) safety, adversarial robustness, and cross-agent interoperability. Keep this separate from or explicitly integrated with the current study's existing `naive`, `tool_available`, and `tool_instructed` capability modes; avoid duplicating the experiment without a clear estimand.

## Whitepaper claim boundary

Prefer a testable claim such as: “A stable UPI combined with machine-readable passport references and a standard callable-tool interface can improve DPP discovery and use by compatible agents.” Do not claim “blockchain makes agents interoperable by default” unless the experiment supports it. Publicly publishing a passport makes it addressable; it does not ensure every agent crawls it or invokes its tools.

## Next action for the orchestrator

Inspect the current repo and harness, then propose a preregisterable experiment that isolates *discovery* from *verification capability*. Define conditions, ground truth, primary outcomes, success criteria, safety boundaries, and model/version logging before running trials. Preserve the repo's existing honesty boundaries and do not change the registered protocol silently.
