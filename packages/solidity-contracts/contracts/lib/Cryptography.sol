// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

/// @notice This is the Fuel protocol cryptography library.
library CryptographyLib {
    /////////////
    // Methods //
    /////////////

    // secp256k1n / 2
    uint256 private constant MAX_SIGNATURE_S_VALUE = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    /// @notice The primary hash method for Fuel.
    /// @param data The bytes input data.
    /// @return The returned hash result.
    function hash(bytes memory data) internal pure returns (bytes32) {
        return sha256(data);
    }
}
