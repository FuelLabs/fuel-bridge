use crate::utils::{
    constants::{
        BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_ID, FROM, PROXY_TOKEN_DECIMALS, TO,
    },
    setup::{
        create_deposit_message, create_wallet, relay_message_to_contract, setup_environment,
        BridgeFungibleTokenContractConfigurables, BridgingConfig,
    },
};
use fuels::prelude::Address;
use std::str::FromStr;

mod success {
    use super::*;
    use crate::utils::constants::BRIDGED_TOKEN_GATEWAY;
    use crate::utils::interface::src20::total_supply;
    use crate::utils::setup::setup_environment_with_proxy;
    use crate::utils::{
        constants::MESSAGE_AMOUNT,
        setup::{
            contract_balance, create_metadata_message, create_recipient_contract, encode_hex,
            get_asset_id, get_contract_ids, precalculate_deposit_id, wallet_balance, MetadataEvent,
            RefundRegisteredEvent,
        },
    };
    use fuel_core_types::fuel_types::canonical::Deserialize;

    use fuels::types::bech32::{Bech32Address, FUEL_BECH32_HRP};
    use fuels::types::{Bytes32, U256};
    use fuels::{
        programs::contract::SettableContract,
        types::{tx_status::TxStatus, Bits256},
    };

    #[tokio::test]
    async fn deposit_to_wallet() {
        let mut wallet = create_wallet();

        let amount: u64 = 10;
        let token_address = "0x000000000000000000000000fcF38f326CA709b0B04B2215Dbc969fC622775F7";
        let token_id = BRIDGED_TOKEN_ID;
        let from_address = "0x00000000000000000000000090F79bf6EB2c4f870365E785982E1f101E93b906";
        let message_sender = "0x00000000000000000000000059F2f1fCfE2474fD5F0b9BA1E73ca90b143Eb8d0";
        let recipient: Bytes32 = Bytes32::from_bytes(
            &hex::decode("92dffc873b56f219329ed03bb69bebe8c3d8b041088574882f7a6404f02e2f28")
                .unwrap(),
        )
        .unwrap();
        let recipient_bech32: Bech32Address =
            Bech32Address::new(FUEL_BECH32_HRP, recipient.clone());

        let configurables: BridgeFungibleTokenContractConfigurables =
            BridgeFungibleTokenContractConfigurables::default()
                .with_BRIDGED_TOKEN_GATEWAY(Bits256::from_hex_str(message_sender).unwrap())
                .unwrap();

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, Some(configurables.clone()));

        let (message, coin, deposit_contract) = create_deposit_message(
            token_address,
            token_id,
            from_address,
            *recipient,
            U256::from(amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            Some(message_sender),
            Some(configurables),
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let _tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let tx_status = wallet.provider().unwrap().tx_status(&_tx_id).await.unwrap();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let asset_id = get_asset_id(&proxy_id.into(), token_address);
        let asset_balance = provider
            .get_asset_balance(&recipient_bech32, asset_id)
            .await
            .unwrap();

        // Check that wallet now has bridged coins
        assert_eq!(asset_balance, amount);

        // Verify that a L1 token has been registered
        let registered_l1_address: Bits256 = bridge
            .methods()
            .asset_to_l1_address(asset_id)
            .with_contract_ids(&[implementation_contractid])
            .call()
            .await
            .unwrap()
            .value;

        assert_eq!(
            registered_l1_address,
            Bits256::from_hex_str(token_address).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_to_wallet_multiple_times() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let (proxy_id, implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let deposit_amount = u64::MAX / 2;

        let (first_deposit_message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(deposit_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (second_deposit_message, _, _) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(deposit_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![first_deposit_message, second_deposit_message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);
        let impl_asset_id = get_asset_id(&implementation_contractid, BRIDGED_TOKEN);

        // Get the balance for the deposit contract before
        assert!(total_supply(&implementation_contractid, &bridge, asset_id)
            .await
            .is_none());

        ////////////////////
        // First deposit  //
        ////////////////////

        // Relay the test message to the bridge contract
        let _tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let balance = wallet_balance(&wallet, &asset_id).await;

        // Check that wallet now has bridged coins
        assert_eq!(balance, deposit_amount);

        let supply = total_supply(&implementation_contractid, &bridge, asset_id)
            .await
            .unwrap();
        assert_eq!(supply, deposit_amount);

        ////////////////////
        // Second deposit //
        ////////////////////

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let balance = wallet_balance(&wallet, &asset_id).await;
        assert_eq!(balance, deposit_amount * 2);

        let supply = total_supply(&implementation_contractid, &bridge, asset_id)
            .await
            .unwrap();
        assert_eq!(supply, deposit_amount * 2);

        // Verify that a L1 token has been registered
        let registered_l1_address: Bits256 = bridge
            .methods()
            .asset_to_l1_address(asset_id)
            .with_contract_ids(&[implementation_contractid])
            .call()
            .await
            .unwrap()
            .value;

        assert_eq!(
            registered_l1_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_to_wallet_total_supply_overflow_triggers_refunds() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let max_deposit_amount = u64::MAX;

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let (first_deposit_message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(max_deposit_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (second_deposit_message, _, _) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(max_deposit_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![first_deposit_message, second_deposit_message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);

        // Get the balance for the deposit contract before
        assert!(total_supply(&implementation_contractid, &bridge, asset_id)
            .await
            .is_none());

        ////////////////////
        // First deposit  //
        ////////////////////

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let balance = wallet_balance(&wallet, &asset_id).await;

        // Check that wallet now has bridged coins
        assert_eq!(balance, max_deposit_amount);

        let supply = total_supply(&implementation_contractid, &bridge, asset_id)
            .await
            .unwrap();
        assert_eq!(supply, max_deposit_amount);

        ////////////////////
        // Second deposit //
        ////////////////////

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let utxos = wallet
            .provider()
            .unwrap()
            .get_coins(wallet.address(), asset_id)
            .await
            .unwrap();

        assert_eq!(utxos.len(), 1);
        assert_eq!(utxos[0].amount, max_deposit_amount);

        let supply = total_supply(&implementation_contractid, &bridge, asset_id)
            .await
            .unwrap();
        assert_eq!(supply, max_deposit_amount);

        let refund_registered_events = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        assert_eq!(refund_registered_events.len(), 1);

        let RefundRegisteredEvent {
            amount,
            token_address,
            from,
            token_id,
        } = refund_registered_events[0];

        // Check logs
        assert_eq!(amount, Bits256(encode_hex(U256::from(max_deposit_amount))));
        assert_eq!(token_address, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());
        assert_eq!(from, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token_id, Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap());
    }

    #[tokio::test]
    async fn deposit_to_contract() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let deposit_amount = u64::MAX;

        let (proxy_id, implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let (message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            U256::from(deposit_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            true,
            None,
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        let deposit_contract = create_recipient_contract(wallet.clone()).await;
        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);

        // Relay the test message to the bridge contract
        let _tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        // Get the balance for the deposit contract after
        let balance = contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

        assert_eq!(balance, deposit_amount);
    }

    #[tokio::test]
    async fn deposit_to_contract_with_extra_data() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let amount = u64::MAX;

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let (message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            U256::from(amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            true,
            Some(vec![11u8, 42u8, 69u8]),
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        let deposit_contract = create_recipient_contract(wallet.clone()).await;
        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(&provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after =
            contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + amount
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_max_amount_with_extra_data() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let amount = u64::MAX;

        let (proxy_id, implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let (message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            U256::from(amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            true,
            Some(vec![11u8, 42u8, 69u8]),
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        let deposit_contract = create_recipient_contract(wallet.clone()).await;
        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(&provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        // Get the balance for the deposit contract after
        let deposit_contract_balance_after =
            contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

        assert_eq!(
            deposit_contract_balance_after,
            deposit_contract_balance_before + amount
        );
    }

    #[tokio::test]
    async fn register_metadata_18_decimals() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let name = "Token".to_string();
        let symbol = "TKN".to_string();
        let decimals = 18;

        let (proxy_id, implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let amount: u64 = u64::MAX;
        let (deposit_message, coin, _) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(amount),
            decimals,
            proxy_id,
            false,
            None,
        )
        .await;

        let metadata_message =
            create_metadata_message(BRIDGED_TOKEN, BRIDGED_TOKEN_ID, &name, &symbol, proxy_id)
                .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![deposit_message, (0, metadata_message)],
            None,
            None,
            configurables,
        )
        .await;

        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);
        let provider = wallet.provider().expect("Needs provider");

        // Relay the deposit message
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;
        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let l1_address: Bits256 = bridge
            .methods()
            .asset_to_l1_address(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value;
        assert_eq!(l1_address, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());

        let l2_decimals: u8 = bridge
            .methods()
            .decimals(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value
            .unwrap();

        assert_eq!(l2_decimals, PROXY_TOKEN_DECIMALS as u8);

        // Relay the metadata message
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        let receipts = tx_status.clone().take_receipts();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let metadata_events = bridge
            .log_decoder()
            .decode_logs_with_type::<MetadataEvent>(&receipts)
            .unwrap();

        assert_eq!(metadata_events.len(), 1);
        assert_eq!(
            metadata_events[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );

        let registered_name = bridge.methods().name(asset_id)
        .with_contract_ids(&[implementation_contractid.clone()])
        .call().await.unwrap().value;

        assert_eq!(name, registered_name.unwrap());

        let registered_symbol = bridge
            .methods()
            .symbol(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value;

        assert_eq!(symbol, registered_symbol.unwrap());
    }

    #[tokio::test]
    async fn register_metadata_9_decimals() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let name = "Token".to_string();
        let symbol = "TKN".to_string();
        let decimals = 9;

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let amount: u64 = u64::MAX;
        let (deposit_message, coin, _) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(amount),
            decimals,
            proxy_id,
            false,
            None,
        )
        .await;

        let metadata_message =
            create_metadata_message(BRIDGED_TOKEN, BRIDGED_TOKEN_ID, &name, &symbol, proxy_id)
                .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![deposit_message, (0, metadata_message)],
            None,
            None,
            configurables,
        )
        .await;

        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);
        let provider = wallet.provider().expect("Needs provider");

        // Relay the deposit message
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;
        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let l1_address: Bits256 = bridge
            .methods()
            .asset_to_l1_address(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value;
        assert_eq!(l1_address, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());

        let l2_decimals: u8 = bridge
            .methods()
            .decimals(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value
            .unwrap();

        assert_eq!(l2_decimals, PROXY_TOKEN_DECIMALS as u8);

        // Relay the metadata message
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        let receipts = tx_status.clone().take_receipts();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let metadata_events = bridge
            .log_decoder()
            .decode_logs_with_type::<MetadataEvent>(&receipts)
            .unwrap();

        assert_eq!(metadata_events.len(), 1);
        assert_eq!(
            metadata_events[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );

        let registered_name = bridge.methods().name(asset_id)
        .with_contract_ids(&[implementation_contractid.clone()])
        .call().await.unwrap().value;
        assert_eq!(name, registered_name.unwrap());

        let registered_symbol = bridge
            .methods()
            .symbol(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value;

        assert_eq!(symbol, registered_symbol.unwrap());
    }

    #[tokio::test]
    async fn register_metadata_6_decimals() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let name = "Token".to_string();
        let symbol = "TKN".to_string();
        let decimals = 6;

        let (proxy_id, implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let amount: u64 = u64::MAX;
        let (deposit_message, coin, _) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(amount),
            decimals,
            proxy_id,
            false,
            None,
        )
        .await;

        let metadata_message =
            create_metadata_message(BRIDGED_TOKEN, BRIDGED_TOKEN_ID, &name, &symbol, proxy_id)
                .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![deposit_message, (0, metadata_message)],
            None,
            None,
            configurables,
        )
        .await;

        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);
        let provider = wallet.provider().expect("Needs provider");

        // Relay the deposit message
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;
        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let l1_address: Bits256 = bridge
            .methods()
            .asset_to_l1_address(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value;
        assert_eq!(l1_address, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());

        let l2_decimals: u8 = bridge
            .methods()
            .decimals(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value
            .unwrap();
        assert_eq!(l2_decimals, decimals as u8);

        // Relay the metadata message
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        let receipts = tx_status.clone().take_receipts();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let metadata_events = bridge
            .log_decoder()
            .decode_logs_with_type::<MetadataEvent>(&receipts)
            .unwrap();

        assert_eq!(metadata_events.len(), 1);
        assert_eq!(
            metadata_events[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );

        let registered_name = bridge.methods().name(asset_id)
        .with_contract_ids(&[implementation_contractid.clone()])
        .call().await.unwrap().value;

        assert_eq!(name, registered_name.unwrap());

        let registered_symbol = bridge
            .methods()
            .symbol(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value;

        assert_eq!(symbol, registered_symbol.unwrap());
    }

    #[tokio::test]
    async fn deposit_more_than_u64_max_triggers_refunds() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let deposit_amount: u128 = u64::MAX as u128 + 1;

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let (message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(deposit_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let asset_id = get_asset_id(bridge.contract_id(), BRIDGED_TOKEN);
        let asset_balance = wallet_balance(&wallet, &asset_id).await;

        assert_eq!(asset_balance, 0);

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let utxos = wallet
            .provider()
            .unwrap()
            .get_coins(wallet.address(), asset_id)
            .await
            .unwrap();

        assert_eq!(utxos.len(), 0);

        let supply = total_supply(&implementation_contractid, &bridge, asset_id).await;
        assert!(supply.is_none());

        let refund_registered_events = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        assert_eq!(refund_registered_events.len(), 1);

        let RefundRegisteredEvent {
            amount,
            token_address,
            from,
            token_id,
        } = refund_registered_events[0];

        // Check logs
        assert_eq!(amount, Bits256(encode_hex(U256::from(deposit_amount))));
        assert_eq!(token_address, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());
        assert_eq!(from, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token_id, Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap());
    }

    #[tokio::test]
    async fn deposit_different_tokens() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;

        let token_one = "0x00000000000000000000000000000000000000000000000000000000deadbeef";
        let token_two = "0xdeadbeef00000000000000000000000000000000000000000000000000000000";

        let token_one_amount: u64 = 1;
        let token_two_amount: u64 = 2;

        let (proxy_id, _implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let (message_one, coin, deposit_contract) = create_deposit_message(
            token_one,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(token_one_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (message_two, _, _) = create_deposit_message(
            token_two,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            U256::from(token_two_amount),
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message_one, message_two],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[1].clone(),
            utxo_inputs.contract.clone(),
        )
        .await;

        let tx_status = provider.tx_status(&tx_id).await.unwrap();
        assert!(matches!(tx_status, TxStatus::Success { .. }));

        // Token one checks
        let asset_id = get_asset_id(&proxy_id.into(), token_one);
        let asset_balance = wallet_balance(&wallet, &asset_id).await;

        // Check that wallet now has bridged coins
        assert_eq!(asset_balance, token_one_amount);

        // Verify that a L1 token has been registered
        let token_one_registered_l1_address: Bits256 = bridge
            .methods()
            .asset_to_l1_address(asset_id)
            .with_contract_ids(&[implementation_contractid.clone()])
            .call()
            .await
            .unwrap()
            .value;

        assert_eq!(
            token_one_registered_l1_address,
            Bits256::from_hex_str(token_one).unwrap()
        );

        // // Token two checks
        let asset_id = get_asset_id(bridge.contract_id(), token_two);
        let asset_balance = wallet_balance(&wallet, &asset_id).await;

        // // Check that wallet now has bridged coins
        assert_eq!(asset_balance, token_two_amount);

        // Verify that a L1 token has been registered
        let token_two_registered_l1_address: Bits256 = bridge
            .methods()
            .asset_to_l1_address(asset_id)
            .with_contract_ids(&[implementation_contractid])
            .call()
            .await
            .unwrap()
            .value;

        assert_eq!(
            token_two_registered_l1_address,
            Bits256::from_hex_str(token_two).unwrap()
        );
        assert_ne!(
            token_one_registered_l1_address,
            token_two_registered_l1_address
        );
    }
}

mod revert {
    use fuels::types::tx_status::TxStatus;

    use crate::utils::setup::get_contract_ids;

    use super::*;

    #[tokio::test]
    async fn verification_fails_with_incorrect_sender() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let bad_sender: &str = "0x5555550000000000000000000000000000000000000000000000000005555555";

        let (proxy_id, implementation_contract_id) =
            get_contract_ids(&wallet, configurables.clone());

        let (message, coin, deposit_contract) = create_deposit_message(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min,
            BRIDGED_TOKEN_DECIMALS,
            proxy_id,
            false,
            None,
        )
        .await;

        let (implementation_contractid, bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            Some(bad_sender),
            configurables,
        )
        .await;

        // Relay the test message to the bridge contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipt = wallet.provider().unwrap().tx_status(&tx_id).await.unwrap();

        match receipt {
            TxStatus::Revert { reason, .. } => {
                assert_eq!(reason, "Revert(18446744073709486080)");
            }
            _ => {
                panic!("Transaction did not revert");
            }
        }
    }
}
