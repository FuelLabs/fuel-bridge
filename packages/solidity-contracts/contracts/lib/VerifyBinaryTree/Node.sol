// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.4;

/// @notice Merkle Tree Node structure.
struct Node {
    bytes32 digest;
    // Left child.
    bytes32 leftChildPtr;
    // Right child.
    bytes32 rightChildPtr;
}
