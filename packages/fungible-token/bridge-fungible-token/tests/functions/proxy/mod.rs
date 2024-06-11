
mod success {
    use crate::utils::{
        constants::{
            BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_ID, FROM, PROXY_TOKEN_DECIMALS,
        },
        interface::bridge::withdraw,
        setup::{
            create_deposit_message, create_wallet, decode_hex, encode_hex, get_contract_ids, parse_output_message_data, relay_message_to_contract, setup_environment, wallet_balance, BridgeFungibleTokenContractConfigurables, BridgeProxy
        },
    };
    use fuels::{accounts::wallet::WalletUnlocked, prelude::AssetId, test_helpers::DEFAULT_COIN_AMOUNT, types::{Bits256, ContractId}};


    #[tokio::test]
    async fn proxy_owner() -> anyhow::Result<()> {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());

        let (_, bridge, _) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![],
            None,
            None,
            configurables,
        )
        .await;

        let proxy = BridgeProxy::new(bridge.contract_id().clone(), wallet.clone());

        let owner: State = proxy.methods()._proxy_owner().with_contract_ids(&[proxy_id.into()]).simulate().await?.value;

        match owner {
            
        };


        Ok(())
    }
}