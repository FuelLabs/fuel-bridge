library;

// A message is encoded as
// 0x00 => CONTRACT_ID
// 0x20 => MESSAGE_TYPE
// 0x40 => TOKEN_ADDRESS
// 0x60 => TOKEN_ID
pub const OFFSET_MESSAGE_TYPE: u64 = 32;
pub const OFFSET_TOKEN_ADDRESS: u64 = OFFSET_MESSAGE_TYPE + 32;
pub const OFFSET_TOKEN_ID: u64 = OFFSET_TOKEN_ADDRESS + 32;

// 0x80 and onwards: payload, with offsets defined as below

// Offsets for a deposit message
pub const OFFSET_FROM: u64 = OFFSET_TOKEN_ID + 32;
pub const OFFSET_TO: u64 = OFFSET_FROM + 32;
pub const OFFSET_AMOUNT: u64 = OFFSET_TO + 32;
pub const OFFSET_DECIMALS: u64 = OFFSET_AMOUNT + 32;

// Offsets for a metadata message
pub const OFFSET_NAME_PTR: u64 = OFFSET_TOKEN_ID + 32;
pub const OFFSET_SYMBOL_PTR: u64 = OFFSET_NAME_PTR + 32;

// Type of messages that can be received
pub const DEPOSIT: u8 = 0;
pub const CONTRACT_DEPOSIT: u8 = 1;
pub const CONTRACT_DEPOSIT_WITH_DATA: u8 = 2;
pub const METADATA: u8 = 3;
