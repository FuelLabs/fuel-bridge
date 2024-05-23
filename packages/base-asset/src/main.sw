contract;

use std::string::String;
use standards::src20::SRC20;

configurable {
    /// The decimals of the base asset.
    DECIMALS: u8 = 9u8,
    /// The base asset of the fuel network.
    NAME: str[5] = __to_str_array("Ether"),
    /// The symbol of the base asset of the fuel network.
    SYMBOL: str[3] = __to_str_array("ETH"),
}

impl SRC20 for Contract {
    /// The total number of assets minted by a contract, for the base asset this is always one.
    ///
    /// # Additional Information
    ///
    /// For the base asset contract, this is always one.
    ///
    /// # Returns
    ///
    /// * [u64] - The number of assets that this contract has minted.
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    ///
    /// fn foo(base_asset_contract: ContractId) {
    ///     let src_20_abi = abi(SRC20, base_asset_contract);
    ///     let assets = src_20_abi.total_assets();
    ///     assert(assets == 1);
    /// }
    /// ```
    #[storage(read)]
    fn total_assets() -> u64 {
        1
    }

    /// Always returns none for the Base asset.
    ///
    /// # Additional Information
    ///
    /// This value is stored and managed by the bridge contract.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the total supply, this should be the default `SubId`.
    ///
    /// # Returns
    ///
    /// * [Option<u64>] - Always `None` for the base asset contract.
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    /// use std::constants::DEFAULT_SUB_ID;
    ///
    /// fn foo(base_asset_contract: ContractId) {
    ///     let src_20_abi = abi(SRC20, base_asset_contract);
    ///     let supply = src_20_abi.total_supply(DEFAULT_SUB_ID);
    ///     assert(supply == None);
    /// }
    /// ```
    #[storage(read)]
    fn total_supply(asset: AssetId) -> Option<u64> {
        None
    }

    /// Returns the name of the base asset, Ether.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the name, this should be the `AssetId::base()` for the base asset.
    ///
    /// # Returns
    ///
    /// * [Option<String>] - The name of the base asset.
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    ///
    /// fn foo(base_asset_contract: ContractId) {
    ///     let src_20_abi = abi(SRC20, base_asset_contract);
    ///     let name = src_20_abi.name(AssetId::base());
    ///     assert(name.unwrap() == String::from_ascii_str(from_str_array("Ether")));
    /// }
    /// ```
    #[storage(read)]
    fn name(asset: AssetId) -> Option<String> {
        if asset == AssetId::base() {
            Some(String::from_ascii_str(from_str_array(NAME)))
        } else {
            None
        }
    }

    /// Returns the symbol of the asset.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the symbol, this should be the `AssetId::base()` for the base asset.
    ///
    /// # Returns
    ///
    /// * [Option<String>] - The symbol of the base asset.
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    ///
    /// fn foo(base_asset_contract: ContractId) {
    ///     let src_20_abi = abi(SRC20, base_asset_contract);
    ///     let symbol = src_20_abi.symbol(AssetId::base());
    ///     assert(symbol.unwrap()() == String::from_ascii_str(from_str_array("ETH")));
    /// }
    /// ```
    #[storage(read)]
    fn symbol(asset: AssetId) -> Option<String> {
        if asset == AssetId::base() {
            Some(String::from_ascii_str(from_str_array(SYMBOL)))
        } else {
            None
        }
    }

    /// Returns the number of decimals the base asset uses.
    ///
    /// # Arguments
    ///
    /// * `asset`: [AssetId] - The asset of which to query the decimals, this should be the `AssetId::base()` for the base asset.
    ///
    /// # Returns
    ///
    /// * [Option<u8>] - The decimal precision used by the base asset.
    ///
    /// # Examples
    ///
    /// ```sway
    /// use src20::SRC20;
    ///
    /// fn foo(base_asset_contract: ContractId) {
    ///     let src_20_abi = abi(SRC20, base_asset_contract);
    ///     let decimals = src_20_abi.decimals(AssetId::base());
    ///     assert(decimals.unwrap() == 9u8);
    /// }
    /// ```
    #[storage(read)]
    fn decimals(asset: AssetId) -> Option<u8> {
        if asset == AssetId::base() {
            Some(DECIMALS)
        } else {
            None
        }
    }
}
