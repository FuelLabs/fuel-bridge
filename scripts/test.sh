#!/bin/bash

set -e

echo "\n\Building packages..."
pnpm run build

echo "\n\nStarting docker..."
pnpm run node:up

RUN_TESTS_TRY=0
MAX_TRIES=50

runTests() {
    NODE_URL="http://localhost:4000/playground";

    if [ $RUN_TESTS_TRY -gt $MAX_TRIES ]; then
        echo "\n\nTests failed"
        exit 1
    fi

    if curl --silent --head --request GET $NODE_URL | grep "200 OK" > /dev/null; then
        echo "\nRun tests..."
        # pnpm turbo run test
    else
        # Sleep for 6 seconds before retrying
        sleep 6
        RUN_TESTS_TRY=$((RUN_TESTS_TRY+1))
        runTests
    fi
}

echo "\n\nWaiting for node..."
runTests
