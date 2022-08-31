use fuel_crypto::Hasher;
use fuels::contract::script::Script;
use fuels::prelude::*;
use fuels::test_helpers::Config;
use fuels::tx::{AssetId, Bytes32, Contract as tx_contract, Input, Output, Transaction, UtxoId};

abigen!(
    TestContract,
    "../contract-message-test/out/debug/contract_message_test-abi.json"
);

async fn get_balance(provider: &Provider, address: Address, asset: AssetId) -> u64 {
    let balance = provider.get_asset_balance(&address, asset).await.unwrap();
    balance
}

#[tokio::test]
async fn spend_predicate_with_script_constraint() {
    // Set up a wallet
    let native_asset: AssetId = Default::default();
    let mut provider_config = Config::local_node();
    provider_config.predicates = true; // predicates are currently disabled by default
    let wallets = launch_custom_provider_and_get_wallets(
        WalletsConfig::new_single(None, None),
        Some(provider_config),
    )
    .await;
    let wallet = wallets[0].clone();

    // Get provider and client
    let provider = wallet.get_provider().unwrap();
    let client = &provider.client;

    // Get padded bytecode root that must be hardcoded into the predicate to constrain the spending transaction
    let mut script_bytecode =
        std::fs::read("../contract-message-script/out/debug/contract_message_script.bin")
            .unwrap()
            .to_vec();
    let padding = script_bytecode.len() % 8;
    let script_bytecode_unpadded = script_bytecode.clone();
    script_bytecode.append(&mut vec![0; padding]);
    let script_hash = Hasher::hash(&script_bytecode);

    println!("Padded script length: {}", script_bytecode.len());
    println!("Padded script hash   : 0x{:?}", script_hash);

    // Deploy test contract
    let test_contract_id = Contract::deploy(
        "../contract-message-test/out/debug/contract_message_test.bin",
        &wallet,
        TxParameters::default(),
        StorageConfiguration::default(),
    )
    .await
    .unwrap();
    let contract_instance = TestContract::new(test_contract_id.to_string(), wallet.clone());
    println!("Test contract_id   : 0x{:?}", test_contract_id);

    // Get predicate bytecode and root
    let predicate_bytecode =
        std::fs::read("../contract-message-predicate/out/debug/contract_message_predicate.bin")
            .unwrap();
    let predicate_root: [u8; 32] = (*tx_contract::root_from_code(&predicate_bytecode)).into();
    let predicate_root = Address::from(predicate_root);

    // Transfer some coins to the predicate root
    let transfer_amount: u64 = 100;

    let _receipt = wallet
        .transfer(
            &predicate_root,
            transfer_amount,
            native_asset,
            TxParameters::default(),
        )
        .await
        .unwrap();
    let _receipt = wallet
        .transfer(
            &wallet.address(),
            transfer_amount,
            native_asset,
            TxParameters::default(),
        )
        .await
        .unwrap();

    // Check set up completed correctly
    let predicate_balance = get_balance(&provider, predicate_root, native_asset).await;
    assert_eq!(predicate_balance, transfer_amount);

    // Get the predicate coin to spend
    let gas_coin = &provider.get_coins(&wallet.address()).await.unwrap()[0];
    let predicate_coin = &provider.get_coins(&predicate_root).await.unwrap()[0];

    // Configure inputs and outputs to send coins from predicate to receiver

    // Input coin
    let input_coin = Input::CoinSigned {
        utxo_id: UtxoId::from(gas_coin.utxo_id.clone()),
        owner: Address::from(gas_coin.owner.clone()),
        amount: transfer_amount,
        asset_id: AssetId::from(gas_coin.asset_id.clone()),
        witness_index: 0,
        maturity: 0,
    };

    // Input coin (mock message)
    let input_coin_message = Input::CoinPredicate {
        utxo_id: UtxoId::from(predicate_coin.utxo_id.clone()),
        owner: predicate_root,
        amount: transfer_amount,
        asset_id: native_asset,
        maturity: 0,
        predicate: predicate_bytecode,
        predicate_data: vec![],
    };

    // Input contract
    let input_contract = Input::Contract {
        utxo_id: UtxoId::new(Bytes32::zeroed(), 0u8),
        balance_root: Bytes32::zeroed(),
        state_root: Bytes32::zeroed(),
        contract_id: test_contract_id,
    };

    // A variable output for the coin transfer
    let output_variable = Output::Variable {
        to: Address::default(),
        amount: 0,
        asset_id: AssetId::default(),
    };

    // Output contract
    let output_contract = Output::Contract {
        input_index: 2u8,
        balance_root: Bytes32::zeroed(),
        state_root: Bytes32::zeroed(),
    };

    // Output for change
    let output_change = Output::Change {
        to: Address::default(),
        amount: 0,
        asset_id: AssetId::default(),
    };

    // Load more coins for gas
    let mut tx = Transaction::Script {
        gas_price: 0,
        gas_limit: 10_000_000,
        maturity: 0,
        byte_price: 0,
        receipts_root: Default::default(),
        script: script_bytecode_unpadded,
        script_data: vec![],
        inputs: vec![input_coin, input_coin_message, input_contract],
        outputs: vec![output_variable, output_contract, output_change],
        witnesses: vec![],
        metadata: None,
    };
    wallet.sign_transaction(&mut tx).await.unwrap();

    let script = Script::new(tx);
    let _receipts = script.call(&client).await.unwrap();

    // Verify test contract counter was incremented
    let _receipt = wallet
        .transfer(
            &wallet.address(),
            transfer_amount,
            native_asset,
            TxParameters::default(),
        )
        .await
        .unwrap();
    let test_contract_counter = contract_instance
        .get_test_counter()
        .call()
        .await
        .unwrap()
        .value;
    assert_eq!(test_contract_counter, 1);
}
