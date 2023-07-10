#!/bin/bash

set -e

echo "\n\nStarting docker..."
pnpm run node:up

runTests() {
    NODE_URL="http://localhost:4000/playground";

    if curl --silent --head --request GET $NODE_URL | grep "200 OK" > /dev/null; then
        echo "\Run tests..."
        pnpm turbo run test
    else
        sleep .5
        runTests
    fi
}

echo "\n\nWaiting for node..."
runTests
