// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {FuelBlockHeader, FuelBlockHeaderLib} from "../fuelchain/types/FuelBlockHeader.sol";
import {FuelBlockHeaderLite, FuelBlockHeaderLiteLib} from "../fuelchain/types/FuelBlockHeaderLite.sol";
import {CryptographyLib} from "../lib/Cryptography.sol";

contract FuelBlockHeaderTester {
    using FuelBlockHeaderLib for FuelBlockHeader;
    using FuelBlockHeaderLiteLib for FuelBlockHeaderLite;

    /// @notice Serialize a block application header.
    /// @param header The block header structure.
    /// @return The serialized block application header.
    function _serializeApplicationHeader(FuelBlockHeader memory header) public pure returns (bytes memory) {
        return header.serializeApplicationHeader();
    }

    /// @notice Produce the block application header hash.
    /// @param header The block header structure.
    /// @return The block application header hash.
    function _computeApplicationHeaderHash(FuelBlockHeader memory header) public pure returns (bytes32) {
        return CryptographyLib.hash(header.serializeApplicationHeader());
    }

    /// @notice Serialize a block consensus header.
    /// @param header The block header structure.
    /// @return The serialized block consensus header.
    function _serializeConsensusHeader(FuelBlockHeader memory header) public pure returns (bytes memory) {
        return header.serializeConsensusHeader();
    }

    /// @notice Produce the block consensus header hash.
    /// @param header The block header structure.
    /// @return The block consensus header hash.
    function _computeConsensusHeaderHash(FuelBlockHeader memory header) public pure returns (bytes32) {
        return CryptographyLib.hash(header.serializeConsensusHeader());
    }
}
