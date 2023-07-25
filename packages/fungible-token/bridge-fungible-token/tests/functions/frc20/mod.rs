mod success {

    // TODO: clean up imports
    use crate::utils::environment as env;
    use crate::utils::interface::frc20::{decimals, name, symbol, total_supply};
    use crate::{launch_provider_and_get_wallet, PROXY_TOKEN_DECIMALS};

    #[tokio::test]
    #[ignore]
    async fn check_total_supply() {
        // TODO: finish test
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = total_supply(&contract).await;
    }

    #[tokio::test]
    async fn check_name() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = name(&contract).await;

        assert_eq!(
            response,
            String::from("MY_TOKEN                                                        ")
        );
    }

    #[tokio::test]
    async fn check_symbol() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = symbol(&contract).await;

        assert_eq!(response, String::from("MYTKN                           "));
    }

    #[tokio::test]
    async fn check_decimals() {
        let wallet = launch_provider_and_get_wallet().await;
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let response = decimals(&contract).await;

        assert_eq!(response, PROXY_TOKEN_DECIMALS)
    }
}
