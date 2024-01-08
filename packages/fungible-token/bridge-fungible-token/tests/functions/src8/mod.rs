mod success {

    use crate::utils::setup::{get_asset_id, setup_test, get_bridged_asset_chain};

    #[tokio::test]
    async fn check_bridged_chain_asset_metadata() {
        let (contract, config) = setup_test().await;
        let asset_id = get_asset_id(contract.contract_id());

        // TODO: SDK limitation https://github.com/FuelLabs/fuels-rs/issues/1046
        let _unusued = get_bridged_asset_chain(&contract, asset_id).await.unwrap();
    }
}
