#!/bin/bash
# verify.sh -- Test Cedar-based MCP authorization and verify receipts.
#
# Sends six tool calls demonstrating different Cedar authorization patterns,
# then verifies all receipts offline.
#
# Usage:
#   1. In one terminal: npm start
#   2. In another terminal: ./verify.sh

set -e

SERVER_CMD="npx protect-mcp --cedar ./policy.cedar --enforce -- node server.js"

echo "Starting server with Cedar policy enforcement..."
echo ""

# Use temporary FIFOs to communicate with the server
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

# Test 1: read_file (should ALLOW -- permitted for all)
send_request "read_file (should ALLOW)" '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/etc/hostname"}}}'

# Test 2: write_file to /tmp (should ALLOW -- path matches /tmp/*)
send_request "write_file to /tmp (should ALLOW)" '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"write_file","arguments":{"path":"/tmp/test.txt","content":"hello from mcp"}}}'

# Test 3: write_file to /etc (should DENY -- path does not match /tmp/*)
send_request "write_file to /etc (should DENY)" '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"write_file","arguments":{"path":"/etc/passwd","content":"malicious"}}}'

# Test 4: execute_command (should DENY -- forbidden by default)
send_request "execute_command (should DENY)" '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"execute_command","arguments":{"command":"rm -rf /"}}}'

# Test 5: access_database with admin role (should ALLOW)
send_request "access_database with admin role (should ALLOW)" '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"access_database","arguments":{"query":"SELECT * FROM users","table":"users"},"context":{"role":"admin"}}}'

# Test 6: access_database without role (should DENY)
send_request "access_database without role (should DENY)" '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"access_database","arguments":{"query":"SELECT * FROM users","table":"users"}}}'

# Clean up
exec 3>&-
exec 4<&-
kill $SERVER_PID 2>/dev/null || true
rm -f "$FIFO_IN" "$FIFO_OUT"

echo "=== Verify receipts ==="
echo ""
if [ -f .protect-mcp-receipts.jsonl ]; then
  npx protect-mcp receipts --last 10
  echo ""
  npx @veritasacta/verify .protect-mcp-receipts.jsonl
  echo ""
  echo "=== Export audit bundle ==="
  echo ""
  npx protect-mcp bundle --format audit
else
  echo "No receipts file found. This is expected if the server was not"
  echo "started through protect-mcp."
fi
