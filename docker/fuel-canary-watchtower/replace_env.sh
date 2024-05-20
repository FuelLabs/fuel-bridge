#!/bin/sh

CONFIG_FILE=$1

# Replace placeholders with environment variables
sed -i "s|{{FUEL_GRAPHQL_ENDPOINT}}|${FUEL_GRAPHQL_ENDPOINT}|g" $CONFIG_FILE
sed -i "s|{{ETHEREUM_RPC}}|${ETHEREUM_RPC}|g" $CONFIG_FILE

# Execute the main application
/app/fuel-canary-watchtower $CONFIG_FILE
