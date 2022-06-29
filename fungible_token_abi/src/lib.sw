library fungible_token_abi;

use std::identity::Identity;

abi FungibleToken {
    #[storage(read, write)]fn constructor(owner: Identity);
    #[storage(read)]fn mint(amount: u64);
    #[storage(read)]fn burn(amount: u64);
    #[storage(read)]fn transfer(to: Identity, amount: u64);
    fn name() -> str[11];
    fn symbol() -> str[11];
    fn decimals() -> u8;
}
