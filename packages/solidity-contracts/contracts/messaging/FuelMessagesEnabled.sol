// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import {FuelMessagePortal} from "../fuelchain/FuelMessagePortal.sol";

/// @title FuelMessagesEnabled
/// @notice Helper contract for contracts sending and receiving messages from Fuel
abstract contract FuelMessagesEnabled {
    ////////////
    // Errors //
    ////////////

    error CallerIsNotPortal();
    error InvalidMessageSender();

    /////////////
    // Storage //
    /////////////

    /// @notice FuelMessagePortal contract used to send and receive messages from Fuel
    FuelMessagePortal internal _fuelMessagePortal;

    ////////////////////////
    // Function Modifiers //
    ////////////////////////

    /// @notice Enforces that the modified function is only callable by the Fuel message portal
    modifier onlyFromPortal() {
        if (msg.sender != address(_fuelMessagePortal)) revert CallerIsNotPortal();
        _;
    }

    /// @notice Enforces that the modified function is only callable by the portal and a specific Fuel account
    /// @param fuelSender The only sender on Fuel which is authenticated to call this function
    modifier onlyFromFuelSender(bytes32 fuelSender) {
        if (msg.sender != address(_fuelMessagePortal)) revert CallerIsNotPortal();
        if (_fuelMessagePortal.messageSender() != fuelSender) revert InvalidMessageSender();
        _;
    }

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Gets the currently set message portal address
    /// @return fuelMessagePortal Fuel message portal address
    function fuelMessagePortal() public view returns (address) {
        return address(_fuelMessagePortal);
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The message receiver address or predicate root
    /// @param data The message data to be sent to the receiver
    function sendMessage(bytes32 recipient, bytes memory data) internal {
        _fuelMessagePortal.sendMessage(recipient, data);
    }

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The message receiver address or predicate root
    /// @param amount The amount of ETH to send with message
    /// @param data The message data to be sent to the receiver
    function sendMessage(bytes32 recipient, uint256 amount, bytes memory data) internal {
        _fuelMessagePortal.sendMessage{value: amount}(recipient, data);
    }

    /// @notice Used by message receiving contracts to get the address on Fuel that sent the message
    function messageSender() internal view returns (bytes32) {
        return _fuelMessagePortal.messageSender();
    }
}
