mod utils {
    pub mod environment;
    pub mod ext_fuel_core;
    pub mod ext_sdk_provider;
}
use std::str::FromStr;

use utils::environment as env;
use utils::ext_fuel_core;
use utils::ext_sdk_provider;

use fuels::test_helpers::DEFAULT_COIN_AMOUNT;
use fuels::tx::{Address, AssetId, Bytes32, ContractId};

pub const RANDOM_SALT: &str = "0x1a896ebd5f55c10bc830755278e6d2b9278b4177b8bca400d3e7710eee293786";
pub const RANDOM_SALT2: &str = "0xd5f55c10bc830755278e6d2b9278b4177b8bca401a896eb0d3e7710eee293786";

///////////////////
// SUCCESS CASES //
///////////////////

#[tokio::test]
async fn relay_message_with_predicate_and_script_constraint() {
    let data_word = 54321u64;
    let data_bytes = Bytes32::from_str(RANDOM_SALT).unwrap();
    let data_address = Address::from_str(RANDOM_SALT2).unwrap();
    let mut message_data = data_word.to_be_bytes().to_vec();
    message_data.append(&mut env::decode_hex(RANDOM_SALT));
    message_data.append(&mut env::decode_hex(RANDOM_SALT2));
    let message_data = env::prefix_contract_id(message_data).await;
    let message = (100, message_data);
    let coin = (DEFAULT_COIN_AMOUNT, AssetId::default());

    // Set up the environment
    let (wallet, test_contract, contract_input, coin_inputs, message_inputs) =
        env::setup_environment(vec![coin], vec![message]).await;

    // Relay the test message to the test contract
    let _receipts = env::relay_message_to_contract(
        &wallet,
        message_inputs[0].clone(),
        contract_input,
        &coin_inputs[..],
        &vec![],
        &vec![],
    )
    .await;

    // Verify test contract received the message
    let test_contract_counter = test_contract.get_test_counter().call().await.unwrap().value;
    assert_eq!(test_contract_counter, 1);

    // Verify test contract received the correct data
    let test_contract_id: ContractId = test_contract._get_contract_id().into();
    let test_contract_data1 = test_contract.get_test_data1().call().await.unwrap().value;
    assert_eq!(test_contract_data1, test_contract_id);
    let test_contract_data2 = test_contract.get_test_data2().call().await.unwrap().value;
    assert_eq!(test_contract_data2, data_word);
    let test_contract_data3 = test_contract.get_test_data3().call().await.unwrap().value;
    assert_eq!(test_contract_data3, data_bytes.to_vec()[..]);
    let test_contract_data4 = test_contract.get_test_data4().call().await.unwrap().value;
    assert_eq!(test_contract_data4, data_address);

    // Verify the message value was received by the test contract
    let provider = wallet.get_provider().unwrap();
    let test_contract_balance = provider
        .get_contract_asset_balance(test_contract._get_contract_id(), AssetId::default())
        .await
        .unwrap();
    assert_eq!(test_contract_balance, 100);
}
