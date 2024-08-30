library;

use std::bytes::Bytes;

/// Encode the data to be passed out of the contract when sending a message
pub fn encode_data(to: b256, amount: b256, bridged_token: b256, token_id: b256) -> Bytes {
    // capacity is 4 + 32 + 32 + 32 + 32 = 132
    let mut data = Bytes::with_capacity(132);

    // first, we push the selector 1 byte at a time
    // the function selector for finalizeWithdrawal on the base layer gateway contract:
    // finalizeWithdrawal(address,address,uint256,uint256) = 0x64a7fad9
    data.push(0x64u8);
    data.push(0xa7u8);
    data.push(0xfau8);
    data.push(0xd9u8);

    data.append(Bytes::from(to));
    data.append(Bytes::from(bridged_token));
    data.append(Bytes::from(amount));
    data.append(Bytes::from(token_id));

    data
}
