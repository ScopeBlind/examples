/**
 * @file receipt_signer.c
 * @brief NXP SE050 Ed25519 receipt signing. See receipt_signer.h.
 *
 * Thin wrapper over nxp-plugandtrust (SSS API). Exists so that
 * firmware has one clear call site for "sign this digest" and one
 * for "get my public key", with no canonicalization, policy, or
 * receipt assembly mixed in.
 *
 * Link: -lse05x
 * Tested against: nxp-plugandtrust main branch, 2026-04.
 * Hardware: SE050 on OM-SE050ARD / OM-SE051ARD breakout or
 *           Mikroe SE050 Click, connected via I2C at address 0x48.
 */
#include "receipt_signer.h"

#include "fsl_sss_api.h"
#include "fsl_sss_util_asn1_der.h"
#include "ex_sss_boot.h"
#include "nxLog_App.h"

#include <string.h>

/* Global SSS session + keystore, initialized by rs_init. */
static ex_sss_boot_ctx_t g_boot_ctx;
static sss_session_t *g_session = NULL;
static sss_key_store_t *g_keystore = NULL;

rs_status_t rs_init(void) {
    sss_status_t status;

    memset(&g_boot_ctx, 0, sizeof(g_boot_ctx));

    /* Open SSS session against SE050 via T=1/I2C (default transport). */
    status = ex_sss_boot_open(&g_boot_ctx, NULL);
    if (status != kStatus_SSS_Success) {
        LOG_E("ex_sss_boot_open failed: 0x%x", status);
        return RS_ERR_INIT;
    }

    g_session = &g_boot_ctx.session;
    g_keystore = &g_boot_ctx.ks;

    return RS_OK;
}

rs_status_t rs_sign_digest(uint32_t key_id,
                           const uint8_t digest[RECEIPT_DIGEST_LEN],
                           uint8_t sig_out[RECEIPT_SIGNATURE_LEN]) {
    if (digest == NULL || sig_out == NULL || g_session == NULL) {
        return RS_ERR_INVALID_ARGUMENT;
    }

    sss_object_t obj;
    sss_asymmetric_t ctx;
    sss_status_t status;
    size_t sig_len = RECEIPT_SIGNATURE_LEN;

    /* Look up the persistent Ed25519 keypair. */
    status = sss_key_object_init(&obj, g_keystore);
    if (status != kStatus_SSS_Success) return RS_ERR_INIT;

    status = sss_key_object_get_handle(&obj, key_id);
    if (status != kStatus_SSS_Success) {
        sss_key_object_free(&obj);
        return RS_ERR_OBJECT_NOT_FOUND;
    }

    /* Create the asymmetric signing context for Ed25519.
     * Algorithm kAlgorithm_SSS_SHA256 + EdDSA mode signs the
     * 32-byte digest per RFC 8032. */
    status = sss_asymmetric_context_init(
        &ctx, g_session, &obj,
        kAlgorithm_SSS_SHA256,
        kMode_SSS_Sign
    );
    if (status != kStatus_SSS_Success) {
        sss_key_object_free(&obj);
        return RS_ERR_SIGN;
    }

    /* Sign the canonical-envelope digest. */
    status = sss_asymmetric_sign_digest(
        &ctx,
        (uint8_t *)digest, RECEIPT_DIGEST_LEN,
        sig_out, &sig_len
    );

    sss_asymmetric_context_free(&ctx);
    sss_key_object_free(&obj);

    if (status != kStatus_SSS_Success) return RS_ERR_SIGN;
    if (sig_len != RECEIPT_SIGNATURE_LEN) return RS_ERR_SIGN;

    return RS_OK;
}

rs_status_t rs_read_pubkey(uint32_t key_id,
                           uint8_t pubkey_out[RECEIPT_PUBKEY_LEN]) {
    if (pubkey_out == NULL || g_keystore == NULL) {
        return RS_ERR_INVALID_ARGUMENT;
    }

    sss_object_t obj;
    sss_status_t status;
    size_t key_len = RECEIPT_PUBKEY_LEN;
    size_t key_bit_len = 256;

    status = sss_key_object_init(&obj, g_keystore);
    if (status != kStatus_SSS_Success) return RS_ERR_INIT;

    status = sss_key_object_get_handle(&obj, key_id);
    if (status != kStatus_SSS_Success) {
        sss_key_object_free(&obj);
        return RS_ERR_OBJECT_NOT_FOUND;
    }

    status = sss_key_store_get_key(g_keystore, &obj,
                                    pubkey_out, &key_len, &key_bit_len);

    sss_key_object_free(&obj);

    if (status != kStatus_SSS_Success) return RS_ERR_READ_PUBKEY;
    return RS_OK;
}

void rs_release(void) {
    ex_sss_session_close(&g_boot_ctx);
    g_session = NULL;
    g_keystore = NULL;
}
