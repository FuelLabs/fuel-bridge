mod utils {
    pub mod builder;
    pub mod environment;
}

use std::str::FromStr;
use utils::builder;
use utils::environment as env;

use fuels::prelude::*;
use fuels::tx::{Address, AssetId, Receipt};

pub const L1_TOKEN: &str = "0x00000000000000000000000000000000000000000000000000000000deadbeef";
pub const LAYER_1_ERC20_GATEWAY: &str =
    "0xca400d3e7710eee293786830755278e6d2b9278b4177b8b1a896ebd5f55c10bc";
pub const TO: &str = "0x0000000000000000000000000000000000000000000000000000000000000777";
pub const FROM: &str = "0x0000000000000000000000008888888888888888888888888888888888888888";
pub const MINIMUM_BRIDGABLE_AMOUNT: &str =
    "0x000000000000000000000000000000000000000000000000000000003B9ACA00";
pub const DUST: &str = "0x000000000000000000000000000000000000000000000000000000003B9AC9FF";
// 18446744073709551615000000000 (u64::max() * 10 ^ 19)
pub const MAXIMUM_BRIDGABLE_AMOUNT: &str =
    "0x00000000000000000000000000000000000000003B9AC9FFFFFFFFFFC4653600";
pub const OVERFLOWING_AMOUNT: &str =
    "0x00000000000000000000000000000000000000003B9ACA000000000000000000";
pub const DECIMAL_ADJUSTMENT_FACTOR: u64 = 1_000_000_000;

mod success {
    use super::*;

    #[tokio::test]
    async fn relay_message_with_predicate_and_script_constraint() -> Result<(), Error> {
        let mut wallet = env::setup_wallet();

        let (message, coin) = env::construct_msg_data(
            L1_TOKEN,
            FROM,
            wallet.address().hash().to_vec(),
            MINIMUM_BRIDGABLE_AMOUNT,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let test_contract_base_asset_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_base_asset_balance, 100);
        // Check that wallet now has bridged coins
        assert_eq!(balance, 1);
        Ok(())
    }

    #[tokio::test]
    async fn depositing_max_amount_ok() -> Result<(), Error> {
        let mut wallet = env::setup_wallet();

        let (message, coin) = env::construct_msg_data(
            L1_TOKEN,
            FROM,
            wallet.address().hash().to_vec(),
            MAXIMUM_BRIDGABLE_AMOUNT,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let test_contract_base_asset_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_base_asset_balance, 100);

        let intermediate_val = env::hex_to_uint_128(MAXIMUM_BRIDGABLE_AMOUNT);
        let l2_token_amount = u64::try_from(intermediate_val / 1_000_000_000u128).unwrap();

        // Check that wallet now has bridged coins
        assert_eq!(balance, l2_token_amount);
        Ok(())
    }

    #[tokio::test]
    async fn claim_refund() -> Result<(), Error> {
        // perform a failing deposit first to register a refund & verify it, then claim and verify output message is created as expected
        let mut wallet = env::setup_wallet();
        let (message, coin) =
            env::construct_msg_data(L1_TOKEN, FROM, wallet.address().hash().to_vec(), DUST).await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let refund_registered_event = test_contract
            .logs_with_type::<utils::environment::bridgefungibletokencontract_mod::RefundRegisteredEvent>(
            &receipts,
        )?;

        // Verify the message value was received by the test contract
        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        assert_eq!(test_contract_balance, 100);
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(*Address::from_str(&DUST).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256(*Address::from_str(&L1_TOKEN).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256(*Address::from_str(&FROM).unwrap())
        );

        // verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);
        let call_response = test_contract
            .methods()
            .claim_refund(
                Bits256(*Address::from_str(&FROM).unwrap()),
                Bits256(*Address::from_str(&L1_TOKEN).unwrap()),
            )
            .append_message_outputs(1)
            .call()
            .await
            .unwrap();
        // verify correct message was sent

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        assert_eq!(
            *test_contract_id.hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(LAYER_1_ERC20_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 104);

        // message data
        let (selector, to, l1_token, amount) =
            env::parse_output_message_data(message_receipt.data().unwrap());
        assert_eq!(selector, env::decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256(*Address::from_str(&FROM).unwrap()));
        assert_eq!(l1_token, Bits256(*Address::from_str(&L1_TOKEN).unwrap()));
        // Compare the value output in the message with the original value (DUST) as a uint.
        assert_eq!(amount, 999999999);

        Ok(())
    }

    #[tokio::test]
    async fn withdraw_from_bridge() -> Result<(), Error> {
        // perform successful deposit first, verify it, then withdraw and verify balances
        let mut wallet = env::setup_wallet();

        let (message, coin) = env::construct_msg_data(
            L1_TOKEN,
            FROM,
            wallet.address().hash().to_vec(),
            MAXIMUM_BRIDGABLE_AMOUNT,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let test_contract_base_asset_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_base_asset_balance, 100);

        let intermediate_val = env::hex_to_uint_128(MAXIMUM_BRIDGABLE_AMOUNT);
        let l2_token_amount = u64::try_from(intermediate_val / 1_000_000_000u128).unwrap();

        // Check that wallet now has bridged coins
        assert_eq!(balance, l2_token_amount);

        // Now try to withdraw
        let custom_tx_params = TxParameters::new(None, Some(5_000_000), None);
        let l2_token_amount = 3000;
        let call_params = CallParameters::new(
            Some(l2_token_amount),
            Some(AssetId::new(*test_contract_id.hash())),
            None,
        );

        let call_response = test_contract
            .methods()
            .withdraw_to(Bits256(*wallet.address().hash()))
            .tx_params(custom_tx_params)
            .call_params(call_params)
            .append_message_outputs(1)
            .call()
            .await
            .unwrap();

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        assert_eq!(
            *test_contract_id.hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(LAYER_1_ERC20_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 104);

        // message data
        let (selector, to, l1_token, amount) =
            env::parse_output_message_data(message_receipt.data().unwrap());
        assert_eq!(selector, env::decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256(*wallet.address().hash()));
        assert_eq!(l1_token, Bits256(*Address::from_str(&L1_TOKEN).unwrap()));
        assert_eq!(amount, l2_token_amount * DECIMAL_ADJUSTMENT_FACTOR);

        Ok(())
    }

    #[tokio::test]
    async fn decimal_conversions_are_correct() -> Result<(), Error> {
        // start with an eth amount
        // bridge it to Fuel
        // bridge it back to L1
        // compare starting value with ending value, should be identical

        // first make a deposit
        let mut wallet = env::setup_wallet();
        let (message, coin) = env::construct_msg_data(
            L1_TOKEN,
            FROM,
            wallet.address().hash().to_vec(),
            MINIMUM_BRIDGABLE_AMOUNT,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let test_contract_base_asset_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_base_asset_balance, 100);
        // Check that wallet now has bridged coins

        let intermediate_val = env::hex_to_uint_128(MINIMUM_BRIDGABLE_AMOUNT);
        let l2_token_amount = u64::try_from(intermediate_val / 1_000_000_000u128).unwrap();

        assert_eq!(balance, l2_token_amount);

        // Now try to withdraw
        let custom_tx_params = TxParameters::new(None, Some(5_000_000), None);
        let call_params = CallParameters::new(
            Some(l2_token_amount),
            Some(AssetId::new(*test_contract_id.hash())),
            None,
        );

        let call_response = test_contract
            .methods()
            .withdraw_to(Bits256(*wallet.address().hash()))
            .tx_params(custom_tx_params)
            .call_params(call_params)
            .append_message_outputs(1)
            .call()
            .await
            .unwrap();

        let message_receipt = call_response
            .receipts
            .iter()
            .find(|&r| matches!(r, Receipt::MessageOut { .. }))
            .unwrap();

        assert_eq!(
            *test_contract_id.hash(),
            **message_receipt.sender().unwrap()
        );
        assert_eq!(
            &Address::from_str(LAYER_1_ERC20_GATEWAY).unwrap(),
            message_receipt.recipient().unwrap()
        );
        assert_eq!(message_receipt.amount().unwrap(), 0);
        assert_eq!(message_receipt.len().unwrap(), 104);

        // message data
        let (selector, to, l1_token, msg_data_amount) =
            env::parse_output_message_data(message_receipt.data().unwrap());
        assert_eq!(selector, env::decode_hex("0x53ef1461").to_vec());
        assert_eq!(to, Bits256(*wallet.address().hash()));
        assert_eq!(l1_token, Bits256(*Address::from_str(&L1_TOKEN).unwrap()));
        assert_eq!(
            u128::try_from(msg_data_amount).unwrap(),
            u128::try_from(l2_token_amount).unwrap()
                * u128::try_from(DECIMAL_ADJUSTMENT_FACTOR).unwrap()
        );

        // now verify that the initial amount == the final amount
        assert_eq!(u128::try_from(msg_data_amount).unwrap(), intermediate_val);

        Ok(())
    }

    #[tokio::test]
    async fn depositing_dust_registers_refund() -> Result<(), Error> {
        // "dust" here refers to any amount less than 1_000_000_000.
        // This is to account for conversion between the 18 decimals on most erc20 contracts, and the 9 decimals in the Fuel BridgeFungibleToken contract

        let mut wallet = env::setup_wallet();

        let (message, coin) =
            env::construct_msg_data(L1_TOKEN, FROM, wallet.address().hash().to_vec(), DUST).await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let refund_registered_event = test_contract
            .logs_with_type::<utils::environment::bridgefungibletokencontract_mod::RefundRegisteredEvent>(
            &receipts,
        )?;

        // Verify the message value was received by the test contract
        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        assert_eq!(test_contract_balance, 100);
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(*Address::from_str(&DUST).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256(*Address::from_str(&L1_TOKEN).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256(*Address::from_str(&FROM).unwrap())
        );

        // verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);
        Ok(())
    }

    #[tokio::test]
    async fn depositing_amount_too_large_registers_refund() -> Result<(), Error> {
        let mut wallet = env::setup_wallet();

        let (message, coin) = env::construct_msg_data(
            L1_TOKEN,
            FROM,
            wallet.address().hash().to_vec(),
            OVERFLOWING_AMOUNT,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let refund_registered_event = test_contract
            .logs_with_type::<utils::environment::bridgefungibletokencontract_mod::RefundRegisteredEvent>(
            &receipts,
        )?;

        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();
        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_balance, 100);

        // check that the RefundRegisteredEvent receipt is populated correctly
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(*Address::from_str(&OVERFLOWING_AMOUNT).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256(*Address::from_str(&L1_TOKEN).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256(*Address::from_str(&FROM).unwrap())
        );

        // verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);
        Ok(())
    }

    #[tokio::test]
    async fn can_get_name() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract.methods().name().call().await.unwrap();
        assert_eq!(call_response.value, "________________________MY_TOKEN")
    }

    #[tokio::test]
    async fn can_get_symbol() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract.methods().symbol().call().await.unwrap();
        assert_eq!(call_response.value, "___________________________MYTKN")
    }

    #[tokio::test]
    async fn can_get_decimals() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract.methods().decimals().call().await.unwrap();
        assert_eq!(call_response.value, 9)
    }

    #[tokio::test]
    async fn can_get_layer1_token() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;
        let l1_token = Address::from_str(&L1_TOKEN).unwrap();

        let call_response = contract.methods().layer1_token().call().await.unwrap();
        assert_eq!(call_response.value, Bits256(*l1_token))
    }

    #[tokio::test]
    async fn can_get_layer1_decimals() {
        let wallet = launch_provider_and_get_wallet().await;
        // Set up the environment
        let (contract, _id) = env::get_fungible_token_instance(wallet.clone()).await;

        let call_response = contract.methods().layer1_decimals().call().await.unwrap();
        assert_eq!(call_response.value, 18)
    }
}

mod revert {
    use super::*;

    #[tokio::test]
    async fn deposit_with_wrong_l1_token_registers_refund() -> Result<(), Error> {
        let mut wallet = env::setup_wallet();
        let wrong_token_value: &str =
            "0x1111110000000000000000000000000000000000000000000000000000111111";

        let (message, coin) = env::construct_msg_data(
            wrong_token_value,
            FROM,
            env::decode_hex(TO),
            MINIMUM_BRIDGABLE_AMOUNT,
        )
        .await;

        // Set up the environment
        let (
            test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            test_contract_id,
            provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], None).await;

        // Relay the test message to the test contract
        let receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;

        let refund_registered_event = test_contract
            .logs_with_type::<utils::environment::bridgefungibletokencontract_mod::RefundRegisteredEvent>(
            &receipts,
        )?;

        // Verify the message value was received by the test contract
        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.get_contract_id(), AssetId::default())
            .await
            .unwrap();

        let balance = wallet
            .get_asset_balance(&AssetId::new(*test_contract_id.hash()))
            .await?;

        // Verify the message value was received by the test contract
        assert_eq!(test_contract_balance, 100);

        // check that the RefundRegisteredEvent receipt is populated correctly
        assert_eq!(
            refund_registered_event[0].amount,
            Bits256(*Address::from_str(&MINIMUM_BRIDGABLE_AMOUNT).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].asset,
            Bits256(*Address::from_str(&wrong_token_value).unwrap())
        );
        assert_eq!(
            refund_registered_event[0].from,
            Bits256(*Address::from_str(&FROM).unwrap())
        );

        // verify that no tokens were minted for message.data.to
        assert_eq!(balance, 0);
        Ok(())
    }

    #[tokio::test]
    #[should_panic(expected = "Revert(42)")]
    async fn verification_fails_with_wrong_sender() {
        let mut wallet = env::setup_wallet();
        let (message, coin) = env::construct_msg_data(
            L1_TOKEN,
            FROM,
            env::decode_hex(TO),
            MINIMUM_BRIDGABLE_AMOUNT,
        )
        .await;

        let bad_sender: &str =
            "0x55555500000000000000000000000000000000000000000000000000005555555";

        // Set up the environment
        let (
            _test_contract,
            contract_input,
            coin_inputs,
            message_inputs,
            _test_contract_id,
            _provider,
        ) = env::setup_environment(&mut wallet, vec![coin], vec![message], Some(bad_sender)).await;

        // Relay the test message to the test contract
        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            &coin_inputs[..],
            &vec![],
            &env::generate_outputs(),
        )
        .await;
    }
}
