/**
 * @file receipt_signer.h
 * @brief Minimal ATECC608B ECDSA-P256 receipt-signing wrapper.
 *
 * Keeps the on-device surface small: the device receives a pre-hashed
 * 32-byte digest (SHA-256 over the JCS-canonical envelope minus
 * signature) and returns a 64-byte ECDSA P-256 signature (r || s).
 *
 * Host-side code (host/build_receipt.py) handles the JCS
 * canonicalization and assembly; the device signs what it's told to
 * sign. This is the right decomposition for real embedded systems:
 * the secure element is a signing oracle, not a JSON parser.
 *
 * License: MIT. Note: compiling this against cryptoauthlib links your
 * binary to Microchip's (restrictive) CryptoAuthLib license for the
 * library portion.
 */
#ifndef RECEIPT_SIGNER_H
#define RECEIPT_SIGNER_H

#include <stddef.h>
#include <stdint.h>

#define RECEIPT_DIGEST_LEN    32u    /* SHA-256 */
#define RECEIPT_SIGNATURE_LEN 64u    /* ECDSA P-256 r||s raw */
#define RECEIPT_PUBKEY_LEN    64u    /* Uncompressed X||Y, no 0x04 prefix */

/** Status codes. 0 means success; negative values surface errors from
 *  the underlying CryptoAuthLib status for host-side logging. */
typedef enum {
    RS_OK                    = 0,
    RS_ERR_INIT              = -1,
    RS_ERR_SIGN              = -2,
    RS_ERR_READ_PUBKEY       = -3,
    RS_ERR_INVALID_ARGUMENT  = -4,
} rs_status_t;

/**
 * Initialize the ATECC608B over I2C.
 * Reuses the default CryptoAuthLib I2C configuration (cfg_ateccx08a_i2c_default),
 * which works out-of-box on the Microchip CryptoAuth Trust Platform
 * Development Kit (DM320118).
 *
 * @return RS_OK on success.
 */
rs_status_t rs_init(void);

/**
 * Sign a 32-byte SHA-256 digest using the private key in the given slot.
 *
 * @param slot      ATECC608B slot holding the private key (e.g. 0).
 * @param digest    32-byte SHA-256 of the canonical envelope minus signature.
 * @param sig_out   64-byte buffer receiving the raw ECDSA r||s.
 * @return RS_OK on success.
 */
rs_status_t rs_sign_digest(uint16_t slot,
                           const uint8_t digest[RECEIPT_DIGEST_LEN],
                           uint8_t sig_out[RECEIPT_SIGNATURE_LEN]);

/**
 * Read the public key corresponding to the private key in a slot.
 * Used at provisioning time to compute the RFC 7638 JWK thumbprint
 * that becomes the receipt's `kid`.
 *
 * @param slot       Slot holding the private key.
 * @param pubkey_out 64-byte buffer receiving uncompressed X||Y.
 * @return RS_OK on success.
 */
rs_status_t rs_read_pubkey(uint16_t slot,
                           uint8_t pubkey_out[RECEIPT_PUBKEY_LEN]);

/** Release the I2C handle. Call on shutdown. */
void rs_release(void);

#endif /* RECEIPT_SIGNER_H */
