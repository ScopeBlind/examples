# Express API Gateway -- Cedar Policies + Signed Receipts

Wraps an Express-based MCP tool server with protect-mcp policies and signed
receipts. Demonstrates JSON policy format, rate limiting, and per-tool
allow/deny rules.

## Quick start

### 1. Install dependencies

```bash
cd express-api-gateway
npm install
```

### 2. Start the server through protect-mcp

```bash
npx protect-mcp --policy policy.json --enforce -- node server.js
```

This starts `server.js` as a child process with protect-mcp sitting in front.
Every MCP `tools/call` request is evaluated against `policy.json` before
reaching the server.

### 3. Test the tools

In another terminal:

```bash
./test.sh
```

This sends three tool calls over stdio and shows what happens:

- `get_weather` -- allowed (safe, no restrictions)
- `send_email` -- allowed (rate-limited to 5 per minute)
- `delete_account` -- denied (blocked by policy)

### 4. View receipts

```bash
npx protect-mcp receipts
```

### 5. Export audit bundle

```bash
npx protect-mcp bundle
```

This creates a portable audit archive containing all receipts, the policy
snapshot, and a manifest signature.

## What you'll see

```
$ ./test.sh

--- get_weather ---
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Weather in London: 14C, partly cloudy"}]}}

--- send_email ---
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Email sent to alice@example.com: subject='Meeting tomorrow'"}]}}

--- delete_account ---
{"jsonrpc":"2.0","id":3,"error":{"code":-32603,"message":"DENIED by policy: Destructive operations require human approval"}}

$ npx protect-mcp receipts --last 3

[2026-04-04T10:20:01Z] ALLOW  get_weather      sha256:f1e2d3...  sig:OK
[2026-04-04T10:20:02Z] ALLOW  send_email       sha256:f1e2d3...  sig:OK
[2026-04-04T10:20:03Z] DENY   delete_account   sha256:f1e2d3...  sig:OK
```

All three calls produce signed receipts -- including the denied one. The
receipt proves that the policy evaluation happened and what the decision was.

## Files in this example

```
express-api-gateway/
  package.json    -- Dependencies
  server.js       -- MCP server with 3 tools (stdio JSON-RPC)
  policy.json     -- protect-mcp JSON policy
  test.sh         -- Sends test requests and shows results
```

## Policy format

The JSON policy format is the simplest way to configure protect-mcp. Each
tool can be set to allow or deny, with optional conditions:

```json
{
  "default": "allow",
  "rules": [
    { "tool": "delete_account", "decision": "deny", "reason": "..." },
    { "tool": "send_email", "decision": "allow", "conditions": { "max_per_minute": 5 } }
  ]
}
```

For more complex policies (path-based rules, role checks, contextual
conditions), use Cedar policies instead. See the
[mcp-server-signing](../mcp-server-signing/) example.

## How verification works

Each receipt contains:

- **Decision**: allow, deny, or shadow
- **Policy digest**: SHA-256 hash of the policy at evaluation time
- **Timestamp**: ISO 8601 decision time
- **Tool name and input hash**: what was called
- **Ed25519 signature**: covers all fields above

Verify offline with:

```bash
npx @veritasacta/verify .protect-mcp-receipts.jsonl
```

The verifier checks Ed25519 signatures without contacting any server. It is
issuer-blind -- it validates cryptographic integrity without knowing or
trusting the original signer.
