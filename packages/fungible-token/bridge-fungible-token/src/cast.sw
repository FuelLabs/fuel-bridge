library;

use std::u256::U256;
use std::constants::ZERO_B256;

impl From<b256> for U256 {
    fn from(value: b256) -> Self {
        let (word1, word2, word3, word4) = asm(r1: value) { r1: (u64, u64, u64, u64) };
        let result = U256::from((word1, word2, word3, word4));

        result
    }

    fn into(self) -> b256 {
        let result = b256::min();

        asm(output: result, r1: self.a, r2: self.b, r3: self.c, r4: self.d) {
            sw   output r1 i0; // store the word in r1 in output + 0 words
            sw   output r2 i1; // store the word in r2 in output + 1 word
            sw   output r3 i2; // store the word in r3 in output + 1 word
            sw   output r4 i3; // store the word in r4 in output + 1 word
        }

        result
    }
}

#[test]
fn test_b256_from() {
    // Test the boundary conditions: min, middle, max
    let min = b256::min();
    let middle = 0x000000000000000000000000000000000000000000000000000000000000000a;
    let max = b256::max();

    // Alternatively, compare each field of the U256
    assert_eq(U256::from(min), U256::from((0, 0, 0, 0)));
    assert_eq(U256::from(middle), U256::from((0, 0, 0, 10)));
    assert_eq(U256::from(max), U256::from((u64::max(), u64::max(), u64::max(), u64::max())));
}

#[test]
fn test_b256_into() {
    // Test the boundary conditions: min, middle, max
    let min = U256::from((0, 0, 0, 0));
    let middle = U256::from((0, 0, 0, 10));
    let max = U256::from((u64::max(), u64::max(), u64::max(), u64::max()));

    let min_into_b256: b256 = min.into();
    let middle_into_b256: b256 = middle.into();
    let max_into_b256: b256 = max.into();

    assert(min_into_b256 == b256::min());
    assert(middle_into_b256 == 0x000000000000000000000000000000000000000000000000000000000000000a);
    assert(max_into_b256 == b256::max());
}
