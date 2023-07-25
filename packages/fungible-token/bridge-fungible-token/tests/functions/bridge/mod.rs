mod success {

    // TODO: clean up imports
    use crate::utils::environment as env;
    use crate::utils::interface::bridge::{
        bridged_token, bridged_token_decimals, bridged_token_gateway, claim_refund, withdraw,
    };
    use crate::{
        launch_provider_and_get_wallet, BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS,
        BRIDGED_TOKEN_GATEWAY,
    };
    use fuels::prelude::Address;
    use fuels::types::Bits256;
    use std::str::FromStr;

    #[tokio::test]
    async fn check_bridged_token() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = bridged_token(&contract).await;

        assert_eq!(
            response,
            Bits256(*Address::from_str(BRIDGED_TOKEN).unwrap())
        )
    }

    #[tokio::test]
    async fn check_bridged_token_decimals() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = bridged_token_decimals(&contract).await;

        assert_eq!(response, BRIDGED_TOKEN_DECIMALS)
    }

    #[tokio::test]
    async fn check_bridged_token_gateway() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = bridged_token_gateway(&contract).await;

        assert_eq!(
            response,
            Bits256(*Address::from_str(BRIDGED_TOKEN_GATEWAY).unwrap())
        )
    }
}
