// Default policy -- shadow mode
//
// This policy allows all tool calls. In shadow mode, protect-mcp logs
// every decision as a signed receipt without blocking anything.
// Edit this file to add restrictions when you are ready to enforce.

permit(principal, action, resource);

// Example: block destructive shell operations
// forbid(principal, action, resource)
//   when { resource.tool == "Bash" && resource.command.contains("rm -rf") };

// Example: block file writes outside the project directory
// forbid(principal, action, resource)
//   when { resource.tool == "Write" && !resource.path.startsWith("/home/user/project/") };

// Example: require elevated trust for database tools
// forbid(principal, action, resource)
//   when { resource.tool == "database_query" && context.tier != "elevated" };
