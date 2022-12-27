// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/// @notice Common predicates for Fuel InputMessages
library InputMessagePredicates {
    bytes32 public constant CONTRACT_MESSAGE_PREDICATE =
        0xc453f2ed45abb180e0a17aa88e78941eb8169c5f949ee218b45afcb0cfd2c0a8;
}

/// @title IFuelMessagePortal
/// @notice The Fuel Message Portal contract sends and receives messages between the EVM and Fuel
interface IFuelMessagePortal {
    ////////////
    // Events //
    ////////////

    /// @notice Emitted when a Message is sent from the EVM to Fuel
    event SentMessage(bytes32 indexed sender, bytes32 indexed recipient, uint64 nonce, uint64 amount, bytes data);

    ///////////////////////////////
    // Public Functions Outgoing //
    ///////////////////////////////

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The message receiver address or predicate root
    /// @param data The message data to be sent to the receiver
    function sendMessage(bytes32 recipient, bytes memory data) external payable;

    /// @notice Send only ETH to the given recipient
    /// @param recipient The recipient address
    function depositETH(bytes32 recipient) external payable;

    ///////////////////////////////
    // Public Functions Incoming //
    ///////////////////////////////

    /// @notice Used by message receiving contracts to get the address on Fuel that sent the message
    function messageSender() external view returns (bytes32);
}
