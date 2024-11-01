#!/bin/sh
set -euo

RETRIES=${RETRIES:-60}
DELAY=${DELAY:-10}

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


# PORTAL_ADDRESS=$(jq -r '.address' /l1chain/fuel-v2-contracts/deployments/mainnetFork/FuelMessagePortal.json)

# pull data from deployer dump
export STATE_CONTRACT_ADDRESS=$(jq -r '.address' /l1chain/fuel-v2-contracts/deployments/FuelChainState.json)
echo "STATE_CONTRACT_ADDRESS: $STATE_CONTRACT_ADDRESS"
echo "FUEL_GRAPHQL_ENDPOINT: $FUEL_GRAPHQL_ENDPOINT"
echo "RPC: $ETHEREUM_RPC"

# start the Block Commiter
echo "Launching block committer with STATE_CONTRACT_ADDRESS=$STATE_CONTRACT_ADDRESS"
exec /root/fuel-block-committer