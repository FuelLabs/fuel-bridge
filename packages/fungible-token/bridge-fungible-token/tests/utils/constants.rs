pub(crate) const CONTRACT_MESSAGE_PREDICATE_BINARY: &str =
    "../../message-predicates/contract-message-predicate/out/contract_message_predicate.bin";
pub(crate) const MESSAGE_SENDER_ADDRESS: &str =
    "0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe";
pub(crate) const BRIDGE_FUNGIBLE_TOKEN_CONTRACT_BINARY: &str =
    "../bridge-fungible-token/out/release/bridge_fungible_token.bin";
pub(crate) const DEPOSIT_RECIPIENT_CONTRACT_BINARY: &str =
    "../test-deposit-recipient-contract/out/release/test_deposit_recipient_contract.bin";

pub(crate) const BRIDGED_TOKEN: &str =
    "0x00000000000000000000000000000000000000000000000000000000deadbeef";
pub(crate) const BRIDGED_TOKEN_ID: &str =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
pub(crate) const BRIDGED_TOKEN_GATEWAY: &str =
    "0x00000000000000000000000096c53cd98B7297564716a8f2E1de2C83928Af2fe";
pub(crate) const TO: &str = "0x0000000000000000000000000000000000000000000000000000000000000777";
pub(crate) const FROM: &str = "0x0000000000000000000000008888888888888888888888888888888888888888";

pub(crate) const BRIDGED_TOKEN_DECIMALS: u8 = 18;
pub(crate) const PROXY_TOKEN_DECIMALS: u8 = 9;
pub(crate) const PRECISION: u64 = 10u64.pow((BRIDGED_TOKEN_DECIMALS - PROXY_TOKEN_DECIMALS) as u32);

pub(crate) const MESSAGE_AMOUNT: u64 = 100;
