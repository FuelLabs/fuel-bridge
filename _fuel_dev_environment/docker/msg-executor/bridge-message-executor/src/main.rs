use chrono::Utc;
use std::env;
use std::str::FromStr;
use std::thread::sleep;
use std::time;
use fuels::client::schema::message::Message;
use fuels::tx::{Receipt, Contract as tx_contract, Output, Bytes32, Input, UtxoId, TxPointer, Word, Transaction, MessageId };
use futures::executor::block_on;
use fuels::prelude::*;
use fuels::signers::fuel_crypto::SecretKey;

const CLIENT_CONNECT_POLL_MILLIS: u64 = 1000;
const MONITOR_POLL_MILLIS: u64 = 500;
const CONTRACT_MESSAGE_MIN_GAS: u64 = 1000000000000; //TODO: 1_200_000;
const CONTRACT_MESSAGE_SCRIPT_BINARY: &str = "./bridge-message-predicates/contract_message_script.bin";
const CONTRACT_MESSAGE_PREDICATE_BINARY: &str = "./bridge-message-predicates/contract_message_predicate.bin";

fn main() {
    // TODO: support accepting arguments via environment variables
    let args: Vec<String> = env::args().collect();

    // TODO: order of the arguments shouldn't matter
    let timeout: u64 = args[2].parse().unwrap();
    let fuel_http = &args[4];
    let executor_key = &args[6];

    // Connect the Fuel provider and create wallet
    let st = startup(timeout, fuel_http, executor_key);
    let (provider, wallet) = block_on(st);

    // Monitor for messages and execute them when found
    let mo = monitor(&provider, &wallet);
    block_on(mo);
}

async fn startup(timeout: u64, fuel_http: &String, executor_key: &String) -> (Provider, WalletUnlocked) {
    // connect to provider
    println!("{} | Attempting to connect to Fuel client...", Utc::now());
    let start = time::Instant::now();
    let mut provider: Provider;
    loop {
        provider = Provider::connect(fuel_http).await.unwrap();
        let info_test = provider.chain_info().await;

        match info_test {
            Ok(_) => {
                println!("{} | Connected to Fuel client!", Utc::now());
                break;
            },
            Err(_) => { }
        }

        if start.elapsed() < time::Duration::from_millis(timeout) {
            sleep(time::Duration::from_millis(CLIENT_CONNECT_POLL_MILLIS));
        } else {
            panic!("Failed to connect to Fuel client before timeout.");
        }
    }

    // create wallet
    let secret = SecretKey::from_str(executor_key).unwrap();
    let wallet = WalletUnlocked::new_from_private_key(secret, Some(provider.clone()));

    (provider, wallet)
}

async fn monitor(provider: &Provider, wallet: &WalletUnlocked) {
    let predicate_bytecode = std::fs::read(CONTRACT_MESSAGE_PREDICATE_BINARY).unwrap();
    let predicate_root = Address::from(*tx_contract::root_from_code(&predicate_bytecode));
    let predicate_root = &Bech32Address::from(predicate_root);
    loop {
        let messages = provider.get_messages(predicate_root).await;
        match messages {
            Ok(messages) => {
                let messages: Vec<Message> = messages.into_iter().filter(|message| message.fuel_block_spend.is_none()).collect();
                for m in messages.iter() {
                    let receipts = execute_message(wallet, m).await;
                    //dbg!(receipts);//////////////////////////////////////////////////////////////////////////////////////////////////////////
                }
            },
            Err(e) => {
                println!("{} | [ERR] There was an error communicating with the Fuel client.", Utc::now());
                println!("{e}");
            }
        }

        sleep(time::Duration::from_millis(MONITOR_POLL_MILLIS));
    }
}

async fn execute_message(
    wallet: &WalletUnlocked,
    message: &Message,
) -> Vec<Receipt> {
    println!("{} | Executing message... ({})", Utc::now(), message.message_id.to_string());

    // find a UTXO that can cover gas costs
    let all_coins = wallet.get_coins(AssetId::default()).await.unwrap();
    let coin_inputs: Vec<Input> = all_coins
        .into_iter()
        .filter(|coin| coin.amount.0 >= CONTRACT_MESSAGE_MIN_GAS)
        .map(|coin| Input::CoinSigned {
            utxo_id: UtxoId::from(coin.utxo_id.clone()),
            owner: Address::from(coin.owner.clone()),
            amount: coin.amount.clone().into(),
            asset_id: AssetId::from(coin.asset_id.clone()),
            tx_pointer: TxPointer::default(),
            witness_index: 0,
            maturity: 0,
        })
        .collect();
    if coin_inputs.len() == 0 {
        println!("{} | [ERR] Provided wallet has no single UTXO that can cover gas costs.", Utc::now());
        return Vec::new();
    }
    let gas_coin: Input = coin_inputs[0].clone();

    // get predicate and script
    let script_bytecode = std::fs::read(CONTRACT_MESSAGE_SCRIPT_BINARY).unwrap();
    let predicate_bytecode = std::fs::read(CONTRACT_MESSAGE_PREDICATE_BINARY).unwrap();

    // parse message data
    let message_data: Vec<u8> = message.data.clone()
        .into_iter()
        .map(|num| num.to_ne_bytes()[0])
        .collect();
    let mut message_data_subset: [u8; 32] = [0; 32];
    for n in 0..32 {
        message_data_subset[n] = message_data[n];
    }
    let contract_id: ContractId = ContractId::from(message_data_subset);

    // build tx list of outputs
    let mut tx_outputs: Vec<Output> = Vec::new();
    tx_outputs.push(Output::Contract {
        input_index: 0u8,
        balance_root: Bytes32::zeroed(),
        state_root: Bytes32::zeroed(),
    });
    tx_outputs.push(Output::Change {
        to: wallet.address().into(),
        amount: 0,
        asset_id: AssetId::default(),
    });
    tx_outputs.push(Output::Variable {
        to: Address::default(),
        amount: Word::default(),
        asset_id: AssetId::default(),
    });

    // start building tx list of inputs
    let mut tx_inputs: Vec<Input> = Vec::new();
    tx_inputs.push(Input::Contract {
        utxo_id: UtxoId::new(Bytes32::zeroed(), 0u8),
        balance_root: Bytes32::zeroed(),
        state_root: Bytes32::zeroed(),
        tx_pointer: TxPointer::default(),
        contract_id: contract_id,
    });
    tx_inputs.push(Input::MessagePredicate {
        message_id: MessageId::from_str(message.message_id.to_string().as_str()).unwrap(),
        sender: Address::from(message.sender.clone()),
        recipient: Address::from(message.recipient.clone()),
        amount: message.amount.clone().into(),
        nonce: message.nonce.clone().into(),
        data: message_data.clone(),
        predicate: predicate_bytecode.clone(),
        predicate_data: vec![],
    });
    tx_inputs.push(gas_coin);

    // create the transaction
    let params = TxParameters::default();
    let mut tx = Transaction::script(
        params.gas_price,
        CONTRACT_MESSAGE_MIN_GAS,
        params.maturity,
        script_bytecode,
        vec![],
        tx_inputs,
        tx_outputs,
        vec![],
    );

    // get provider and client
    let provider = wallet.get_provider().unwrap();

    // sign transaction and call
    wallet.sign_transaction(&mut tx).await.unwrap();
    let result = provider.send_transaction(&mut tx).await;

    match result {
        Ok(receipts) => {
            println!("{} | Message successfully executed! ({})", Utc::now(), message.message_id.to_string());
            receipts
        },
        Err(e) => {
            println!("{} | [ERR] There was an error while executing message.", Utc::now());
            println!("{e}");
            Vec::new()
        },
    }

}
