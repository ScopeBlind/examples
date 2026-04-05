# ScopeBlind Examples

Three complete examples showing how to add signed, independently verifiable audit trails to AI agent tool calls.

Each example uses [protect-mcp](https://npmjs.com/package/protect-mcp) to wrap MCP tool servers with Cedar policies and Ed25519-signed receipts. Every tool call produces a cryptographic receipt that can be verified offline by anyone -- without contacting the original issuer.

## Examples

| Example | Description | Time |
|---------|-------------|------|
| [claude-code-hooks](./claude-code-hooks/) | Add protect-mcp as Claude Code hooks. Every tool call gets a signed receipt and Cedar policy check. | ~2 min |
| [express-api-gateway](./express-api-gateway/) | Wrap an Express-based MCP server with JSON policies and rate limiting. | ~5 min |
| [mcp-server-signing](./mcp-server-signing/) | Cedar WASM policy engine with per-tool authorization and full audit bundles. | ~10 min |

## Prerequisites

- Node.js 20+
- npm 9+

No ScopeBlind account required. All examples run locally.

## How verification works

Every tool call through protect-mcp produces a signed receipt containing:

1. **Decision** -- whether the call was allowed, denied, or logged (shadow mode)
2. **Policy hash** -- SHA-256 of the Cedar or JSON policy that produced the decision
3. **Timestamp** -- when the decision was made
4. **Tool context** -- tool name, truncated input hash, trust tier
5. **Ed25519 signature** -- signs all of the above

Receipts are appended to `.protect-mcp-receipts.jsonl` (one JSON object per line). Anyone can verify them offline using:

```bash
npx @veritasacta/verify .protect-mcp-receipts.jsonl
```

This checks every signature without contacting any server. The verifier is issuer-blind -- it validates cryptographic integrity without knowing or trusting the original signer.

## Links

- [scopeblind.com](https://scopeblind.com) -- project homepage
- [protect-mcp on npm](https://npmjs.com/package/protect-mcp) -- package documentation
- [scopeblind/scopeblind-gateway](https://github.com/scopeblind/scopeblind-gateway) -- source code
- [Cedar language reference](https://docs.cedarpolicy.com/) -- policy language docs
