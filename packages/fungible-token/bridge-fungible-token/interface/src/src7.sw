library;

use std::{bytes::Bytes, string::String};

pub enum Metadata {
    B256: b256,
    Bytes: Bytes,
    Int: u64,
    String: String,
}

abi SRC7 {
    #[storage(read)]
    fn metadata(asset: AssetId, key: String) -> Option<Metadata>;
}
