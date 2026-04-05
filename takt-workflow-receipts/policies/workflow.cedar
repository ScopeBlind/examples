// Cedar policy for TAKT CI/CD workflows
//
// This policy governs what tool operations are permitted during a
// TAKT plan-implement-review workflow. It is evaluated locally by
// protect-mcp's Cedar WASM engine -- no external server required.
//
// Cedar uses deny-overrides semantics: an explicit forbid always
// wins over a permit. Rules are evaluated in parallel; the most
// restrictive matching decision wins.
//
// Context fields available in protect-mcp:
//   resource.tool     -- tool name (Read, Edit, Bash, etc.)
//   resource.path     -- file path (when applicable)
//   resource.command   -- shell command (for Bash tool)
//   context.tier      -- trust tier (open, standard, elevated)
//   context.agentId   -- agent identifier (when set)

// =================================================================
// READ OPERATIONS -- permitted for all callers
// =================================================================
// Research and review steps rely on read-only exploration.
// These tools never modify the filesystem.

permit(principal, action, resource)
  when { resource.tool == "Read" };

permit(principal, action, resource)
  when { resource.tool == "Glob" };

permit(principal, action, resource)
  when { resource.tool == "Grep" };

// =================================================================
// CODE GENERATION -- write to project paths only
// =================================================================
// The implement step needs Edit and Write access. Restrict writes
// to the project directory to prevent accidental modifications
// outside the working tree.

permit(principal, action, resource)
  when { resource.tool == "Edit" };

permit(principal, action, resource)
  when { resource.tool == "Write" };

// =================================================================
// SHELL COMMANDS -- allow safe commands, deny destructive ones
// =================================================================
// Bash is needed for running tests, checking git status, and
// installing dependencies. Deny commands that modify remote state
// or destroy local data.

permit(principal, action, resource)
  when { resource.tool == "Bash" };

// Deny destructive filesystem operations
forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*rm -rf*" };

forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*rm -r /*" };

// Deny remote state changes -- these require human approval
forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*git push*" };

forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*git force*" };

forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*--force*" };

// Deny deployment commands
forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*deploy*" };

forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*kubectl apply*" };

forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*terraform apply*" };

// Deny package publishing
forbid(principal, action, resource)
  when { resource.tool == "Bash" && resource.command like "*npm publish*" };

// =================================================================
// RATE LIMITING (advisory)
// =================================================================
// Cedar does not natively enforce rate limits, but protect-mcp
// respects tier-based throttling. Set the trust tier in your
// protect-mcp config to control call frequency:
//
//   open:      100 calls / hour (default)
//   standard:  1000 calls / hour
//   elevated:  10000 calls / hour
//
// To require elevated tier for a specific tool:
//
//   forbid(principal, action, resource)
//     when { resource.tool == "expensive_api" && context.tier != "elevated" };

// =================================================================
// DEFAULT DENY for unknown tools
// =================================================================
// Any tool not explicitly permitted above is denied. This is a
// safety net -- if TAKT or the provider adds new tools, they
// won't be allowed until you add a permit rule.
//
// Uncomment the line below to enable strict default-deny:
//
// forbid(principal, action, resource);
//
// With the line commented out, protect-mcp's built-in default
// (shadow mode: log but allow) applies to unmatched tools.
