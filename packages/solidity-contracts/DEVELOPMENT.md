# Fuel Solidity Contracts

The Fuel Solidity smart contract architecture.

## Table of contents

- [Fuel Solidity Contracts](#fuel-solidity-contracts)
  - [Table of contents](#table-of-contents)
  - [Build From Source](#build-from-source)
    - [Dependencies](#dependencies)
    - [Building](#building)
  - [Deployed Contract Addresses](#deployed-contract-addresses)
  - [Scripts](#scripts)
    - [Deploy All](#deploy-all)
    - [Upgrade All](#upgrade-all)
    - [Deploy Implementations](#deploy-implementations)
    - [Verify Source](#verify-source)
    - [Verify Address](#verify-address)
  - [Contributing](#contributing)
  - [License](#license)
    - [Exceptions](#exceptions)

## Build From Source

### Dependencies

| dep     | version                                                  |
| ------- | -------------------------------------------------------- |
| Node.js | [>=v18.0.0](https://nodejs.org/en/blog/release/v18.0.0/) |

## Deployed Contract Addresses

You can find the addresses of the currently deployed contracts in the deployment files:

- Mainnet - TBD
- Sepolia - [deployments.sepolia.json](./deployments/deployments.sepolia.json)

\*Note: the contracts may have source code different from the current master branch head. Refer to the code verification on Etherscan or Sourcify for a look at their verified source code.

## Scripts

There are several provided scripts to help with contract management. Before running the scripts, make sure your environment variables are correctly configured. You can optionally create a .env file to set these variables (see [.env.example](.env.example)). The following is a list of the common variables to set:

- ETHERSCAN_API_KEY - Etherscan API key (required for code verification steps)
- CONTRACTS_RPC_URL - Overrides the default script used network RPC URL when set
- CONTRACTS_DEPLOYER_KEY - Overrides the default script used network accounts when set
- CONTRACTS_GAS_PRICE - Overrides the default script used network gas price when set

### Deploy All

```sh
npm run script-deploy --network <name of the network>
```

Deploys ALL contracts including proxy contracts. This is most useful when running a local network that you wish to deploy the full contract set to for testing.

### Upgrade All

```sh
npm run script-upgrade --network <name of the network>
```

Upgrades ALL contracts with new implementations. This is only possible if the current owner of the contracts is also the default deployer for the network. This is most useful when running a local network that you wish to upgrade the full contract set to for testing.

### Deploy Implementations

```sh
npm run script-deploy-impl --network <name of the network>
```

Deploys new implementation contracts. This is most useful in preparation for proposing a contract upgrade where the proxy contract owner is a multisig.

### Verify Source

```sh
npm run script-verify-source --network <name of the network>
```

Verifies the contract source code on Etherscan and Sourcify. This is only possible on recognized public networks (spolia, mainnet) and requires a deployment file either added manually under the `deployments` directory or auto generated after the deploy/upgrade scripts. This is useful to run in case there was an issue verifying the source during the deploy or upgrade scripts.

### Verify Address

```sh
npm run script-verify-address --network <name of the network>
```

Verifies the given contract address source code on Etherscan and Sourcify. This is useful to test if a proposed upgrade implementation exactly matches the expected code currently in the repository or on a specific branch of the repository. It also publicly verifies the source code of the given contract on Etherscan and Sourcify in the process. Note that this script checks the bytecode at the address against the repository first before uploading to Etherscan so you would see an error in regards to that first before anything about publicly verifying.

## Contributing

Code must pass tests with 100% coverage as well as be formatted and linted.

```sh
npm run coverage

npm run format
npm run lint
```

## License

The primary license for this repo is `Apache 2.0`, see [`LICENSE`](../../LICENSE).

### Exceptions

- [`ExcessivelySafeCall.sol`](./contracts/vendor/ExcessivelySafeCall.sol) is licensed under `MIT OR Apache-2.0` (as indicated in the SPDX headers) by [Nomad](https://github.com/nomad-xyz/ExcessivelySafeCall).
