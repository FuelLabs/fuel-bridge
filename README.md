# Fuel Bridge Fungible Token

The contract responsible for sending/receiving messages from the base layer ERC20 gateway to mint/burn representative tokens on the Fuel chain. Detailed documentation of the bridging process can be found [here](./docs/design_docs.md).

### Bridge Message Predicates

This project uses the general contract message relaying script/predicate from the [bridge-message-predicates](https://github.com/FuelLabs/bridge-message-predicates) repo.

## Building From Source

### Dependencies

| dep     | version                                                  |
| ------- | -------------------------------------------------------- |
| Forc    | [>=v0.24.0](https://fuellabs.github.io/sway/v0.24.0/introduction/installation.html) |

### Building

Build:

```sh
forc build -p bridge-message-predicates/contract-message-receiver
forc build -p bridge-fungible-token-abi
forc build -p bridge-fungible-token
```

Run tests:

```sh
cd bridge-fungible-token && forc test && cd ..
```

## Contributing

Code must be formatted.

```sh
forc-fmt -p bridge-fungible-token
forc-fmt -p bridge-fungible-token-abi
cd bridge-fungible-token && cargo fmt && cd ..
```

## License

The primary license for this repo is `Apache 2.0`, see [`LICENSE`](./LICENSE).
