<p align="center">
    <a href="https://crates.io/crates/forc/0.55.0" alt="forc">
        <img src="https://img.shields.io/badge/forc-v0.55.0-orange" />
    </a>
    <a href="https://crates.io/crates/fuel-core/0.24.2" alt="fuel-core">
        <img src="https://img.shields.io/badge/fuel--core-v0.24.2-blue" />
    </a>
</p>

# Fuel Base Asset

The contract deployed on the Fuel Network which implements the SRC-20 standard for the base asset, Ether.

## Quickstart

### Building Sway

In the root of the repository run the following command to build all the Sway programs.

```bash
forc build --release
```

### Running Rust Tests

After the Sway programs have been built run the following command in the root of the repository.

```bash
cargo test
```

## License

The primary license for this repo is `Apache 2.0`, see [`LICENSE`](../../LICENSE).
