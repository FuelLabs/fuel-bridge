use fuels::accounts::{wallet::WalletUnlocked, provider::Provider};

pub const DEFAULT_MNEMONIC_PHRASE: &str = "test test test test test test test test test test test junk";
pub const N_ACCOUNTS: u8 = 20;

#[allow(dead_code)]
pub enum AccountName {
    Alice = 0, 
    Bob = 1, 
    Carol = 2, 
    Dave = 3, 
    Eve = 4, 
    Frank = 5, 
    Grace = 6, 
    Heather = 7, 
    Ivan = 8, 
    Judy = 9, 
    Mallory = 10,
}

pub fn get_wallet_by_name(name: AccountName, provider: Option<Provider>) -> WalletUnlocked {
    let n = name as u8;
    let mut wallet = WalletUnlocked::new_from_mnemonic_phrase_with_path(DEFAULT_MNEMONIC_PHRASE, None, format!("m/44'/60'/0'/0/{}", n).as_str()).unwrap();

    if provider.is_some() {
        wallet.set_provider(provider.unwrap());
    }

    wallet
}