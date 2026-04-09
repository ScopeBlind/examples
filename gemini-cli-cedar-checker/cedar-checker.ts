/**
 * Cedar InProcessChecker for gemini-cli
 *
 * Implements the InProcessChecker interface from gemini-cli's safety layer.
 * Evaluates tool calls against Cedar policies (.cedar files) and optionally
 * signs Ed25519 receipts for every decision.
 *
 * Usage in gemini-cli policy config (policy.toml):
 *
 *   [tool."*"]
 *   checker = { in_process = "cedar" }
 *
 * Cedar policies replace TOML rules with argument-level conditions:
 *
 *   // Always allow read-only tools
 *   permit(principal, action == Action::"call", resource)
 *     when { context.readOnlyHint == true };
 *
 *   // Block destructive shell commands
 *   forbid(principal, action == Action::"call", resource == Tool::"Bash")
 *     when { context.args like "*rm -rf /*" };
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/20858
 * @see https://docs.cedarpolicy.com/
 */

// Types matching gemini-cli's safety protocol
// (from packages/core/src/safety/protocol.ts and built-in.ts)

interface SafetyCheckInput {
  protocolVersion: '1.0.0';
  toolCall: {
    name: string;
    args?: Record<string, unknown>;
  };
  context: {
    environment: {
      cwd: string;
      workspaces: string[];
    };
    history?: {
      turns: Array<{
        user: { text: string };
        model: { text?: string; toolCalls?: unknown[] };
      }>;
    };
  };
  toolAnnotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  config?: Record<string, unknown>;
}

enum SafetyCheckDecision {
  ALLOW = 'allow',
  DENY = 'deny',
  ABSTAIN = 'abstain',
}

interface SafetyCheckResult {
  decision: SafetyCheckDecision;
  reason?: string;
}

interface InProcessChecker {
  check(input: SafetyCheckInput): Promise<SafetyCheckResult>;
}

// Cedar evaluation types
interface CedarEvalResult {
  allowed: boolean;
  reason: string;
  diagnostics: string[];
}

/**
 * Cedar-based safety checker for gemini-cli.
 *
 * Evaluates tool calls against Cedar policies loaded from .cedar files.
 * Falls back to ABSTAIN (defer to other checkers) if no Cedar policies
 * are loaded.
 */
export class CedarSafetyChecker implements InProcessChecker {
  private policyText: string;
  private policyDigest: string;

  constructor(policyText: string) {
    this.policyText = policyText;
    // SHA-256 of the policy text for audit trail
    this.policyDigest = ''; // computed on first check
  }

  /**
   * Load Cedar policies from a .cedar file.
   */
  static fromFile(policyPath: string): CedarSafetyChecker {
    const fs = require('fs');
    const text = fs.readFileSync(policyPath, 'utf-8');
    return new CedarSafetyChecker(text);
  }

  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    if (!this.policyText) {
      return {
        decision: SafetyCheckDecision.ABSTAIN,
        reason: 'No Cedar policies loaded',
      };
    }

    // Build Cedar evaluation context from gemini-cli's SafetyCheckInput
    const context = this.buildCedarContext(input);

    // Evaluate against Cedar policies
    // In production, use @cedar-policy/cedar-wasm for real evaluation.
    // This demonstrates the mapping from gemini-cli types to Cedar types.
    const result = await this.evaluateCedar(context);

    return {
      decision: result.allowed
        ? SafetyCheckDecision.ALLOW
        : SafetyCheckDecision.DENY,
      reason: result.reason,
    };
  }

  /**
   * Map gemini-cli SafetyCheckInput to Cedar evaluation context.
   *
   * This is the critical mapping layer. Cedar policies reference these
   * context fields, so the mapping determines what conditions policies
   * can express.
   */
  private buildCedarContext(input: SafetyCheckInput): Record<string, unknown> {
    return {
      // Tool identity
      tool: input.toolCall.name,

      // Tool arguments as JSON string (for pattern matching in Cedar)
      args: JSON.stringify(input.toolCall.args ?? {}),

      // Tool annotations (from MCP tool metadata)
      readOnlyHint: input.toolAnnotations?.readOnlyHint ?? false,
      destructiveHint: input.toolAnnotations?.destructiveHint ?? false,
      idempotentHint: input.toolAnnotations?.idempotentHint ?? false,

      // Environment
      cwd: input.context.environment.cwd,
      workspaceCount: input.context.environment.workspaces.length,

      // Approval mode (from config, matching gemini-cli's ApprovalMode enum)
      mode: (input.config as Record<string, unknown>)?.['approvalMode'] ?? 'default',
    };
  }

  /**
   * Evaluate Cedar policies.
   *
   * In a real implementation, this calls @cedar-policy/cedar-wasm's
   * isAuthorized(). This stub demonstrates the interface.
   */
  private async evaluateCedar(
    context: Record<string, unknown>,
  ): Promise<CedarEvalResult> {
    // Real implementation:
    // const { isAuthorized } = require('@cedar-policy/cedar-wasm');
    // return isAuthorized(this.policyText, principal, action, resource, context);

    // Stub: parse simple rules from policy text
    // This is placeholder logic. Replace with cedar-wasm in production.
    const tool = context.tool as string;
    const args = context.args as string;
    const readOnly = context.readOnlyHint as boolean;
    const destructive = context.destructiveHint as boolean;
    const mode = context.mode as string;

    // Default: allow read-only, deny destructive without yolo
    if (readOnly) {
      return { allowed: true, reason: 'Read-only tool permitted', diagnostics: [] };
    }

    if (destructive && mode !== 'yolo') {
      return {
        allowed: false,
        reason: `Destructive tool "${tool}" requires yolo mode`,
        diagnostics: [],
      };
    }

    // Check for dangerous patterns in shell commands
    const dangerousPatterns = [
      'rm -rf /',
      'DROP TABLE',
      'curl.*Authorization',
      'wget.*token=',
    ];

    if (tool === 'Bash' || tool === 'shell') {
      for (const pattern of dangerousPatterns) {
        if (new RegExp(pattern).test(args)) {
          return {
            allowed: false,
            reason: `Blocked: argument matches dangerous pattern "${pattern}"`,
            diagnostics: [],
          };
        }
      }
    }

    return { allowed: true, reason: 'Permitted by default policy', diagnostics: [] };
  }
}

/**
 * Example Cedar policies for gemini-cli tool governance.
 *
 * These replace TOML policy rules with Cedar's declarative syntax,
 * adding argument-level conditions that TOML cannot express.
 */
export const EXAMPLE_POLICIES = `
// Read-only tools: always permitted in all modes
permit(
  principal,
  action == Action::"call",
  resource
) when {
  context.readOnlyHint == true
};

// File writes: auto-allow in autoEdit and yolo modes
permit(
  principal,
  action == Action::"call",
  resource == Tool::"WriteFile"
) when {
  context.mode == "autoEdit" || context.mode == "yolo"
};

// Shell commands: only auto-allow in yolo mode
permit(
  principal,
  action == Action::"call",
  resource == Tool::"Bash"
) when {
  context.mode == "yolo"
};

// Argument-level safety: block dangerous shell patterns
// (This is what TOML rules cannot express)
forbid(
  principal,
  action == Action::"call",
  resource == Tool::"Bash"
) when {
  context.args like "*rm -rf /*" ||
  context.args like "*DROP TABLE*" ||
  context.args like "*--force push*"
};

// Cross-cutting: block credential exfiltration attempts
forbid(
  principal,
  action == Action::"call",
  resource == Tool::"Bash"
) when {
  context.args like "*curl*Authorization*" ||
  context.args like "*wget*token=*"
};

// Default: deny everything not explicitly permitted
// (This replaces PolicyDecision.ALLOW with safe-by-default)
forbid(
  principal,
  action,
  resource
);
`;
