// SPDX-License-Identifier: Apache-2.0
/// @title VerifyBinaryTree
/// @author Fuel Labs
/// @dev This implements verification for the binary trees used by the FuelVM
/// @dev For more details, check:
/// @dev https://github.com/FuelLabs/fuel-specs/blob/master/src/protocol/cryptographic-primitives.md

pragma solidity ^0.8.4;

import {Node} from "./Node.sol";
import {nodeDigest, leafDigest} from "./TreeHasher.sol";
import {pathLengthFromKey, getStartingBit} from "./Utils.sol";

/// @notice Verify if element (key, data) exists in Merkle tree, given data, proof, and root.
/// @param root: The root of the tree in which verify the given leaf
/// @param data: The data of the leaf to verify
/// @param key: The key of the leaf to verify.
/// @param proof: Binary Merkle Proof for the leaf.
/// @param numLeaves: The number of leaves in the tree
/// @return : Whether the proof is valid
/// @dev numLeaves is necessary to determine height of sub-tree containing the data to prove
// solhint-disable-next-line func-visibility
function verifyBinaryTree(
    bytes32 root,
    bytes memory data,
    bytes32[] memory proof,
    uint256 key,
    uint256 numLeaves
) pure returns (bool) {
    // A sibling at height 1 is created by getting the hash of the data to prove.
    return verifyBinaryTreeDigest(root, leafDigest(data), proof, key, numLeaves);
}

/// @notice Verify if element (key, digest) exists in Merkle tree, given digest, proof, and root.
/// @param root: The root of the tree in which verify the given leaf
/// @param digest: The digest of the data of the leaf to verify
/// @param key: The key of the leaf to verify.
/// @param proof: Binary Merkle Proof for the leaf.
/// @param numLeaves: The number of leaves in the tree
/// @return : Whether the proof is valid
/// @dev numLeaves is necessary to determine height of sub-tree containing the data to prove
// solhint-disable-next-line func-visibility
function verifyBinaryTreeDigest(
    bytes32 root,
    bytes32 digest,
    bytes32[] memory proof,
    uint256 key,
    uint256 numLeaves
) pure returns (bool) {
    // Check proof is correct length for the key it is proving
    if (numLeaves <= 1) {
        if (proof.length != 0) {
            return false;
        }
    } else if (proof.length != pathLengthFromKey(key, numLeaves)) {
        return false;
    }

    // Check key is in tree
    if (key >= numLeaves) {
        return false;
    }

    // Null proof is only valid if numLeaves = 1
    // If so, just verify digest is root
    if (proof.length == 0) {
        if (numLeaves == 1) {
            return (root == digest);
        } else {
            return false;
        }
    }

    uint256 height = 1;
    uint256 stableEnd = key;

    // While the current subtree (of height 'height') is complete, determine
    // the position of the next sibling using the complete subtree algorithm.
    // 'stableEnd' tells us the ending index of the last full subtree. It gets
    // initialized to 'key' because the first full subtree was the
    // subtree of height 1, created above (and had an ending index of
    // 'key').

    while (true) {
        // Determine if the subtree is complete. This is accomplished by
        // rounding down the key to the nearest 1 << 'height', adding 1
        // << 'height', and comparing the result to the number of leaves in the
        // Merkle tree.

        uint256 subTreeStartIndex = (key / (1 << height)) * (1 << height);
        uint256 subTreeEndIndex = subTreeStartIndex + (1 << height) - 1;

        // If the Merkle tree does not have a leaf at index
        // 'subTreeEndIndex', then the subtree of the current height is not
        // a complete subtree.
        if (subTreeEndIndex >= numLeaves) {
            break;
        }
        stableEnd = subTreeEndIndex;

        // Determine if the key is in the first or the second half of
        // the subtree.
        if (proof.length <= height - 1) {
            return false;
        }
        if (key - subTreeStartIndex < (1 << (height - 1))) {
            digest = nodeDigest(digest, proof[height - 1]);
        } else {
            digest = nodeDigest(proof[height - 1], digest);
        }

        height += 1;
    }

    // Determine if the next hash belongs to an orphan that was elevated. This
    // is the case IFF 'stableEnd' (the last index of the largest full subtree)
    // is equal to the number of leaves in the Merkle tree.
    if (stableEnd != numLeaves - 1) {
        if (proof.length <= height - 1) {
            return false;
        }
        digest = nodeDigest(digest, proof[height - 1]);
        height += 1;
    }

    // All remaining elements in the proof set will belong to a left sibling\
    // i.e proof sideNodes are hashed in "from the left"
    while (height - 1 < proof.length) {
        digest = nodeDigest(proof[height - 1], digest);
        height += 1;
    }

    return (digest == root);
}
