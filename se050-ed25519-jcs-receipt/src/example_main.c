/**
 * @file example_main.c
 * @brief End-to-end example: initialize SE050, sign a digest with Ed25519,
 *        print the signature in hex.
 *
 * In real firmware, digest is produced by hashing the JCS-canonical
 * envelope bytes via the host. This example takes a digest as a
 * command-line argument to keep the on-device concern narrow.
 *
 * Build (Linux host with nxp-plugandtrust installed):
 *   cc -I/usr/include/sss \
 *      src/example_main.c src/receipt_signer.c \
 *      -lse05x -lsmCom -lex_common -o signed_receipt_example
 *
 * Provisioning note: before running, load an Ed25519 keypair into the
 * SE050 under a known persistent object ID. The nxp-plugandtrust
 * "ex_ed25519" sample or ssscli can do this:
 *   ssscli connect se050 none
 *   ssscli generate keypair ed25519 0x7DCCBB00
 *
 * Run:
 *   ./signed_receipt_example 0x7DCCBB00 32f97b1a916a9ca8bfd2fbc0cb84ed541e71cf24afa74b0103e01117ff56fdc9
 */
#include "receipt_signer.h"

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int hex_decode(const char *hex, uint8_t *out, size_t out_len) {
    if (strlen(hex) != out_len * 2) return -1;
    for (size_t i = 0; i < out_len; i++) {
        unsigned int b;
        if (sscanf(hex + 2 * i, "%2x", &b) != 1) return -1;
        out[i] = (uint8_t)b;
    }
    return 0;
}

static void hex_print(const uint8_t *buf, size_t len) {
    for (size_t i = 0; i < len; i++) {
        printf("%02x", buf[i]);
    }
    printf("\n");
}

int main(int argc, char *argv[]) {
    if (argc != 3) {
        fprintf(stderr, "usage: %s <key-id-hex> <64-char-hex-sha256-digest>\n", argv[0]);
        fprintf(stderr, "example: %s 0x7DCCBB00 5dfbae0449122458...\n", argv[0]);
        return 2;
    }

    /* Parse key ID (hex, 32-bit) */
    uint32_t key_id = (uint32_t)strtoul(argv[1], NULL, 0);
    if (key_id == 0) {
        fprintf(stderr, "invalid key id\n");
        return 2;
    }

    uint8_t digest[RECEIPT_DIGEST_LEN];
    if (hex_decode(argv[2], digest, sizeof(digest)) != 0) {
        fprintf(stderr, "invalid digest (must be 64 hex chars)\n");
        return 2;
    }

    rs_status_t status = rs_init();
    if (status != RS_OK) {
        fprintf(stderr, "rs_init failed: %d\n", status);
        return 1;
    }

    uint8_t pubkey[RECEIPT_PUBKEY_LEN];
    status = rs_read_pubkey(key_id, pubkey);
    if (status != RS_OK) {
        fprintf(stderr, "rs_read_pubkey failed: %d (key not provisioned at this ID?)\n", status);
        rs_release();
        return 1;
    }

    uint8_t signature[RECEIPT_SIGNATURE_LEN];
    status = rs_sign_digest(key_id, digest, signature);
    if (status != RS_OK) {
        fprintf(stderr, "rs_sign_digest failed: %d\n", status);
        rs_release();
        return 1;
    }

    printf("pubkey    ");
    hex_print(pubkey, RECEIPT_PUBKEY_LEN);
    printf("signature ");
    hex_print(signature, RECEIPT_SIGNATURE_LEN);

    rs_release();
    return 0;
}
