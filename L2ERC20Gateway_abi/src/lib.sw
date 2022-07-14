library gateway_abi;

use std::{address::Address, identity::Identity};

abi L2ERC20Gateway {
    #[storage(read, write)]fn withdraw_refund(originator: Identity);
    fn withdraw_to(to: Identity);
    #[storage(read, write)]fn finalize_deposit();
    // TODO: this should return EvmAddress. Issue here: https://github.com/FuelLabs/fuels-rs/issues/434
    fn layer1_token() -> Address;
    fn layer1_decimals() -> u8;
}
