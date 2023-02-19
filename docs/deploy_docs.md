# Contract Deploy for Bridge

Each token to be bridged needs to have a corresponding bridge fungible token contract defined on the Fuel chain. These contracts handle messaging with the base layer gateway contract and are responsible for minting and burning the Fuel side token proxies.

## Dependencies

| dep         | version                                                  |
| ----------- | -------------------------------------------------------- |
| Forc        | [v0.31.1](https://fuellabs.github.io/sway/v0.31.1/introduction/installation.html) |
| Forc-Client | [v0.31.1](https://fuellabs.github.io/sway/v0.31.1/forc/plugins/forc_client/index.html) |

## Configure

Configure the target base layer token by editing the `bridge-fungible-token/Forc.toml` file:

- **BRIDGED_TOKEN_GATEWAY**: The address of the gateway contract on the base layer
- **BRIDGED_TOKEN**: The address of the token contract on the base layer
- **BRIDGED_TOKEN_DECIMALS**: The decimal value of the base layer token contract
- **NAME**: The token name (padded to 32 characters)
- **SYMBOL**: The token symbol (padded to 32 characters)

## Deploy

Run the deploy command to compile and deploy the Fuel side token contract with the set configuration.

```sh
forc-deploy --release --path bridge-fungible-token --url <URL> --gas-price <GAS_PRICE> <SIGNING_KEY>
```
