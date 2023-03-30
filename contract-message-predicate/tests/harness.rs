mod utils {
    pub mod builder;
    pub mod environment;
}
use utils::builder;

// Test that input messages can be relayed to a contract
// and that the contract can successfully parse the message data
mod success {
    use std::str::FromStr;

    use crate::utils::builder;
    use crate::utils::environment as env;
    use fuels::prelude::TxParameters;
    use fuels::test_helpers::DEFAULT_COIN_AMOUNT;
    use fuels::tx::{Address, AssetId, Bytes32, ContractId};
    use fuels::types::Bits256;

    pub const RANDOM_WORD: u64 = 54321u64;
    pub const RANDOM_WORD2: u64 = 123456u64;
    pub const RANDOM_SALT: &str =
        "0x1a896ebd5f55c10bc830755278e6d2b9278b4177b8bca400d3e7710eee293786";
    pub const RANDOM_SALT2: &str =
        "0xd5f55c10bc830755278e6d2b9278b4177b8bca401a896eb0d3e7710eee293786";
    pub const RANDOM_SALT3: &str =
        "0xd5f55c10bc830755278e6d2b9278b4177b8bca401a896eb0d3e7710eee293786";

    #[tokio::test]
    async fn relay_message_with_predicate_and_script_constraint() {
        let data_word = RANDOM_WORD;
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
            contract_input.clone(),
            coin_inputs[0].clone(),
        )
        .await;

        // Verify test contract received the message with the correct data
        let test_contract_id: ContractId = test_contract.contract_id().into();
        let methods = test_contract.methods();
        let test_contract_counter = methods.test_counter().call().await.unwrap().value;
        let test_contract_data1 = methods.test_data1().call().await.unwrap().value;
        let test_contract_data2 = methods.test_data2().call().await.unwrap().value;
        let test_contract_data3 = methods.test_data3().call().await.unwrap().value;
        let test_contract_data4 = methods.test_data4().call().await.unwrap().value;
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

    #[tokio::test]
    async fn relay_message_with_other_dataless_message_as_input() {
        let data_word = RANDOM_WORD2;
        let data_bytes = Bits256(Bytes32::from_str(RANDOM_SALT2).unwrap().into());
        let data_address = Address::from_str(RANDOM_SALT3).unwrap();

        let message_data1 = env::message_data(RANDOM_WORD2, RANDOM_SALT2, RANDOM_SALT3).await;
        let message1 = (100, message_data1);
        let message2 = (200, vec![]);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, test_contract, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message1, message2]).await;

        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            &vec![
                message_inputs[1].clone(),
                contract_input.clone(),
                coin_inputs[0].clone(),
            ],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[message1, message2, message3, contract, coin], tx outputs[change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;

        // Verify test contract received the message with the correct data
        let test_contract_id: ContractId = test_contract.contract_id().into();
        let methods = test_contract.methods();
        let test_contract_counter = methods.test_counter().call().await.unwrap().value;
        let test_contract_data1 = methods.test_data1().call().await.unwrap().value;
        let test_contract_data2 = methods.test_data2().call().await.unwrap().value;
        let test_contract_data3 = methods.test_data3().call().await.unwrap().value;
        let test_contract_data4 = methods.test_data4().call().await.unwrap().value;
        assert_eq!(test_contract_counter, 1);
        assert_eq!(test_contract_data1, test_contract_id);
        assert_eq!(test_contract_data2, data_word);
        assert_eq!(test_contract_data3, data_bytes);
        assert_eq!(test_contract_data4, data_address);

        // Verify the message valuew were received by the test contract
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
    use fuels::prelude::ScriptTransaction;
    use fuels::prelude::Transaction;
    use fuels::prelude::TxParameters;
    use fuels::test_helpers::DEFAULT_COIN_AMOUNT;
    use fuels::tx::{Address, AssetId, Input, TxPointer, UtxoId};

    pub const RANDOM_WORD: u64 = 54321u64;
    pub const RANDOM_WORD2: u64 = 123456u64;
    pub const RANDOM_SALT: &str =
        "0xf55c10bc8307552781a896ebd5e6d2b9278b4177b8bca400d3e7710eee293786";
    pub const RANDOM_SALT2: &str =
        "0xd5f55c10bc830755278e6d2b9278b4177b8bca401a896eb0d3e7710eee293786";
    pub const RANDOM_SALT3: &str =
        "0xd5f55c10bc830755278e6d2b9278b4177b8bca401a896eb0d3e7710eee293786";

    #[tokio::test]
    #[should_panic(expected = "InputNotFound")]
    async fn relay_message_with_missing_message() {
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, _) =
            env::setup_environment(vec![coin], vec![]).await;

        // Transfer coins to a coin with the predicate as an owner
        let predicate_bytecode = fuel_contract_message_predicate::predicate_bytecode();
        let predicate_root = Address::from(fuel_contract_message_predicate::predicate_root());
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
            &vec![contract_input.clone(), coin_inputs[0].clone()],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[coin_message, contract, coin], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "ContractNotInInputs")]
    async fn relay_message_with_missing_contract() {
        let message_data = env::prefix_contract_id(vec![]).await;
        let message = (100, message_data);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, _, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            &vec![coin_inputs[0].clone()],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[message, coin], tx outputs[change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "ContractNotFound")]
    async fn relay_message_with_wrong_contract() {
        let message_data_bad = Salt::from_str(RANDOM_SALT).unwrap().to_vec();
        let message = (100, message_data_bad);
        let coin = (1_000_000, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message]).await;

        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            &vec![contract_input.clone(), coin_inputs[0].clone()],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[message, contract, coin], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut tx).await;
    }

    #[tokio::test]
    #[should_panic(expected = "The transaction contains a predicate which failed to validate")]
    async fn relay_multiple_messages() {
        let message_data1 = env::message_data(RANDOM_WORD, RANDOM_SALT3, RANDOM_SALT).await;
        let message1 = (100, message_data1);
        let message_data2 = env::message_data(RANDOM_WORD2, RANDOM_SALT2, RANDOM_SALT3).await;
        let message2 = (150, message_data2);
        let message_data3 = env::message_data(RANDOM_WORD, RANDOM_SALT, RANDOM_SALT2).await;
        let message3 = (200, message_data3);
        let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());
        let (wallet, _, contract_input, coin_inputs, message_inputs) =
            env::setup_environment(vec![coin], vec![message1, message2, message3]).await;

        let mut tx = builder::build_contract_message_tx(
            message_inputs[0].clone(),
            &vec![
                message_inputs[1].clone(),
                message_inputs[2].clone(),
                contract_input.clone(),
                coin_inputs[0].clone(),
            ],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Note: tx inputs[message1, message2, message3, contract, coin], tx outputs[change, variable]
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
            &vec![contract_input.clone(), coin_inputs[0].clone()],
            &vec![],
            TxParameters::default(),
        )
        .await;

        // Modify the script bytecode
        let mut modified_tx = ScriptTransaction::new(
            tx.inputs().clone(),
            tx.outputs().clone(),
            TxParameters::default(),
        )
        .with_script(vec![0u8, 1u8, 2u8, 3u8]);

        // Note: tx inputs[message, contract, coin], tx outputs[contract, change, variable]
        let _receipts = env::sign_and_call_tx(&wallet, &mut modified_tx).await;
    }
}
