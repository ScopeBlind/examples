#!/usr/bin/env python3
"""
build_receipt.py -- host-side builder for SE050-signed receipts.

Three modes:

  --build       Construct a receipt envelope, print the JCS canonical
                form, and print the SHA-256 digest. Feed the digest
                to the SE050 via the C example to obtain the
                signature.

  --assemble    Take a (signature, pubkey) triple from the device
                and emit the final receipt JSON with proper
                RFC 7638 JWK thumbprint kid.

  --reference   Generate a full reference receipt using pure-Python
                Ed25519, producing byte-identical output to what
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
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization
except ImportError:
    sys.stderr.write("Missing dependency. Install: pip install cryptography\n")
    sys.exit(2)


# ============================================================
# JCS canonicalization (matches @veritasacta/artifacts v0.2.2)
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
    """Match ECMAScript JSON.stringify: whole-number floats to int."""
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


def jwk_thumbprint_ed25519(pubkey_bytes: bytes) -> str:
    """RFC 7638 JWK thumbprint for Ed25519 keys (OKP)."""
    jwk = {"crv": "Ed25519", "kty": "OKP", "x": b64url(pubkey_bytes)}
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
        "algorithm": "ed25519",
        "kid": kid,
        "issuer": issuer,
        "issued_at": issued_at,
        "payload": payload,
    }
    return envelope


# ============================================================
# Reference receipt generator (software Ed25519)
# ============================================================

def reference_sample() -> dict[str, Any]:
    """Reproducible reference receipt using software Ed25519.
    Deterministic seed -> byte-identical output across runs."""
    seed = hashlib.sha256(b"scopeblind:seal:se050-reference:2026-04").digest()
    priv = ed25519.Ed25519PrivateKey.from_private_bytes(seed)
    pub = priv.public_key()
    pub_bytes = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    kid = jwk_thumbprint_ed25519(pub_bytes)

    envelope = build_envelope(
        issuer="scopeblind:seal:SB-SEAL-SE050-001",
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
    signature = priv.sign(canonical)

    envelope["signature"] = signature.hex()
    return {
        "receipt": envelope,
        "_debug": {
            "canonical": canonical.decode(),
            "digest_sha256": hashlib.sha256(canonical).hexdigest(),
            "pubkey_hex": pub_bytes.hex(),
        },
    }


# ============================================================
# CLI
# ============================================================

def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="mode", required=True)

    p_build = sub.add_parser("build",
                              help="Print canonical envelope + SHA-256 digest for the device to sign")
    p_build.add_argument("--pubkey", required=True,
                          help="64-char hex-encoded Ed25519 pubkey from SE050")

    p_asm = sub.add_parser("assemble", help="Assemble final receipt JSON")
    p_asm.add_argument("--signature", required=True,
                       help="128-char hex-encoded Ed25519 signature from device")
    p_asm.add_argument("--pubkey", required=True,
                       help="64-char hex-encoded Ed25519 pubkey from SE050")

    p_ref = sub.add_parser("reference",
                            help="Generate sample_receipt.json using software Ed25519")
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

    pubkey = bytes.fromhex(args.pubkey)
    if len(pubkey) != 32:
        print(f"pubkey must be 32 bytes (64 hex chars), got {len(pubkey)}", file=sys.stderr)
        return 2

    kid = jwk_thumbprint_ed25519(pubkey)

    envelope = build_envelope(
        issuer="scopeblind:seal:SB-SEAL-SE050-001",
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
