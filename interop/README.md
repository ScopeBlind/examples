# Receipt Format Interop Example

This directory contains a reference envelope for cross-system receipt interoperability, based on the [IETF Internet-Draft for signed receipts](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/).

## Problem

Multiple agent governance systems produce Ed25519-signed receipts with JCS-canonicalized payloads and hash-linked chains. Each system adds domain-specific fields (policy results, delegation chains, spending authority). Without a common envelope, verifiers need separate implementations for each system.

## Approach

The IETF draft defines the common envelope. Domain-specific fields go in an `extensions` object inside the payload. A single verifier checks the envelope signature. Policy-specific validation layers on top.

```
Common Envelope (IETF draft)
+-- payload (JCS-canonicalized, RFC 8785)
|   +-- receipt_id, type, spec, issued_at, issuer_id
|   +-- previousReceiptHash (chain linking)
|   +-- extensions
|       +-- scopeblind: { cedar_decision, policy_digest, mode, ... }
|       +-- aps: { delegationChain, scope, spend, finality, ... }
|       +-- (other systems add their own namespace here)
+-- signature { alg: "EdDSA", kid, sig }
```

## Field Mapping

How each system's receipt fields map to the common envelope:

| IETF Draft Field | ScopeBlind | APS ExecutionEnvelope |
|---|---|---|
| `payload` | `payload` (Passport envelope) | Root object fields |
| `signature.alg` | `"EdDSA"` | `signature.algorithm: "Ed25519"` |
| `signature.kid` | `"sb:issuer:..."` | `signature.public_key` (hex) |
| `signature.sig` | Hex string | `signature.value` (hex) |
| `receipt_id` | `sha256:` content-addressed | `receiptId` (random hex) |
| `issued_at` | ISO 8601 | `timestamp` (ISO 8601) |
| `issuer_id` | `sb:issuer:<fingerprint>` | `agent_did` |
| `previousReceiptHash` | `edges[].receipt_id` (DAG) | `previousReceiptHash` (linear) |
| `type` | 12 explicit type values | Implicit from artifact class |
| `spec` | `draft-farley-acta-signed-receipts-01` | `schema: "execution-envelope.v0.1"` |
| Canonicalization | JCS (RFC 8785, strict) | JCS (RFC 8785) |

## Extensions

The `extensions` object is an open namespace. Each system registers a key:

- `scopeblind` - Cedar policy evaluation results, enforcement mode, trust tier, tool input hash
- `aps` - Delegation chain, capability scope, spending constraints, finality state

The common verifier ignores extensions during signature verification. Extensions are part of the signed payload (covered by the signature) but not part of the verification contract.

## Verification

```bash
npx @veritasacta/verify@0.2.5 interop-envelope.json --key <issuer-public-key-hex>
```

Exit codes: 0 = valid, 1 = invalid (tampered), 2 = error (malformed).

## Chaining Model

The draft specifies `previousReceiptHash` for linear chaining. ScopeBlind extends this with typed edges forming a directed acyclic graph (DAG), supporting branching delegation chains and multi-causal decisions. The linear hash is a subset of the DAG model and can coexist for backwards compatibility.

## References

- [IETF Draft: draft-farley-acta-signed-receipts](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/)
- [Verifier: @veritasacta/verify](https://npmjs.com/package/@veritasacta/verify) (Apache-2.0)
- [ScopeBlind Gateway](https://github.com/scopeblind/scopeblind-gateway) (MIT)
