# TAKT Workflow Receipts -- Tamper-Evident Audit Trails via protect-mcp

Level 1 integration: external tooling, zero changes to TAKT core.

This example adds Ed25519-signed receipts to a TAKT multi-step workflow.
Every tool call made by any step (research, implement, review) produces a
cryptographic receipt that can be verified offline by anyone -- without
contacting the original signer.

TAKT already logs workflow events to NDJSON. protect-mcp adds a parallel
audit trail with properties that plain logs cannot provide:

| Property | NDJSON logs | protect-mcp receipts |
|---|---|---|
| Tamper detection | No -- files can be edited after the fact | Yes -- Ed25519 signatures cover every field |
| Ordering proof | Timestamp only (clock can be wrong) | Chained receipt IDs form a hash chain |
| Third-party audit | Requires trust in the log author | Issuer-blind verification, no trust required |
| CI/CD evidence | Manual inspection | Machine-verifiable bundles |
| Policy binding | Not captured | SHA-256 digest of the policy at evaluation time |

## How it works

TAKT delegates tool execution to its configured provider (Claude, Codex,
etc.). The provider reads MCP server configuration from its own settings
file. By declaring protect-mcp as an MCP server in the provider's config,
every tool call is intercepted, evaluated against a Cedar policy, signed,
and logged -- all before reaching the underlying tool.

This is Level 1 integration. TAKT itself is unaware of protect-mcp. The
signing happens at the provider layer, which is why no changes to TAKT
core are needed.

## Prerequisites

- Node.js 20+
- npm 9+
- [TAKT](https://github.com/nrslib/takt) installed: `npm install -g takt`

No ScopeBlind account required. Everything runs locally.

## Quick start

### 1. Initialize protect-mcp

```bash
cd examples/takt-workflow-receipts
npx protect-mcp init
```

This generates an Ed25519 keypair and config template. The Cedar policy
in `policies/workflow.cedar` is already provided.

### 2. Start the protect-mcp hook server

In a separate terminal:

```bash
npx protect-mcp serve --enforce --cedar ./policies
```

This starts the local hook server on port 9377. It evaluates Cedar
policies and signs every decision with Ed25519.

### 3. Run the TAKT workflow

```bash
takt run workflow.takt.yaml --task "Add input validation to the user registration endpoint"
```

TAKT orchestrates the workflow through its steps (research, implement,
review). The provider's hooks route tool calls through protect-mcp
automatically.

### 4. View receipts

```bash
npx protect-mcp receipts --last 10
```

Output:

```
[2026-04-05T14:22:01Z] ALLOW  Read          sha256:c4a1b2...  sig:OK
[2026-04-05T14:22:03Z] ALLOW  Grep          sha256:c4a1b2...  sig:OK
[2026-04-05T14:22:08Z] ALLOW  Edit          sha256:c4a1b2...  sig:OK
[2026-04-05T14:22:12Z] ALLOW  Bash(npm test) sha256:c4a1b2...  sig:OK
[2026-04-05T14:22:15Z] DENY   Bash(git push) sha256:c4a1b2...  sig:OK
```

Note the last entry: the Cedar policy denied `git push` because the
workflow policy requires explicit approval for push operations.

### 5. Verify offline

```bash
npx @veritasacta/verify .protect-mcp-receipts.jsonl
```

Or use the included script:

```bash
./verify.sh
```

This checks every Ed25519 signature without contacting any server. The
verifier is issuer-blind -- it validates cryptographic integrity without
knowing or trusting the identity of the original signer.

## What receipts prove that NDJSON logs don't

**Tamper detection.** Each receipt is signed with Ed25519. Changing any
field (decision, timestamp, tool name, input hash) invalidates the
signature. NDJSON log lines can be edited silently.

**Ordering proof.** Receipts include a `prev` field linking to the
previous receipt's ID, forming a hash chain. Inserting or removing a
receipt breaks the chain. NDJSON logs rely on timestamps alone.

**Third-party audit.** Anyone with the receipt file can verify signatures
using `@veritasacta/verify`. No API key, no account, no network access
required. The verifier does not know or trust the signer.

**CI/CD evidence.** Export a compliance bundle with
`npx protect-mcp bundle`. The bundle contains all receipts, the Cedar
policy snapshot, and a covering signature -- suitable for attaching to
pull requests, audit reports, or regulatory filings.

## Files in this example

```
takt-workflow-receipts/
  README.md              -- This file
  workflow.takt.yaml     -- TAKT workflow definition (3 steps)
  policies/
    workflow.cedar       -- Cedar policy for CI/CD workflows
  verify.sh              -- Receipt verification script
```

## Integration architecture

```
takt run workflow.takt.yaml
  |
  v
TAKT PieceEngine (orchestrates steps)
  |
  v
Claude / Codex provider (executes tool calls)
  |
  +---> .claude/settings.json hooks
  |       |
  |       v
  |     protect-mcp hook server (port 9377)
  |       |
  |       +---> Cedar policy evaluation (WASM)
  |       +---> Ed25519 signature
  |       +---> Append to .protect-mcp-receipts.jsonl
  |       |
  |       v
  |     Decision: ALLOW / DENY
  |
  v
Tool execution (Read, Edit, Bash, etc.)
  |
  v
TAKT NDJSON log (standard workflow log)
```

protect-mcp sits between the provider and the tools. TAKT sees normal
tool execution. The provider sees normal hook responses. Neither needs
to know about receipts.

## Adapting to your workflow

**Change the Cedar policy.** Edit `policies/workflow.cedar` to match your
authorization requirements. The policy uses Cedar's deny-overrides
semantics: an explicit `forbid` always wins over `permit`.

**Add more steps.** The workflow YAML defines three steps. Add more by
following the same pattern. Each step inherits the same receipt signing
-- no per-step configuration needed.

**Switch providers.** This works with any TAKT provider that supports
hooks or MCP servers. The Claude provider uses `.claude/settings.json`;
other providers have equivalent configuration.

**Export for compliance.** After a workflow run:

```bash
npx protect-mcp bundle --output audit-bundle.json
```

The bundle is a self-contained, offline-verifiable archive suitable for
regulatory or compliance review.

## Context

This example fulfills a Level 1 integration discussed in
[nrslib/takt#589](https://github.com/nrslib/takt/issues/589). Level 1
means external tooling only -- no changes to TAKT core. The signing,
policy evaluation, and verification all happen outside TAKT's process
boundary.

## Links

- [TAKT](https://github.com/nrslib/takt) -- workflow orchestrator
- [protect-mcp on npm](https://npmjs.com/package/protect-mcp) -- security gateway
- [scopeblind/scopeblind-gateway](https://github.com/scopeblind/scopeblind-gateway) -- source code
- [Cedar language reference](https://docs.cedarpolicy.com/) -- policy language docs
- [@veritasacta/verify](https://npmjs.com/package/@veritasacta/verify) -- offline receipt verification
