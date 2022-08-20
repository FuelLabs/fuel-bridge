// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/// @notice Common predicates for Fuel InputMessages
library InputMessagePredicates {
    bytes32 public constant MESSAGE_TO_FUNGIBLE_TOKEN =
        0x609a428d6498d9ddba812cc67c883a53446a1c01bc7388040f1e758b15e1d8bb;
    bytes32 public constant MESSAGE_TO_CONTRACT_GENERIC =
        0x6a1c01bc7388040609a428d6498d9ddba812cc67c8b15e1d8bb883a5344f1e75;
}

/// @notice Structure for proving Fuel OutputMessages
struct OutputMessageProof {
    bytes32 root;
    uint256 key;
    uint256 numLeaves;
    bytes32[] proof;
}

/// @title IFuelMessagePortal
/// @notice The Fuel Message Portal contract sends and receives messages between the EVM and Fuel
interface IFuelMessagePortal {
    ////////////
    // Events //
    ////////////

    /// @notice Emitted when a Message is sent from the EVM to Fuel
    event SentMessage(
        bytes32 indexed sender,
        bytes32 indexed recipient,
        bytes32 owner,
        uint64 nonce,
        uint64 amount,
        bytes data
    );

    ///////////////////////////////
    // Public Functions Outgoing //
    ///////////////////////////////

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The target message receiver
    /// @param owner The owner predicate required to play message
    /// @param data The message data to be sent to the receiver
    function sendMessage(
        bytes32 recipient,
        bytes32 owner,
        bytes memory data
    ) external payable;

    /// @notice Send only ETH to the given recipient
    /// @param recipient The recipient address
    function sendETH(bytes32 recipient) external payable;

    ///////////////////////////////
    // Public Functions Incoming //
    ///////////////////////////////

    /// @notice Relays an incoming message from Fuel
    /// @param sender The address sending the message
    /// @param recipient The receiving address
    /// @param amount The value amount to send with message
    /// @param nonce The message nonce
    /// @param data The ABI of the call to make to the receiver
    /// @param merkleProof Merkle proof to prove this message is valid
    function relayMessage(
        bytes32 sender,
        bytes32 recipient,
        bytes32 nonce,
        uint64 amount,
        bytes calldata data,
        OutputMessageProof calldata merkleProof
    ) external payable;

    /// @notice Used by message receiving contracts to get the address on Fuel that sent the message
    function getMessageSender() external view returns (bytes32);
}
