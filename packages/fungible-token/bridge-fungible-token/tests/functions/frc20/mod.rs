mod success {

    use crate::utils::{
        constants::PROXY_TOKEN_DECIMALS,
        environment::create_token,
        interface::frc20::{decimals, name, symbol, total_supply},
    };

    #[ignore]
    #[tokio::test]
    async fn check_total_supply() {
        // TODO: finish test
        let contract = create_token().await;
        let _response = total_supply(&contract).await;
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
