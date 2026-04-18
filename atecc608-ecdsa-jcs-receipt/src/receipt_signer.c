/**
 * @file receipt_signer.c
 * @brief Minimal ATECC608B receipt signing. See receipt_signer.h.
 *
 * This is a thin wrapper over cryptoauthlib's atcab_* APIs. It exists
 * so that sensor firmware has one clear call site for "sign this
 * digest" and one for "get my public key", with no policy evaluation,
 * canonicalization, or receipt assembly mixed in.
 *
 * Link: -lcryptoauth
 * Tested against: cryptoauthlib main branch, 2026-04.
 * Hardware: Microchip CryptoAuth Trust Platform Development Kit (DM320118),
 *           ATECC608B, default I2C address 0xC0, pre-provisioned slot 0
 *           with P-256 private key via the Trust Platform config tool.
 */
#include "receipt_signer.h"

#include "cryptoauthlib.h"

/* Default I2C configuration for CryptoAuth Trust Platform Development Kit.
 * Adjust for custom boards: change I2C address, bus speed, or HAL
 * by building your own ATCAIfaceCfg. */
extern ATCAIfaceCfg cfg_ateccx08a_i2c_default;

rs_status_t rs_init(void) {
    ATCA_STATUS status = atcab_init(&cfg_ateccx08a_i2c_default);
    return (status == ATCA_SUCCESS) ? RS_OK : RS_ERR_INIT;
}

rs_status_t rs_sign_digest(uint16_t slot,
                           const uint8_t digest[RECEIPT_DIGEST_LEN],
                           uint8_t sig_out[RECEIPT_SIGNATURE_LEN]) {
    if (digest == NULL || sig_out == NULL) {
        return RS_ERR_INVALID_ARGUMENT;
    }
    /* atcab_sign signs a 32-byte message that was previously loaded
     * into TempKey. The simpler atcab_sign_ext variant takes the
     * message directly (equivalent semantics; convenience wrapper). */
    ATCA_STATUS status = atcab_sign_ext(atcab_get_device(),
                                        slot, digest, sig_out);
    return (status == ATCA_SUCCESS) ? RS_OK : RS_ERR_SIGN;
}

rs_status_t rs_read_pubkey(uint16_t slot,
                           uint8_t pubkey_out[RECEIPT_PUBKEY_LEN]) {
    if (pubkey_out == NULL) {
        return RS_ERR_INVALID_ARGUMENT;
    }
    ATCA_STATUS status = atcab_get_pubkey(slot, pubkey_out);
    return (status == ATCA_SUCCESS) ? RS_OK : RS_ERR_READ_PUBKEY;
}

void rs_release(void) {
    atcab_release();
}
