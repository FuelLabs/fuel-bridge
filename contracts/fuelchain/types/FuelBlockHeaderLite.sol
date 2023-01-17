// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {CryptographyLib} from "../../lib/Cryptography.sol";

/// @title Lightweight Fuel Chain Block Header
/// @dev The Fuel chain block header structure with just a hash of the application header
struct FuelBlockHeaderLite {
    // Merkle root of all previous consensus header hashes (not including this block)
    bytes32 prevRoot;
    // Height of this block
    uint64 height;
    // Time this block was created, in TAI64 format
    uint64 timestamp;
    // Hash of serialized application header for this block
    bytes32 applicationHash;
}

/// @title Block Header Library
/// @dev Provides useful functions for dealing with Fuel blocks
library FuelBlockHeaderLiteLib {
    /////////////
    // Methods //
    /////////////

    /// @notice Serialize a block consensus header.
    /// @param header The block header structure.
    /// @return The serialized block consensus header.
    function serializeConsensusHeader(FuelBlockHeaderLite memory header) internal pure returns (bytes memory) {
        return abi.encodePacked(header.prevRoot, (uint32)(header.height), header.timestamp, header.applicationHash);
    }

    /// @notice Produce the block consensus header hash.
    /// @param header The block header structure.
    /// @return The block consensus header hash.
    function computeConsensusHeaderHash(FuelBlockHeaderLite memory header) internal pure returns (bytes32) {
        return CryptographyLib.hash(serializeConsensusHeader(header));
    }
}
