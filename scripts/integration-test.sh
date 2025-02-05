# run the tests.
echo "\nRun integration tests..."
pnpm run test:transfer & pnpm run test:erc20 & pnpm run test:erc721 & pnpm run test:bridge_proxy & pnpm run test:bridge_mainnet_tokens