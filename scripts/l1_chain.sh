#!/bin/bash
set -euo

RETRIES=${RETRIES:-20}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'
L1_CHAIN_HTTP="http://127.0.0.1:$L1_PORT"

# start l1 chain
echo "Starting l1 chain."
npx hardhat node --network hardhat --port $L1_PORT --hostname $L1_IP &

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

# deploy contracts
echo "Deploying contracts to L1."
LOCALHOST_HTTP=$L1_CHAIN_HTTP AUTHORITY_KEY=$POA_AUTHORITY_KEY npm run node-deploy

# serve contract deployment data
echo "Starting deployment data server."
npm run serve-deployments
