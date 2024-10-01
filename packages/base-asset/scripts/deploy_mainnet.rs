use clap::Parser;
use fuels::{accounts::wallet::WalletUnlocked, crypto::SecretKey, prelude::*, types::ContractId};
use rpassword::read_password;
use std::{
    io::{self, Write},
    str::FromStr,
};

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Provider URL
    #[arg(short, long, default_value = "127.0.0.1:4000")]
    provider_url: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    print!("Enter your signing key: ");
    io::stdout().flush()?;

    // Read the password, masking the input
    let signing_key = read_password()?;

    let signing_wallet = setup_signing_wallet(&args.provider_url, &signing_key).await?;

    println!("Loaded wallet {}", signing_wallet.address().hash());

    // Deploy proxy with args as configurables
    let storage_configuration = StorageConfiguration::default()
        .add_slot_overrides_from_file("./out/release/base-asset-contract-storage_slots.json")?;

    let configuration =
        LoadConfiguration::default().with_storage_configuration(storage_configuration);

    println!("\n|||||||||||||||||||||||||||||||||||||||||||||||||\n-|- Deploying base asset -|-\n|||||||||||||||||||||||||||||||||||||||||||||||||");
    let base_asset_contract_id =
        Contract::load_from("./out/release/base-asset-contract.bin", configuration)?
            .deploy(&signing_wallet, TxPolicies::default())
            .await?;

    println!(
        " - Proxy Contract Deployed with ContractId: {}",
        ContractId::from(base_asset_contract_id)
    );

    Ok(())
}

async fn setup_signing_wallet(provider_url: &str, signing_key: &str) -> Result<WalletUnlocked> {
    let provider = Provider::connect(provider_url).await?;
    let secret = SecretKey::from_str(signing_key)?;
    Ok(WalletUnlocked::new_from_private_key(secret, Some(provider)))
}
