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

# run the tests.
echo "\nRun tests..."
pnpm turbo run test
