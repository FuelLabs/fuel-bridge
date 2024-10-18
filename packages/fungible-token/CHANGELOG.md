# @fuel-bridge/fungible-token

## 1.0.0

### Minor Changes

- Upgraded forc to 0.64.0, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- Updated sway contracts compiler to forc v0.63.4, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))

## 0.6.0

### Minor Changes

- Upgrade all dependencies to fuel-core 0.27, by [@SwayStar123](https://github.com/SwayStar123) (See [#201](https://github.com/FuelLabs/fuel-bridge/pull/201))
- Bump ts-sdk to 0.94.4, by [@DefiCake](https://github.com/DefiCake) (See [#277](https://github.com/FuelLabs/fuel-bridge/pull/277))
- remove unused mapping, by [@viraj124](https://github.com/viraj124) (See [#258](https://github.com/FuelLabs/fuel-bridge/pull/258))
- Architecture revamp featuring single asset issuer on L2, by [@DefiCake](https://github.com/DefiCake) (See [#150](https://github.com/FuelLabs/fuel-bridge/pull/150))
- Bump all packages to adhere to fuel-core 0.26, forc 0.56, fuel-rs 0.60, fuel-ts 0.85, by [@DefiCake](https://github.com/DefiCake) (See [#180](https://github.com/FuelLabs/fuel-bridge/pull/180))
- Update forc to 0.63.3, by [@DefiCake](https://github.com/DefiCake) (See [#265](https://github.com/FuelLabs/fuel-bridge/pull/265))
- Upgraded fuel dependencies to fuel-core 0.33, by [@DefiCake](https://github.com/DefiCake) (See [#237](https://github.com/FuelLabs/fuel-bridge/pull/237))
- Implement SRC-7 and SRC-20, by [@DefiCake](https://github.com/DefiCake) (See [#240](https://github.com/FuelLabs/fuel-bridge/pull/240))
- Added upgradability to bridge contracts, by [@DefiCake](https://github.com/DefiCake) (See [#164](https://github.com/FuelLabs/fuel-bridge/pull/164))
- Add typegen for fuel ts sdk and a deploy script for the bridge. Bump fuel-core to v0.31.0, by [@DefiCake](https://github.com/DefiCake) (See [#222](https://github.com/FuelLabs/fuel-bridge/pull/222))
- Upgraded ts-sdk to 0.94.3, by [@DefiCake](https://github.com/DefiCake) (See [#271](https://github.com/FuelLabs/fuel-bridge/pull/271))
- Use custom error for relay unknown error reverts, by [@DefiCake](https://github.com/DefiCake) (See [#178](https://github.com/FuelLabs/fuel-bridge/pull/178))
- Update fuel-core to v0.26.0 and all sdk dependencies needed to track it, by [@DefiCake](https://github.com/DefiCake) (See [#161](https://github.com/FuelLabs/fuel-bridge/pull/161))

### Patch Changes

- Update documentation, by [@DefiCake](https://github.com/DefiCake) (See [#197](https://github.com/FuelLabs/fuel-bridge/pull/197))
- Use L1 token decimals to determine L2 token decimals, by [@DefiCake](https://github.com/DefiCake) (See [#166](https://github.com/FuelLabs/fuel-bridge/pull/166))
- Add reentrancy unit test for l2 proxy-bridge, by [@DefiCake](https://github.com/DefiCake) (See [#221](https://github.com/FuelLabs/fuel-bridge/pull/221))
- Add comments to Hexens audit. Fix some other in-code commentary, by [@DefiCake](https://github.com/DefiCake) (See [#177](https://github.com/FuelLabs/fuel-bridge/pull/177))
- Remove unused code in L2 bridge, by [@DefiCake](https://github.com/DefiCake) (See [#259](https://github.com/FuelLabs/fuel-bridge/pull/259))
- Removed unused and vulnerable npm dependencies, by [@DefiCake](https://github.com/DefiCake) (See [#212](https://github.com/FuelLabs/fuel-bridge/pull/212))
- Bump forc and ts version, by [@DefiCake](https://github.com/DefiCake) (See [#162](https://github.com/FuelLabs/fuel-bridge/pull/162))

## 0.5.0

### Minor Changes

- Add pnpm audit to CI and migrate dependencies to safe versions, by [@DefiCake](https://github.com/DefiCake) (See [#126](https://github.com/FuelLabs/fuel-bridge/pull/126))
- Update to forc 0.49.1, by [@DefiCake](https://github.com/DefiCake) (See [#119](https://github.com/FuelLabs/fuel-bridge/pull/119))
- Workaround current fuel-rs small configurables (u8) limitation. Add tests for decimal conversion, by [@DefiCake](https://github.com/DefiCake) (See [#123](https://github.com/FuelLabs/fuel-bridge/pull/123))
- Bump forc to 0.51, by [@DefiCake](https://github.com/DefiCake) (See [#141](https://github.com/FuelLabs/fuel-bridge/pull/141))
- Remove b256-u256 conversions, use new sway utils that implement these features, by [@DefiCake](https://github.com/DefiCake) (See [#143](https://github.com/FuelLabs/fuel-bridge/pull/143))

### Patch Changes

- Bump forc to 0.50.0, by [@DefiCake](https://github.com/DefiCake) (See [#124](https://github.com/FuelLabs/fuel-bridge/pull/124))
- Add CORS to deployment server + update typescript SDK, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#134](https://github.com/FuelLabs/fuel-bridge/pull/134))
- Bump fuels to 0.55.0, by [@DefiCake](https://github.com/DefiCake) (See [#122](https://github.com/FuelLabs/fuel-bridge/pull/122))

## 0.4.0

### Minor Changes

- Update to fuel-core 0.22.0 (beta-5), by [@LuizAsFight](https://github.com/LuizAsFight) (See [#106](https://github.com/FuelLabs/fuel-bridge/pull/106))
- Replace FRC20 with SRC20, by [@DefiCake](https://github.com/DefiCake) (See [#102](https://github.com/FuelLabs/fuel-bridge/pull/102))
- Use sway 0.48.1 and migrate from U256 to u256, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#106](https://github.com/FuelLabs/fuel-bridge/pull/106))
- Bumped fuels to 0.50.1, by [@DefiCake](https://github.com/DefiCake) (See [#95](https://github.com/FuelLabs/fuel-bridge/pull/95))

## 0.3.0

### Minor Changes

- Add SRC-7, by [@DefiCake](https://github.com/DefiCake) (See [#88](https://github.com/FuelLabs/fuel-bridge/pull/88))
- Introduces a handshake protocol to avoid loss of funds while bridging assets from L1 to L2, by [@DefiCake](https://github.com/DefiCake) (See [#82](https://github.com/FuelLabs/fuel-bridge/pull/82))
- Bump forc version to 0.46.1, by [@DefiCake](https://github.com/DefiCake) (See [#93](https://github.com/FuelLabs/fuel-bridge/pull/93))
- Update to most recenta beta-4. fuel-core 0.20.7 + fuels 0.63.0, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#96](https://github.com/FuelLabs/fuel-bridge/pull/96))

## 0.2.2

## 0.2.1

## 0.2.0

### Minor Changes

- Add NFT support, by [@DefiCake](https://github.com/DefiCake) (See [#40](https://github.com/FuelLabs/fuel-bridge/pull/40))
- Adds asset sub_id awareness to ERC20 bridge and implementation for ERC721 bridge, by [@DefiCake](https://github.com/DefiCake) (See [#40](https://github.com/FuelLabs/fuel-bridge/pull/40))

## 0.1.1

## 0.1.0

### Patch Changes

- ✨ feat: release fuel-bridge packages first version, by [@luizstacio](https://github.com/luizstacio) (See [#69](https://github.com/FuelLabs/fuel-bridge/pull/69))

## 0.1.0

### Patch Changes

- ✨ feat: release fuel-bridge packages first version, by [@luizstacio](https://github.com/luizstacio) (See [#69](https://github.com/FuelLabs/fuel-bridge/pull/69))
