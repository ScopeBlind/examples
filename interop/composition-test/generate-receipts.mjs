#!/usr/bin/env node
/**
 * Composition Test: ScopeBlind + APS receipts for the same tool call
 *
 * Scenario: CrewAI agent calls `execute_api_call` tool
 *   - POST to a paid API endpoint
 *   - Spend: $0.50
 *   - APS checks: delegation scope includes `tools:api_call`, spend within budget
 *   - ScopeBlind checks: Cedar policy permits API calls for this agent tier
 *
 * Both receipts share the same `action_ref` (SHA-256 of the canonical tool invocation).
 *
 * Receipt format: "passport" envelope (same as APS), verified by @veritasacta/verify.
 * The verifier signs canonicalize(envelope.payload) and stores sig in envelope.signature.sig.
 */

import { createHash } from 'crypto';
import { generateKeyPairSync, sign } from 'crypto';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Ed25519 key generation ---
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubKeyRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const privKeyRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
const pubKeyHex = pubKeyRaw.toString('hex');

// --- JCS canonicalization (RFC 8785) ---
// Recursive key-sorted JSON serialization. For ASCII-only keys this is equivalent to full JCS.
function deepSortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSortKeys);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = deepSortKeys(obj[key]);
  }
  return sorted;
}
function canonicalize(obj) {
  return JSON.stringify(deepSortKeys(obj));
}

// --- Signing: sign canonicalize(payload), return hex ---
function signPayload(payload) {
  const message = Buffer.from(canonicalize(payload));
  const sig = sign(null, message, privateKey);
  return sig.toString('hex');
}

function sha256hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

// --- Shared scenario ---
const AGENT_ID = 'crewai-agent-research-001';
const TOOL_NAME = 'execute_api_call';
const TOOL_ARGS = {
  method: 'POST',
  url: 'https://api.openrouter.ai/api/v1/chat/completions',
  model: 'anthropic/claude-sonnet-4-20250514',
  prompt_hash: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  max_tokens: 4096,
};
const SPEND_USD = 0.50;

// --- action_ref: content hash anchoring both governance evaluations ---
function computeActionRef(agentId, toolName, args) {
  const input = JSON.stringify({ agent_id: agentId, args, tool: toolName });
  return 'sha256:' + sha256hex(input);
}
const actionRef = computeActionRef(AGENT_ID, TOOL_NAME, TOOL_ARGS);

// --- Cedar policy ---
const CEDAR_POLICY = `permit(
  principal,
  action == Action::"execute_api_call",
  resource
) when {
  context.agent_tier in ["research", "trading", "admin"] &&
  context.daily_api_calls < 1000 &&
  context.spend_usd <= 500.00
};`;

const policyDigest = 'sha256:' + sha256hex(CEDAR_POLICY);
const toolInputHash = 'sha256:' + sha256hex(JSON.stringify(TOOL_ARGS));
const issuerFingerprint = pubKeyHex.substring(0, 12);
const issuerId = `sb:issuer:${issuerFingerprint}`;
const now = new Date();

// ============================================================
// Receipt 1: Cedar Policy Evaluation
// ============================================================
const policyPayload = {
  spec: 'draft-farley-acta-signed-receipts-01',
  receipt_id: null, // set below
  type: 'policy:evaluation',
  issued_at: now.toISOString(),
  issuer_id: issuerId,
  previousReceiptHash: null,
  action_ref: actionRef,
  agentId: AGENT_ID,
  action: {
    tool: TOOL_NAME,
    decision: 'permit',
    context: {
      agent_tier: 'research',
      daily_api_calls: 47,
      spend_usd: SPEND_USD,
    },
  },
  extensions: {
    scopeblind: {
      cedar_decision: 'permit',
      cedar_diagnostics: [],
      policy_digest: policyDigest,
      mode: 'enforce',
      tier: 'signed-known',
      tool_input_hash: toolInputHash,
    },
  },
};

policyPayload.receipt_id = 'sha256:' + sha256hex(canonicalize(policyPayload));
const policySig = signPayload(policyPayload);
const policyReceiptHash = 'sha256:' + sha256hex(canonicalize(policyPayload));

const policyReceipt = {
  payload: policyPayload,
  signature: {
    alg: 'EdDSA',
    kid: issuerId,
    sig: policySig,
  },
};

// ============================================================
// Receipt 2: Tool Execution
// ============================================================
const execPayload = {
  spec: 'draft-farley-acta-signed-receipts-01',
  receipt_id: null,
  type: 'tool:execution',
  issued_at: new Date(now.getTime() + 150).toISOString(),
  issuer_id: issuerId,
  previousReceiptHash: policyReceiptHash,
  action_ref: actionRef,
  agentId: AGENT_ID,
  action: {
    tool: TOOL_NAME,
    args_hash: toolInputHash,
    result: {
      success: true,
      output_hash: 'sha256:' + sha256hex('{"response":"Multi-model research output on semiconductor supply chain risks...","tokens_used":1847}'),
      tokens_used: 1847,
      latency_ms: 2340,
    },
  },
  spend: {
    amount: SPEND_USD,
    currency: 'usd',
  },
  extensions: {
    scopeblind: {
      cedar_decision: 'permit',
      policy_digest: policyDigest,
      mode: 'enforce',
      tier: 'signed-known',
      tool_input_hash: toolInputHash,
      otel_trace_id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      otel_span_id: 'e5f6a7b8c9d0e1f2',
    },
  },
};

execPayload.receipt_id = 'sha256:' + sha256hex(canonicalize(execPayload));
const execSig = signPayload(execPayload);

const execReceipt = {
  payload: execPayload,
  signature: {
    alg: 'EdDSA',
    kid: issuerId,
    sig: execSig,
  },
};

// --- Write outputs ---
writeFileSync(join(__dirname, 'scopeblind-policy-eval.json'), JSON.stringify(policyReceipt, null, 2) + '\n');
writeFileSync(join(__dirname, 'scopeblind-execution.json'), JSON.stringify(execReceipt, null, 2) + '\n');
writeFileSync(join(__dirname, 'scopeblind-pubkey.txt'), pubKeyHex + '\n');
writeFileSync(join(__dirname, 'action-ref.txt'), actionRef + '\n');
writeFileSync(join(__dirname, 'cedar-policy.cedar'), CEDAR_POLICY + '\n');

console.log('Generated ScopeBlind composition test receipts:');
console.log(`  action_ref:      ${actionRef}`);
console.log(`  public key:      ${pubKeyHex}`);
console.log(`  policy receipt:  scopeblind-policy-eval.json`);
console.log(`  exec receipt:    scopeblind-execution.json`);
console.log(`  Cedar policy:    cedar-policy.cedar`);
console.log(`  policy digest:   ${policyDigest}`);
console.log('');
console.log('Verify:');
console.log(`  npx @veritasacta/verify scopeblind-policy-eval.json --key ${pubKeyHex}`);
console.log(`  npx @veritasacta/verify scopeblind-execution.json --key ${pubKeyHex}`);
