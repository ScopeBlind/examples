/**
 * @file receipt_signer.h
 * @brief Minimal NXP SE050 Ed25519 receipt-signing wrapper.
 *
 * SE050 natively supports Ed25519 (RFC 8032). Unlike ATECC608B which is
 * ECDSA P-256 only, SE050 can sign the IETF draft's mandatory-to-implement
 * algorithm in hardware. This matters for interoperability with the
 * @veritasacta/verify reference CLI, which accepts Ed25519-signed receipts
 * without needing ES256 adapter support.
 *
 * Host-side code (host/build_receipt.py) handles the JCS canonicalization
 * and envelope assembly; the device signs the 32-byte digest it's given
 * and returns a 64-byte Ed25519 signature.
 *
 * License: MIT. Compiling against nxp-plugandtrust links your binary
 * to NXP's SE05x SDK terms; the wrapper code here is MIT.
 */
#ifndef SE050_RECEIPT_SIGNER_H
#define SE050_RECEIPT_SIGNER_H

#include <stddef.h>
#include <stdint.h>

#define RECEIPT_DIGEST_LEN    32u    /* SHA-256 */
#define RECEIPT_SIGNATURE_LEN 64u    /* Ed25519 signature */
#define RECEIPT_PUBKEY_LEN    32u    /* Ed25519 public key (compressed) */

typedef enum {
    RS_OK                    = 0,
    RS_ERR_INIT              = -1,
    RS_ERR_SIGN              = -2,
    RS_ERR_READ_PUBKEY       = -3,
    RS_ERR_INVALID_ARGUMENT  = -4,
    RS_ERR_OBJECT_NOT_FOUND  = -5,
} rs_status_t;

/**
 * Initialize the SE050 over I2C via the nxp-plugandtrust SDK.
 * Uses the default T=1 over I2C config from the SE05x Trust Platform.
 *
 * @return RS_OK on success.
 */
rs_status_t rs_init(void);

/**
 * Sign a 32-byte SHA-256 digest using the Ed25519 key in the given
 * persistent object ID. Unlike the ATECC608B, SE050's Ed25519 sign
 * operation signs the message directly per RFC 8032 (no pre-hashing
 * wrapper). For receipt use the canonical bytes have already been
 * hashed on the host; we invoke the raw Ed25519ph mode or pass the
 * 32-byte digest as the message (implementation-dependent).
 *
 * @param key_id    Persistent object ID holding the Ed25519 keypair
 *                  (e.g. 0x7DCCBB00; assigned at provisioning).
 * @param digest    32-byte SHA-256 of the canonical envelope minus signature.
 * @param sig_out   64-byte buffer receiving Ed25519 signature (R || S).
 * @return RS_OK on success.
 */
rs_status_t rs_sign_digest(uint32_t key_id,
                           const uint8_t digest[RECEIPT_DIGEST_LEN],
                           uint8_t sig_out[RECEIPT_SIGNATURE_LEN]);

/**
 * Read the 32-byte Ed25519 public key from a persistent object.
 * Used at provisioning to compute the RFC 7638 JWK thumbprint that
 * becomes the receipt's `kid`.
 */
rs_status_t rs_read_pubkey(uint32_t key_id,
                           uint8_t pubkey_out[RECEIPT_PUBKEY_LEN]);

/** Release the SDK session. Call on shutdown. */
void rs_release(void);

#endif /* SE050_RECEIPT_SIGNER_H */
