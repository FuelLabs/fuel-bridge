#!/bin/bash
set -euo

if [ -z "$FUEL_CHAIN_HTTP" ]; then
    echo "Must specify \$FUEL_CHAIN_HTTP."
    exit 1
fi
if [ -z "$EXECUTOR_KEY" ]; then
    echo "Must specify \$EXECUTOR_KEY."
    exit 1
fi

# run the executor program
exec bridge-message-executor --connect-timeout 60000 --fuel-chain-http ${FUEL_CHAIN_HTTP} --executor-key ${EXECUTOR_KEY}
