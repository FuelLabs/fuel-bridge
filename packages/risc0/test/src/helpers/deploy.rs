use fuels::{
    accounts::wallet::WalletUnlocked,
    macros::abigen,
    programs::contract::{Contract, LoadConfiguration},
    types::transaction::TxPolicies,
};
abigen!(Contract(
    name = "WalletContract",
    abi = "packages/risc0/test/contracts/wallet/out/debug/wallet-abi.json"
));

pub async fn deploy_smart_wallet(
    account: &WalletUnlocked,
) -> anyhow::Result<WalletContract<WalletUnlocked>> {
    // This will load and deploy your contract binary to the chain so that its ID can
    // be used to initialize the instance
    let configurables = WalletContractConfigurables::new()
        .with_ASSET_ID(Default::default())
        .with_OWNER_ADDRESS(account.address().clone().into());

    let contract_id = Contract::load_from(
        "./contracts/wallet/out/debug/wallet.bin",
        LoadConfiguration::default().with_configurables(configurables),
    )?
    .deploy(account, TxPolicies::default())
    .await?;

    let contract = WalletContract::new(contract_id, account.clone());

    Ok(contract)
}
