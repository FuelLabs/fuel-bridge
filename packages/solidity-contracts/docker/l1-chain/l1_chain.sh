#!/bin/sh
set -euo

RETRIES=${RETRIES:-120}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'

L1_CHAIN_HTTP="http://127.0.0.1:$L1_PORT"

echo "Starting l1 chain."
pnpm hardhat node --network hardhat --port $L1_PORT --hostname $L1_IP &

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

export LOCALHOST_HTTP=$L1_CHAIN_HTTP

# Start auto mining
# We use a separate process to start auto mining because
# the deployment of contracts can fail if the chain is
# mining at the same time.
RPC_URL=$L1_CHAIN_HTTP pnpm run start-mining

# serve contract deployment data
echo "Starting deployment data server."
pnpm run serve-deployments


