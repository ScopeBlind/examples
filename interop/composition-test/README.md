# Composition Test: ASM + ScopeBlind + APS

**One service choice. One tool call. Two governance evaluations. One verifier.**

This test demonstrates the composition model for service selection and multi-engine agent governance. ASM records why the fixture chooses one eligible API route before the call. A single CrewAI tool call (`execute_api_call`) is then independently evaluated by two different governance engines (ScopeBlind Cedar policy + APS delegation scope), both producing Ed25519-signed receipts in the IETF draft envelope format and both verifiable by the same offline tool.

## Scenario

A CrewAI research agent calls `execute_api_call`:
- **Tool:** POST to `api.openrouter.ai` (paid API)
- **Spend:** $0.50
- **Model:** `anthropic/claude-sonnet-4-20250514`

### ASM selection (pre-call)
- Checks: cloud invocability, required chat/API functions, fixture price, and approval boundary
- Produces: an unsigned Selection Receipt that pins both candidate manifests by digest
- Authority: explains the choice only; it is not an authorization, execution, or payment receipt

### APS evaluation (delegation + scope)
- Checks: delegation scope includes `tools:api_call`, spend within $500 budget
- Produces: delegation receipt with `extensions.aps`

### ScopeBlind evaluation (Cedar policy)
- Checks: Cedar policy permits API calls for `research` tier, rate limit not exceeded
- Produces: policy evaluation receipt + execution receipt with `extensions.scopeblind`

### Correlation
Both governance evaluations reference the same `action_ref` -- a SHA-256 hash of the canonical tool invocation (`agent_id + tool_name + args`). ScopeBlind's signed policy and execution receipts also carry `extensions.asm.selection_receipt`, which references the exact pre-call Selection Receipt digest. A verifier can therefore link **why this route** to **was this call allowed** and **what executed** without making any receipt authoritative for another event.

## Receipts

| File | Engine | Type | Chain |
|------|--------|------|-------|
| `asm-selection-receipt.json` | ASM | Pre-call selection explanation (unsigned v0.1) | Pins the two fixture manifests |
| `scopeblind-policy-eval.json` | ScopeBlind | Cedar policy evaluation | First in chain |
| `scopeblind-execution.json` | ScopeBlind | Tool execution result | Links to policy eval |

APS-side receipts are at [`../aps-test-vectors/`](../aps-test-vectors/).

## Verify

```bash
# ScopeBlind receipts
SB_KEY=$(cat scopeblind-pubkey.txt)
npx @veritasacta/verify@0.2.5 scopeblind-policy-eval.json --key $SB_KEY
npx @veritasacta/verify@0.2.5 scopeblind-execution.json --key $SB_KEY

# APS receipts (same verifier, different engine)
APS_KEY=$(cat ../aps-test-vectors/gateway-pubkey.txt)
npx @veritasacta/verify@0.2.5 ../aps-test-vectors/receipt-permit.json --key $APS_KEY
npx @veritasacta/verify@0.2.5 ../aps-test-vectors/receipt-commerce.json --key $APS_KEY
```

All four should return exit code 0 (VALID).

Validate the two scenario-local selection manifests independently:

```bash
python -m pip install "asm-protocol==0.5.2"
asm-lint asm-openrouter-manifest.json --as-of 2026-08-17 --fail-on not-ready
asm-lint asm-direct-manifest.json --as-of 2026-08-17 --fail-on not-ready
```

These manifests deliberately describe fixed fixture values, not current provider pricing.

## Verify all at once

```bash
bash verify-all.sh
```

## What this proves

1. **Format convergence.** Two independent implementations (APS ProxyGateway + ScopeBlind protect-mcp) produce receipts that verify against the same tool, without coordination on the verification path.

2. **Event authority stays separate.** The unsigned ASM receipt explains provider selection. ScopeBlind and APS remain authoritative for their own signed policy and execution events. Referencing the Selection Receipt digest does not turn ASM into an authorization or settlement proof.

3. **Extension isolation.** `extensions.asm` carries only a Selection Receipt reference, `extensions.scopeblind` carries Cedar results, and `extensions.aps` carries delegation chains and spend tracking. Signed extensions are tamper-evident but remain semantically owned by their issuers.

4. **Composable governance.** An agent can be simultaneously selected by a local ASM policy and governed by APS and ScopeBlind without any engine reproducing another engine's facts.

5. **IETF draft as interop baseline.** The governance systems reference `draft-farley-acta-signed-receipts-01`. The draft defines their signed envelope; the ASM Selection Receipt remains a separate, digest-linked pre-call artifact.

## Generate fresh receipts

```bash
node generate-receipts.mjs
```

This generates new Ed25519 keys and fresh governance receipts for the scenario. The `action_ref` and Selection Receipt digest are deterministic while their input files remain unchanged.

## Cedar policy used

```cedar
permit(
  principal,
  action == Action::"execute_api_call",
  resource
) when {
  context.agent_tier in ["research", "trading", "admin"] &&
  context.daily_api_calls < 1000 &&
  context.spend_usd <= 500.00
};
```

Policy digest included in every ScopeBlind receipt. If the policy changes, the digest changes, and the audit trail shows exactly when.

## Links

- [IETF Draft: Signed Receipts](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/)
- [APS test vectors](../aps-test-vectors/)
- [CrewAI integration discussion](https://github.com/crewAIInc/crewAI/issues/5283)
- [@veritasacta/verify](https://npmjs.com/package/@veritasacta/verify) (Apache-2.0)
- [protect-mcp](https://npmjs.com/package/protect-mcp) (MIT)
- [agent-passport-system](https://npmjs.com/package/agent-passport-system)
- [ASM Selection Receipt v0.1](https://github.com/YE-YI7/asm-spec/blob/main/docs/specs/selection-receipt.md)
