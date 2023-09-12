#!/bin/sh
set -euo

RETRIES=${RETRIES:-10}
DELAY=${DELAY:-5}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'

echo " --- --- --- trying connect to http://$FUEL_IP:$FUEL_PORT/health"
# wait for the base layer to be up
curl \
    --fail \
    --show-error \
    --silent \
    --retry-connrefused \
    --retry $RETRIES \
    --retry-delay $DELAY \
    http://$FUEL_IP:$FUEL_PORT/health > /dev/null


echo " --- --- --- connected to http://$FUEL_IP:$FUEL_PORT"
# this is needed to remove "/deployments.*.json" from variable DEPLOYMENTS_HTTP
DEPLOYMENTS_HTTP_DIR=$(dirname "$DEPLOYMENTS_HTTP")
# TODO: pass env variables in a better way
echo " --- --- --- executing deploy fuel contracts"
echo " --- --- --- HTTP_DEPLOYER=$DEPLOYMENTS_HTTP_DIR HTTP_ETHEREUM_CLIENT=$L1_CHAIN_HTTP HTTP_FUEL_CLIENT=http://$FUEL_IP:$FUEL_PORT/graphql"
cd ./project && HTTP_DEPLOYER="$DEPLOYMENTS_HTTP_DIR" HTTP_ETHEREUM_CLIENT="$L1_CHAIN_HTTP" HTTP_FUEL_CLIENT="http://$FUEL_IP:$FUEL_PORT/graphql" pnpm --filter @fuel-bridge/fuel-contracts serveDeployment
echo " --- --- --- executed deploy fuel contracts"
