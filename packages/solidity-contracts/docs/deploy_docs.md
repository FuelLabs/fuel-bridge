
# Fuel Bridge Solidity-Contracts Deployment 

This document outlines the deployment steps for the Solidity-Contracts package in the Fuel Bridge

## Contents

- [deployAll](deployAll.ts)
- [deployImplementation]()
- [grandComitterRole]()
- [replaceFuelChainConsts]()
- [serveDeployments]()
- [startAutoMining]()
- [upgradeAll]()
- [utils]()
- [verifyAddress]()
- [verifySource]()

### deployAll.ts

The `deployAll.ts` script is responsible for deployin the solidity contracts that comprise the Fuel V2 System. To deploy the contracts for testing, you must firstly run an Ethereum node locally by calling `npx hardhat node`. To run this script, simple call the following command:

`npx hardhat run scripts/deploy.ts`

The script checks that the `QUICK_DEPLOY` and `DEPLOYER_KEY` variables are set, and then attempts to call `ethers.getBlockNumber` to ensure that your environment has access to an Ethereum RPC.

The script requires a prompt from the user when run on `QUICK_DEPLOY` mode, to confirm that it was not triggered by accident. Then, the `deployFuel` function is called, which creates the new smart contracts on the connected blockchain.

```
export async function deployFuel(
  deployer?: Signer
): Promise<DeployedContracts> {
  // Deploy fuel chain state contract
  const FuelChainState = await ethers.getContractFactory(
    'FuelChainState',
    deployer
  );

  const fuelChainState = await upgrades
    .deployProxy(FuelChainState, [], {
      initializer: 'initialize',
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelChainState__factory.connect(tx as any, tx.runner));

  // Deploy message portal contract
  const FuelMessagePortal = await ethers.getContractFactory(
    'FuelMessagePortal',
    deployer
  );

  const fuelMessagePortal = await upgrades
    .deployProxy(FuelMessagePortal, [await fuelChainState.getAddress()], {
      initializer: 'initialize',
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelMessagePortal__factory.connect(tx as any, tx.runner));
  const fuelMessagePortalAddress = await fuelMessagePortal.getAddress();

  // Deploy gateway contract for ERC20 bridging
  const FuelERC20Gateway = await ethers.getContractFactory(
    'FuelERC20GatewayV2',
    deployer
  );
  const fuelERC20Gateway = await upgrades
    .deployProxy(FuelERC20Gateway, [fuelMessagePortalAddress], {
      initializer: 'initialize',
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelERC20GatewayV2__factory.connect(tx as any, tx.runner));

  // Deploy gateway contract for ERC721 bridging
  const FuelERC721Gateway = await ethers.getContractFactory(
    'FuelERC721GatewayV2',
    deployer
  );
  const fuelERC721Gateway = await upgrades
    .deployProxy(FuelERC721Gateway, [fuelMessagePortalAddress], {
      initializer: 'initialize',
    })
    .then((tx) => tx.waitForDeployment())
    .then((tx) => FuelERC721Gateway__factory.connect(tx as any, tx.runner));

  // Return deployed contracts
  return {
    fuelChainState,
    fuelMessagePortal,
    fuelERC20Gateway,
    fuelERC721Gateway,
  };
}
```

An artifacts file is then saved that documents the deployment. 

If `QUICK_DEPLOY` was not called, then the contracts are also verified on the relevant https://etherscan.io website.

### deployImplementation.ts

The `deployImplementation.ts` script is designed to be used as part of an UUPS upgrade event on the Fuel v2 system contracts. This script is used to deploy the new implementation contracts which the Fuel Bridge UUPS proxy contracts will point to. Before running this script, ensure that you have an Ethereum node running locally by executing 

`npx hardhat node` 

To deploy the implementation contracts, use the following command:

`npx hardhat run --network localhost scripts/deployImplementation.ts`

This script begins by verifying the connection to the Ethereum RPC by attempting to fetch the current block number. If the connection is successful, it proceeds to prompt the user for confirmation to deploy the implementation for each contract on the specified network.

#### Deployment Steps:
- The script checks the connection to the Ethereum node. If the connection fails, it throws an error indicating the issue with the RPC connection.

- Network Identification: It identifies the current network to which it is connected.

- Deployment Confirmation: The user is prompted to confirm the deployment of the implementation for each contract: `FuelChainState`, `FuelMessagePortal`, and `FuelERC20Gateway`.

#### Contract Implementation Deployment:

If the script was successful the implementation of `FuelChainState` will be deployed. along with the implementation of `FuelMessagePortal `and `FuelERC20Gateway`.

After successful deployment, the script logs the addresses of the deployed implementations and updates the deployments file with these addresses. If the network supports source code verification, the script prompts the user to confirm whether they want to publish the contract source code for verification. If confirmed, it waits for a few confirmations and then publishes the source code for verification on Etherscan.

### grandComitterRole.ts

The grandComitterRole.ts script is responsible for granting the COMMITTER_ROLE to a specified address within the FuelChainState contract. This role enables access to special function for committing block headers to the Fuel sequencer.


    
    function commit(bytes32 blockHash, uint256 commitHeight) external whenNotPaused onlyRole(COMMITTER_ROLE) {
        uint256 slot = commitHeight % NUM_COMMIT_SLOTS;
        Commit storage commitSlot = _commitSlots[slot];

        unchecked {
            if (commitSlot.timestamp + COMMIT_COOLDOWN > uint32(block.timestamp)) {
                revert CannotRecommit();
            }
        }

        commitSlot.blockHash = blockHash;
        commitSlot.timestamp = uint32(block.timestamp);

        emit CommitSubmitted(commitHeight, blockHash);
    }
    

Prerequisites:
Ensure that the environment variables DEPLOYER_KEY, FUEL_CHAIN_STATE_ADDRESS, COMITTER_ADDRESS, and RPC_URL are correctly set.

Execution:
To run this script, use the following command:

`node scripts/grandComitterRole.ts`

#### Script Steps:
- **Environment Variable Validation:** The script checks if the required environment variables are set and valid. If any are missing or invalid, it throws an error.

- **Provider Setup:** A StaticJsonRpcProvider is instantiated using the provided RPC_URL.

- **Wallet Initialization:** A wallet is created from the DEPLOYER_KEY and the provider.

- **Contract Interaction:** The FuelChainState contract is connected using the provided address and the admin wallet.

- **Role Granting: **The script retrieves the COMMITTER_ROLE identifier and then executes a grantRole transaction to assign this role to the COMITTER_ADDRESS.

- **Transaction Confirmation:** After sending the transaction, the script waits for the transaction to be confirmed on the blockchain.

- **Execution Result:** If the transaction is successful, a success message is logged. If any errors occur, they are logged, and the script exits with a status of 1.

### replaceFuelChainConsts.ts

The `replaceFuelChainConsts.ts` script is designed to dynamically update the constant values in the FuelChainState.sol contract file based on the values specified in the `.fuelChainConsts.env` file. This is particularly useful during development and testing phases to simulate different contract behaviors without redeploying the contract.

#### Functionality

**Environment File Loading:** The script starts by loading the `.fuelChainConsts.env` file, which contains key-value pairs of constants to be updated in the contract.

**File Parsing:** If the environment file is found and contains data, the script proceeds to read the content of FuelChainState.sol.

**Constant Replacement:** For each key-value pair in the environment file, the script uses a regular expression to find and replace the corresponding constant in the contract file.

**File Update:** After all constants have been replaced, the updated content is written back to FuelChainState.sol.

**Error Handling:** If the environment file is not found or if any error occurs during the process, the script throws an error and exits with a status of 1.

### serveDeployments.ts

The `serveDeployments.ts` script sets up a simple **Express.js** server to serve the local deployment addresses stored in the deployments directory. This is useful for providing a RESTful API endpoint to access the deployment details during local development and testing.

**Setup:**
Environment Configuration: The script uses the SERVE_PORT environment variable to determine the port on which the server should run. If not specified, it defaults to port 8080.

**Express Server Initialization:** An Express server is initialized and configured to use CORS (Cross-Origin Resource Sharing) to allow requests from different origins.

**Static File Serving:** The server is set up to serve static files from the deployments directory, which typically contains a `deployments.local.json` file with the deployment addresses.

**Server Start:** The server listens on the specified port and logs the server URL and the fact that CORS is enabled.

**Usage:**
To use this script, ensure that you have run the deployment script or have a valid deployments.local.json file in the deployments directory. Then, start the server using the following command:

`npx ts-node scripts/serveDeployments.ts`

This will start the server, and you can access the deployment addresses via a web browser or HTTP client at https://localhost:8080.

### startAutoMining.ts

The `startAutoMining.ts` script is a utility script that when run, automatically begins mining blocks on a local Ethereum node, which is useful for speeding up the block confirmation process during development and testing. This script interacts with the Ethereum node's JSON-RPC API to set the mining behavior.

**Functionality:**
Environment Configuration: The script requires the RPC_URL environment variable to be set, which points to the local Ethereum node's RPC endpoint.

**Provider Setup:** A JsonRpcProvider is instantiated using the provided RPC_URL.

**Automine Activation:** The script sends a evm_setAutomine RPC call to the provider with the argument true, which enables automatic mining on the node.

**Interval Mining Setup:** The script then sends a `evm_setIntervalMining` RPC call to the provider with an interval of 30000 milliseconds (30 seconds), which sets the interval at which the node should mine a block.

**Execution Result:** After setting up the mining behavior, the script logs the completion of the process. If any errors occur, they are logged, and the script exits with a status of 1.

### upgradeAll.ts

The `upgradeAll.ts` script is designed to upgrade all the solidity smart contracts in the Fuel v2 system.

**Prerequisites:**
Ensure that the environment variables and configuration are correctly set for the Ethereum node.

Have a valid deployments.`<local/spolia/mainnet>.json` file with the current contract addresses.

**Execution:**
To run this script, use the following command:


`npx hardhat run --network localhost scripts/upgradeAll.ts`

**Script Steps:**

**Connection Verification:** The script checks the connection to the Ethereum node. If the connection fails, it throws an error indicating the issue with the RPC connection.

**Network Identification:** It identifies the current network to which it is connected.

**Deployment Confirmation:** The user is prompted to confirm the upgrade of all contracts on the specified network.

**Contract Upgrade:** If confirmed, the script attempts to upgrade all contracts using the upgradeFuel function.

```
export async function upgradeFuel(
  contracts: DeployedContractAddresses,
  signer?: Signer
): Promise<DeployedContractAddresses> {
  // Upgrade fuel chain state contract
  const FuelChainState = await ethers.getContractFactory(
    'FuelChainState',
    signer
  );
  await upgrades.forceImport(contracts.FuelChainState, FuelChainState, {
    kind: 'uups',
  });
  await upgrades.upgradeProxy(contracts.FuelChainState, FuelChainState);

  // Upgrade message portal contract
  const FuelMessagePortal = await ethers.getContractFactory(
    'FuelMessagePortal',
    signer
  );
  await upgrades.forceImport(contracts.FuelMessagePortal, FuelMessagePortal, {
    kind: 'uups',
  });
  await upgrades.upgradeProxy(contracts.FuelMessagePortal, FuelMessagePortal);

  // Upgrade gateway contract for ERC20 bridging
  const FuelERC20Gateway = await ethers.getContractFactory(
    'FuelERC20Gateway',
    signer
  );
  await upgrades.forceImport(contracts.FuelERC20Gateway, FuelERC20Gateway, {
    kind: 'uups',
  });
  await upgrades.upgradeProxy(contracts.FuelERC20Gateway, FuelERC20Gateway);

  // Upgrade gateway contract for ERC20 bridging
  const FuelERC721Gateway = await ethers.getContractFactory(
    'FuelERC721Gateway',
    signer
  );
  await upgrades.forceImport(contracts.FuelERC721Gateway, FuelERC721Gateway, {
    kind: 'uups',
  });
  await upgrades.upgradeProxy(contracts.FuelERC721Gateway, FuelERC721Gateway);

  // Return deployed contracts
  contracts.FuelChainState_impl =
    await upgrades.erc1967.getImplementationAddress(contracts.FuelChainState);
  contracts.FuelMessagePortal_impl =
    await upgrades.erc1967.getImplementationAddress(
      contracts.FuelMessagePortal
    );
  contracts.FuelERC20Gateway_impl =
    await upgrades.erc1967.getImplementationAddress(contracts.FuelERC20Gateway);
  return contracts;
}

```

**Address Logging and File Update:** After successful upgrade, the script logs the addresses of the upgraded contracts and updates the deployments file with these addresses.

**Source Code Verification:** If the network supports source code verification, the script prompts the user to confirm whether they want to publish the contract source code for verification. If confirmed, it waits for a few confirmations and then publishes the source code for verification.

### utils.ts

The `utils.ts` script provides a set of utility functions for deploying, upgrading and verifying the deployment of the Fuel v2 system contracts, as well as providing some useful helper functions for miscellaneous tasks. These utilities handle tasks such as loading and saving deployment addresses, confirming user actions, and verifying contract source code on Etherscan and Sourcify.

**Key Functions:**
loadDeploymentsFile: Loads the deployment addresses for the currently connected network from a JSON file. If the file does not exist and `saveTemplateOnNotFound` is true, it creates a new file with blank addresses.

**saveDeploymentsFile:** Saves the deployed addresses to a JSON file, replacing the existing file for the connected network.

**getNetworkName:** Determines the name of the connected network based on its chain ID. It supports common EVM networks like mainnet, goerli, local, and sepolia.

**confirmationPrompt:** Provides a simple CLI confirmation prompt for user input, returning a boolean based on the user's response.

**publishProxySourceVerification** and **publishImplementationSourceVerification:** These functions handle the verification of contract source code on Etherscan and Sourcify for both proxy and implementation contracts.

**isNetworkVerifiable:** Checks if the connected network is verifiable, which is true for mainnet and sepolia.

**waitForConfirmations:** Waits for a specified number of block confirmations before proceeding, useful for ensuring transaction finality.

**verifyEtherscan** and **verifySourcifyFromEtherscan:** These functions are responsible for publishing and verifying the source code of contracts on Etherscan and Sourcify, respectively.

**sleep:** A simple utility to pause execution for a specified number of milliseconds.

### verifyAddress.ts

The `verifyAddress.ts` script is designed to verify the source code of a deployed contract in the Fuel v2 system. This script send bytecode and sourcecode to etherscan, so that Etherscan can verify the contract code.

**Prerequisites:**
Ensure that the environment variables and configuration are correctly set for the Ethereum node.

**Execution:**
To run this script, use the following command:

`npx hardhat run scripts/verifyAddress.ts`

**Script Steps:**
**Connection Verification:** The script checks the connection to the Ethereum node. If the connection fails, it throws an error indicating the issue with the RPC connection.

**Contract Address Input:** The user is prompted to enter the deployed contract address they would like to verify.

**Address Validation:** The script validates the entered contract address to ensure it is a valid Ethereum address.

**Source Code Verification:** The script attempts to verify the source code of the deployed contract using Hardhat's verify task.

**Error Handling:** If the verification process fails, the script logs the error message.

### verifySource.ts

The `verifySource.ts` script is designed to publish the source code for verification of the Fuel v2 system contracts, both for the proxy and implementation contracts. This script differs from `verifyAddress.ts`, as it also verified the proxy contracts as well.

**Prerequisites:**
- Ensure that the environment variables and configuration are correctly set for the Ethereum node.

- Have a valid deployments.`<local/spolia/mainnet>.json` file with the current contract addresses.

**Execution:**
To run this script, use the following command:

`npx hardhat run scripts/verifySource.ts`

**Script Steps:**
**Connection Verification:** The script checks the connection to the Ethereum node. If the connection fails, it throws an error indicating the issue with the RPC connection.

**Deployment File Loading:** It loads the deployment addresses from the `deployments.<local/spolia/mainnet>.json` file.

**Network Identification:** It identifies the current network to which it is connected.

**roxy Contract Verification Confirmation:** The user is prompted to confirm whether they want to publish the verification of source code for all contract proxies on the specified network.

**Proxy Contract Verification:** If confirmed, the script publishes the source code verification for the proxy contracts.

**Implementation Contract Verification Confirmation:** The user is prompted to confirm whether they want to publish the verification of source code for the implementation contracts of `FuelChainState`, `FuelMessagePortal`, and `FuelERC20Gateway`.

**Implementation Contract Verification:** If confirmed, the script publishes the source code verification for the implementation contracts.