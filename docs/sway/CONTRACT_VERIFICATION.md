# Summary

This document contains information for auditors and coders to verify the bridge bytecode that is currently deployed on Fuel Ignition.

The bytecode is generated multiple versions of sway dating the months of August-September 2025. The source code reference commit is [5ddd191](https://github.com/FuelLabs/fuel-bridge/tree/5ddd191fb4a97ba687dd377abdd6f869d2f7baad), with the data indicated in the tables below.

It is important to maintain the github repositories used as dependencies for `forc`. `forc` does not still feature a package manager, external dependencies such as libraries are linked through git repositories. For future reference, `Forc.lock` snapshot have been provided in this documentation too.

## Proxy Contract  

| Field                 | Value |
|-----------------------|------------------------------------------------------------------|
| **Source Code File**  | [proxy.sw](../../packages/fungible-token/bridge-fungible-token/proxy/src/proxy.sw) |
| **Address**          | `0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8` |
| **Deployment TX ID** | `0xf5b14e738945466ae236e3d83d5638a12671ff165b50315ec9dd7f22643bbb52` |
| **Binary**        | [proxy.bin](./binaries/proxy/proxy.bin) |
| **INITIAL_OWNER**   | `0xfc96a3a99ae1873e9e571a8be7d14111a2b4b7bd3abacb367c6e0f79c9c149d9` |
| **INITIAL_TARGET**  | `0xa8ccd6fee8a8a7160a76aefdf37f235c9f9aaf38f1fd5f3299c48e4ee57802d2` |
| **Salt**            | `0` (`0x00..00`) |
| **Forc / Sway Version** | `0.63.3` |
| **Forc.lock** | [Forc.lock](./binaries/proxy/Forc.lock) |

---

## Implementation 1 (Deprecated)  

| Field                 | Value |
|-----------------------|------------------------------------------------------------------|
| **Source Code File**  | [main.sw](../../packages/fungible-token/bridge-fungible-token/implementation/src/main.sw) |
| **Address**          | `0xa8ccd6fee8a8a7160a76aefdf37f235c9f9aaf38f1fd5f3299c48e4ee57802d2` |
| **Deployment TX ID** | `0x5d3a0a04385ad54744542d939825a8d428d96a2ef41b4f957f91624f6c446a6a` |
| **Binary**        | [implementation.bin](./binaries/implementation_1/implementation.bin) |
| **BRIDGED_TOKEN_GATEWAY** | `0x000000000000000000000000a4cA04d02bfdC3A2DF56B9b6994520E69dF43F67` |
| **Salt**            | `0` (`0x00..00`) |
| **Forc / Sway Version** | `0.63.3` |
| **Forc.lock** | [Forc.lock](./binaries/implementation_1/Forc.lock) |

---

## Implementation 2 (Live)  

| Field                 | Value |
|-----------------------|------------------------------------------------------------------|
| **Source Code File**  | [main.sw](../../packages/fungible-token/bridge-fungible-token/implementation/src/main.sw) |
| **Address**          | `0x0ceafc5ef55c66912e855917782a3804dc489fb9e27edfd3621ea47d2a281156` |
| **Deployment TX ID** | `0x5c8171a4901d9a5132bbca6154883f65ae7a927b2b8da7b20a65e6cbb8314a8a` |
| **Binary**        | [implementation.bin](./binaries/implementation_2/implementation.bin) |
| **BRIDGED_TOKEN_GATEWAY** | `0x000000000000000000000000a4cA04d02bfdC3A2DF56B9b6994520E69dF43F67` |
| **Salt**            | `0` (`0x00..00`) |
| **Forc / Sway Version** | `0.63.4` |
| **Forc.lock** | [Forc.lock](./binaries/implementation_2/Forc.lock) |



## Example Rust code to reproduce

Run `forc build --release` at the root to generate the needed binaries, abis and storage descriptor files.

```rust
async fn get_contract_ids() -> anyhow::Result<()> {
    // Proxy: 0x4ea6ccef1215d9479f1024dff70fc055ca538215d2c8c348beddffd54583d0e8
    // Old implementation: 0xa8ccd6fee8a8a7160a76aefdf37f235c9f9aaf38f1fd5f3299c48e4ee57802d2
    // New implementation: 0x0ceafc5ef55c66912e855917782a3804dc489fb9e27edfd3621ea47d2a281156

    let gateway = "0x000000000000000000000000a4cA04d02bfdC3A2DF56B9b6994520E69dF43F67";
    let configurables: BridgeFungibleTokenContractConfigurables =
        BridgeFungibleTokenContractConfigurables::default()
            .with_BRIDGED_TOKEN_GATEWAY(Bits256::from_hex_str(gateway)?)?;
    let configuration = LoadConfiguration::default().with_configurables(configurables);

    let impl_id = Contract::load_from(BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY, configuration)?
        .contract_id();
    dbg!(&impl_id);

    let initial_owner = Bits256::from_hex_str(
        "0xfc96a3a99ae1873e9e571a8be7d14111a2b4b7bd3abacb367c6e0f79c9c149d9",
    )?;

    let old_impl = Bits256::from_hex_str(
        "0xa8ccd6fee8a8a7160a76aefdf37f235c9f9aaf38f1fd5f3299c48e4ee57802d2",
    )?;
    let configurables: BridgeProxyConfigurables = BridgeProxyConfigurables::default()
        .with_INITIAL_OWNER(State::Initialized(Identity::Address(Address::new(
            initial_owner.0,
        ))))?
        .with_INITIAL_TARGET(ContractId::new(old_impl.0))?;

    let configuration = LoadConfiguration::default().with_configurables(configurables);

    let proxy_id = Contract::load_from(BRIDGE_PROXY_BINARY, configuration)?.contract_id();
    dbg!(&proxy_id);

    Ok(())
}
```