# Fuel Bridge Fungible Token

The contract responsible for sending/receiving messages from the base layer ERC20 gateway to mint/burn representative tokens on the Fuel chain.

## Table of contents

- [Documentation/Diagrams](./docs/design_docs.md)
- [Deploying Token Contracts](./docs/deploy_docs.md)
- [Build From Source](#building_from_source)
- [Contributing](#contributing)
- [License](#license)

### Bridge Message Predicates

This project uses the general contract message relaying script/predicate from the [bridge-message-predicates](https://github.com/FuelLabs/bridge-message-predicates) repo.

## Building From Source

### Dependencies

| dep     | version                                                  |
| ------- | -------------------------------------------------------- |
| Forc    | [v0.35.0](https://fuellabs.github.io/sway/v0.35.0/introduction/installation.html) |

### Building

Build:

```sh
forc build
```

Run tests:

```sh
cargo test
```

## Contributing

Code must be formatted.

```sh
forc fmt
cargo fmt
```

## License

The primary license for this repo is `Apache 2.0`, see [`LICENSE`](./LICENSE).
