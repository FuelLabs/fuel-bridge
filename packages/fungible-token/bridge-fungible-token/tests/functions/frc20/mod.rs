mod success {

    use crate::utils::{
        constants::PROXY_TOKEN_DECIMALS,
        interface::frc20::{decimals, name, symbol, total_supply},
        setup::create_token,
    };

    #[ignore]
    #[tokio::test]
    async fn check_total_supply() {
        // Lacking SDK support on version 0.43
        let contract = create_token().await;
        let _response = total_supply(&contract).await;

        // use crate::utils::setup::U256;
        // assert_eq!(response, U256::new());
    }

    #[tokio::test]
    async fn check_name() {
        let contract = create_token().await;
        let response = name(&contract).await;

        assert_eq!(
            response,
            String::from("MY_TOKEN                                                        ")
        );
    }

    #[tokio::test]
    async fn check_symbol() {
        let contract = create_token().await;
        let response = symbol(&contract).await;

        assert_eq!(response, String::from("MYTKN                           "));
    }

    #[tokio::test]
    async fn check_decimals() {
        let contract = create_token().await;
        let response = decimals(&contract).await;

        assert_eq!(response, PROXY_TOKEN_DECIMALS)
    }
}