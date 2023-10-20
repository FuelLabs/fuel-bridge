<p align="center">
    <a href="https://crates.io/crates/forc/0.46.0" alt="forc">
        <img src="https://img.shields.io/badge/forc-v0.46.0-orange" />
    </a>
    <a href="https://crates.io/crates/fuel-core/0.20.7" alt="fuel-core">
        <img src="https://img.shields.io/badge/fuel--core-v0.20.7-blue" />
    </a>
</p>

# Fuel Bridge Fungible Token

The contract responsible for sending/receiving messages from the base layer gateway to mint/burn representative proxy tokens on the Fuel chain.

## Table of contents

- [Documentation/Diagrams](./docs/design_docs.md)
- [Deploying Token Contracts](./docs/deploy_docs.md)
- [License](#license)

### Bridge Message Predicates

This project uses the general contract message relaying script/predicate from the [bridge-message-predicates](https://github.com/FuelLabs/bridge-message-predicates) repo.

## Quickstart

### Building Sway

Each Sway project uses a `fuel-toolchain.toml` file with pinned versions so `forc` will install the correct versions for you if you do not have them installed.

In the root of the repository run the following command to build all the Sway programs.

```bash
forc build
```

### Running Rust Tests

After the Sway programs have been built run the following command in the root of the repository.

```bash
cargo test
```

## License

The primary license for this repo is `Apache 2.0`, see [`LICENSE`](../../LICENSE).
