# @fuel-bridge/solidity-contracts

## 1.0.0

### Major Changes

- Deploy mainnet contracts, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))

### Minor Changes

- Upgrade testnet and devnet artifacts, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- Add rate limit status check for FuelMessagePortal, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- don't update current withdrawn amount when rate limit is reset, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- update comment, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- add zero address check for time to finalise, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- ci proxy upgrade verification flow, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- add rate limit disabling/re-enabling, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- 🐞 Fix upgradability: reduce FuelERC20GatewayV4 \_\_gap variable, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- update naming convention for immutable var, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))

### Patch Changes

- Added base asset deploy script and documentation, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- Updated testnet deployment artifacts, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))
- Swap symbol and name in the metadata payload, by [@DefiCake](https://github.com/DefiCake) (See [#340](https://github.com/FuelLabs/fuel-bridge/pull/340))

## 0.6.0

### Minor Changes

- add eth rate limiter, by [@viraj124](https://github.com/viraj124) (See [#228](https://github.com/FuelLabs/fuel-bridge/pull/228))
- Adds FuelMessagePortalV3 with increased granularity on withdrawals control, by [@DefiCake](https://github.com/DefiCake) (See [#148](https://github.com/FuelLabs/fuel-bridge/pull/148))
- Adapted deployments for a full e2e environment, and minor util adaptions to anvil quirks, by [@DefiCake](https://github.com/DefiCake) (See [#229](https://github.com/FuelLabs/fuel-bridge/pull/229))
- 🐞 fix pnpm audit findings, by [@PraneshASP](https://github.com/PraneshASP) (See [#247](https://github.com/FuelLabs/fuel-bridge/pull/247))
- reset rate limit script, by [@viraj124](https://github.com/viraj124) (See [#254](https://github.com/FuelLabs/fuel-bridge/pull/254))
- Added FuelChainState setter to FuelMessagePortalV3, by [@DefiCake](https://github.com/DefiCake) (See [#234](https://github.com/FuelLabs/fuel-bridge/pull/234))
- Deploy devnet and testnet contracts, by [@DefiCake](https://github.com/DefiCake) (See [#175](https://github.com/FuelLabs/fuel-bridge/pull/175))
- 🐞 Fix depositToken naming, by [@DefiCake](https://github.com/DefiCake) (See [#273](https://github.com/FuelLabs/fuel-bridge/pull/273))
- 🐞 Fix ECDSA test flakiness, by [@DefiCake](https://github.com/DefiCake) (See [#144](https://github.com/FuelLabs/fuel-bridge/pull/144))
- Add recommit protection in FuelChainState, by [@DefiCake](https://github.com/DefiCake) (See [#174](https://github.com/FuelLabs/fuel-bridge/pull/174))
- remove unused mapping, by [@viraj124](https://github.com/viraj124) (See [#258](https://github.com/FuelLabs/fuel-bridge/pull/258))
- Architecture revamp featuring single asset issuer on L2, by [@DefiCake](https://github.com/DefiCake) (See [#150](https://github.com/FuelLabs/fuel-bridge/pull/150))
- Ported @fuel-contracts/merkle-sol utils, by [@DefiCake](https://github.com/DefiCake) (See [#196](https://github.com/FuelLabs/fuel-bridge/pull/196))
- FuelChainState is now configurable in deployment scripts, by [@DefiCake](https://github.com/DefiCake) (See [#204](https://github.com/FuelLabs/fuel-bridge/pull/204))
- erc20 rate limit, by [@viraj124](https://github.com/viraj124) (See [#239](https://github.com/FuelLabs/fuel-bridge/pull/239))
- Bump all packages to adhere to fuel-core 0.26, forc 0.56, fuel-rs 0.60, fuel-ts 0.85, by [@DefiCake](https://github.com/DefiCake) (See [#180](https://github.com/FuelLabs/fuel-bridge/pull/180))
- add `_disableInitializers()` to FuelMessagePortal V2 and V3, by [@PraneshASP](https://github.com/PraneshASP) (See [#248](https://github.com/FuelLabs/fuel-bridge/pull/248))
- Add relay deposit script, by [@DefiCake](https://github.com/DefiCake) (See [#266](https://github.com/FuelLabs/fuel-bridge/pull/266))
- add disable initializer in erc20 v4 gateway, by [@viraj124](https://github.com/viraj124) (See [#261](https://github.com/FuelLabs/fuel-bridge/pull/261))
- Added upgradability to bridge contracts, by [@DefiCake](https://github.com/DefiCake) (See [#164](https://github.com/FuelLabs/fuel-bridge/pull/164))
- Extract CommonPredicates lib into its own file, by [@DefiCake](https://github.com/DefiCake) (See [#142](https://github.com/FuelLabs/fuel-bridge/pull/142))
- Use custom error for relay unknown error reverts, by [@DefiCake](https://github.com/DefiCake) (See [#178](https://github.com/FuelLabs/fuel-bridge/pull/178))
- Update fuel-core to v0.26.0 and all sdk dependencies needed to track it, by [@DefiCake](https://github.com/DefiCake) (See [#161](https://github.com/FuelLabs/fuel-bridge/pull/161))
- Added hardhat scripts, by [@DefiCake](https://github.com/DefiCake) (See [#190](https://github.com/FuelLabs/fuel-bridge/pull/190))
- add zero address check for asset issuer id, by [@viraj124](https://github.com/viraj124) (See [#250](https://github.com/FuelLabs/fuel-bridge/pull/250))

### Patch Changes

- Deployment of new devnet, by [@DefiCake](https://github.com/DefiCake) (See [#157](https://github.com/FuelLabs/fuel-bridge/pull/157))
- Add deprecation notices and use better folder grouping, by [@DefiCake](https://github.com/DefiCake) (See [#171](https://github.com/FuelLabs/fuel-bridge/pull/171))
- Update documentation, by [@DefiCake](https://github.com/DefiCake) (See [#197](https://github.com/FuelLabs/fuel-bridge/pull/197))
- Add nonce to FTI interface, by [@DefiCake](https://github.com/DefiCake) (See [#155](https://github.com/FuelLabs/fuel-bridge/pull/155))
- Deploy new token bridge to devnet, by [@DefiCake](https://github.com/DefiCake) (See [#233](https://github.com/FuelLabs/fuel-bridge/pull/233))
- 🐞 Fix encoding issue on FuelERC20GatewayV4.sendMetadata(), by [@DefiCake](https://github.com/DefiCake) (See [#169](https://github.com/FuelLabs/fuel-bridge/pull/169))
- Add migration files of FuelChainState testnet upgrade - withdrawal period extension, by [@DefiCake](https://github.com/DefiCake) (See [#207](https://github.com/FuelLabs/fuel-bridge/pull/207))
- Use L1 token decimals to determine L2 token decimals, by [@DefiCake](https://github.com/DefiCake) (See [#166](https://github.com/FuelLabs/fuel-bridge/pull/166))
- 🐞 Fix CI on pnpm audit, by [@DefiCake](https://github.com/DefiCake) (See [#217](https://github.com/FuelLabs/fuel-bridge/pull/217))
- Add FTI interface, by [@DefiCake](https://github.com/DefiCake) (See [#151](https://github.com/FuelLabs/fuel-bridge/pull/151))
- Improve granularity of blacklisting permissions for messages in FuelMessagePortal, by [@DefiCake](https://github.com/DefiCake) (See [#168](https://github.com/FuelLabs/fuel-bridge/pull/168))
- Add comments to Hexens audit. Fix some other in-code commentary, by [@DefiCake](https://github.com/DefiCake) (See [#177](https://github.com/FuelLabs/fuel-bridge/pull/177))
- Added FuelChainState devnet and testnet redeploy artifacts, by [@DefiCake](https://github.com/DefiCake) (See [#235](https://github.com/FuelLabs/fuel-bridge/pull/235))
- Reconfigured testnet and devnet contracts, by [@DefiCake](https://github.com/DefiCake) (See [#236](https://github.com/FuelLabs/fuel-bridge/pull/236))
- Update testnet and devnet contracts, by [@DefiCake](https://github.com/DefiCake) (See [#185](https://github.com/FuelLabs/fuel-bridge/pull/185))
- Removed unused and vulnerable npm dependencies, by [@DefiCake](https://github.com/DefiCake) (See [#212](https://github.com/FuelLabs/fuel-bridge/pull/212))

## 0.5.0

### Minor Changes

- Add pnpm audit to CI and migrate dependencies to safe versions, by [@DefiCake](https://github.com/DefiCake) (See [#126](https://github.com/FuelLabs/fuel-bridge/pull/126))

### Patch Changes

- Deployed beta5devnet, by [@DefiCake](https://github.com/DefiCake) (See [#114](https://github.com/FuelLabs/fuel-bridge/pull/114))
- Add CORS to deployment server + update typescript SDK, by [@LuizAsFight](https://github.com/LuizAsFight) (See [#134](https://github.com/FuelLabs/fuel-bridge/pull/134))

## 0.4.0

### Minor Changes

- ERC20 gateway with training wheels, by [@DefiCake](https://github.com/DefiCake) (See [#100](https://github.com/FuelLabs/fuel-bridge/pull/100))
- Added deposit caps for native base asset (eth), by [@DefiCake](https://github.com/DefiCake) (See [#97](https://github.com/FuelLabs/fuel-bridge/pull/97))

### Patch Changes

- 🐞 Fix prettier and apply it to current files, by [@DefiCake](https://github.com/DefiCake) (See [#98](https://github.com/FuelLabs/fuel-bridge/pull/98))
- Remove deposit limitations on ether, by [@DefiCake](https://github.com/DefiCake) (See [#101](https://github.com/FuelLabs/fuel-bridge/pull/101))
- Add deploy scripts, by [@DefiCake](https://github.com/DefiCake) (See [#107](https://github.com/FuelLabs/fuel-bridge/pull/107))
- Add beta 5 deployment artifacts, by [@DefiCake](https://github.com/DefiCake) (See [#110](https://github.com/FuelLabs/fuel-bridge/pull/110))

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
