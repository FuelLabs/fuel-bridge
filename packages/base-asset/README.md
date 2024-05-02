<p align="center">
    <a href="https://crates.io/crates/forc/0.56.0" alt="forc">
        <img src="https://img.shields.io/badge/forc-v0.56.0-orange" />
    </a>
    <a href="https://crates.io/crates/fuel-core/0.24.2" alt="fuel-core">
        <img src="https://img.shields.io/badge/fuel--core-v0.24.2-blue" />
    </a>
</p>

# Fuel Base Asset

The contract deployed on the Fuel Network which implements the SRC-20 standard for the base asset, Ether.

## Contract ID

The `ContractId` of the base asset SRC-20 implementation is `0x7e2becd64cd598da59b4d1064b711661898656c6b1f4918a787156b8965dc83c`. This is calculated using the zero salt (`0x00..00`).

## Asset Id

The `AssetId` fo the base asset SRC-20 implementation is `0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07`. This calculated by taking the SHA256 hash digest of the ContractId and the zero SubId (`0x00..00`) i.e. sha256((contract_id, sub_id)).

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
