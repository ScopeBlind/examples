#!/bin/bash
# verify-receipt.sh -- View and verify protect-mcp receipts
#
# Usage: ./verify-receipt.sh

set -e

echo "=== Latest receipts ==="
echo ""
npx protect-mcp receipts --last 5

echo ""
echo "=== Verify independently ==="
echo ""
npx @veritasacta/verify .protect-mcp-receipts.jsonl
