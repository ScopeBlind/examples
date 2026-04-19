# NXP SE050 + JCS + Ed25519 signed receipts

Reference implementation showing how to emit [draft-farley-acta-signed-receipts-01](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/) receipts from a sensor whose private key lives in an [NXP SE050](https://www.nxp.com/products/SE050) secure element.

## Why SE050 over ATECC608B

SE050 supports **Ed25519 natively in hardware**. The IETF draft's mandatory-to-implement algorithm is Ed25519, so receipts emitted by an SE050-based signer verify directly against `@veritasacta/verify` without needing ES256 adapter support. Three practical differences from ATECC608B:

| Property | ATECC608B | SE050 |
|---|---|---|
| Native Ed25519 | No (ECDSA P-256 only) | **Yes** |
| Native ECDSA P-256 | Yes | Yes |
| Price @ 10K volume | ~$0.60-$0.80 | ~$1.20-$2.00 |
| SDK | cryptoauthlib (MIT) | nxp-plugandtrust (BSD-3) |
| Linux / Zephyr story | Good | Better (first-class HAL) |
| Typical use | IoT, Matter devices | Pharma, supply-chain attestation |

Use SE050 when:
- Ed25519 native is a requirement (IETF spec conformance, regulatory, pharma)
- You want first-class Linux/Zephyr integration
- The ~$1 per-device premium is acceptable

Use ATECC608B when:
- Cost dominates at volume
- ECDSA P-256 + ES256 verifier support is acceptable
- You already have cryptoauthlib integrated

## What this example contains

```
se050-ed25519-jcs-receipt/
├── src/
│   ├── receipt_signer.{c,h}   Thin nxp-plugandtrust wrapper: init, sign 32-byte digest, read pubkey
│   └── example_main.c         CLI that signs a hex digest from argv
├── host/
│   └── build_receipt.py       Host-side receipt construction, canonicalization, assembly
├── sample_receipt.json        Reference receipt (reproducible from build_receipt.py)
├── Makefile                   Linux host build against installed nxp-plugandtrust
└── README.md                  This file
```

## Design

Secure-element boundary: the device signs **pre-hashed digests**, nothing else. The receipt envelope is JCS-canonicalized and SHA-256-hashed on the host (Python, or an embedded JCS emitter of your choice). Only the 32-byte digest crosses the I2C bus to the SE050. The device returns a 64-byte Ed25519 signature (R || S).

This matches how the [companion ATECC608B example](../atecc608-ecdsa-jcs-receipt/) is structured; the only meaningful difference is the algorithm family (Ed25519 vs ECDSA P-256) and the secure-element library (nxp-plugandtrust vs cryptoauthlib).

## Quick start

### Host-only (software reference, no hardware required)

```bash
pip install cryptography
python3 host/build_receipt.py reference --out sample_receipt.json
```

Produces a byte-reproducible reference receipt using software Ed25519 with a deterministic seed. Good for fixture regeneration and cross-implementation conformance testing.

Verify the reference receipt:

```bash
npx @veritasacta/verify sample_receipt.json
# ✓ Signature valid (Ed25519)
```

### Full flow (SE050 connected via OM-SE050ARD or similar breakout)

1. **Provision an Ed25519 keypair on the device.** Use nxp-plugandtrust's `ssscli` or the `ex_ed25519` sample:

   ```bash
   ssscli connect se050 none
   ssscli generate keypair ed25519 0x7DCCBB00
   # Key is now persistent under object ID 0x7DCCBB00
   ```

2. **Build the Linux host binary:**

   ```bash
   # Prerequisite: nxp-plugandtrust built and installed
   # git clone https://github.com/NXPPlugNTrust/nxp-plugandtrust
   # cd nxp-plugandtrust && mkdir build && cd build && cmake ..
   # make && sudo make install

   make
   ```

3. **Read the device's public key** (via ssscli or the C example):

   ```bash
   ssscli get object 0x7DCCBB00 --format=hex
   # 32-byte Ed25519 public key
   ```

4. **Build the canonical form on the host:**

   ```bash
   python3 host/build_receipt.py build --pubkey <32-byte hex pubkey>
   # Prints the canonical envelope and the SHA-256 digest to sign.
   ```

5. **Sign the digest on the device:**

   ```bash
   ./signed_receipt_example 0x7DCCBB00 <64-char hex sha256>
   # pubkey    <64 hex chars>
   # signature <128 hex chars>
   ```

6. **Assemble the final receipt:**

   ```bash
   python3 host/build_receipt.py assemble \
     --signature <128 hex> \
     --pubkey <64 hex> \
     > my-receipt.json
   ```

7. **Verify**:

   ```bash
   npx @veritasacta/verify my-receipt.json
   ```

## Canonicalization notes

Identical to the ATECC608B example — matches [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) with two adaptations from [AIP-0001 §JCS Canonicalization](https://github.com/VeritasActa/Acta):

- **ASCII-only keys** at ingest.
- **Whole-number floats collapse to integers** (`38.0` → `"38"`) to match ECMAScript `JSON.stringify`.

Both behaviors live in `host/build_receipt.py`'s `jcs_canonical` function.

## Cross-implementation posture

SE050-emitted receipts verify cleanly against:

- `@veritasacta/verify` (Apache-2.0 reference CLI)
- `agent-passport-system` verifier (APS)
- Any Ed25519 + JCS verifier that implements [draft-farley-acta-signed-receipts-01](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/)

Conformance fixtures live at [ScopeBlind/agent-governance-testvectors](https://github.com/ScopeBlind/agent-governance-testvectors). Four independent software implementations (protect-mcp, protect-mcp-adk, agent-passport-system, sb-runtime) cross-verify today. This SE050-based implementation would be the first Ed25519-native *hardware* signer registered in that matrix.

## Licensing note

The SE050-specific wrapper code (`src/receipt_signer.{c,h}` and `src/example_main.c`) is MIT per the root LICENSE. Linking against nxp-plugandtrust subjects your compiled binary to NXP's SE05x SDK license terms (BSD-3 for most components; check `nxp-plugandtrust/LICENSE.txt`). The Python host code has no such constraint.

## Related work

- **[atecc608-ecdsa-jcs-receipt/](../atecc608-ecdsa-jcs-receipt/)** — Companion reference for the ATECC608B (ECDSA P-256, cheaper, needs ES256 verifier support)
- **[ScopeBlind Seal](https://scopeblind.com)** — cold-chain attestation sensor hardware the SE050 portion of this example is sized for
- **[ScopeBlind/agent-governance-testvectors](https://github.com/ScopeBlind/agent-governance-testvectors)** — cross-implementation conformance fixtures
- **[RFC: Ruuvi firmware signed-receipt mode](https://github.com/ruuvi/ruuvi.firmware.c/issues/381)** — parallel discussion on nRF52-based BLE tags
