mod tests {
    use crate::utils::setup::{
        create_wallet, get_contract_ids, setup_environment,
        BridgeFungibleTokenContractConfigurables, BridgeProxy, State,
    };
    use ethers::core::rand::{self, Rng};
    use fuels::{
        accounts::{wallet::WalletUnlocked, Account},
        prelude::AssetId,
        test_helpers::DEFAULT_COIN_AMOUNT,
        types::{
            bech32::Bech32Address,
            errors::{transaction::Reason, Error},
            ContractId,
        },
    };

    #[tokio::test]
    async fn proxy_owner_and_target() -> anyhow::Result<()> {
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

        let owner = proxy
            .methods()
            ._proxy_owner()
            .with_contract_ids(&[proxy_id.into()])
            .simulate()
            .await?
            .value;

        assert!(
            matches!(owner,
                State::Initialized(fuels::types::Identity::Address(address))
                if address == wallet.address().clone().into()
            ),
            "Ownership was not initialized or owner is not the expected address. Value: {:?}",
            owner
        );

        let target = proxy
            .methods()
            ._proxy_target()
            .with_contract_ids(&[proxy_id.into()])
            .simulate()
            .await?
            .value;

        assert_eq!(target, _implementation_contract_id);

        Ok(())
    }

    #[tokio::test]
    async fn proxy_change_owner() -> anyhow::Result<()> {
        let mut wallet = create_wallet();
        let new_owner = WalletUnlocked::new_random(None);

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

        let _tx_id = proxy
            .methods()
            ._proxy_change_owner(new_owner.address().into())
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await?
            .tx_id
            .unwrap();

        let owner = proxy
            .methods()
            ._proxy_owner()
            .with_contract_ids(&[proxy_id.into()])
            .simulate()
            .await?
            .value;

        assert!(
            matches!(owner,
                State::Initialized(fuels::types::Identity::Address(address))
                if address == new_owner.address().clone().into()
            ),
            "Ownership was not initialized or owner is not the expected address. Value: {:?}",
            owner
        );

        Ok(())
    }

    #[tokio::test]
    async fn proxy_revoke_ownership() -> anyhow::Result<()> {
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

        let _tx_id = proxy
            .methods()
            ._proxy_revoke_ownership()
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await?
            .tx_id
            .unwrap();

        let owner = proxy
            .methods()
            ._proxy_owner()
            .with_contract_ids(&[proxy_id.into()])
            .simulate()
            .await?
            .value;

        assert_eq!(owner, State::Revoked);

        Ok(())
    }

    #[tokio::test]
    async fn proxy_revoke_ownership_only_owner() -> anyhow::Result<()> {
        let mut wallet = create_wallet();
        let mut mallory = WalletUnlocked::new_random(None);

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

        let _ = wallet
            .transfer(
                mallory.address(),
                DEFAULT_COIN_AMOUNT / 2,
                Default::default(),
                Default::default(),
            )
            .await?;

        let provider = wallet.provider().unwrap().clone();
        mallory.set_provider(provider);

        let proxy = BridgeProxy::new(bridge.contract_id().clone(), mallory.clone());

        let error_receipt = proxy
            .methods()
            ._proxy_revoke_ownership()
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await
            .unwrap_err();

        assert!(
            matches!(error_receipt,
                Error::Transaction(Reason::Reverted {reason, ..})
                if reason == "NotOwner"
            ),
            "Transaction did not revert or reverted with a wrong reason"
        );

        Ok(())
    }

    #[tokio::test]
    async fn proxy_change_owner_cannot_be_zero() -> anyhow::Result<()> {
        let mut wallet = create_wallet();
        let new_owner = Bech32Address::default();

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

        let error_receipt = proxy
            .methods()
            ._proxy_change_owner(new_owner.into())
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await
            .unwrap_err();

        assert!(
            matches!(error_receipt,
                Error::Transaction(Reason::Reverted {reason, ..})
                if reason == "IdentityZero"
            ),
            "Transaction did not revert or reverted with a wrong reason"
        );

        Ok(())
    }

    #[tokio::test]
    async fn proxy_change_owner_only_owner() -> anyhow::Result<()> {
        let mut wallet = create_wallet();
        let mut mallory = WalletUnlocked::new_random(None);

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

        let _ = wallet
            .transfer(
                mallory.address(),
                DEFAULT_COIN_AMOUNT / 2,
                Default::default(),
                Default::default(),
            )
            .await?;

        let provider = wallet.provider().unwrap().clone();
        mallory.set_provider(provider);

        let proxy = BridgeProxy::new(bridge.contract_id().clone(), mallory.clone());

        let error_receipt = proxy
            .methods()
            ._proxy_change_owner(mallory.address().into())
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await
            .unwrap_err();

        assert!(
            matches!(error_receipt,
                Error::Transaction(Reason::Reverted {reason, ..})
                if reason == *"NotOwner"
            ),
            "Transaction did not revert or reverted with a wrong reason"
        );

        let owner = proxy
            .methods()
            ._proxy_owner()
            .with_contract_ids(&[proxy_id.into()])
            .simulate()
            .await?
            .value;

        assert!(
            matches!(owner,
                State::Initialized(fuels::types::Identity::Address(address))
                if address == wallet.address().clone().into()
            ),
            "Ownership was not initialized or owner is not the expected address"
        );

        Ok(())
    }

    #[tokio::test]
    async fn proxy_set_target() -> anyhow::Result<()> {
        let mut wallet = create_wallet();

        let mut rng = rand::thread_rng();
        let random_bytes: [u8; 32] = rng.gen();
        let random_contract_id = ContractId::new(random_bytes);

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

        let _tx_id = proxy
            .methods()
            .set_proxy_target(random_contract_id)
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await?
            .tx_id
            .unwrap();

        let target = proxy
            .methods()
            ._proxy_target()
            .with_contract_ids(&[proxy_id.into()])
            .simulate()
            .await?
            .value;

        assert_eq!(target, random_contract_id);

        Ok(())
    }

    #[tokio::test]
    async fn proxy_set_target_only_owner() -> anyhow::Result<()> {
        let mut wallet = create_wallet();
        let mut mallory = WalletUnlocked::new_random(None);

        let mut rng = rand::thread_rng();
        let random_bytes: [u8; 32] = rng.gen();
        let random_contract_id = ContractId::new(random_bytes);

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

        let _ = wallet
            .transfer(
                mallory.address(),
                DEFAULT_COIN_AMOUNT / 2,
                Default::default(),
                Default::default(),
            )
            .await?;

        let provider = wallet.provider().unwrap().clone();
        mallory.set_provider(provider);

        let proxy = BridgeProxy::new(bridge.contract_id().clone(), mallory.clone());

        let error_receipt = proxy
            .methods()
            .set_proxy_target(random_contract_id)
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await
            .unwrap_err();

        assert!(
            matches!(error_receipt,
                Error::Transaction(Reason::Reverted {reason, ..})
                if reason == "NotOwner"
            ),
            "Transaction did not revert or reverted with a wrong reason"
        );

        Ok(())
    }

    #[tokio::test]
    async fn proxy_set_target_id_cannot_be_zero() -> anyhow::Result<()> {
        let mut wallet = create_wallet();

        let new_target = ContractId::default();

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

        let error_receipt = proxy
            .methods()
            .set_proxy_target(new_target)
            .with_contract_ids(&[proxy_id.into()])
            .call()
            .await
            .unwrap_err();

        assert!(
            matches!(error_receipt,
                Error::Transaction(Reason::Reverted {reason, ..})
                if reason == *"IdentityZero"
            ),
            "Transaction did not revert or reverted with a wrong reason"
        );

        Ok(())
    }
}
