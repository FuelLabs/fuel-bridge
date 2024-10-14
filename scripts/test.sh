#!/bin/bash

# Exit immediately on errors
set -e

# Build the project artifacts
echo -e "\n\nBuilding projects..."
pnpm run build

# Run tests for Cargo and Forc
echo -e "\n\nRunning Cargo tests..."
cargo test
echo -e "\n\nRunning Forc tests..."
pnpm forc test

# Start L1 and Fuel nodes using Docker
echo -e "\n\nStarting Docker..."
pnpm run node:up

# Wait for Fuel node readiness with a max of 50 attempts (6s interval)
MAX_CHECK_ATTEMPTS=50
NODE_URL="http://localhost:4000/v1/playground"
HEALTH_CHECK_COUNTER=0

wait_for_node() {
    echo -ne "\rWaiting for node to be ready..."

    if [ $HEALTH_CHECK_COUNTER -ge $MAX_CHECK_ATTEMPTS ]; then
        echo -e "\n\nNode is not ready after $MAX_CHECK_ATTEMPTS attempts, exiting."
        exit 1
    fi

    if curl --silent --head --fail "$NODE_URL" | grep -q "200 OK"; then
        echo -e "\nNode is ready, running tests..."
        pnpm turbo run test
    else
        HEALTH_CHECK_COUNTER=$((HEALTH_CHECK_COUNTER + 1))
        sleep 6
        wait_for_node
    fi
}

wait_for_node
