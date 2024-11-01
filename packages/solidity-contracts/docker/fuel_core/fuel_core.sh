#!/bin/sh
set -euo

PORTAL_ADDRESS=$(jq -r '.address' /l1chain/fuel-v2-contracts/deployments/FuelMessagePortal.json)

echo "Launching fuel node with PORTAL_ADDRESS=$PORTAL_ADDRESS"

exec /root/fuel-core run \
    --ip $FUEL_IP \
    --port $FUEL_PORT \
    --db-type in-memory \
    --utxo-validation \
    --vm-backtrace \
    --enable-relayer \
    --relayer $L1_CHAIN_HTTP \
    --relayer-v2-listening-contracts $PORTAL_ADDRESS \
    --relayer-da-deploy-height 0 \
    --poa-interval-period 1sec \
    --debug \
    --min-gas-price 0 \
    --snapshot ./

echo "Launched fuel node"