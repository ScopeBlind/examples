#!/bin/bash
# test.sh -- Send test MCP requests to the server and verify receipts.
#
# Usage:
#   1. In one terminal: npm start
#   2. In another terminal: ./test.sh
#
# This script pipes JSON-RPC requests into the server's stdin and reads
# responses from stdout. If you started the server with protect-mcp,
# each call produces a signed receipt.

set -e

SERVER_CMD="npx protect-mcp --policy policy.json --enforce -- node server.js"

echo "Starting server with protect-mcp..."
echo ""

# Use a temporary FIFO to communicate with the server
FIFO_IN=$(mktemp -u)
FIFO_OUT=$(mktemp -u)
mkfifo "$FIFO_IN"
mkfifo "$FIFO_OUT"

# Start the server in the background
$SERVER_CMD < "$FIFO_IN" > "$FIFO_OUT" 2>/dev/null &
SERVER_PID=$!

# Open file descriptors
exec 3>"$FIFO_IN"
exec 4<"$FIFO_OUT"

# Give the server a moment to initialize
sleep 1

# Helper: send a request and read the response
send_request() {
  local label="$1"
  local payload="$2"

  echo "--- $label ---"
  echo "$payload" >&3
  read -t 5 response <&4 2>/dev/null || response='{"error":"timeout"}'
  echo "$response"
  echo ""
}

# Initialize
send_request "initialize" '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'

# Test 1: get_weather (should be allowed)
send_request "get_weather" '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_weather","arguments":{"city":"London"}}}'

# Test 2: send_email (should be allowed, rate-limited)
send_request "send_email" '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"send_email","arguments":{"to":"alice@example.com","subject":"Meeting tomorrow","body":"See you at 3pm"}}}'

# Test 3: delete_account (should be denied by policy)
send_request "delete_account" '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"delete_account","arguments":{"user_id":"user-123","confirmation":"CONFIRM"}}}'

# Clean up
exec 3>&-
exec 4<&-
kill $SERVER_PID 2>/dev/null || true
rm -f "$FIFO_IN" "$FIFO_OUT"

echo "=== Receipts ==="
echo ""
if [ -f .protect-mcp-receipts.jsonl ]; then
  npx protect-mcp receipts --last 5
  echo ""
  echo "=== Verify ==="
  echo ""
  npx @veritasacta/verify .protect-mcp-receipts.jsonl
else
  echo "No receipts file found. This is expected if the server was not"
  echo "started through protect-mcp."
fi
