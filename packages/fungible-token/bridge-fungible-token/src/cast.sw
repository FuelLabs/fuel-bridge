library;

use std::u256::U256;
use std::constants::ZERO_B256;

impl From<b256> for U256 {
    fn from(value: b256) -> U256 {
        let (word1, word2, word3, word4) = asm(r1: value) { r1: (u64, u64, u64, u64) };
        let result = U256::from((word1, word2, word3, word4));

        result
    }

    fn into(self) -> b256 {
        let result: b256 = ZERO_B256;

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
fn test_b256_addition() {
    let one = U256::from((0, 0, 0, 1));
    let two = U256::from((0, 0, 0, 2));

    let addition = one.add(two);
    let three = U256::from((0, 0, 0, 3));

    assert(three == addition);

    let three_b256: b256 = 0x0000000000000000000000000000000000000000000000000000000000000003;

    assert(U256::from(three_b256) == three);
    assert(U256::from(three_b256) == addition);

    let three_into_b256: b256 = three.into();
    assert(three_into_b256 == three_b256);

    let addition_into_b256: b256 = addition.into();
    assert(addition_into_b256 == three_b256);
}

#[test]
fn test_b256_conversion() {
    let u64_max = 0xffffffffffffffff;

    let max = U256::from((u64_max, u64_max, u64_max, u64_max));
    let max_b256: b256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    let max_into_b256: b256 = max.into();
    assert(max_into_b256 == max_b256); // test into
    assert(max == U256::from(max_b256)); // test from
    let random = 0x0123456789abcdef;

    let unsigned = U256::from((random, 0, random, 0));
    let bits: b256 = 0x0123456789abcdef00000000000000000123456789abcdef0000000000000000;

    let unsigned_into_b256: b256 = unsigned.into();
    assert(U256::from(bits) == unsigned);
    assert(unsigned_into_b256 == bits);
}

#[test(should_revert)]
fn test_b256_overflow() {
    let max_b256: b256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    let max = U256::from(max_b256);
    let overflow = max.add(U256::from((0, 0, 0, 1)));
}

#[test(should_revert)]
fn test_b256_underflow() {
    let min_b256: b256 = 0x0000000000000000000000000000000000000000000000000000000000000000;
    let min = U256::from(min_b256);
    let overflow = min.subtract(U256::from((0, 0, 0, 1)));
}
