# @fuel-bridge/test-utils

## 1.0.0

### Minor Changes

- Improve sway scripts, by [@DefiCake](https://github.com/DefiCake) (See [#280](https://github.com/FuelLabs/fuel-bridge/pull/280))
- integrate fork tokens in e2e test, by [@viraj124](https://github.com/viraj124) (See [#267](https://github.com/FuelLabs/fuel-bridge/pull/267))

## 0.6.0

### Minor Changes

- Improve message relay utils, by [@DefiCake](https://github.com/DefiCake) (See [#275](https://github.com/FuelLabs/fuel-bridge/pull/275))
- Adapted deployments for a full e2e environment, and minor util adaptions to anvil quirks, by [@DefiCake](https://github.com/DefiCake) (See [#229](https://github.com/FuelLabs/fuel-bridge/pull/229))
- Upgrade all dependencies to fuel-core 0.27, by [@SwayStar123](https://github.com/SwayStar123) (See [#201](https://github.com/FuelLabs/fuel-bridge/pull/201))
- Bump ts-sdk to 0.94.4, by [@DefiCake](https://github.com/DefiCake) (See [#277](https://github.com/FuelLabs/fuel-bridge/pull/277))
- 🐞 Fix depositToken naming, by [@DefiCake](https://github.com/DefiCake) (See [#273](https://github.com/FuelLabs/fuel-bridge/pull/273))
- Architecture revamp featuring single asset issuer on L2, by [@DefiCake](https://github.com/DefiCake) (See [#150](https://github.com/FuelLabs/fuel-bridge/pull/150))
- Bump all packages to adhere to fuel-core 0.26, forc 0.56, fuel-rs 0.60, fuel-ts 0.85, by [@DefiCake](https://github.com/DefiCake) (See [#180](https://github.com/FuelLabs/fuel-bridge/pull/180))
- Add relay deposit script, by [@DefiCake](https://github.com/DefiCake) (See [#266](https://github.com/FuelLabs/fuel-bridge/pull/266))
- add disable initializer in erc20 v4 gateway, by [@viraj124](https://github.com/viraj124) (See [#261](https://github.com/FuelLabs/fuel-bridge/pull/261))
- Upgraded fuel dependencies to fuel-core 0.33, by [@DefiCake](https://github.com/DefiCake) (See [#237](https://github.com/FuelLabs/fuel-bridge/pull/237))
- Implement SRC-7 and SRC-20, by [@DefiCake](https://github.com/DefiCake) (See [#240](https://github.com/FuelLabs/fuel-bridge/pull/240))
- Added upgradability to bridge contracts, by [@DefiCake](https://github.com/DefiCake) (See [#164](https://github.com/FuelLabs/fuel-bridge/pull/164))
- Add typegen for fuel ts sdk and a deploy script for the bridge. Bump fuel-core to v0.31.0, by [@DefiCake](https://github.com/DefiCake) (See [#222](https://github.com/FuelLabs/fuel-bridge/pull/222))
- Upgraded ts-sdk to 0.94.3, by [@DefiCake](https://github.com/DefiCake) (See [#271](https://github.com/FuelLabs/fuel-bridge/pull/271))
- Update fuel-core to v0.26.0 and all sdk dependencies needed to track it, by [@DefiCake](https://github.com/DefiCake) (See [#161](https://github.com/FuelLabs/fuel-bridge/pull/161))

### Patch Changes

- Increase test coverage, by [@DefiCake](https://github.com/DefiCake) (See [#226](https://github.com/FuelLabs/fuel-bridge/pull/226))
- Update documentation, by [@DefiCake](https://github.com/DefiCake) (See [#197](https://github.com/FuelLabs/fuel-bridge/pull/197))
- Use ZeroBytes32 for witnesses at relayCommonMessage.ts, by [@DefiCake](https://github.com/DefiCake) (See [#193](https://github.com/FuelLabs/fuel-bridge/pull/193))
- 🐞 Fix CI on pnpm audit, by [@DefiCake](https://github.com/DefiCake) (See [#217](https://github.com/FuelLabs/fuel-bridge/pull/217))
- Removed unused and vulnerable npm dependencies, by [@DefiCake](https://github.com/DefiCake) (See [#212](https://github.com/FuelLabs/fuel-bridge/pull/212))
- Bump forc and ts version, by [@DefiCake](https://github.com/DefiCake) (See [#162](https://github.com/FuelLabs/fuel-bridge/pull/162))

## 0.5.0

### Minor Changes

- Add pnpm audit to CI and migrate dependencies to safe versions, by [@DefiCake](https://github.com/DefiCake) (See [#126](https://github.com/FuelLabs/fuel-bridge/pull/126))

### Patch Changes

- Add CORS to deployment server + update typescript SDK, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#134](https://github.com/FuelLabs/fuel-bridge/pull/134))

## 0.4.0

### Minor Changes

- Update to fuel-core 0.22.0 (beta-5), by [@LuizAsFight](https://github.com/LuizAsFight) (See [#106](https://github.com/FuelLabs/fuel-bridge/pull/106))

### Patch Changes

- ✨ feat: update fuels-ts to 0.71.1, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#118](https://github.com/FuelLabs/fuel-bridge/pull/118))

## 0.3.0

### Minor Changes

- Introduces a handshake protocol to avoid loss of funds while bridging assets from L1 to L2, by [@DefiCake](https://github.com/DefiCake) (See [#82](https://github.com/FuelLabs/fuel-bridge/pull/82))
- Update to most recenta beta-4. fuel-core 0.20.7 + fuels 0.63.0, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#96](https://github.com/FuelLabs/fuel-bridge/pull/96))

### Patch Changes

- Add a few helpers to aid in hardhat and integration tests, by [@DefiCake](https://github.com/DefiCake) (See [#85](https://github.com/FuelLabs/fuel-bridge/pull/85))
- Refactor of erc20 tests, upgrade of hardhat, by [@DefiCake](https://github.com/DefiCake) (See [#80](https://github.com/FuelLabs/fuel-bridge/pull/80))

## 0.2.2

## 0.2.1

## 0.2.0

### Minor Changes

- Add NFT support, by [@DefiCake](https://github.com/DefiCake) (See [#40](https://github.com/FuelLabs/fuel-bridge/pull/40))
- Adds asset sub_id awareness to ERC20 bridge and implementation for ERC721 bridge, by [@DefiCake](https://github.com/DefiCake) (See [#40](https://github.com/FuelLabs/fuel-bridge/pull/40))

## 0.1.1

### Patch Changes

- ✨ feat: update fuels-ts, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#74](https://github.com/FuelLabs/fuel-bridge/pull/74))

## 0.1.0

### Patch Changes

- ✨ feat: release fuel-bridge packages first version, by [@luizstacio](https://github.com/luizstacio) (See [#69](https://github.com/FuelLabs/fuel-bridge/pull/69))
- ✨ feat: release test-utils and solidity-contracts packs, by [@luizstacio](https://github.com/luizstacio) (See [#72](https://github.com/FuelLabs/fuel-bridge/pull/72))

## 0.1.0

### Patch Changes

- ✨ feat: release fuel-bridge packages first version, by [@luizstacio](https://github.com/luizstacio) (See [#69](https://github.com/FuelLabs/fuel-bridge/pull/69))
- ✨ feat: release test-utils and solidity-contracts packs, by [@luizstacio](https://github.com/luizstacio) (See [#72](https://github.com/FuelLabs/fuel-bridge/pull/72))
