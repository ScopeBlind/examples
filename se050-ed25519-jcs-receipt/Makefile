# Makefile for the NXP SE050 signed-receipt example.
#
# Requires nxp-plugandtrust (SE05x SDK) built and installed on the host.
# Install from source:
#   git clone https://github.com/NXPPlugNTrust/nxp-plugandtrust
#   cd nxp-plugandtrust && mkdir build && cd build
#   cmake .. -DPTMW_Host=PCWindows -DPTMW_SE05X_Auth=None
#   make && sudo make install
#
# For embedded targets (Cortex-M), adapt CFLAGS / HAL selection to match
# your board's I2C peripheral. See nxp-plugandtrust/hostlib/hostLib/
# platform/ for supported HALs (Raspberry Pi, iMX, STM32, Zephyr, etc).

CC      ?= cc
CFLAGS  ?= -Wall -Wextra -O2 -std=c11 \
           -I/usr/local/include/sss \
           -I/usr/local/include/sss/api \
           -I/usr/local/include/ex \
           -Isrc
LDFLAGS ?= -lse05x -lsmCom -lex_common

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

verify: sample_receipt.json
	@echo "Verifying with @veritasacta/verify (requires npx + npm)..."
	npx @veritasacta/verify sample_receipt.json

clean:
	rm -f $(OBJS) $(BIN)

.PHONY: all clean reference verify
