#!/bin/sh
set -euo

RETRIES=${RETRIES:-60}
DELAY=${DELAY:-10}
JSON='{"jsonrpc":"2.0","id":0,"method":"net_version","params":[]}'

# wait for the base layer to be up
curl \
    --fail \
    --show-error \
    --silent \
    --retry-connrefused \
    --retry $RETRIES \
    --retry-delay 5 \
    http://$FUEL_IP:$FUEL_PORT/health > /dev/null

export ETH_ERC20_TOKEN_ADDRESS=$(cat "./addresses.json" | jq -r .ERC20)
export FUEL_ERC20_GATEWAY_ADDRESS=$(cat "./addresses.json" | jq -r .FuelERC20Gateway)

# if has test erc20 token address, deploy the equivalent fuel token contract
if [ -n "$ETH_ERC20_TOKEN_ADDRESS" ]; then
    # this is needed to remove "/deployments.*.json" from variable DEPLOYMENTS_HTTP
    DEPLOYMENTS_HTTP_DIR=$(dirname "$DEPLOYMENTS_HTTP")
    cd ./project && HTTP_DEPLOYER="$DEPLOYMENTS_HTTP_DIR" HTTP_ETHEREUM_CLIENT="$L1_CHAIN_HTTP" HTTP_FUEL_CLIENT="http://$FUEL_IP:$FUEL_PORT/graphql" ETH_ERC20_TOKEN_ADDRESS="$ETH_ERC20_TOKEN_ADDRESS" FUEL_ERC20_GATEWAY_ADDRESS="$FUEL_ERC20_GATEWAY_ADDRESS" pnpm --filter @fuel-bridge/integration-tests deployFuelToken && pnpm --filter @fuel-bridge/integration-tests serveDeployments
fi
