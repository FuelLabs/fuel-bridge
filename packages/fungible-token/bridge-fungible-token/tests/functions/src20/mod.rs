mod success {
    use crate::utils::{
        constants::PROXY_TOKEN_DECIMALS,
        interface::src20::{decimals, name, symbol, total_assets, total_supply},
        setup::{get_asset_id, setup_test},
    };

    #[tokio::test]
    async fn check_total_supply() {
        let contract = setup_test().await;
        let asset_id = get_asset_id(contract.contract_id());

        let expected_total_supply: u64 = u64::MAX;

        assert_eq!(
            total_supply(&contract, asset_id).await.unwrap(),
            expected_total_supply
        );
    }

    #[tokio::test]
    async fn check_total_assets() {
        let contract = setup_test().await;

        assert_eq!(total_assets(&contract).await, 1);
    }

    #[tokio::test]
    #[ignore] // Ignore while we work on the METADATA flows
    async fn check_name() {
        let contract = setup_test().await;
        let asset_id = get_asset_id(contract.contract_id());

        let response = name(&contract, asset_id).await.unwrap();

        assert_eq!(
            response,
            String::from("MY_TOKEN                                                        ")
        );
    }

    #[tokio::test]
    #[ignore] // Ignore while we work on the METADATA flows
    async fn check_symbol() {
        let contract = setup_test().await;
        let asset_id = get_asset_id(contract.contract_id());

        let response = symbol(&contract, asset_id).await.unwrap();

        assert_eq!(response, String::from("MYTKN                           "));
    }

    #[tokio::test]
    async fn check_decimals() {
        let contract = setup_test().await;
        let asset_id = get_asset_id(contract.contract_id());

        let response = decimals(&contract, asset_id).await.unwrap();

        assert_eq!(u64::from(response), PROXY_TOKEN_DECIMALS)
    }
}
