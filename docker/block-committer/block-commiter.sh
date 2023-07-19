#!/bin/sh
set -euo

RETRIES=${RETRIES:-60}
DELAY=${DELAY:-10}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'

if [ -z "$ETHEREUM_RPC" ]; then
    echo "Must specify \$ETHEREUM_RPC."
    exit 1
fi
if [ -z "$FUEL_GRAPHQL_ENDPOINT" ]; then
    echo "Must specify \$FUEL_GRAPHQL_ENDPOINT."
    exit 1
fi
if [ -z "$DEPLOYMENTS_HTTP" ]; then
    echo "Must specify \$DEPLOYMENTS_HTTP."
    exit 1
fi

echo $FUEL_GRAPHQL_ENDPOINT/health

# wait for the base layer to be up
echo "Waiting for Fuel Core chain."
curl \
    --fail \
    --show-error \
    --silent \
    --retry-connrefused \
    --retry $RETRIES \
    --retry-delay $DELAY \
    $FUEL_GRAPHQL_ENDPOINT/health > /dev/null
echo "Connected to Fuel Core chain."

# get the deployments file from the deployer
echo "Waiting for l1 chain deployment data."
curl \
    --fail \
    --show-error \
    --silent \
    --retry-connrefused \
    --retry-all-errors \
    --retry $RETRIES \
    --retry-delay $DELAY \
    $DEPLOYMENTS_HTTP \
    -o addresses.json
echo "Got l1 chain deployment data."

# pull data from deployer dump
export STATE_CONTRACT_ADDRESS=$(cat "./addresses.json" | jq -r .FuelChainState)
echo "STATE_CONTRACT_ADDRESS: $STATE_CONTRACT_ADDRESS"
echo "ETHEREUM_RPC: $ETHEREUM_RPC"
echo "FUEL_GRAPHQL_ENDPOINT: $FUEL_GRAPHQL_ENDPOINT"

# start the Block Commiter
echo "Starting block commiter"
exec /root/fuel-block-committer
