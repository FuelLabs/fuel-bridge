// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IFuelMessagePortal} from "./IFuelMessagePortal.sol";

/// @title FuelMessagesEnabled
/// @notice Helper contract for contracts sending and receiving messages from Fuel
contract FuelMessagesEnabled {
    ///////////////
    // Constants //
    ///////////////

    /// @notice IFuelMessagePortal contract used to send and receive messages from Fuel
    IFuelMessagePortal public immutable FUEL_MESSAGE_PORTAL;

    ////////////////////////
    // Function Modifiers //
    ////////////////////////

    /// @notice Enforces that the modified function is only callable by the Fuel message portal
    modifier onlyFromPortal() {
        require(msg.sender == address(FUEL_MESSAGE_PORTAL), "Caller is not the portal");
        _;
    }

    /// @notice Enforces that the modified function is only callable by the portal and a specific Fuel account
    /// @param fuelSender The only sender on Fuel which is authenticated to call this function
    modifier onlyFromFuelSender(bytes32 fuelSender) {
        require(msg.sender == address(FUEL_MESSAGE_PORTAL), "Caller is not the portal");
        require(FUEL_MESSAGE_PORTAL.getMessageSender() == fuelSender, "Invalid message sender");
        _;
    }

    /////////////////
    // Constructor //
    /////////////////

    /// @notice Contract constructor to setup immutable values
    /// @param fuelMessagePortal The IFuelMessagePortal contract
    constructor(IFuelMessagePortal fuelMessagePortal) {
        FUEL_MESSAGE_PORTAL = fuelMessagePortal;
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The message receiver address or predicate root
    /// @param data The message data to be sent to the receiver
    function sendMessage(bytes32 recipient, bytes memory data) internal {
        FUEL_MESSAGE_PORTAL.sendMessage(recipient, data);
    }

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The message receiver address or predicate root
    /// @param amount The amount of ETH to send with message
    /// @param data The message data to be sent to the receiver
    function sendMessage(
        bytes32 recipient,
        uint256 amount,
        bytes memory data
    ) internal {
        FUEL_MESSAGE_PORTAL.sendMessage{value: amount}(recipient, data);
    }

    /// @notice Used by message receiving contracts to get the address on Fuel that sent the message
    function getMessageSender() internal view returns (bytes32) {
        return FUEL_MESSAGE_PORTAL.getMessageSender();
    }
}
