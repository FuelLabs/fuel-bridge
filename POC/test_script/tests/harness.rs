use fuel_crypto::Hasher;
use fuels::contract::script::Script;
use fuels::prelude::*;
use fuels::test_helpers::Config;
use fuels::tx::{AssetId, Contract, Input, Output, Transaction, UtxoId};

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
    let wallet = &launch_custom_provider_and_get_wallets(
        WalletsConfig::new_single(None, None),
        Some(provider_config),
    )
    .await[0];

    // Get provider and client
    let provider = wallet.get_provider().unwrap();
    let client = &provider.client;

    // Get padded bytecode root that must be hardcoded into the predicate to constrain the spending transaction
    let mut script_bytecode = std::fs::read("../test_script/out/debug/test-script.bin")
        .unwrap()
        .to_vec();
    let padding = script_bytecode.len() % 8;
    let script_bytecode_unpadded = script_bytecode.clone();
    script_bytecode.append(&mut vec![0; padding]);
    let script_hash = Hasher::hash(&script_bytecode);

    println!("Padded script length: {}", script_bytecode.len());
    println!("Padded script hash   : 0x{:?}", script_hash);

    // Get predicate bytecode and root
    let predicate_bytecode =
        std::fs::read("../test_predicate/out/debug/test-predicate.bin").unwrap();
    let predicate_root: [u8; 32] = (*Contract::root_from_code(&predicate_bytecode)).into();
    let predicate_root = Address::from(predicate_root);

    // Transfer some coins to the predicate root
    let transfer_amount: u64 = 1000;

    let _receipt = wallet
        .transfer(
            &predicate_root,
            transfer_amount,
            native_asset,
            TxParameters::default(),
        )
        .await
        .unwrap();

    // Check set up completed correctly
    let mut predicate_balance = get_balance(&provider, predicate_root, native_asset).await;
    assert_eq!(predicate_balance, transfer_amount);

    // Get the predicate coin to spend
    let predicate_coin = &provider.get_coins(&predicate_root).await.unwrap()[0];

    // Specify the address receiving the coin output
    let receiver_address = Address::new([1u8; 32]);

    // Configure inputs and outputs to send coins from predicate to receiver

    // This is the coin belonging to the predicate root
    let input_predicate = Input::CoinPredicate {
        utxo_id: UtxoId::from(predicate_coin.utxo_id.clone()),
        owner: predicate_root,
        amount: transfer_amount,
        asset_id: native_asset,
        maturity: 0,
        predicate: predicate_bytecode,
        predicate_data: vec![],
    };

    // A variable output for the coin transfer
    let output_variable = Output::Variable {
        to: receiver_address,
        amount: 0,
        asset_id: AssetId::default(),
    };

    // Output for change
    let output_change = Output::Change {
        to: Address::default(),
        amount: 0,
        asset_id: AssetId::default(),
    };

    let tx = Transaction::Script {
        gas_price: 0,
        gas_limit: 10_000_000,
        maturity: 0,
        byte_price: 0,
        receipts_root: Default::default(),
        script: script_bytecode_unpadded,
        script_data: vec![],
        inputs: vec![input_predicate],
        outputs: vec![output_variable, output_change],
        witnesses: vec![],
        metadata: None,
    };

    let script = Script::new(tx);

    let _receipts = script.call(&client).await.unwrap();

    predicate_balance = get_balance(&provider, predicate_root, native_asset).await;
    let receiver_balance = get_balance(&provider, receiver_address, native_asset).await;

    assert_eq!(predicate_balance, 0);
    assert_eq!(receiver_balance, 1000);
}
