// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {FuelMessagesEnabled} from "../messaging/FuelMessagesEnabled.sol";
import {IFuelMessagePortal} from "../messaging/IFuelMessagePortal.sol";

/// @notice This contract allows for testing message receiving.
contract MessageSendingContract is FuelMessagesEnabled {
    /// @notice Constructor.
    /// @param fuelMessagePortal The IFuelMessagePortal contract
    // solhint-disable-next-line no-empty-blocks
    constructor(IFuelMessagePortal fuelMessagePortal) FuelMessagesEnabled(fuelMessagePortal) {
        //nothing to do
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
    function attemptSendMessageWithAmount(
        bytes32 recipient,
        uint256 amount,
        bytes memory data
    ) external {
        sendMessage(recipient, amount, data);
    }

    /// @notice Default receive function
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {
        // handle incoming eth
    }
}
