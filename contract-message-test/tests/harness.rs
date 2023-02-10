mod utils {
    pub mod builder;
    pub mod environment;
}
use utils::builder;

// Test that input messages can be relayed to a contract
// and that the contract can successfully parse the message data
mod success {
    use std::str::FromStr;

    use crate::utils::environment as env;
    use fuels::test_helpers::DEFAULT_COIN_AMOUNT;
    use fuels::tx::{Address, AssetId, Bytes32, ContractId};
    use fuels::types::Bits256;

    pub const RANDOM_SALT: &str =
        "0x1a896ebd5f55c10bc830755278e6d2b9278b4177b8bca400d3e7710eee293786";
    pub const RANDOM_SALT2: &str =
        "0xd5f55c10bc830755278e6d2b9278b4177b8bca401a896eb0d3e7710eee293786";

    #[tokio::test]
    async fn relay_message_with_predicate_and_script_constraint() {
        let data_word = 54321u64;
        let data_bytes = Bits256(Bytes32::from_str(RANDOM_SALT).unwrap().into());
        let data_address = Address::from_str(RANDOM_SALT2).unwrap();
        let mut message_data = data_word.to_be_bytes().to_vec();
        message_data.append(&mut env::decode_hex(RANDOM_SALT));
        message_data.append(&mut env::decode_hex(RANDOM_SALT2));
        let message_data = env::prefix_contract_id(message_data).await;
        let message = (100, message_data);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, test_contract, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        let _receipts = env::relay_message_to_contract(
            &wallet,
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &vec![],
        )
        .await;

        // Verify test contract received the message with the correct data
        let test_contract_id: ContractId = test_contract.contract_id().into();
        let methods = test_contract.methods();
        let test_contract_counter = methods.get_test_counter().call().await.unwrap().value;
        let test_contract_data1 = methods.get_test_data1().call().await.unwrap().value;
        let test_contract_data2 = methods.get_test_data2().call().await.unwrap().value;
        let test_contract_data3 = methods.get_test_data3().call().await.unwrap().value;
        let test_contract_data4 = methods.get_test_data4().call().await.unwrap().value;
        assert_eq!(test_contract_counter, 1);
        assert_eq!(test_contract_data1, test_contract_id);
        assert_eq!(test_contract_data2, data_word);
        assert_eq!(test_contract_data3, data_bytes);
        assert_eq!(test_contract_data4, data_address);

        // Verify the message value was received by the test contract
        let provider = wallet.get_provider().unwrap();
        let test_contract_balance = provider
            .get_contract_asset_balance(test_contract.contract_id(), AssetId::default())
            .await
            .unwrap();
        assert_eq!(test_contract_balance, 100);
    }
}

// Test the cases where the transaction should panic due to the
// predicate script failing to validate the transaction requirements
mod fail {
    use std::str::FromStr;

    use crate::utils::builder;
    use crate::utils::environment as env;
    use fuels::prelude::Salt;
    use fuels::prelude::TxParameters;
    use fuels::test_helpers::DEFAULT_COIN_AMOUNT;
    use fuels::tx::field::GasLimit;
    use fuels::tx::field::GasPrice;
    use fuels::tx::field::Inputs;
    use fuels::tx::field::Maturity;
    use fuels::tx::field::Outputs;
    use fuels::tx::{Address, AssetId, Input, Output, Transaction, TxPointer, UtxoId, Word};

    pub const RANDOM_SALT: &str =
        "0xf55c10bc8307552781a896ebd5e6d2b9278b4177b8bca400d3e7710eee293786";

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_too_many_inputs() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin1 = (1_000_000, AssetId::default());
        let coin2 = (1_000_000, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin1, coin2], vec![message]).await;

        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![coin_inputs[1].clone()],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[contract, message, coin1, coin2], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_missing_input_contract() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin1 = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let coin2 = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, _, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin1, coin2], vec![message]).await;

        let variable_output = Output::Variable {
            to: Address::default(),
            amount: Word::default(),
            asset_id: AssetId::default(),
        };
        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            coin_inputs[1].clone(),
            coin_inputs[0].clone(),
            &vec![],
            &vec![variable_output],
            TxParameters::default(),
        )
        .await;

        // Swap the output contract at the start with the output variable at the end then pop it off
        let outputs_len = tx.outputs().len();
        let outputs = tx.outputs_mut();
        outputs.swap(0, outputs_len - 1);
        outputs.pop();

        // Note: tx inputs[coin2, message, coin1], tx outputs[variable, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_missing_input_message() {
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, _) =
            env::setup_environment(vec![coin], vec![]).await;

        // Transfer coins to a coin with the predicate as an owner
        let (predicate_bytecode, predicate_root) = builder::get_contract_message_predicate().await;
        let _receipt = wallet
            .transfer(
                &predicate_root.into(),
                100,
                AssetId::default(),
                TxParameters::default(),
            )
            .await
            .unwrap();
        let predicate_coin = &wallet
            .get_provider()
            .unwrap()
            .get_coins(&predicate_root.into(), AssetId::default())
            .await
            .unwrap()[0];
        let coin_as_message = Input::CoinPredicate {
            utxo_id: UtxoId::from(predicate_coin.utxo_id.clone()),
            owner: predicate_root,
            amount: 100,
            asset_id: AssetId::default(),
            tx_pointer: TxPointer::default(),
            maturity: 0,
            predicate: predicate_bytecode,
            predicate_data: vec![],
        };
        let mut tx = builder::build_contract_message_tx(
            coin_as_message,
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[contract, coin_message, coin], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_mismatched_contract_ids() {
        let message_data_bad = Salt::from_str(RANDOM_SALT).unwrap().to_vec();
        let message = (100, message_data_bad);
        let coin = (1_000_000, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[contract, message, coin], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_missing_output_contract() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        // Create a variable output to sit in place of the contract input
        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Swap the output contract at the start with the output variable at the end
        let outputs_len = tx.outputs().len();
        let outputs = tx.outputs_mut();
        outputs.swap(0, outputs_len - 1);

        // Note: tx inputs[contract, message, coin], tx outputs[variable, change, contract]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_missing_output_change() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        // Create a variable output to sit in place of the contract input
        let output_variable = Output::Variable {
            to: Address::default(),
            amount: Word::default(),
            asset_id: AssetId::default(),
        };
        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &vec![output_variable],
            TxParameters::default(),
        )
        .await;

        // Swap the output change with the output variable at the end then pop it off
        let outputs_len = tx.outputs().len();
        let outputs = tx.outputs_mut();
        outputs.swap(1, outputs_len - 1);
        outputs.pop();

        // Note: tx inputs[contract, message, coin], tx outputs[contract, variable, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_too_many_outputs() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        // Create 3 output messages to include in tx
        let output_messages: Vec<Output> = (0..7)
            .map(|_i| Output::Message {
                recipient: Address::default(),
                amount: Word::default(),
            })
            .collect();
        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &output_messages,
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[contract, message, coin], tx outputs[contract, change, variable, message1, message2, message3]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "transaction predicate verification failed")]
    async fn relay_message_with_too_little_gas() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin = (1_000_000, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        let mut tx_params = TxParameters::default();
        tx_params.gas_price = 1;
        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &vec![],
            tx_params,
        )
        .await;

        // Note: tx inputs[contract, message, coin], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_message_with_invalid_script() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        let tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            contract_input,
            coin_inputs[0].clone(),
            &vec![],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Modify the script bytecode
        let mut modified_tx = Transaction::script(
            tx.gas_price().clone(),
            tx.gas_limit().clone(),
            tx.maturity().clone(),
            vec![0u8, 1u8, 2u8, 3u8],
            vec![],
            tx.inputs().clone(),
            tx.outputs().clone(),
            vec![],
        );

        // Note: tx inputs[contract, message, coin], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut modified_tx).await;
    }
}
