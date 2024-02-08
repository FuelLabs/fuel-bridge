use ethabi::ParamType;
use methods::{PROVER_ELF, PROVER_ID};
use prover_core::Inputs;
use risc0_zkvm::{default_prover, ExecutorEnv};
use std::{
    io::{BufReader, Read},
    path::PathBuf,
};

const OUTPUT_PARAM_TYPES: [ParamType; 1] = [ParamType::FixedBytes(32)];

#[derive(Parser)]
struct Args {
    path: Option<std::path::PathBuf>,
}

fn main() {
    // Initialize tracing. In order to view logs, run `RUST_LOG=info cargo run`
    env_logger::init();

    let inputs = Inputs {
        chain_config: String::from(include_str!("../../test/res/test_snapshot.json")),
        target_block: String::from(include_str!("../../test/res/test_target_block.json")),
        transactions_json: String::from(include_str!("../../test/res/test_transaction.json")),
        initial_block_json: String::from(""), // TODO
    };

    let env = ExecutorEnv::builder()
        .write(&inputs)
        .unwrap()
        .build()
        .unwrap();

    // Obtain the default prover.
    let prover = default_prover();

    // Produce a receipt by proving the specified ELF binary.
    let receipt = prover.prove(env, PROVER_ELF).unwrap();

    // Optional: Verify receipt to confirm that recipients will also be able to
    // verify your receipt
    receipt.verify(PROVER_ID).unwrap();

    // We can extract the output of the journal
    let out = ethabi::decode(&OUTPUT_PARAM_TYPES, &receipt.journal.bytes).unwrap();

    println!(
        "Block ID: {:?}",
        hex::encode(out[0].clone().into_fixed_bytes().unwrap())
    );

    Ok(())
}
