# @fuel-bridge/solidity-contracts

## 0.3.0

### Minor Changes

- Introduces a handshake protocol to avoid loss of funds while bridging assets from L1 to L2, by [@DefiCake](https://github.com/DefiCake) (See [#82](https://github.com/FuelLabs/fuel-bridge/pull/82))

### Patch Changes

- Change erc721 tests to use their own fixture and remove some unrelated erc20 tests in them, by [@DefiCake](https://github.com/DefiCake) (See [#87](https://github.com/FuelLabs/fuel-bridge/pull/87))
- Refactor of erc20 tests, upgrade of hardhat, by [@DefiCake](https://github.com/DefiCake) (See [#80](https://github.com/FuelLabs/fuel-bridge/pull/80))
- Added beta4 new deployments, by [@DefiCake](https://github.com/DefiCake) (See [#84](https://github.com/FuelLabs/fuel-bridge/pull/84))

## 0.2.2

### Patch Changes

- Added some minor gas optimizations, by [@DefiCake](https://github.com/DefiCake) (See [#78](https://github.com/FuelLabs/fuel-bridge/pull/78))

## 0.2.1

### Patch Changes

- Changes require statements to if-revert-custom-error for better interfacing and reduced gas costs, by [@DefiCake](https://github.com/DefiCake) (See [#60](https://github.com/FuelLabs/fuel-bridge/pull/60))

## 0.2.0

### Minor Changes

- Add NFT support, by [@DefiCake](https://github.com/DefiCake) (See [#40](https://github.com/FuelLabs/fuel-bridge/pull/40))
- Adds asset sub_id awareness to ERC20 bridge and implementation for ERC721 bridge, by [@DefiCake](https://github.com/DefiCake) (See [#40](https://github.com/FuelLabs/fuel-bridge/pull/40))

## 0.1.1

## 0.1.0

### Minor Changes

- Add a rescueETH function for ERC20Gateway to address TOB-6, by [@DefiCake](https://github.com/DefiCake) (See [#73](https://github.com/FuelLabs/fuel-bridge/pull/73))

### Patch Changes

- ✨ feat: release fuel-bridge packages first version, by [@luizstacio](https://github.com/luizstacio) (See [#69](https://github.com/FuelLabs/fuel-bridge/pull/69))
- ✨ feat: release test-utils and solidity-contracts packs, by [@luizstacio](https://github.com/luizstacio) (See [#72](https://github.com/FuelLabs/fuel-bridge/pull/72))

## 0.1.0

### Minor Changes

- Add a rescueETH function for ERC20Gateway to address TOB-6, by [@DefiCake](https://github.com/DefiCake) (See [#73](https://github.com/FuelLabs/fuel-bridge/pull/73))

### Patch Changes

- ✨ feat: release fuel-bridge packages first version, by [@luizstacio](https://github.com/luizstacio) (See [#69](https://github.com/FuelLabs/fuel-bridge/pull/69))
- ✨ feat: release test-utils and solidity-contracts packs, by [@luizstacio](https://github.com/luizstacio) (See [#72](https://github.com/FuelLabs/fuel-bridge/pull/72))
