// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {CryptographyLib} from "../../lib/Cryptography.sol";

/// @title Fuel Chain Block Header
/// @dev The Fuel chain block header structure
struct FuelBlockHeader {
    ///////////////
    // Consensus //
    ///////////////
    // Merkle root of all previous consensus header hashes (not including this block)
    bytes32 prevRoot;
    // Height of this block
    uint32 height;
    // Time this block was created, in TAI64 format
    uint64 timestamp;
    /////////////////
    // Application //
    /////////////////
    //Height of the data availability layer up to which (inclusive) input messages are processed
    uint64 daHeight;
    // Number of transactions in this block
    uint64 txCount;
    // Number of output messages in this block
    uint64 outputMessagesCount;
    // Merkle root of transactions in this block
    bytes32 txRoot;
    // Merkle root of output messages in this block
    bytes32 outputMessagesRoot;
    // Version of consensus parameters
    uint32 consensusParametersVersion;
    // Version of state transition bytecode
    uint32 stateTransitionBytecodeVersion;
}

/// @title Block Header Library
/// @dev Provides useful functions for dealing with Fuel blocks
library FuelBlockHeaderLib {
    /////////////
    // Methods //
    /////////////

    /// @notice Serialize a block application header.
    /// @param header The block header structure.
    /// @return The serialized block application header.
    function serializeApplicationHeader(FuelBlockHeader memory header) internal pure returns (bytes memory) {
        return
            abi.encodePacked(
                header.daHeight,
                header.txCount,
                header.outputMessagesCount,
                header.txRoot,
                header.outputMessagesRoot,
                header.consensusParametersVersion,
                header.stateTransitionBytecodeVersion
            );
    }

    /// @notice Produce the block application header hash.
    /// @param header The block header structure.
    /// @return The block application header hash.
    function computeApplicationHeaderHash(FuelBlockHeader memory header) internal pure returns (bytes32) {
        return CryptographyLib.hash(serializeApplicationHeader(header));
    }

    /// @notice Serialize a block consensus header.
    /// @param header The block header structure.
    /// @return The serialized block consensus header.
    function serializeConsensusHeader(FuelBlockHeader memory header) internal pure returns (bytes memory) {
        return abi.encodePacked(header.prevRoot, header.height, header.timestamp, computeApplicationHeaderHash(header));
    }

    /// @notice Produce the block consensus header hash.
    /// @param header The block header structure.
    /// @return The block consensus header hash.
    function computeConsensusHeaderHash(FuelBlockHeader memory header) internal pure returns (bytes32) {
        return CryptographyLib.hash(serializeConsensusHeader(header));
    }
}
