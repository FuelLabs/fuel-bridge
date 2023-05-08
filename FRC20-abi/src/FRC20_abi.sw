library;

use std::u256::U256;

abi FRC20 {
    /// Get the total supply of the token.
    #[storage(read)]
    fn total_supply() -> U256;

    /// Get the name of the token
    /// Example (with trailing padding): "MY_TOKEN                                                        "
    fn name() -> str[64];

    /// Get the symbol of the token
    /// Example (with trailing padding): "TKN                             "
    fn symbol() -> str[32];

    /// Get the decimals of the token
    fn decimals() -> u8;
}
