// Cedar authorization policy for MCP tool calls
//
// This policy demonstrates four authorization patterns:
//   1. Unconditional allow (read_file)
//   2. Path-based restriction (write_file)
//   3. Blanket deny with explicit allow-list (execute_command)
//   4. Role-based access control (access_database)
//
// Cedar uses deny-overrides semantics: an explicit forbid always
// wins over a permit.

// ---- read_file: permitted for all callers ----

permit(principal, action, resource)
  when { resource.tool == "read_file" };

// ---- write_file: only to /tmp/ paths ----

permit(principal, action, resource)
  when { resource.tool == "write_file" && resource.path like "/tmp/*" };

// ---- execute_command: forbidden by default ----
// To allow specific commands, add a permit rule above this forbid.
// Example:
//   permit(principal, action, resource)
//     when { resource.tool == "execute_command" && resource.command == "ls" };

forbid(principal, action, resource)
  when { resource.tool == "execute_command" };

// ---- access_database: requires admin role ----

permit(principal, action, resource)
  when { resource.tool == "access_database" && context.role == "admin" };
