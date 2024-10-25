// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {FuelMessagesEnabled} from "../messaging/FuelMessagesEnabled.sol";
import {FuelMessagePortal} from "../fuelchain/FuelMessagePortal.sol";

/// @notice This contract allows for testing message receiving.
contract MessageTester is FuelMessagesEnabled {
    bytes32 internal constant TRUSTED_SENDER = 0xf40001353a6b162f0ff9d59cae46ed49355aa4c424e3f79f6d84352f85715576;

    /// @notice Storage to hold and test incoming data
    uint256 public data1;
    uint256 public data2;

    /// @notice Constructor.
    /// @param fuelMessagePortal The FuelMessagePortal contract
    constructor(FuelMessagePortal fuelMessagePortal) {
        _fuelMessagePortal = fuelMessagePortal;
    }

    /// @notice Message receiving function.
    /// @param d1 Test param 1
    /// @param d2 Test param 2
    function receiveMessage(uint256 d1, uint256 d2) external payable onlyFromFuelSender(TRUSTED_SENDER) {
        data1 = d1;
        data2 = d2;
    }

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The target message receiver
    /// @param data The message data to be sent to the receiver
    function attemptSendMessage(bytes32 recipient, bytes memory data) external {
        sendMessage(recipient, data);
    }

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The target message receiver
    /// @param amount The amount of ETH to send with message
    /// @param data The message data to be sent to the receiver
    function attemptSendMessageWithAmount(bytes32 recipient, uint256 amount, bytes memory data) external {
        sendMessage(recipient, amount, data);
    }

    /// @notice Gets the address of the trusted message sender.
    /// @return Address of the trusted message sender
    function getTrustedSender() external pure returns (bytes32) {
        return TRUSTED_SENDER;
    }

    /// @notice Default receive function
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {
        // handle incoming eth
    }
}
