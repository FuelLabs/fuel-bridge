library;

/// A message is encoded as
/// 0x00 => CONTRACT_ID
/// 0x20 => MESSAGE_TYPE
/// 0x28 and onwards: payload, with offsets defined as below
pub const OFFSET_MESSAGE_TYPE: u64 = 32;
pub const OFFSET_TOKEN_ADDRESS: u64 = OFFSET_MESSAGE_TYPE + 1;
pub const OFFSET_TOKEN_ID: u64 = OFFSET_TOKEN_ADDRESS + 32;
pub const OFFSET_FROM: u64 = OFFSET_TOKEN_ID + 32;
pub const OFFSET_TO: u64 = OFFSET_FROM + 32;
pub const OFFSET_AMOUNT: u64 = OFFSET_TO + 32;
pub const OFFSET_DECIMALS: u64 = OFFSET_AMOUNT + 32;
pub const ADDRESS_DEPOSIT_DATA_LEN: u64 = OFFSET_DECIMALS + 1;
pub const CONTRACT_DEPOSIT_WITHOUT_DATA_LEN: u64 = ADDRESS_DEPOSIT_DATA_LEN + 1u64;