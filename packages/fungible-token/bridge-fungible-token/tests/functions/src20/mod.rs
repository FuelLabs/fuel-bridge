mod success {
    use crate::utils::{
        constants::PROXY_TOKEN_DECIMALS,
        interface::src20::{decimals, name, symbol, total_supply},
        setup::{get_asset_id, setup_test},
    };

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
