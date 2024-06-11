
mod success {
    use crate::utils::
        setup::{
            create_wallet, get_contract_ids, setup_environment, BridgeFungibleTokenContractConfigurables, BridgeProxy, State
        }
    ;
    use fuels::{prelude::AssetId, test_helpers::DEFAULT_COIN_AMOUNT};

    
    #[tokio::test]
    async fn proxy_owner() -> anyhow::Result<()> {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let wallet_funds = (DEFAULT_COIN_AMOUNT, AssetId::default());

        let (_, bridge, _) = setup_environment(
            &mut wallet,
            vec![wallet_funds],
            vec![],
            None,
            None,
            configurables,
        )
        .await;

        let proxy = BridgeProxy::new(bridge.contract_id().clone(), wallet.clone());

        let owner = proxy.methods()
            ._proxy_owner()
            .with_contract_ids(&[proxy_id.into()])
            .simulate()
            .await?
            .value;

        assert!(matches!(owner,
            State::Initialized(fuels::types::Identity::Address(address))
            if address == wallet.address().clone().into()
        ), "Ownership was not initialized or owner is not the expected address");


        Ok(())
    }
}