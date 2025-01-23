#!/bin/sh
set -euo

RETRIES=${RETRIES:-60}
DELAY=${DELAY:-10}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'

if [ -z "$COMMITTER__ETH__RPC" ]; then
    echo "Must specify \$ETHEREUM_RPC."
    exit 1
fi
if [ -z "$COMMITTER__FUEL__GRAPHQL_ENDPOINT" ]; then
    echo "Must specify \$FUEL_GRAPHQL_ENDPOINT."
    exit 1
fi
if [ -z "$DEPLOYMENTS_HTTP" ]; then
    echo "Must specify \$DEPLOYMENTS_HTTP."
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
    --retry-delay $DELAY \
    $DEPLOYMENTS_HTTP \
    -o addresses.json
echo "Got l1 chain deployment data."

echo "COMMITTER__ETH__STATE_CONTRACT_ADDRESS: $COMMITTER__ETH__STATE_CONTRACT_ADDRESS"
echo "ETHEREUM_RPC: $COMMITTER__ETH__RPC"
echo "FUEL_GRAPHQL_ENDPOINT: $COMMITTER__FUEL__GRAPHQL_ENDPOINT"

# start the Block Commiter
echo "Starting block commiter"
exec /root/fuel-block-committer