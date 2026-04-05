# MCP Server with Cedar Policy Engine

Advanced example using the Cedar WASM policy engine for per-tool authorization.
Cedar gives you typed, composable policy rules with path matching, role checks,
and contextual conditions -- all evaluated locally in WebAssembly.

## Prerequisites

- Node.js 20+
- npm 9+
- `@cedar-policy/cedar-wasm` is installed as an optional dependency. If
  unavailable, protect-mcp falls back to its built-in evaluator.

## Quick start

### 1. Install dependencies

```bash
cd mcp-server-signing
npm install
```

### 2. Review the Cedar policy

Open `policy.cedar` to see the four authorization rules:

- `read_file` -- permitted for all callers
- `write_file` -- permitted only for paths under `/tmp/`
- `execute_command` -- forbidden (requires explicit allow-list)
- `access_database` -- requires admin role in the request context

Edit these rules to match your requirements.

### 3. Start the server with Cedar enforcement

```bash
npx protect-mcp --cedar ./policy.cedar --enforce -- node server.js
```

protect-mcp detects `.cedar` files automatically and loads the WASM evaluator.
Every tool call is checked against the policy before reaching the server.

### 4. Run the test suite

In another terminal:

```bash
./verify.sh
```

This sends test requests demonstrating each authorization pattern, then
verifies all receipts offline.

### 5. Export a compliance bundle

```bash
npx protect-mcp bundle --format audit
```

The audit bundle contains:

- All signed receipts
- The Cedar policy snapshot (source + SHA-256 digest)
- A manifest linking receipts to the policy version
- A bundle signature covering the entire archive

## What you'll see

```
$ ./verify.sh

--- read_file (should ALLOW) ---
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Contents of /etc/hostname: dev-machine"}]}}

--- write_file to /tmp (should ALLOW) ---
{"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Wrote 13 bytes to /tmp/test.txt"}]}}

--- write_file to /etc (should DENY) ---
{"jsonrpc":"2.0","id":3,"error":{"code":-32603,"message":"DENIED by Cedar: write_file not permitted for path /etc/passwd"}}

--- execute_command (should DENY) ---
{"jsonrpc":"2.0","id":4,"error":{"code":-32603,"message":"DENIED by Cedar: execute_command is forbidden"}}

--- access_database with admin role (should ALLOW) ---
{"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"Query result: 42 rows from users table"}]}}

--- access_database without role (should DENY) ---
{"jsonrpc":"2.0","id":6,"error":{"code":-32603,"message":"DENIED by Cedar: access_database requires admin role"}}

=== Verify receipts ===

Verified 6 receipts, 0 failures
Policy digest: sha256:b7c8d9e0f1a2...
Cedar policy: policy.cedar (4 rules)
All signatures valid.
```

## Files in this example

```
mcp-server-signing/
  package.json     -- Dependencies (includes optional Cedar WASM)
  server.js        -- MCP server with 4 tools (stdio JSON-RPC)
  policy.cedar     -- Cedar authorization policy
  verify.sh        -- Test requests + receipt verification
```

## Cedar policy structure

Cedar policies use a principal/action/resource model. In protect-mcp:

- **Principal**: the agent or caller identity (default: anonymous)
- **Action**: always `Action::"MCP::Tool::call"` for tool invocations
- **Resource**: `Tool::"<tool_name>"` -- the tool being called
- **Context**: additional fields from the request (role, path, tier, etc.)

Example rule that allows database access only for admins:

```cedar
permit(principal, action, resource)
  when { resource.tool == "access_database" && context.role == "admin" };
```

Cedar evaluates all matching rules. An explicit `forbid` always wins over
`permit` (deny-overrides semantics).

## How verification works

Each receipt contains:

- **Decision**: allow or deny, with the Cedar rule ID that produced it
- **Policy digest**: SHA-256 hash of the full Cedar policy source
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
