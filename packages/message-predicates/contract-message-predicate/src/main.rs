use fuel_tx::{Address, Bytes32, ConsensusParameters};

fn main() {
    //get predicate and script bytecode
    let script = fuel_contract_message_predicate::script_bytecode();
    let predicate = fuel_contract_message_predicate::predicate_bytecode();

    //output to console and build files
    let script_hash = fuel_contract_message_predicate::script_hash();
    let predicate_root =
        fuel_contract_message_predicate::predicate_root(&ConsensusParameters::default());
    println!("Script bytecode size is {} bytes.", script.len());
    println!("Script hash: 0x{}", Bytes32::from(script_hash));
    println!("Predicate bytecode size is {} bytes.", predicate.len());
    println!("Predicate root: 0x{}", Address::from(predicate_root));
}
