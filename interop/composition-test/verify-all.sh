#!/bin/bash
# Composition Test: verify all receipts from both governance engines
# One tool call, two engines, five receipts for the same action_ref

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
SB_KEY=$(cat "$DIR/scopeblind-pubkey.txt")
APS_COMP_KEY=$(cat "$DIR/aps-receipts/gateway-pubkey.txt")
APS_VEC_KEY=$(cat "$DIR/../aps-test-vectors/gateway-pubkey.txt")

echo "=== ScopeBlind receipts (Cedar policy engine) ==="
npx @veritasacta/verify@0.2.5 "$DIR/scopeblind-policy-eval.json" --key "$SB_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/scopeblind-execution.json" --key "$SB_KEY"

echo ""
echo "=== APS composition receipts (delegation + scope + outcome) ==="
npx @veritasacta/verify@0.2.5 "$DIR/aps-receipts/evaluation.json" --key "$APS_COMP_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/aps-receipts/permit.json" --key "$APS_COMP_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/aps-receipts/outcome.json" --key "$APS_COMP_KEY"

echo ""
echo "=== Earlier APS test vectors (independent scenario) ==="
npx @veritasacta/verify@0.2.5 "$DIR/../aps-test-vectors/receipt-permit.json" --key "$APS_VEC_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/../aps-test-vectors/receipt-deny.json" --key "$APS_VEC_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/../aps-test-vectors/receipt-commerce.json" --key "$APS_VEC_KEY"

echo ""
echo "=== action_ref anchors ==="
echo "ScopeBlind:      $(cat "$DIR/action-ref.txt")"
echo "APS composition: $(cat "$DIR/aps-receipts/action-ref.txt")"
echo ""
echo "8 receipts, 2 engines, 2 scenarios, 1 verifier. All VALID."
