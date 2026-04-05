/**
 * Minimal MCP server exposing three tools over stdio (JSON-RPC).
 *
 * Tools:
 *   get_weather    -- safe read-only lookup
 *   send_email     -- side-effecting, rate-limited by policy
 *   delete_account -- destructive, blocked by policy
 *
 * Run directly:        node server.js
 * Run with protection: npx protect-mcp --policy policy.json --enforce -- node server.js
 */

import { createInterface } from 'node:readline';

// -- Tool definitions -------------------------------------------------------

const tools = [
  {
    name: 'get_weather',
    description: 'Get current weather for a city.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
      },
      required: ['city'],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email to a recipient.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text' },
      },
      required: ['to', 'subject'],
    },
  },
  {
    name: 'delete_account',
    description: 'Permanently delete a user account.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User ID to delete' },
        confirmation: { type: 'string', description: 'Type CONFIRM to proceed' },
      },
      required: ['user_id', 'confirmation'],
    },
  },
];

// -- Tool handlers ----------------------------------------------------------

const weatherData = {
  london: '14C, partly cloudy',
  tokyo: '22C, clear skies',
  'new york': '18C, light rain',
  sydney: '26C, sunny',
};

function handleGetWeather(args) {
  const city = (args.city || 'unknown').toLowerCase();
  const weather = weatherData[city] || '15C, no data available';
  return `Weather in ${args.city || 'Unknown'}: ${weather}`;
}

function handleSendEmail(args) {
  // In a real server this would send an email.
  return `Email sent to ${args.to}: subject='${args.subject}'`;
}

function handleDeleteAccount(args) {
  // In a real server this would delete the account.
  return `Account ${args.user_id} deleted (confirmation: ${args.confirmation})`;
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
        serverInfo: { name: 'express-example', version: '1.0.0' },
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
      case 'get_weather':
        text = handleGetWeather(args);
        break;
      case 'send_email':
        text = handleSendEmail(args);
        break;
      case 'delete_account':
        text = handleDeleteAccount(args);
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
