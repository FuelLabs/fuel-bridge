mod success {
    use std::ops::Div;

    use crate::utils::{
        constants::{PRECISION, PROXY_TOKEN_DECIMALS},
        interface::src20::{decimals, name, symbol, total_assets, total_supply},
        setup::{get_asset_id, setup_test},
    };

    #[tokio::test]
    async fn check_total_supply() {
        let (contract, config) = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        let expected_total_supply: u64 = config.amount.test.div(PRECISION).as_u64();

        assert_eq!(
            total_supply(&contract, asset_id).await.unwrap(),
            expected_total_supply
        );
    }

    #[tokio::test]
    async fn check_total_assets() {
        let (contract, _config) = setup_test().await;

        assert_eq!(total_assets(&contract).await, 1);
    }

    #[tokio::test]
    async fn check_name() {
        let (contract, _config) = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        let response = name(&contract, asset_id).await.unwrap();

        assert_eq!(
            response,
            String::from("MY_TOKEN                                                        ")
        );
    }

    #[tokio::test]
    async fn check_symbol() {
        let (contract, _config) = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        let response = symbol(&contract, asset_id).await.unwrap();

        assert_eq!(response, String::from("MYTKN                           "));
    }

    #[tokio::test]
    async fn check_decimals() {
        let (contract, _config) = setup_test().await;
        let asset_id = get_asset_id(&contract.contract_id());

        let response = decimals(&contract, asset_id).await.unwrap();

        assert_eq!(response, PROXY_TOKEN_DECIMALS)
    }
}
