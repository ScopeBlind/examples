#!/bin/bash
# Composition Test: verify the pre-call selection link and signed governance receipts

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
SB_KEY=$(cat "$DIR/scopeblind-pubkey.txt")
APS_COMP_KEY=$(cat "$DIR/aps-receipts/gateway-pubkey.txt")
APS_VEC_KEY=$(cat "$DIR/../aps-test-vectors/gateway-pubkey.txt")

echo "=== ASM pre-call selection link ==="
python3 - "$DIR" <<'PY'
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])

def load(name):
    return json.loads((root / name).read_text(encoding="utf-8"))

def digest(value):
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return "sha256:" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()

selection = load("asm-selection-receipt.json")
selection_digest = digest(selection)
expected = (root / "asm-selection-receipt-digest.txt").read_text(encoding="utf-8").strip()
assert selection_digest == expected, "Selection Receipt digest file does not match"

manifests = {
    item["service_id"]: item["manifest_digest"]
    for item in selection["evidence"]
}
for name in ("asm-openrouter-manifest.json", "asm-direct-manifest.json"):
    manifest = load(name)
    assert manifests[manifest["service_id"]] == digest(manifest), f"manifest digest mismatch: {name}"

for name in ("scopeblind-policy-eval.json", "scopeblind-execution.json"):
    receipt = load(name)
    reference = receipt["payload"]["extensions"]["asm"]["selection_receipt"]
    assert reference["digest"] == selection_digest, f"Selection Receipt reference mismatch: {name}"
    assert reference["selection_id"] == selection["selection_id"], f"selection_id mismatch: {name}"

scopeblind_action = load("scopeblind-policy-eval.json")["payload"]["action_ref"]
aps_action = (root / "aps-receipts" / "action-ref.txt").read_text(encoding="utf-8").strip()
assert scopeblind_action == aps_action, "ScopeBlind and APS action_ref values do not match"

print(f"Selection Receipt: {selection_digest}")
print("2 manifest digests, 2 signed receipt references, and shared action_ref: MATCH")
PY

echo ""
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
echo "1 selection artifact, 8 signed receipts, 3 engines, 2 scenarios. All VALID."
