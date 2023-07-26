mod functions;
mod utils;

use crate::env::{BridgeFungibleTokenContractConfigurables, RefundRegisteredEvent};

use std::str::FromStr;
use utils::environment as env;
use utils::environment::{contract_balance, wallet_balance, TestConfig};

use fuels::{
    accounts::ViewOnlyAccount,
    prelude::{Address, AssetId, CallParameters, TxParameters},
    programs::contract::SettableContract,
    types::Bits256,
};
use primitive_types::U256 as Unsigned256;

use crate::utils::constants::{
    BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_GATEWAY, FROM, PROXY_TOKEN_DECIMALS, TO,
};
