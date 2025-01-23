#!/bin/sh
set -euo

RETRIES=${RETRIES:-90}
# new fuel core version config params
DA_COMPRESSION=${DA_COMPRESSION:-"3600sec"}
GRAPHQL_COMPLEXITY=${GRAPHQL_COMPLEXITY:-500000}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'

if [ -z "$L1_CHAIN_HTTP" ]; then
    echo "Must specify \$L1_CHAIN_HTTP."
    exit 1
fi
if [ -z "$DEPLOYMENTS_HTTP" ]; then
    echo "Must specify \$DEPLOYMENTS_HTTP."
    exit 1
fi

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
export FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS=$(cat "./addresses.json" | jq -r .FuelMessagePortal)
echo "FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS: $FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS"
echo "L1_CHAIN_HTTP: $L1_CHAIN_HTTP"

export FORKING=${FORKING}

# start the Fuel client
if [ "$FORKING" = "true" ]; then
    echo "FORKING is enabled. Running with da deploy height"
    exec /root/fuel-core run \
        --ip $FUEL_IP \
        --port $FUEL_PORT \
        --utxo-validation \
        --vm-backtrace \
        --enable-relayer \
        --relayer $L1_CHAIN_HTTP \
        --relayer-v2-listening-contracts $FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS \
        --poa-interval-period 1sec \
        --relayer-da-deploy-height=21371952 \
        --debug \
        --da-compression $DA_COMPRESSION \
        --graphql-max-complexity $GRAPHQL_COMPLEXITY \
        --min-gas-price 0 \
        --snapshot ./
else
    echo "FORKING is disabled. Running without da deploy height"
    exec /root/fuel-core run \
        --ip $FUEL_IP \
        --port $FUEL_PORT \
        --utxo-validation \
        --vm-backtrace \
        --enable-relayer \
        --relayer $L1_CHAIN_HTTP \
        --relayer-v2-listening-contracts $FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS \
        --poa-interval-period 1sec \
        --debug \
        --da-compression $DA_COMPRESSION \
        --graphql-max-complexity $GRAPHQL_COMPLEXITY \
        --min-gas-price 0 \
        --snapshot ./
fi
