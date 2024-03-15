use crate::utils::{
    constants::{
        BRIDGED_TOKEN, BRIDGED_TOKEN_DECIMALS, BRIDGED_TOKEN_ID, FROM, PROXY_TOKEN_DECIMALS, TO,
    },
    setup::{
        create_msg_data, create_wallet, relay_message_to_contract, setup_environment,
        BridgeFungibleTokenContractConfigurables, BridgingConfig,
    },
};
use fuels::prelude::Address;
use std::str::FromStr;

mod success {
    use super::*;

    use crate::utils::constants::BRIDGED_TOKEN_GATEWAY;
    use crate::utils::interface::src20::total_supply;
    use crate::utils::setup::get_asset_id;
    use crate::utils::{
        constants::MESSAGE_AMOUNT,
        setup::{
            contract_balance, create_recipient_contract, encode_hex, precalculate_deposit_id,
            wallet_balance, RefundRegisteredEvent,
        },
    };
    use fuels::{prelude::AssetId, programs::contract::SettableContract, types::Bits256};

    #[tokio::test]
    async fn deposit_to_wallet() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.test));
    }

    // This test is akin to bridging USDT or USDC and mimicking its decimals on Fuel
    #[tokio::test]
    async fn deposit_to_wallet_with_6_decimals() {
        let mut wallet: fuels::accounts::wallet::WalletUnlocked = create_wallet();
        let proxy_token_decimals = 6u64;
        let bridged_token_decimals = 6u64;
        let config = BridgingConfig::new(bridged_token_decimals, proxy_token_decimals);

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = Some(
            BridgeFungibleTokenContractConfigurables::new()
                .with_DECIMALS(proxy_token_decimals)
        );

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        assert_eq!(
            config.amount.test.as_u64(),
            config.fuel_equivalent_amount(config.amount.test)
        );

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let tx = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipts = provider.tx_status(&tx).await.unwrap().take_receipts();

        let refund_registered_events = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        assert_eq!(refund_registered_events.len(), 0);

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.test));
    }

    // This test is akin to bridging WBTC and mimicking its decimals on Fuel
    #[tokio::test]
    async fn deposit_to_wallet_with_8_decimals() {
        let mut wallet: fuels::accounts::wallet::WalletUnlocked = create_wallet();
        let proxy_token_decimals = 8u64;
        let bridged_token_decimals = 8u64;
        let config = BridgingConfig::new(bridged_token_decimals, proxy_token_decimals);

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = Some(
            BridgeFungibleTokenContractConfigurables::new()
                .with_DECIMALS(proxy_token_decimals)
        );

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        assert_eq!(
            config.amount.test.as_u64(),
            config.fuel_equivalent_amount(config.amount.test)
        );

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let tx = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipts = provider.tx_status(&tx).await.unwrap().take_receipts();

        let refund_registered_events = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        assert_eq!(refund_registered_events.len(), 0);

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.test));
    }

    // This test is akin to bridging USDC or USDT and using the standard 9 decimals on Fuel
    #[tokio::test]
    async fn deposit_to_wallet_with_6_decimals_and_conversion() {
        let mut wallet: fuels::accounts::wallet::WalletUnlocked = create_wallet();
        let proxy_token_decimals = 9u64;
        let bridged_token_decimals = 6u64;
        let config = BridgingConfig::new(bridged_token_decimals, proxy_token_decimals);

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = Some(
            BridgeFungibleTokenContractConfigurables::new()
                .with_DECIMALS(proxy_token_decimals)
                .with_BRIDGED_TOKEN_GATEWAY(Bits256::from_hex_str(BRIDGED_TOKEN_GATEWAY).unwrap())
        );

        let deposit_amount = config.amount.min;

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            deposit_amount,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let tx = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipts = provider.tx_status(&tx).await.unwrap().take_receipts();

        let refund_registered_events = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        assert_eq!(refund_registered_events.len(), 0);

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(deposit_amount));
    }

    // This test is akin to bridging WBTC and and using the standard 9 decimals on Fuel
    #[tokio::test]
    async fn deposit_to_wallet_with_8_decimals_and_conversion() {
        let mut wallet: fuels::accounts::wallet::WalletUnlocked = create_wallet();
        let proxy_token_decimals = 9u64;
        let bridged_token_decimals = 8u64;
        let config = BridgingConfig::new(bridged_token_decimals, proxy_token_decimals);

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = Some(
            BridgeFungibleTokenContractConfigurables::new()
                .with_DECIMALS(proxy_token_decimals)
        );

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let tx = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipts = provider.tx_status(&tx).await.unwrap().take_receipts();

        let refund_registered_events = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        assert_eq!(refund_registered_events.len(), 0);

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.test));
    }

    // Cannot find an example of a token that has more than 18 decimals
    #[tokio::test]
    async fn deposit_to_wallet_with_30_decimals_and_conversion() {
        let mut wallet: fuels::accounts::wallet::WalletUnlocked = create_wallet();
        let proxy_token_decimals = 9u64;
        let bridged_token_decimals = 30u64;
        let config = BridgingConfig::new(bridged_token_decimals, proxy_token_decimals);

        let configurables: Option<BridgeFungibleTokenContractConfigurables> = Some(
            BridgeFungibleTokenContractConfigurables::new()
                .with_DECIMALS(proxy_token_decimals)
        );

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let tx = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipts = provider.tx_status(&tx).await.unwrap().take_receipts();

        let refund_registered_events = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        assert_eq!(refund_registered_events.len(), 0);

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.test));
    }

    #[tokio::test]
    async fn deposit_to_wallet_max_amount() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.max,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, config.fuel_equivalent_amount(config.amount.max));
    }

    #[tokio::test]
    async fn deposit_to_wallet_multiple_times() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let deposit_amount = config.amount.min;
        let fuel_deposit_amount = config.fuel_equivalent_amount(deposit_amount);

        let (first_deposit_message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            deposit_amount,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (second_deposit_message, _, _) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            deposit_amount,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![first_deposit_message, second_deposit_message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        assert!(total_supply(&bridge, asset_id).await.is_none());

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

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &asset_id).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, fuel_deposit_amount);

        let supply = total_supply(&bridge, asset_id).await.unwrap();
        assert_eq!(supply, fuel_deposit_amount);

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
        assert_eq!(balance, fuel_deposit_amount * 2);

        let supply = total_supply(&bridge, asset_id).await.unwrap();
        assert_eq!(supply, fuel_deposit_amount * 2);
    }

    #[tokio::test]
    async fn deposit_to_wallet_total_supply_overflow_triggers_refunds() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let max_deposit_amount = config.amount.max;
        let max_fuel_deposit_amount = config.fuel_equivalent_amount(max_deposit_amount);

        let (first_deposit_message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            max_deposit_amount,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (second_deposit_message, _, _) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            max_deposit_amount,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![first_deposit_message, second_deposit_message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        assert!(total_supply(&bridge, asset_id).await.is_none());

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

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &asset_id).await;

        // Verify the message value was received by the bridge
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Check that wallet now has bridged coins
        assert_eq!(balance, max_fuel_deposit_amount);

        let supply = total_supply(&bridge, asset_id).await.unwrap();
        assert_eq!(supply, max_fuel_deposit_amount);

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
        assert_eq!(utxos[0].amount, max_fuel_deposit_amount);

        let supply = total_supply(&bridge, asset_id).await.unwrap();
        assert_eq!(supply, max_fuel_deposit_amount);

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
        assert_eq!(amount, Bits256(encode_hex(max_deposit_amount)));
        assert_eq!(token_address, Bits256::from_hex_str(BRIDGED_TOKEN).unwrap());
        assert_eq!(from, Bits256::from_hex_str(FROM).unwrap());
        assert_eq!(token_id, Bits256::from_hex_str(BRIDGED_TOKEN_ID).unwrap());
    }

    #[tokio::test]
    async fn deposit_to_contract() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let deposit_amount = config.amount.test;
        let fuel_deposit_amount = config.fuel_equivalent_amount(deposit_amount);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            deposit_amount,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            true,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
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
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(provider, deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
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
            deposit_contract_balance_before + fuel_deposit_amount
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_max_amount() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            config.amount.max,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            true,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
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
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(&provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
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
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.max)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_with_extra_data() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            config.amount.test,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            true,
            Some(vec![11u8, 42u8, 69u8]),
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
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
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(&provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
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
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.test)
        );
    }

    #[tokio::test]
    async fn deposit_to_contract_max_amount_with_extra_data() {
        let mut wallet = create_wallet();
        let deposit_contract_id = precalculate_deposit_id().await;
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *deposit_contract_id,
            config.amount.max,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            true,
            Some(vec![11u8, 42u8, 69u8]),
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
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
        let asset_id = get_asset_id(bridge.contract_id());

        // Get the balance for the deposit contract before
        let deposit_contract_balance_before =
            contract_balance(&provider.clone(), deposit_contract.contract_id(), asset_id).await;

        // Relay the test message to the bridge contract
        let _receipts = relay_message_to_contract(
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
            deposit_contract_balance_before + config.fuel_equivalent_amount(config.amount.max)
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_small_registers_refund() {
        // In cases where BRIDGED_TOKEN_DECIMALS == PROXY_TOKEN_DECIMALS or
        // BRIDGED_TOKEN_DECIMALS < PROXY_TOKEN_DECIMALS,
        // this test will fail because it will attempt to bridge 0 coins which will always revert.

        if BRIDGED_TOKEN_DECIMALS <= PROXY_TOKEN_DECIMALS {
            return;
        }

        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.not_enough,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
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
            utxo_inputs.contract,
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check the logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.amount.not_enough))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_1() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.overflow.one,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
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
            utxo_inputs.contract,
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.overflow.one))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_2() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.overflow.two,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
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
            utxo_inputs.contract,
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.overflow.two))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn deposit_amount_too_large_registers_refund_3() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.overflow.three,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
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
            utxo_inputs.contract,
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        let refund_registered_event = bridge
            .log_decoder()
            .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
            .unwrap();

        let asset_balance =
            contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
        let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

        // Verify the message value was received by the bridge contract
        assert_eq!(asset_balance, MESSAGE_AMOUNT);

        // Verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);

        // Check logs
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(encode_hex(config.overflow.three))
        );
        assert_eq!(
            refund_registered_event[0].token_address,
            Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256::from_hex_str(FROM).unwrap()
        );
    }

    #[tokio::test]
    async fn delta_decimals_too_big_registers_refund() {
        // In cases where BRIDGED_TOKEN_DECIMALS - PROXY_TOKEN_DECIMALS > 19,
        // there would be arithmetic overflow and possibly tokens lost.
        // We want to catch these cases early and register a refund.
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *wallet.address().hash(),
            config.amount.test,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (bridge, utxo_inputs) = setup_environment(
            &mut wallet,
            vec![coin],
            vec![message],
            deposit_contract,
            None,
            configurables,
        )
        .await;

        let provider = wallet.provider().expect("Needs provider");

        // Relay the test message to the bride contract
        let tx_id = relay_message_to_contract(
            &wallet,
            utxo_inputs.message[0].clone(),
            utxo_inputs.contract,
        )
        .await;

        let receipts = wallet
            .provider()
            .unwrap()
            .tx_status(&tx_id)
            .await
            .expect("Could not obtain transaction status")
            .take_receipts();

        // TODO: fails when conditional is removed
        if BRIDGED_TOKEN_DECIMALS > PROXY_TOKEN_DECIMALS + 19 {
            let refund_registered_event = bridge
                .log_decoder()
                .decode_logs_with_type::<RefundRegisteredEvent>(&receipts)
                .unwrap();

            let token_balance =
                contract_balance(provider, bridge.contract_id(), AssetId::default()).await;
            let balance = wallet_balance(&wallet, &get_asset_id(bridge.contract_id())).await;

            // Verify the message value was received by the bridge contract
            assert_eq!(token_balance, MESSAGE_AMOUNT);

            // Verify that no tokens were minted for message.data.to
            assert_eq!(balance, 0);

            // Check logs
            assert_eq!(
                refund_registered_event[0].amount,
                Bits256(encode_hex(config.amount.test))
            );
            assert_eq!(
                refund_registered_event[0].token_address,
                Bits256::from_hex_str(BRIDGED_TOKEN).unwrap()
            );
            assert_eq!(
                refund_registered_event[0].from,
                Bits256::from_hex_str(FROM).unwrap()
            );
        }
    }
}

mod revert {
    use fuels::types::tx_status::TxStatus;

    use super::*;

    #[tokio::test]
    async fn verification_fails_with_incorrect_sender() {
        let mut wallet = create_wallet();
        let configurables: Option<BridgeFungibleTokenContractConfigurables> = None;
        let bridged_token_decimals = BRIDGED_TOKEN_DECIMALS;
        let config = BridgingConfig::new(BRIDGED_TOKEN_DECIMALS, PROXY_TOKEN_DECIMALS);
        let bad_sender: &str =
            "0x55555500000000000000000000000000000000000000000000000000005555555";

        let (message, coin, deposit_contract) = create_msg_data(
            BRIDGED_TOKEN,
            BRIDGED_TOKEN_ID,
            FROM,
            *Address::from_str(TO).unwrap(),
            config.amount.min,
            bridged_token_decimals.try_into().unwrap(),
            configurables.clone(),
            false,
            None,
        )
        .await;

        let (_test_contract, utxo_inputs) = setup_environment(
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
