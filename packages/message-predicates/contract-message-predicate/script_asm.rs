use fuel_asm::{op, GTFArgs, RegId};
use sha2::{Digest, Sha256};

const PROCESS_MESSAGE_FUNCTION_SIGNATURE: &str = "process_message(u64)";
const BYTES_PER_INSTR: u16 = 4;

// Gets the bytecode for the message-to-contract script
pub fn bytecode() -> Vec<u8> {
    //calculate function selector
    let mut fn_sel_hasher = Sha256::new();
    fn_sel_hasher.update(PROCESS_MESSAGE_FUNCTION_SIGNATURE);
    let fn_sel_hash: [u8; 32] = fn_sel_hasher.finalize().into();

    //register names
    const REG_MEMORY_START_PTR: u8 = 0x10;
    const REG_ASSET_PTR: u8 = REG_MEMORY_START_PTR;
    const REG_DATA_PTR: u8 = 0x11;
    const REG_DATA_FN_SEL_PTR: u8 = 0x12;
    const REG_CONTRACT_ADDR_PTR: u8 = 0x13;
    const REG_FN_SELECTOR_PTR: u8 = 0x14;
    const REG_MSG_AMOUNT: u8 = 0x15;

    //referenced data start pointer
    const REF_DATA_START_PTR: u16 = 11 * BYTES_PER_INSTR;

    /* The following assembly code is intended to do the following:
     *  - Call the function `process_message` on the contract with ID that matches
     *   the first 32 bytes in the message data field, while forwarding the exact
     *   amount of base asset specified in the `InputMessage` `amount` field
     *
     * note: this code makes the assumption that all memory at VM initialization is set to 0
     */
    let mut script: Vec<u8> = vec![
        //extend stack for contract call data
        op::move_(REG_MEMORY_START_PTR, RegId::SP), //REG_MEMORY_START_PTR = stack pointer
        op::cfei(32 + 32 + 8 + 8), //extends current call frame stack by 32+32+8+8 bytes [base asset id, contract id, param1, param2]
        op::addi(REG_DATA_PTR, REG_MEMORY_START_PTR, 32), //REG_DATA_PTR = REG_MEMORY_START_PTR + 32bytes [memory start pointer + 32]
        op::addi(REG_DATA_FN_SEL_PTR, REG_DATA_PTR, 32 + 4), //REG_DATA_FN_SEL_PTR = REG_DATA_PTR + 32bytes + 4bytes [call data start pointer + 32 + 4]
        //prep call parameters
        op::gtf(
            REG_MSG_AMOUNT,
            RegId::ZERO,
            GTFArgs::InputMessageAmount.into(),
        ), //REG_MSG_AMOUNT = amount value of message from input[0]
        op::gtf(
            REG_CONTRACT_ADDR_PTR,
            RegId::ZERO,
            GTFArgs::InputMessageData.into(),
        ), //REG_CONTRACT_ADDR_PTR = memory location of the message data from input[0]
        op::addi(REG_FN_SELECTOR_PTR, RegId::IS, REF_DATA_START_PTR), //REG_FN_SELECTOR_PTR = function selector at end of program
        op::mcpi(REG_DATA_PTR, REG_CONTRACT_ADDR_PTR, 32), //32 bytes at REG_DATA_PTR = the 32 bytes at REG_CONTRACT_ADDR_PTR
        op::mcpi(REG_DATA_FN_SEL_PTR, REG_FN_SELECTOR_PTR, 4), //4 bytes at REG_DATA_FN_SEL_PTR = the 4 bytes at REG_FN_SELECTOR_PTR
        //make contract call
        op::call(REG_DATA_PTR, REG_MSG_AMOUNT, REG_ASSET_PTR, RegId::CGAS),
        op::ret(RegId::ZERO),
        //referenced data (function selector)
        //00000000
    ]
    .into_iter()
    .collect();

    //add referenced data (function selector)
    script.append(&mut fn_sel_hash[0..4].to_vec());
    script
}
