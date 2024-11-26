#!/bin/sh
set -euo

#!/bin/sh
set -euo

RETRIES=${RETRIES:-90}
DA_COMPRESSION=${DA_COMPRESSION:-"3600sec"}
GRAPHQL_COMPLEXITY=${GRAPHQL_COMPLEXITY:-500000}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'
# FUEL_DB_PATH=./mnt/db/

if [ -z "$L1_CHAIN_HTTP" ]; then
    echo "Must specify \$L1_CHAIN_HTTP."
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

# pull data from deployer dump
export FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS=$(jq -r '.address' /l1chain/fuel-v2-contracts/deployments/localhost/FuelMessagePortal.json)
echo "FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS: $FUEL_MESSAGE_PORTAL_CONTRACT_ADDRESS"
echo "L1_CHAIN_HTTP: $L1_CHAIN_HTTP"

# start the Fuel client
#--db-path ${FUEL_DB_PATH}
echo "Starting fuel node."
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
