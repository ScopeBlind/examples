# Cedar InProcessChecker for gemini-cli

Reference implementation of a Cedar-based safety checker for [gemini-cli](https://github.com/google-gemini/gemini-cli), implementing the `InProcessChecker` interface from the safety layer.

Replaces TOML policy rules with Cedar's declarative syntax, adding argument-level conditions that TOML cannot express: blocking specific shell patterns, preventing credential exfiltration, and composing workspace/user/admin policies across files.

## Why Cedar over TOML

| Capability | TOML rules | Cedar policies |
|-----------|-----------|---------------|
| Per-tool allow/deny | Yes | Yes |
| Per-mode rules | Yes | Yes |
| Argument pattern matching | No | Yes (`context.args like "*rm -rf /*"`) |
| Cross-cutting deny rules | No | Yes (credential exfiltration, etc.) |
| Policy composition | Single file | Multiple files, merged deterministically |
| Formal verification | No | Yes (Cedar has provable analysis) |
| Policy digest for audit | No | Yes (SHA-256 of policy set in receipts) |

## How it maps to gemini-cli

The checker implements `InProcessChecker` from `packages/core/src/safety/built-in.ts`:

```typescript
const cedarChecker: InProcessChecker = {
  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    // Map gemini-cli context to Cedar context
    // Evaluate against .cedar policies
    // Return ALLOW, DENY, or ABSTAIN
  }
};
```

Cedar context maps from `SafetyCheckInput`:
- `context.tool` from `input.toolCall.name`
- `context.args` from `JSON.stringify(input.toolCall.args)`
- `context.readOnlyHint` / `destructiveHint` from `input.toolAnnotations`
- `context.mode` from the active `ApprovalMode`
- `context.cwd` from `input.context.environment.cwd`

## Example policies

See `cedar-checker.ts` for the full policy set. Key examples:

```cedar
// Always allow read-only tools (replaces read-only TOML rule)
permit(principal, action == Action::"call", resource)
  when { context.readOnlyHint == true };

// Block dangerous shell patterns (not possible in TOML)
forbid(principal, action == Action::"call", resource == Tool::"Bash")
  when { context.args like "*rm -rf /*" };
```

## Related

- [gemini-cli #20858](https://github.com/google-gemini/gemini-cli/issues/20858) -- SDK approval callback mechanism
- [Cedar policy language](https://docs.cedarpolicy.com/)
- [protect-mcp](https://npmjs.com/package/protect-mcp) -- Cedar + receipt signing for MCP tool calls
- [cedar-for-agents PR #64](https://github.com/cedar-policy/cedar-for-agents/pull/64) -- WASM bindings for Cedar schema generation
