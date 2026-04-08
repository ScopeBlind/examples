#!/bin/bash
# Composition Test: verify all receipts from both governance engines
# One verifier, two engines, four receipts

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
SB_KEY=$(cat "$DIR/scopeblind-pubkey.txt")
APS_KEY=$(cat "$DIR/../aps-test-vectors/gateway-pubkey.txt")

echo "=== ScopeBlind receipts (Cedar policy engine) ==="
npx @veritasacta/verify@0.2.5 "$DIR/scopeblind-policy-eval.json" --key "$SB_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/scopeblind-execution.json" --key "$SB_KEY"

echo ""
echo "=== APS receipts (delegation + scope engine) ==="
npx @veritasacta/verify@0.2.5 "$DIR/../aps-test-vectors/receipt-permit.json" --key "$APS_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/../aps-test-vectors/receipt-deny.json" --key "$APS_KEY"
npx @veritasacta/verify@0.2.5 "$DIR/../aps-test-vectors/receipt-commerce.json" --key "$APS_KEY"

echo ""
echo "=== action_ref (shared anchor) ==="
echo "ScopeBlind: $(cat "$DIR/action-ref.txt")"
echo ""
echo "All receipts verified. Two engines, one verifier, one IETF draft."
