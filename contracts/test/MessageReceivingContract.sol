// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {
    BinaryMerkleProof
} from "@fuel-contracts/merkle-sol/contracts/tree/binary/BinaryMerkleProof.sol";
import {FuelMessagesEnabled} from "../messaging/FuelMessagesEnabled.sol";
import {IFuelMessagePortal} from "../messaging/IFuelMessagePortal.sol";

/// @notice This contract allows for testing message receiving.
contract MessageReceivingContract is FuelMessagesEnabled {
    bytes32 internal constant TRUSTED_SENDER =
        0xf40001353a6b162f0ff9d59cae46ed49355aa4c424e3f79f6d84352f85715576;

    /// @notice Storage to hold and test incoming data
    uint256 public data1;
    uint256 public data2;

    /// @notice Constructor.
    /// @param fuelMessagePortal The IFuelMessagePortal contract
    // solhint-disable-next-line no-empty-blocks
    constructor(IFuelMessagePortal fuelMessagePortal) FuelMessagesEnabled(fuelMessagePortal) {
        //nothing to do
    }

    /// @notice Message receiving function.
    /// @param d1 Test param 1
    /// @param d2 Test param 2
    function receiveMessage(uint256 d1, uint256 d2)
        external
        payable
        onlyFromFuelSender(TRUSTED_SENDER)
    {
        data1 = d1;
        data2 = d2;
    }

    /// @notice Gets the address of the trusted message sender.
    /// @return Address of the trusted message sender
    function getTrustedSender() external pure returns (bytes32) {
        return TRUSTED_SENDER;
    }
}
