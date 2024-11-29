#!/bin/sh
set -euo

RETRIES=${RETRIES:-120}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'

L1_CHAIN_HTTP="http://127.0.0.1:$L1_PORT"

pnpm run node
# wait for the base layer to be up
echo "Waiting for l1 chain."
curl \
    --fail \
    --show-error \
    --silent \
    -H "Content-Type: application/json" \
    --retry-connrefused \
    --retry $RETRIES \
    --retry-delay 1 \
    -d $JSON \
    $L1_CHAIN_HTTP > /dev/null

echo "Connected to l1 chain."


