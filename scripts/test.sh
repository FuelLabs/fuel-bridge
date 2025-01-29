#!/bin/bash
# 
# This script is used to run tests on the fuel node.
# it will start the node and wait for it to be ready
# before running the tests.
#
# By ready it means;
# - The L1 node is started
# - The solidity-contracts are deployed to the L1 node;
# - The Fuel Node is started
# - The Fuel Node is connected to the L1 node and syncing blocks
#
# If the node is not ready after 5 minutes (50 checks with interval of 6 seconds),
# the script will fail.
#

set -e

# Build the project to collect the artifacts
echo "\n\nBuild projects..."
pnpm run build

# Test cargo projects
echo "\n\nCargo test..."
cargo test
echo "\n\nForc test..."
pnpm forc test

# Start the docker compose file with L1 and Fuel Node
echo "\n\nStarting docker..."
pnpm run node:up

# Wait for the nodes to be ready and run the tests
HEALTH_CHECK_COUNTER=0
HELTH_CHECK_OUTPUT=""
MAX_CHECK_ATTEMPTS=50

waitForNodesToBeReady() {
    NODE_URL="http://localhost:4000/v1/playground"

    printf "\rWaiting for node.${HELTH_CHECK_OUTPUT}"

    if [ $HEALTH_CHECK_COUNTER -gt $MAX_CHECK_ATTEMPTS ]; then
        echo "\n\nTests failed"
        exit 1
    fi

    CURL_RESPONSE=$(curl --head --request GET --silent --show-error --fail $NODE_URL 2>&1 || true)

    echo -e "\nCurl response headers:\n$CURL_RESPONSE"

    if echo "$CURL_RESPONSE" | grep "200 OK" > /dev/null; then
        echo "\nRun tests..."
        pnpm turbo run test
    else
        echo -e "\n--- Docker Logs (docker-fuel_core-1) ---"
        docker logs docker-fuel_core-1 || echo "Failed to get logs for docker-fuel_core-1"
        echo -e "\n--------------------------------------"

        HEALTH_CHECK_COUNTER=$((HEALTH_CHECK_COUNTER+1))
        HELTH_CHECK_OUTPUT="${HELTH_CHECK_OUTPUT}."
        sleep 6
        waitForNodesToBeReady
    fi
}

waitForNodesToBeReady
