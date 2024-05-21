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

The `ContractId` of the base asset SRC-20 implementation is `0xa20eb159e6460c47f438cb9e9f653a8d5084146ca115c774181c0620608d15a3`. This is calculated using the zero salt (`0x00..00`).

## Asset Id

The `AssetId` fo the base asset SRC-20 implementation is `0xa48cdc6b0bc20843b9a755a6fffc6ff9a0965b1aff0d58cc9247dc72b8bbd61f`. This calculated by taking the SHA256 hash digest of the ContractId and the zero SubId (`0x00..00`) i.e. sha256((contract_id, sub_id)).

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
