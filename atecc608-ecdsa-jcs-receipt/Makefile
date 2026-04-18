# Makefile for the ATECC608B signed-receipt example.
#
# Requires libcryptoauth installed on the host. Install from source:
#   git clone https://github.com/MicrochipTech/cryptoauthlib
#   cd cryptoauthlib && mkdir build && cd build
#   cmake .. && make && sudo make install
#
# For embedded targets (Cortex-M), adapt CFLAGS / HAL selection to match
# your board's I2C peripheral. See cryptoauthlib/lib/hal/README.md for
# HAL layering; drop-in HALs exist for Nordic nRF52, STM32 HAL, and
# Zephyr driver model.

CC      ?= cc
CFLAGS  ?= -Wall -Wextra -O2 -std=c11 \
           -I$(shell pkg-config --cflags-only-I cryptoauthlib 2>/dev/null | sed 's/-I//' || echo /usr/local/include/cryptoauthlib) \
           -Isrc
LDFLAGS ?= -lcryptoauth

BIN := signed_receipt_example

SRCS := src/example_main.c src/receipt_signer.c
OBJS := $(SRCS:.c=.o)

all: $(BIN)

$(BIN): $(OBJS)
	$(CC) $(OBJS) -o $@ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

reference: sample_receipt.json

sample_receipt.json:
	python3 host/build_receipt.py reference --out $@

clean:
	rm -f $(OBJS) $(BIN)

.PHONY: all clean reference
