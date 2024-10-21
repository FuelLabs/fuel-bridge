# DEPLOYMENT

## Proxy

The base asset contract is deployed at `0x7e2becd64cd598da59b4d1064b711661898656c6b1f4918a787156b8965dc83c` (`base_asset_contract_id`). It is a proxy following the [SRC-14](https://github.com/FuelLabs/sway-standards/blob/master/docs/src/src-14-simple-upgradeable-proxies.md) standard, with the following ABI:

```sway
abi SRC14 {
    #[storage(read, write)]
    fn set_proxy_target(new_target: ContractId);
    #[storage(read)]
    fn proxy_target() -> Option<ContractId>;
}

abi SRC14Extension {
    #[storage(read)]
    fn proxy_owner() -> State;
}
```

## Target

The target contract implementation is deployed at `0xf746b8dfe2a6545119b421753ab465a9c21094709f0df7926c6d33cb90797d45` as the result of deploying the sway source code contained in this package with `forc v0.63.4` with salt `0`.

## Base asset ID

The base asset ID is `0xf8f8b6283d7fa5b672b530cbb84fcccb4ff8dc40f8176ef4544ddb1f1952ad07`, which is the result of `sha256(base_asset_contract_id ++ sub_id)`, where `sub_id` is `Bits256::zero()` (`0x0000000000000000000000000000000000000000000000000000000000000000`).

You can observe these values in the [chain configuration repository](https://github.com/FuelLabs/chain-configuration/tree/master/ignition)
