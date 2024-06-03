// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.4;

library Constants {
    ///////////////
    // Constants //
    ///////////////

    /// @dev Maximum tree height
    uint256 internal constant MAX_HEIGHT = 256;

    /// @dev Empty node hash
    bytes32 internal constant EMPTY = sha256("");

    /// @dev Default value for sparse Merkle tree node
    bytes32 internal constant ZERO = bytes32(0);

    /// @dev The null pointer
    bytes32 internal constant NULL = bytes32(0);

    /// @dev The prefixes of leaves and nodes
    bytes1 internal constant LEAF_PREFIX = 0x00;
    bytes1 internal constant NODE_PREFIX = 0x01;
}
