#!/bin/bash
# verify.sh -- Verify protect-mcp receipts from a TAKT workflow run
#
# Checks that receipt signatures are valid and shows a summary of
# the workflow's tool call audit trail.
#
# Usage: ./verify.sh [receipt-file]
#
# Default receipt file: .protect-mcp-receipts.jsonl

set -e

RECEIPT_FILE="${1:-.protect-mcp-receipts.jsonl}"

echo "=== TAKT Workflow Receipt Verification ==="
echo ""

# -----------------------------------------------------------------
# 1. Check if receipt file exists
# -----------------------------------------------------------------

if [ ! -f "$RECEIPT_FILE" ]; then
  echo "No receipt file found at: $RECEIPT_FILE"
  echo ""
  echo "This means either:"
  echo "  - protect-mcp was not running during the workflow"
  echo "  - The workflow has not been run yet"
  echo ""
  echo "To generate receipts:"
  echo "  1. Start protect-mcp:  npx protect-mcp serve --enforce --cedar ./policies"
  echo "  2. Run the workflow:   takt run workflow.takt.yaml --task \"<your task>\""
  exit 1
fi

# -----------------------------------------------------------------
# 2. Count receipts
# -----------------------------------------------------------------

RECEIPT_COUNT=$(wc -l < "$RECEIPT_FILE" | tr -d ' ')
echo "Receipt file: $RECEIPT_FILE"
echo "Total receipts: $RECEIPT_COUNT"
echo ""

if [ "$RECEIPT_COUNT" -eq 0 ]; then
  echo "Receipt file is empty. No tool calls were recorded."
  exit 0
fi

# -----------------------------------------------------------------
# 3. Show recent receipts
# -----------------------------------------------------------------

echo "--- Recent receipts ---"
echo ""
npx protect-mcp receipts --last 10 2>/dev/null || {
  echo "(protect-mcp CLI not available -- showing raw tail)"
  echo ""
  tail -5 "$RECEIPT_FILE"
}

echo ""

# -----------------------------------------------------------------
# 4. Run offline verification
# -----------------------------------------------------------------

echo "--- Offline verification ---"
echo ""
npx @veritasacta/verify "$RECEIPT_FILE" 2>/dev/null
VERIFY_EXIT=$?

echo ""

# -----------------------------------------------------------------
# 5. Summary
# -----------------------------------------------------------------

if [ "$VERIFY_EXIT" -eq 0 ]; then
  echo "--- Summary ---"
  echo ""
  echo "  Receipts verified: $RECEIPT_COUNT"
  echo "  Signature status:  all valid"
  echo "  Verification:      offline (no server contacted)"
  echo ""
  echo "These receipts provide tamper-evident proof that:"
  echo "  - Each tool call was evaluated against a Cedar policy"
  echo "  - The decision (allow/deny) was signed at evaluation time"
  echo "  - No receipt has been modified after signing"
  echo ""
  echo "To export a compliance bundle:"
  echo "  npx protect-mcp bundle --output audit-bundle.json"
else
  echo "--- Summary ---"
  echo ""
  echo "  Receipts checked:  $RECEIPT_COUNT"
  echo "  Signature status:  FAILURES DETECTED"
  echo ""
  echo "One or more receipts failed verification. This indicates"
  echo "the receipt file has been modified after signing."
  exit 1
fi
