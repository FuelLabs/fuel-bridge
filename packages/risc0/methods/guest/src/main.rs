#![no_main]

use ethabi::Token;
use risc0_zkvm::guest::env;
use prover_core::{check_transition, Inputs};

risc0_zkvm::guest::entry!(main);

pub fn main() {
    let Inputs {chain_config, target_block, transactions_json, initial_block_json} = env::read();

    let block = check_transition(
        &chain_config,
        &target_block, 
        &transactions_json, 
        &initial_block_json
    );

    env::commit_slice(&ethabi::encode(&[Token::FixedBytes(block.id().as_slice().to_vec())]));
}