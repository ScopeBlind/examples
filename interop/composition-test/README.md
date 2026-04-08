# Composition Test: ScopeBlind + APS

**One tool call. Two governance evaluations. One verifier.**

This test demonstrates the composition model for multi-engine agent governance: a single CrewAI tool call (`execute_api_call`) is independently evaluated by two different governance engines (ScopeBlind Cedar policy + APS delegation scope), both producing Ed25519-signed receipts in the IETF draft envelope format, both verifiable by the same offline tool.

## Scenario

A CrewAI research agent calls `execute_api_call`:
- **Tool:** POST to `api.openrouter.ai` (paid API)
- **Spend:** $0.50
- **Model:** `anthropic/claude-sonnet-4-20250514`

### APS evaluation (delegation + scope)
- Checks: delegation scope includes `tools:api_call`, spend within $500 budget
- Produces: delegation receipt with `extensions.aps`

### ScopeBlind evaluation (Cedar policy)
- Checks: Cedar policy permits API calls for `research` tier, rate limit not exceeded
- Produces: policy evaluation receipt + execution receipt with `extensions.scopeblind`

### Correlation
Both governance evaluations reference the same `action_ref` -- a SHA-256 hash of the canonical tool invocation (`agent_id + tool_name + args`). A verifier links the evaluations by this hash without needing to understand either engine's internals.

## Receipts

| File | Engine | Type | Chain |
|------|--------|------|-------|
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

## Verify all at once

```bash
bash verify-all.sh
```

## What this proves

1. **Format convergence.** Two independent implementations (APS ProxyGateway + ScopeBlind protect-mcp) produce receipts that verify against the same tool, without coordination on the verification path.

2. **Extension isolation.** `extensions.scopeblind` carries Cedar policy results. `extensions.aps` carries delegation chains and spend tracking. Both are covered by the envelope signature (tamper-evident) but opaque to the other engine's verifier.

3. **Composable governance.** An agent can be simultaneously governed by APS (delegation scope, spend limits) and ScopeBlind (Cedar policy, rate limits) without either system needing to know about the other. The `action_ref` is the only shared anchor.

4. **IETF draft as interop baseline.** Both systems reference `draft-farley-acta-signed-receipts-01`. The draft defines the envelope; extensions carry engine-specific data.

## Generate fresh receipts

```bash
node generate-receipts.mjs
```

This generates new Ed25519 keys and fresh receipts for the scenario. The `action_ref` is deterministic for the same tool invocation.

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
