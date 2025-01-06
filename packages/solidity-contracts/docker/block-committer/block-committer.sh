#!/bin/sh
set -euo

RETRIES=${RETRIES:-60}
DELAY=${DELAY:-10}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'
HEALTH_URL=${HEALTH_URL:-"http://fuel_core:4001/v1/health"}

if [ -z "$COMMITTER__ETH__RPC" ]; then
    echo "Must specify \$ETHEREUM_RPC."
    exit 1
fi
if [ -z "$COMMITTER__FUEL__GRAPHQL_ENDPOINT" ]; then
    echo "Must specify \$FUEL_GRAPHQL_ENDPOINT."
    exit 1
fi

echo $COMMITTER__FUEL__GRAPHQL_ENDPOINT/health

# wait for the base layer to be up
echo "Waiting for Fuel Core chain."
curl \
    --fail \
    --show-error \
    --silent \
    --retry-connrefused \
    --retry $RETRIES \
    --retry-delay $DELAY \
    $HEALTH_URL > /dev/null
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
    --retry-delay 5 \
    $DEPLOYMENTS_HTTP \
    -o addresses.json
echo "Got l1 chain deployment data."

# pull data from deployer dump
export COMMITTER__ETH__STATE_CONTRACT_ADDRESS=$(cat "./addresses.json" | jq -r .FuelChainState)
export COMMITTER__APP__DB__USERNAME=${DB__USERNAME}
export COMMITTER__APP__DB__PASSWORD=${DB__PASSWORD}
export COMMITTER__ETH__L1_KEYS__MAIN=${COMMITTER__ETH__L1_KEYS__MAIN}
export COMMITTER__ETH__L1_KEYS__BLOB=${COMMITTER__ETH__L1_KEYS__BLOB}
echo "COMMITTER__ETH__STATE_CONTRACT_ADDRESS: $COMMITTER__ETH__STATE_CONTRACT_ADDRESS"
echo "ETHEREUM_RPC: $COMMITTER__ETH__RPC"
echo "FUEL_GRAPHQL_ENDPOINT: $COMMITTER__FUEL__GRAPHQL_ENDPOINT"

# start the Block Commiter
echo "Starting block commiter"
exec /root/fuel-block-committer
