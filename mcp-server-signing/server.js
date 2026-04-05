/**
 * MCP server with four tools demonstrating different Cedar authorization
 * patterns. Communicates over stdio using JSON-RPC.
 *
 * Tools:
 *   read_file        -- permitted for all callers
 *   write_file       -- permitted only for specific paths
 *   execute_command   -- requires explicit allow-list (default: forbidden)
 *   access_database   -- requires specific role claim in context
 *
 * Run directly:        node server.js
 * Run with Cedar:      npx protect-mcp --cedar ./policy.cedar --enforce -- node server.js
 */

import { createInterface } from 'node:readline';

// -- Tool definitions -------------------------------------------------------

const tools = [
  {
    name: 'read_file',
    description: 'Read the contents of a file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'access_database',
    description: 'Run a query against the application database.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SQL query to execute' },
        table: { type: 'string', description: 'Target table name' },
      },
      required: ['query', 'table'],
    },
  },
];

// -- Tool handlers ----------------------------------------------------------

// Simulated file system
const files = {
  '/etc/hostname': 'dev-machine',
  '/tmp/test.txt': 'hello world',
  '/var/log/app.log': '[INFO] Application started\n[INFO] Ready',
};

function handleReadFile(args) {
  const path = args.path || '/dev/null';
  const content = files[path];
  if (content !== undefined) {
    return `Contents of ${path}: ${content}`;
  }
  return `File not found: ${path}`;
}

function handleWriteFile(args) {
  const path = args.path || '/dev/null';
  const content = args.content || '';
  // In a real server this would write to disk.
  files[path] = content;
  return `Wrote ${content.length} bytes to ${path}`;
}

function handleExecuteCommand(args) {
  const command = args.command || 'echo hello';
  // In a real server this would execute the command.
  return `Executed: ${command} (exit code 0)`;
}

function handleAccessDatabase(args) {
  const query = args.query || 'SELECT 1';
  const table = args.table || 'unknown';
  // In a real server this would query the database.
  return `Query result: 42 rows from ${table} table`;
}

// -- JSON-RPC stdio transport -----------------------------------------------

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

const reader = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

reader.on('line', (line) => {
  if (!line.trim()) return;

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
    return;
  }

  // Initialize
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'cedar-example', version: '1.0.0' },
      },
    });
    return;
  }

  // List tools
  if (message.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: { tools },
    });
    return;
  }

  // Call a tool
  if (message.method === 'tools/call') {
    const toolName = message.params?.name;
    const args = message.params?.arguments || {};
    let text;

    switch (toolName) {
      case 'read_file':
        text = handleReadFile(args);
        break;
      case 'write_file':
        text = handleWriteFile(args);
        break;
      case 'execute_command':
        text = handleExecuteCommand(args);
        break;
      case 'access_database':
        text = handleAccessDatabase(args);
        break;
      default:
        send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Unknown tool: ${toolName}` },
        });
        return;
    }

    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text }],
      },
    });
    return;
  }

  // Notifications (no response needed)
  if (!message.id) return;

  // Unknown method
  send({
    jsonrpc: '2.0',
    id: message.id,
    error: { code: -32601, message: `Method not found: ${message.method}` },
  });
});
