# Fuel Messaging Bridge Integration Tests

Integration tests for the Fuel Messaging Bridge.

## Building From Source

### Dependencies

| dep     | version                                                  |
| ------- | -------------------------------------------------------- |
| Node.js | [>=v14.0.0](https://nodejs.org/en/blog/release/v14.0.0/) |

### Building

Install dependencies:

```sh
pnpm install
```

### Running Tests

Before running the integration tests, you need to spin up a full development stack complete with an Ethereum client and Fuel client. You can use the easy docker setup detailed [here](https://github.com/FuelLabs/fuel-dev-env/tree/v0.1.0-beta.3).

Run tests:

```sh
pnpm test
```

### Example Scripts

The test logic can also be run in script form. These scripts act as examples for how to bridge ETH and ERC-20 based assets to and from Fuel using the TS-SDK.

```sh
pnpm bridgeETH
pnpm bridgeERC20
```

### Running on Sepolia

The scripts can easily be run on other network setups like Sepolia by modifying environment variables. Refer to the example [environment file](./.env.example) for creating your own .env file configured for your target. You will need to provide URLs for both Fuel and Ethereum providers as well as private keys for executing transactions on the networks. You will also need to provide the bridge contract addresses and ERC-20/fungible token contract addresses if you wish to test bridging ERC-20 tokens.

## License

The primary license for this repo is `UNLICENSED`, see [`LICENSE`](../../LICENSE).
