[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![IETF Draft](https://img.shields.io/badge/IETF-draft--farley--acta--signed--receipts-blue)](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/)

# ScopeBlind Examples

Complete examples showing how to add signed, independently verifiable audit trails to AI agent tool calls, including cybersecurity use cases for vulnerability disclosure.

Each example uses [protect-mcp](https://npmjs.com/package/protect-mcp) to wrap MCP tool servers with Cedar policies and Ed25519-signed receipts. Every tool call produces a cryptographic receipt that can be verified offline by anyone -- without contacting the original issuer.

## Examples

| Example | Description | Time |
|---------|-------------|------|
| [claude-code-hooks](./claude-code-hooks/) | Add protect-mcp as Claude Code hooks. Every tool call gets a signed receipt and Cedar policy check. | ~2 min |
| [express-api-gateway](./express-api-gateway/) | Wrap an Express-based MCP server with JSON policies and rate limiting. | ~5 min |
| [mcp-server-signing](./mcp-server-signing/) | Cedar WASM policy engine with per-tool authorization and full audit bundles. | ~10 min |
| [takt-workflow-receipts](./takt-workflow-receipts/) | Add signed receipts to [TAKT](https://github.com/nrslib/takt) multi-step workflows. Level 1 external integration. | ~5 min |
| [security-vulnerability-disclosure](./security-vulnerability-disclosure/) | Receipt-signed vulnerability disclosure lifecycle with Cedar governance policies. For AI security agents. | ~10 min |

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

## Ecosystem

- [scopeblind/scopeblind-gateway](https://github.com/scopeblind/scopeblind-gateway) -- protect-mcp source code
- [VeritasActa/Acta](https://github.com/VeritasActa/Acta) -- open protocol for contestable public records
- [VeritasActa/drafts](https://github.com/VeritasActa/drafts) -- IETF internet-draft source
- [protect-mcp on npm](https://www.npmjs.com/package/protect-mcp) -- MCP gateway with Cedar policies and signed receipts
- [protect-mcp-adk on PyPI](https://pypi.org/project/protect-mcp-adk/) -- Google ADK receipt signing plugin (Python)
- [@veritasacta/verify on npm](https://www.npmjs.com/package/@veritasacta/verify) -- issuer-blind receipt verification CLI
- [acta.today/wiki](https://acta.today/wiki) -- live Knowledge Unit demo
- [draft-farley-acta-signed-receipts](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/) -- IETF signed receipts draft
- [draft-farley-acta-knowledge-units](https://datatracker.ietf.org/doc/draft-farley-acta-knowledge-units/) -- IETF knowledge units draft
