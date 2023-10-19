library;

use std::{u256::U256, vm::evm::evm_address::EvmAddress};

abi FRC20 {
    /// Get the total supply of the token.
    #[storage(read)]
    fn total_supply() -> U256;

    /// Get the name of the token
    /// Example (with trailing padding): "MY_TOKEN                                                        "
    #[storage(read)]
    fn name() -> str[64];

    /// Get the symbol of the token
    /// Example (with trailing padding): "TKN                             "
    #[storage(read)]
    fn symbol() -> str[32];

    /// Get the decimals of the token
    #[storage(read)]
    fn decimals() -> u8;
}
