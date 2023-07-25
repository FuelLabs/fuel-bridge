use fuel_asm::{op, GTFArgs, RegId};

const INPUT_MESSAGE_TYPE: u32 = 2;
const BYTES_PER_INSTR: u16 = 4;

// Gets the bytecode for the message-to-contract predicate
pub fn bytecode() -> Vec<u8> {
    //register names
    const REG_HASH_PTR: u8 = 0x10;
    const REG_SCRIPT_PTR: u8 = 0x11;
    const REG_SCRIPT_LEN: u8 = 0x12;
    const REG_EXPECTED_HASH_PTR: u8 = 0x13;
    const REG_RESULT: u8 = 0x14;
    const REG_VAL_32: u8 = 0x16;
    const REG_INPUT_INDEX: u8 = 0x17;
    const REG_INPUT_TYPE: u8 = 0x18;
    const REG_INPUT_MSG_DATA_LEN: u8 = 0x19;
    const REG_EXPECTED_INPUT_TYPE: u8 = 0x1a;

    //instruction jump points
    const JMP_LOOP_START: u16 = 11;
    const JMP_SKIP_DATA_CHECK: u16 = 16;
    const JMP_PREDICATE_FAILURE: u16 = 18;

    //referenced data start pointer
    const REF_DATA_START_PTR: u16 = 19 * BYTES_PER_INSTR;

    /* The following assembly code is intended to do the following:
     *  -Verify that the script bytecode hash for the transaction matches that of
     *   the expected Message to Contract script
     *  -Verify there are no other `InputMessages` with data in the transaction
     *   other than the first input
     *
     * If these conditions are met, then the predicate evaluates as true.
     */
    let mut predicate: Vec<u8> = vec![
        //extend stack for storing script hash
        op::move_(REG_HASH_PTR, RegId::SP), //REG_HASH_PTR = stack pointer
        op::cfei(32),                       //extends current call frame stack by 32 bytes
        //compute script hash
        op::gtf(REG_SCRIPT_PTR, RegId::ZERO, GTFArgs::Script.into()), //REG_SCRIPT_PTR = script data address
        op::gtf(REG_SCRIPT_LEN, RegId::ZERO, GTFArgs::ScriptLength.into()), //REG_SCRIPT_LEN = script data length
        op::s256(REG_HASH_PTR, REG_SCRIPT_PTR, REG_SCRIPT_LEN), //32bytes at SCRIPT_HASH_PTR = hash of the script
        //compare hash with expected
        op::addi(REG_EXPECTED_HASH_PTR, RegId::IS, REF_DATA_START_PTR), //REG_EXPECTED_HASH_PTR = address of reference data at end of program
        op::movi(REG_VAL_32, 32),                                       //REG_VAL_32 = 32
        op::meq(REG_RESULT, REG_EXPECTED_HASH_PTR, REG_HASH_PTR, REG_VAL_32), //REG_RESULT = if the 32bytes at REG_HASH_PTR equals the 32bytes at REG_EXPECTED_HASH_PTR
        op::jnei(REG_RESULT, RegId::ONE, JMP_PREDICATE_FAILURE), //jumps to PREDICATE_FAILURE if REG_RESULT is not 1
        //confirm that no other messages with data are included
        op::gtf(
            REG_INPUT_INDEX,
            RegId::ZERO,
            GTFArgs::ScriptInputsCount.into(),
        ), //REG_INPUT_INDEX = the number of inputs in the script
        op::movi(REG_EXPECTED_INPUT_TYPE, INPUT_MESSAGE_TYPE), //REG_EXPECTED_INPUT_TYPE = REG_INPUT_MESSAGE_TYPE
        //LOOP_START:
        op::subi(REG_INPUT_INDEX, REG_INPUT_INDEX, 1), //REG_INPUT_INDEX = REG_INPUT_INDEX - 1
        //check if the input is a message input
        op::gtf(REG_INPUT_TYPE, REG_INPUT_INDEX, GTFArgs::InputType.into()), //REG_INPUT_TYPE = the type of input for input[INPUT_INDEX]
        op::jnei(REG_INPUT_TYPE, REG_EXPECTED_INPUT_TYPE, JMP_SKIP_DATA_CHECK), //skips to SKIP_DATA_CHECK if REG_INPUT_TYPE does not equal REG_EXPECTED_INPUT_TYPE
        //check if the input message has data
        op::gtf(
            REG_INPUT_MSG_DATA_LEN,
            REG_INPUT_INDEX,
            GTFArgs::InputMessageDataLength.into(),
        ), //REG_INPUT_MSG_DATA_LEN = the data length of input[INPUT_INDEX]
        op::jnei(REG_INPUT_MSG_DATA_LEN, RegId::ZERO, JMP_PREDICATE_FAILURE), //jumps to PREDICATE_FAILURE if REG_INPUT_MSG_DATA_LEN does not equal 0
        //SKIP_DATA_CHECK:
        op::jnei(REG_INPUT_INDEX, RegId::ONE, JMP_LOOP_START), //jumps back to LOOP_START if REG_INPUT_INDEX does not equal 1
        op::ret(RegId::ONE),
        //PREDICATE_FAILURE:
        op::ret(RegId::ZERO),
        //referenced data (expected script hash)
        //00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
    ]
    .into_iter()
    .collect();

    //add referenced data (expected script hash)
    predicate.append(&mut crate::script_hash().to_vec());
    predicate
}

#[cfg(test)]
mod tests {
    use super::*;

    // Ensure the predicate bytecode doesn't change
    #[test]
    fn snapshot_predicate_bytecode() {
        let bytecode = bytecode();
        let serialized = hex::encode(&bytecode);
        insta::assert_snapshot!(serialized);
    }
}
