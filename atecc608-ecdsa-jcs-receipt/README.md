# ATECC608B + JCS + ECDSA P-256 signed receipts

Reference implementation showing how to emit [draft-farley-acta-signed-receipts-01](https://datatracker.ietf.org/doc/draft-farley-acta-signed-receipts/) receipts from a sensor whose private key lives in a Microchip [ATECC608B](https://www.microchip.com/en-us/product/ATECC608B) secure element.

The ATECC608B supports ECDSA over NIST P-256, not Ed25519. Ed25519 is the mandatory-to-implement algorithm in the IETF draft, but ECDSA P-256 is listed as an accepted alternative and is the right choice when the signing key must be non-exportable on commodity secure elements. This example produces ECDSA-signed receipts; `@veritasacta/verify` gains ES256 support in [VeritasActa/verify#4](https://github.com/VeritasActa/verify/issues/4).

If you need Ed25519 native hardware-bound signing, use [Microchip TA100](https://www.microchip.com/en-us/product/ta100) or [NXP SE050](https://www.nxp.com/products/SE050) instead of ATECC608B. Same wire format, different library.

## What this example contains

```
atecc608-ecdsa-jcs-receipt/
├── src/
│   ├── receipt_signer.{c,h}   Thin ATECC608B wrapper: init, sign 32-byte digest, read pubkey
│   └── example_main.c         CLI that signs a hex-encoded digest from argv
├── host/
│   └── build_receipt.py       Host-side receipt construction, canonicalization, assembly
├── sample_receipt.json        Reference receipt (reproducible from build_receipt.py)
├── Makefile                   Linux host build against installed libcryptoauth
└── README.md                  This file
```

## Design

Secure-element boundary: the device signs **pre-hashed digests**, nothing else. The receipt envelope is JCS-canonicalized and SHA-256-hashed on the host (Python / Node / embedded JCS emitter of your choice), and only the 32-byte digest crosses the I2C bus to the ATECC608B. The device returns a 64-byte raw ECDSA signature (r || s).

This is the right decomposition because:

- Secure elements are signing oracles, not JSON parsers. Keeping the device's surface at "sign this digest" minimizes attack surface and keeps the firmware small.
- Canonicalization bugs in embedded C are hard to debug. Keeping canonicalization in Python / Node (where testing is easy) and feeding the digest to the device means you can rebuild the canonical form at will without reflashing.
- Host-device split matches real deployments: the sensor broadcasts signed readings over BLE / LoRa / NFC; a nearby gateway (phone, Raspberry Pi, cold-chain base station) handles canonicalization and receipt assembly.

## Quick start

### Host-only (software reference, no hardware required)

```bash
pip install cryptography
python3 host/build_receipt.py reference --out sample_receipt.json
```

This produces a byte-reproducible reference receipt using software ECDSA P-256 with a deterministic key. Useful for fixture regeneration and cross-implementation verification.

### Full flow (ATECC608B connected via Trust Platform Development Kit)

1. **Provision the device.** Use the [Microchip Trust Platform config tool](https://www.microchip.com/design-centers/security-ics/trust-platform) to load a P-256 private key into slot 0 and lock the config zone. The public key cannot leave the device after that.

2. **Build the Linux host binary:**

   ```bash
   # Prerequisite: cryptoauthlib built and installed
   # git clone https://github.com/MicrochipTech/cryptoauthlib && cd cryptoauthlib
   # mkdir build && cd build && cmake .. && make && sudo make install
   
   make
   ```

3. **Read the device's public key:**

   ```bash
   # Firmware read_pubkey_0 is the atcab_get_pubkey equivalent.
   # Returns uncompressed X || Y, 64 bytes hex (128 chars).
   ```

4. **Build the canonical form on the host:**

   ```bash
   python3 host/build_receipt.py build \
     --pubkey-x <32-byte hex X> \
     --pubkey-y <32-byte hex Y>
   # Prints the canonical envelope and the SHA-256 digest to sign.
   ```

5. **Sign the digest on the device:**

   ```bash
   ./signed_receipt_example 5dfbae0449122458ecb3ff5503cb8d3bd89a3c1c3e99d25871aa8c4f43ea4a6f
   # pubkey    <128 hex chars>
   # signature <128 hex chars>
   ```

6. **Assemble the final receipt:**

   ```bash
   python3 host/build_receipt.py assemble \
     --signature <128 hex> \
     --pubkey-x <64 hex> --pubkey-y <64 hex> \
     > my-receipt.json
   ```

The resulting `my-receipt.json` is a v2 envelope that verifies against the Veritas Acta verifier once [verify#4](https://github.com/VeritasActa/verify/issues/4) (ES256 support) lands. In the meantime, the [`sample_receipt.json`](./sample_receipt.json) here demonstrates the expected shape and the signature is verifiable with any ES256 JWS tool.

## Canonicalization notes

The JCS canonical form matches [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) with two adaptations from the [AIP-0001 §JCS Canonicalization](https://github.com/VeritasActa/Acta) spec:

- **ASCII-only keys** at ingest. Non-ASCII keys are rejected rather than normalized. Sidesteps the Unicode normalization surface.
- **Whole-number floats collapse to integers.** `38.0` serializes as `"38"` to match ECMAScript `JSON.stringify`. Without this, Python-signed receipts would disagree with JS verifiers even though the signature is cryptographically correct for Python's canonical form.

Both behaviors are in `host/build_receipt.py`'s `jcs_canonical` function.

## Matching cross-implementation behavior

Conformance against the shared fixture suite: [ScopeBlind/agent-governance-testvectors](https://github.com/ScopeBlind/agent-governance-testvectors). Four independent implementations currently pass (protect-mcp, protect-mcp-adk, agent-passport-system, sb-runtime). This ATECC608B example will be the first hardware-signer implementation registered in that suite once ES256 support lands in the reference verifier.

## Licensing note for upstream

The ATECC608B-specific code (`src/receipt_signer.{c,h}` and `src/example_main.c`) is MIT per this repo's root LICENSE. Linking against `cryptoauthlib` subjects your compiled binary to Microchip's CryptoAuthLib license terms. The Python host code has no such constraint.

This example is offered to the CryptoAuthLib maintainers under Microchip's contribution terms if they would find it useful as an `app/signed_receipt/` entry in the upstream repo. Tracking: [MicrochipTech/cryptoauthlib discussion](https://github.com/MicrochipTech/cryptoauthlib/issues) (TBD once the issue is filed).

## Related work

- **[ScopeBlind Seal](https://scopeblind.com)** — cold-chain attestation sensor hardware the ATECC608B portion of this example is sized for (Australian ETCF grant #197 pending)
- **[microsoft/agent-governance-toolkit examples/physical-attestation-governed](https://github.com/microsoft/agent-governance-toolkit/pull/1168)** — AGT's software-side physical attestation example, same receipt format
- **[ScopeBlind/agent-governance-testvectors](https://github.com/ScopeBlind/agent-governance-testvectors)** — cross-implementation conformance fixtures
- **[RFC: Ruuvi firmware signed-receipt mode](https://github.com/ruuvi/ruuvi.firmware.c/issues/381)** — parallel discussion on adding this to existing Ruuvi BLE tags
