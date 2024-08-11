#!/bin/bash

#### ETHEREUM BOOTSTRAP
pm2 --name eth start "/root/.foundry/bin/anvil \
    --host 0.0.0.0 \
    --block-time 12 \
    --mixed-mining \
    --slots-in-an-epoch 1"

cd /fuel-bridge/packages/solidity-contracts \
    && npx hardhat deploy --network localhost --reset \
    && cd -

export DEPLOYMENTS_DIR=/fuel-bridge/packages/solidity-contracts/deployments/localhost
export STATE_ADDRESS=$(jq -r '.address' $DEPLOYMENTS_DIR/FuelChainState.json)
export PORTAL_ADDRESS=$(jq -r '.address' $DEPLOYMENTS_DIR/FuelMessagePortal.json)
export GATEWAY_ADDRESS=$(jq -r '.address' $DEPLOYMENTS_DIR/FuelERC20Gateway.json)

#### FUEL BOOTSTRAP
pm2 --name fuel start "/root/fuel-core run \
    --ip 0.0.0.0 \
    --port 4000 \
    --db-type in-memory \
    --utxo-validation \
    --vm-backtrace \
    --enable-relayer \
    --relayer http://localhost:8545 \
    --relayer-v2-listening-contracts $PORTAL_ADDRESS \
    --poa-interval-period 1sec \
    --debug \
    --min-gas-price 0"

export COMMIT_INTERVAL=${COMMIT_INTERVAL:-30}
export COMMITTER_PRIVATE_KEY=${COMMITTER_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}
pm2 --name committer start "/root/fuel-block-committer \
    --host 0.0.0.0 \
    --port 8888 \
    --ethereum-chain anvil \
    --ethereum-rpc ws://localhost:8545 \
    --ethereum-wallet-key $COMMITTER_PRIVATE_KEY \
    --state-contract-address $STATE_ADDRESS \
    --commit-interval $COMMIT_INTERVAL"

#### L2 BRIDGE DEPLOYMENT
export L2_BRIDGE_DEPLOYER=${L2_BRIDGE_DEPLOYER:-0xde97d8624a438121b86a1956544bd72ed68cd69f2c99555b08b1e8c51ffd511c}
export ASSET_ISSUER_ID=$(cd /fuel-bridge/packages/test-utils \
    &&  L1_TOKEN_GATEWAY=$GATEWAY_ADDRESS \
        L2_SIGNER=$L2_BRIDGE_DEPLOYER \
        L2_RPC=http://localhost:4000/v1/graphql \
        pnpm deploy:bridge 2>&1 | grep "Proxy at" | awk '{print $3}')

echo "Asset issuer ID is at $ASSET_ISSUER_ID"

cd /fuel-bridge/packages/solidity-contracts \
    && npx hardhat deploy --network localhost --tags set_asset_issuer_id,all \
    && cd -

#### HTTP SERVER FOR BACKWARDS COMPAT
pm2 --name deployments start "pnpm run serve-deployments" --cwd /fuel-bridge/packages/solidity-contracts

#### Attach to logs
pm2 logs