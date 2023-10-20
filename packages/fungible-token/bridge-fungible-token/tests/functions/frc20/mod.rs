mod success {
    use crate::utils::{
        constants::{PROXY_TOKEN_DECIMALS, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN, BRIDGED_TOKEN_ID, FROM},
        interface::frc20::{decimals, name, symbol, total_supply},
        setup::{create_token, get_asset_id, create_wallet, BridgingConfig, create_msg_data, setup_environment, BridgeFungibleTokenContract, relay_message_to_contract},
    };
    use fuels::accounts::wallet::WalletUnlocked;

    /// This setup mints tokens so that they are registered as minted assets in the bridge
    async fn setup_test() -> BridgeFungibleTokenContract<WalletUnlocked> {
        let mut wallet = create_wallet();
        
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            None,
            false,
            None,
        )
        .await;

        let (contract, utxo_inputs, _) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            None,
        )
        .await;

        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
            &utxo_inputs.coin[..],
        )
        .await;

        contract
    }

    #[ignore]
    #[tokio::test]
    async fn check_total_supply() {
        // Lacking SDK support on version 0.43
        let contract = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        let _response = total_supply(&contract, asset_id).await.unwrap();

        // use crate::utils::setup::U256;
        // assert_eq!(response, U256::new());
    }

    #[tokio::test]
    async fn check_name() {
        let contract = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        

        let response = name(&contract, asset_id).await.unwrap();

        assert_eq!(
            response,
            String::from("MY_TOKEN                                                        ")
        );
    }

    #[tokio::test]
    async fn check_symbol() {
        let contract = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        let response = symbol(&contract, asset_id).await.unwrap();

        assert_eq!(response, String::from("MYTKN                           "));
    }

    #[tokio::test]
    async fn check_decimals() {
        let contract = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        let response = decimals(&contract, asset_id).await.unwrap();

        assert_eq!(response, PROXY_TOKEN_DECIMALS)
    }
}
