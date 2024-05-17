use fuel_asm::{op, GTFArgs, RegId};

const PROCESS_MESSAGE_FUNCTION_SIGNATURE: &str = "process_message";
const BYTES_PER_INSTR: u16 = 4;

// Gets the bytecode for the message-to-contract script
pub fn bytecode() -> Vec<u8> {
    let mut fn_selector_bytes =
        fuels::core::codec::encode_fn_selector(PROCESS_MESSAGE_FUNCTION_SIGNATURE);
    const FN_SEL_BYTES_LEN: u16 = 23; // new encoding: len of the function signature as u64 (8 bytes) + 15 bytes of function signature ("process_message" has 15 characters)
    assert_eq!(fn_selector_bytes.len() as u16, FN_SEL_BYTES_LEN);

    //register names
    const REG_MEMORY_START_PTR: u8 = 0x10;
    const REG_DATA_PTR: u8 = 0x11;
    const REG_CONTRACT_ADDR_PTR: u8 = 0x12;
    const REG_FN_SELECTOR_PTR: u8 = 0x13;
    const REG_DATA_FN_SELECTOR_PTR: u8 = 0x14;
    const REG_DATA_CALLDATA_PTR: u8 = 0x15;
    const REG_CALLDATA_PTR: u8 = 0x16;

    //referenced data start pointer
    const REF_DATA_START_PTR: u16 = 13 * BYTES_PER_INSTR;
    
    /* The following assembly code is intended to:
     * Call the function `process_message` on the contract with ID that matches
     * the first 32 bytes in the message data field. It won't forward the possible value
     * stored in the message. L1 entities sending messages here MUST NOT attach
     * a base asset amount, or it will be permanently lost.
     */
    let mut script: Vec<u8> = vec![
        op::move_(REG_MEMORY_START_PTR, RegId::SP), //REG_MEMORY_START_PTR = stack pointer
        op::cfei(32 + 32 + 8 + 8), //extends current call frame stack by 32+32+8+8 bytes [base asset id, contract id, param1, param2]
        op::addi(REG_DATA_PTR, REG_MEMORY_START_PTR, 32), //REG_DATA_PTR = REG_MEMORY_START_PTR + 32bytes [memory start pointer + 32]
        op::gtf(
            REG_CONTRACT_ADDR_PTR,
            RegId::ZERO,
            GTFArgs::InputMessageData.into(),
        ), //REG_CONTRACT_ADDR_PTR = memory location of the message data from input[0]
        op::mcpi(REG_DATA_PTR, REG_CONTRACT_ADDR_PTR, 32), // REG_DATA[0..31] = REG_CONTRACT_ADDR_PTR[0..32]
        op::addi(REG_FN_SELECTOR_PTR, RegId::IS, REF_DATA_START_PTR),
        op::addi(REG_DATA_FN_SELECTOR_PTR, REG_DATA_PTR, 32), // REG_DATA_FN_SELECTOR_PTR = REG_DATA_PTR + 32
        op::sw(REG_DATA_FN_SELECTOR_PTR, REG_FN_SELECTOR_PTR, 0), // REG_DATA[32..39] = (End of IS)[0..7] = (len of "process_message")
        op::addi(REG_CALLDATA_PTR, RegId::IS, REF_DATA_START_PTR + 23), // REG_DATA_FN_SELECTOR_PTR = REG_DATA_PTR + 32 + 23
        op::addi(REG_DATA_CALLDATA_PTR, REG_DATA_PTR, 40), // REG_DATA_FN_SELECTOR_PTR = REG_DATA_PTR + 40
        op::sw(REG_DATA_CALLDATA_PTR, REG_CALLDATA_PTR, 0), // REG_DATA[40..47] = (End of IS)[23..30] = msg_idx = 0
        op::call(REG_DATA_PTR, RegId::ZERO, RegId::ZERO, RegId::CGAS),
        op::ret(RegId::ZERO),
    ]
    .into_iter()
    .collect();

    // At the tail of the script, after the return statement, embed:
    script.append(&mut fn_selector_bytes); // 23 bytes for function selector
    script.append(&mut 0u64.to_be_bytes().to_vec()); // 8 bytes of msg_idx

    script
}
