# Fuel Portal Solidity Contracts

## Install

```
npm install @fuel-bridge/solidity-contracts
```

## Exposed artifacts

### Importing ABIs

```ts
import {
  FuelChainState,
  FuelMessagePortal,
} from '@fuel-bridge/solidity-contracts/abi';

console.log('FuelChainState', FuelChainState);
console.log('FuelMessagePortal', FuelMessagePortal);
```

### Importing typechain

For importing typechain you project should be configured with typescript support:

```ts
import {
  FuelChainState__factory,
  FuelMessagePortal__factory,
} from '@fuel-bridge/solidity-contracts/typechain';

FuelChainState__factory.connect(/*...*/);
FuelMessagePortal__factory.connect(/*...*/);
```

### Contracts

For importing the Solidity contracts use `@fuel-bridge/solidity-contracts/contracts/...`

## License

The primary license for this repo is `Apache 2.0`, see [`LICENSE`](../../LICENSE).

### Exceptions

- [`ExcessivelySafeCall.sol`](./contracts/vendor/ExcessivelySafeCall.sol) is licensed under `MIT OR Apache-2.0` (as indicated in the SPDX headers) by [Nomad](https://github.com/nomad-xyz/ExcessivelySafeCall).
