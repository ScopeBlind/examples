# Claude Code Hooks -- Signed Receipts for Every Tool Call

The simplest way to add audit trails to Claude Code. One command generates
the hooks configuration; from that point, every tool call gets a Cedar policy
check and an Ed25519-signed receipt.

## Quick start

### 1. Initialize hooks

```bash
npx protect-mcp init-hooks
```

This generates two files in your project:

- `.claude/settings.json` -- hook configuration that routes tool calls through protect-mcp
- `policies/default.cedar` -- starter Cedar policy (shadow mode, logs everything)

If you prefer to set them up manually, see the files in this directory.

### 2. Start Claude Code

```bash
claude
```

Claude Code reads `.claude/settings.json` automatically. Every `PreToolUse` and
`PostToolUse` hook fires a request to the protect-mcp local server, which:

1. Evaluates the Cedar policy
2. Signs the decision with Ed25519
3. Appends the receipt to `.protect-mcp-receipts.jsonl`

In shadow mode (the default), no tool calls are blocked -- decisions are logged
only.

### 3. View receipts

```bash
npx protect-mcp receipts --last 5
```

### 4. Verify offline

```bash
npx @veritasacta/verify .protect-mcp-receipts.jsonl
```

This checks every Ed25519 signature without contacting any server.

## What you'll see

After running a few tool calls in Claude Code:

```
$ npx protect-mcp receipts --last 3

[2026-04-04T10:15:32Z] ALLOW  Bash          sha256:a1b2c3...  sig:OK
[2026-04-04T10:15:34Z] ALLOW  Read          sha256:a1b2c3...  sig:OK
[2026-04-04T10:15:37Z] ALLOW  Edit          sha256:a1b2c3...  sig:OK

$ npx @veritasacta/verify .protect-mcp-receipts.jsonl

Verified 3 receipts, 0 failures
Policy digest: sha256:a1b2c3d4e5f6...
All signatures valid.
```

## Files in this example

```
claude-code-hooks/
  .claude/settings.json    -- Hook configuration for Claude Code
  policies/default.cedar   -- Cedar policy (shadow mode)
  verify-receipt.sh        -- Quick verification script
```

## Switching to enforce mode

To block tool calls that violate your policy (instead of just logging them),
start the protect-mcp server with `--enforce`:

```bash
npx protect-mcp --enforce
```

Then edit `policies/default.cedar` to add forbid rules. For example, to block
destructive shell commands:

```cedar
forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command.contains("rm -rf") };
```

## How verification works

Each receipt contains:

- **Decision**: allow, deny, or shadow (logged but not enforced)
- **Policy digest**: SHA-256 hash of the Cedar policy at evaluation time
- **Timestamp**: ISO 8601 decision time
- **Tool name and input hash**: what was called, without exposing raw inputs
- **Ed25519 signature**: covers all fields above

The verifier (`@veritasacta/verify`) checks signatures using only the public
key embedded in each receipt. It never contacts the signing server. This is
issuer-blind verification -- the verifier validates integrity without trusting
or even knowing the identity of the original signer.
