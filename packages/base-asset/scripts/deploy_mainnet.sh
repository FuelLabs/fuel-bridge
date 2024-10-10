#!/bin/sh

# This script requires you to install the fuel toolchain:
# https://github.com/FuelLabs/fuelup
# 
# You must run it from the following directory:
# `packages/base-asset`
# e.g. `bash scripts/deploy_mainnet.sh` 
#
# Alternatively, use the rust script:
# cargo run -r --bin deploy_mainnet -- \
# --provider-url <NODE_URL>`

forc deploy \
    --salt 0x0000000000000000000000000000000000000000000000000000000000000000 \
    --node-url $NODE_URL \
    $SIGNER_KEY