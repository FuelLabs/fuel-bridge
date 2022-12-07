#!/bin/sh
set -euo

RETRIES=${RETRIES:-60}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'
FUEL_DB_PATH=./mnt/db/
RUST_BACKTRACE=1

if [ -z "$DEPLOYER_ADDRESSES_PATH" ]; then
    echo "Must specify \$DEPLOYER_ADDRESSES_PATH."
    exit 1
fi
if [ -z "$L1_CHAIN_HTTP" ]; then
    echo "Must specify \$L1_CHAIN_HTTP."
    exit 1
fi

# wait for the base layer to be up
echo "Waiting for L1."
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

echo "Connected to L1."

# get the addresses file from the deployer
echo "Waiting for deployer."
curl \
    --fail \
    --show-error \
    --silent \
    --retry-connrefused \
    --retry-all-errors \
    --retry $RETRIES \
    --retry-delay 5 \
    $DEPLOYER_ADDRESSES_PATH \
    -o addresses.json

echo "Got addresses from deployer."

# pull data from deployer dump
export FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS=$(cat "./addresses.json" | jq -r .FuelMessagePortal)
echo "FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS is ${FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS}"
echo "L1_CHAIN_HTTP is ${L1_CHAIN_HTTP}"

# start the Fuel client
#--db-path ${FUEL_DB_PATH}
echo "Starting Fuel node."
exec /root/fuel-core run \
    --ip ${FUEL_IP} \
    --port ${FUEL_PORT} \
    --db-type in-memory \
    --utxo-validation \
    --vm-backtrace \
    --consensus-key ${CONSENSUS_KEY_SECRET} \
    --relayer ${L1_CHAIN_HTTP} \
    --relayer-v2-listening-contracts ${FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS} \
    --relayer-da-finalization 0 \
    --chain ./chainConfig.json
