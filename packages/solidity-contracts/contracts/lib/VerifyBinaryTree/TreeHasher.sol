// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.4;

import {CryptographyLib} from "../Cryptography.sol";
import {Constants} from "./Constants.sol";
import {Node} from "./Node.sol";

/// @notice hash some data
/// @param data: The data to be hashed
// solhint-disable-next-line func-visibility
function hash(bytes memory data) pure returns (bytes32) {
    return CryptographyLib.hash(data);
}

/// @notice Calculate the digest of a node
/// @param left : The left child
/// @param right: The right child
/// @return digest : The node digest
// solhint-disable-next-line func-visibility
function nodeDigest(bytes32 left, bytes32 right) pure returns (bytes32 digest) {
    digest = hash(abi.encodePacked(Constants.NODE_PREFIX, left, right));
}

/// @notice Calculate the digest of a leaf
/// @param data : The data of the leaf
/// @return digest : The leaf digest
// solhint-disable-next-line func-visibility
function leafDigest(bytes memory data) pure returns (bytes32 digest) {
    digest = hash(abi.encodePacked(Constants.LEAF_PREFIX, data));
}
