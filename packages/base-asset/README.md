<p align="center">
    <a href="https://crates.io/crates/forc/0.56.1" alt="forc">
        <img src="https://img.shields.io/badge/forc-v0.56.1-orange" />
    </a>
    <a href="https://crates.io/crates/fuel-core/0.26.0" alt="fuel-core">
        <img src="https://img.shields.io/badge/fuel--core-v0.26.0-blue" />
    </a>
</p>

# Fuel Base Asset

The contract deployed on the Fuel Network which implements the SRC-20 standard for the base asset, Ether.

## Contract ID

The `ContractId` of the base asset SRC-20 implementation is `0xf746b8dfe2a6545119b421753ab465a9c21094709f0df7926c6d33cb90797d45`. This is calculated using the zero salt (`0x00..00`).

## Asset Id

The `AssetId` fo the base asset SRC-20 implementation is `0x2361e96b094f3bb902d53d86f3172333587054de09c7ab6c639bd3c52e252aa7`. This calculated by taking the SHA256 hash digest of the ContractId and the zero SubId (`0x00..00`) i.e. sha256((contract_id, sub_id)).

## Compiled Output

The compiled output binaries of the base asset SRC-20 implementation is provided in the `/bin` folder and include both binaries and the hex representation of the binaries.

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
