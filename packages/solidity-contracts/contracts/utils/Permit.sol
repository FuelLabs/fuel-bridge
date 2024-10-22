// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

/// @notice Structure for erc20 token permit signature
struct PermitSignature {
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
}
