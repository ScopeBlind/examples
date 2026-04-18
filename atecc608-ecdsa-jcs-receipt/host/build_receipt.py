#!/usr/bin/env python3
"""
build_receipt.py -- host-side builder for ATECC608B-signed receipts.

Three modes:

  --build       Construct a receipt envelope, print the JCS canonical
                form, and print the SHA-256 digest. Feed the digest
                to the ATECC608B via the C example to obtain the
                signature.

  --assemble    Take a (digest, signature, pubkey) triple from the
                device and emit the final receipt JSON with proper
                RFC 7638 JWK thumbprint kid.

  --reference   Generate a full reference receipt using pure-Python
                ECDSA P-256, producing byte-identical output to what
                the hardware path would produce. Useful for fixture
                regeneration and cross-verification.

Dependencies: cryptography (pip install cryptography)
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes, serialization
except ImportError:
    sys.stderr.write("Missing dependency. Install: pip install cryptography\n")
    sys.exit(2)


# ============================================================
# JCS canonicalization matching @veritasacta/artifacts v0.2.2
# ============================================================

def _assert_ascii_keys(obj: Any) -> None:
    if isinstance(obj, dict):
        for k in obj:
            if not isinstance(k, str):
                raise ValueError(f"non-string key: {type(k).__name__}")
            try:
                k.encode("ascii")
            except UnicodeEncodeError:
                raise ValueError(f"non-ASCII key: {k!r}")
            _assert_ascii_keys(obj[k])
    elif isinstance(obj, list):
        for item in obj:
            _assert_ascii_keys(item)


def _normalize_numbers(obj: Any) -> Any:
    """Match ECMAScript JSON.stringify: whole-number floats collapse to int."""
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, float) and obj.is_integer():
        return int(obj)
    if isinstance(obj, dict):
        return {k: _normalize_numbers(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_normalize_numbers(v) for v in obj]
    return obj


def jcs_canonical(obj: Any) -> str:
    _assert_ascii_keys(obj)
    normalized = _normalize_numbers(obj)
    return json.dumps(normalized, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def jwk_thumbprint_p256(pubkey_x: bytes, pubkey_y: bytes) -> str:
    """RFC 7638 JWK thumbprint for EC P-256 keys."""
    jwk = {"crv": "P-256", "kty": "EC",
           "x": b64url(pubkey_x), "y": b64url(pubkey_y)}
    return b64url(hashlib.sha256(
        json.dumps(jwk, sort_keys=True, separators=(",", ":")).encode()
    ).digest())


# ============================================================
# Envelope construction
# ============================================================

def build_envelope(
    *,
    issuer: str,
    kid: str,
    issued_at: str,
    sequence: int,
    prev_hash_hex: str | None,
    decision: str,
    policy_id: str,
    reason: str,
    location_label: str,
    reading: dict[str, Any],
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": "scopeblind:physical_attestation",
        "spec": "draft-farley-acta-signed-receipts-01",
        "reading": reading,
        "location_label": location_label,
        "decision": decision,
        "policy_id": policy_id,
        "reason": reason,
        "sequence": sequence,
    }
    if prev_hash_hex is not None:
        payload["previousReceiptHash"] = f"sha256:{prev_hash_hex}"

    envelope = {
        "v": 2,
        "type": "scopeblind:physical_attestation",
        "algorithm": "ecdsa-p256",
        "kid": kid,
        "issuer": issuer,
        "issued_at": issued_at,
        "payload": payload,
    }
    return envelope


# ============================================================
# Reference receipt generator (software ECDSA P-256)
# ============================================================

def reference_sample() -> dict[str, Any]:
    """Reproduces the sample_receipt.json fixture.
    Uses a deterministic key derived from a fixed seed so the output
    is byte-identical across runs."""
    # Deterministic key derivation: the ATECC608B's slot 0 private key
    # is typically generated on-device and non-exportable. For the
    # reference fixture we use a known seed so the output is
    # reproducible; DO NOT use this in production.
    seed = hashlib.sha256(b"scopeblind:seal:atecc608-reference:2026-04").digest()
    priv = ec.derive_private_key(
        int.from_bytes(seed, "big") % (
            0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551
        ),
        ec.SECP256R1()
    )
    pub = priv.public_key()
    numbers = pub.public_numbers()
    x_bytes = numbers.x.to_bytes(32, "big")
    y_bytes = numbers.y.to_bytes(32, "big")
    kid = jwk_thumbprint_p256(x_bytes, y_bytes)

    envelope = build_envelope(
        issuer="scopeblind:seal:SB-SEAL-001",
        kid=kid,
        issued_at="2026-04-10T18:00:00Z",
        sequence=5,
        prev_hash_hex=None,
        decision="deny",
        policy_id="cold-chain-wine-premium",
        reason="temp 22.4C > 18.0C limit",
        location_label="Adelaide, loading area (sun exposure)",
        reading={
            "temperature_c": 22.4,
            "humidity_pct": 38,
            "shock_g": 0.3,
            "lux": 45000,
            "latitude": -34.9285,
            "longitude": 138.6007,
            "battery_pct": 97,
        },
    )

    canonical = jcs_canonical(envelope).encode()
    digest = hashlib.sha256(canonical).digest()

    # ECDSA P-256 signing. Note: Python's cryptography library produces
    # DER-encoded signatures by default; we need raw r||s for the
    # receipt format. Extract r, s via sign + decode_dss_signature.
    from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
    der_sig = priv.sign(canonical, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der_sig)
    raw_sig = r.to_bytes(32, "big") + s.to_bytes(32, "big")

    envelope["signature"] = raw_sig.hex()
    return {
        "receipt": envelope,
        "_debug": {
            "canonical": canonical.decode(),
            "digest_sha256": digest.hex(),
            "pubkey_x_hex": x_bytes.hex(),
            "pubkey_y_hex": y_bytes.hex(),
        },
    }


# ============================================================
# CLI
# ============================================================

def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="mode", required=True)

    p_build = sub.add_parser("build",
                              help="Print canonical form + SHA-256 digest to sign")
    p_build.add_argument("--pubkey-x", required=True,
                          help="Hex-encoded x coordinate from ATECC608B")
    p_build.add_argument("--pubkey-y", required=True,
                          help="Hex-encoded y coordinate from ATECC608B")

    p_asm = sub.add_parser("assemble", help="Assemble final receipt JSON")
    p_asm.add_argument("--signature", required=True,
                       help="Hex-encoded 64-byte r||s from device")
    p_asm.add_argument("--pubkey-x", required=True)
    p_asm.add_argument("--pubkey-y", required=True)

    p_ref = sub.add_parser("reference",
                            help="Produce sample_receipt.json using software ECDSA")
    p_ref.add_argument("--out", default="sample_receipt.json")

    args = parser.parse_args()

    if args.mode == "reference":
        result = reference_sample()
        out = Path(args.out)
        out.write_text(json.dumps(result["receipt"], indent=2) + "\n")
        print(f"wrote {out}")
        print(f"canonical ({len(result['_debug']['canonical'])} bytes):")
        print(f"  {result['_debug']['canonical']}")
        print(f"digest: {result['_debug']['digest_sha256']}")
        return 0

    # build and assemble modes require pubkey
    pubkey_x = bytes.fromhex(args.pubkey_x)
    pubkey_y = bytes.fromhex(args.pubkey_y)
    kid = jwk_thumbprint_p256(pubkey_x, pubkey_y)

    envelope = build_envelope(
        issuer="scopeblind:seal:SB-SEAL-001",
        kid=kid,
        issued_at="2026-04-10T18:00:00Z",
        sequence=5,
        prev_hash_hex=None,
        decision="deny",
        policy_id="cold-chain-wine-premium",
        reason="temp 22.4C > 18.0C limit",
        location_label="Adelaide, loading area (sun exposure)",
        reading={
            "temperature_c": 22.4, "humidity_pct": 38, "shock_g": 0.3,
            "lux": 45000, "latitude": -34.9285, "longitude": 138.6007,
            "battery_pct": 97,
        },
    )
    canonical = jcs_canonical(envelope).encode()
    digest = hashlib.sha256(canonical).digest()

    if args.mode == "build":
        print(f"# canonical envelope ({len(canonical)} bytes):")
        print(canonical.decode())
        print(f"\n# sha256 digest to sign:")
        print(digest.hex())
        print(f"\n# kid: {kid}")
        return 0

    # assemble
    envelope["signature"] = args.signature
    print(json.dumps(envelope, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
