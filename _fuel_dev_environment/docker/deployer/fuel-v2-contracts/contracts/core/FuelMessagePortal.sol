// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {
    BinaryMerkleTree
} from "@fuel-contracts/merkle-sol/contracts/tree/binary/BinaryMerkleTree.sol";
import {ExcessivelySafeCall} from "../vendor/ExcessivelySafeCall.sol";
import {CryptographyLib} from "../lib/Cryptography.sol";
import {IFuelMessagePortal, OutputMessageProof} from "../messaging/IFuelMessagePortal.sol";

/// @title FuelMessagePortal
/// @notice The Fuel Message Portal contract sends messages to and from Fuel
contract FuelMessagePortal is IFuelMessagePortal, Ownable, Pausable, ReentrancyGuard {
    ///////////////
    // Constants //
    ///////////////

    /// @dev The number of decimals that the base Fuel asset uses
    uint256 public constant FUEL_BASE_ASSET_DECIMALS = 9;
    uint256 public constant ETH_DECIMALS = 18;

    /// @dev The max message data size in bytes
    uint256 public constant MAX_MESSAGE_DATA_SIZE = 2**16;

    /// @dev Non-zero null value to optimize gas costs
    bytes32 internal constant NULL_MESSAGE_SENDER =
        0x000000000000000000000000000000000000000000000000000000000000dead;

    /////////////
    // Storage //
    /////////////

    /// @notice Current message sender for other contracts to reference
    bytes32 internal s_incomingMessageSender;

    /// @notice The waiting period for message root states (in milliseconds)
    uint64 public s_incomingMessageTimelock;

    /// @notice Nonce for the next message to be sent
    uint64 public s_outgoingMessageNonce;

    /// @notice The address allowed to commit new message root states
    address public s_incomingMessageRootCommitter;

    /// @notice The message output roots mapped to the timestamp they were comitted
    mapping(bytes32 => uint256) public s_incomingMessageRoots;

    /// @notice Mapping of message hash to boolean success value
    mapping(bytes32 => bool) public s_incomingMessageSuccessful;

    /////////////////
    // Constructor //
    /////////////////

    /// @notice Contract constructor to setup immutable values and default values
    constructor() Ownable() {
        //outgoing message data
        s_outgoingMessageNonce = 0;

        //incoming message data
        s_incomingMessageSender = NULL_MESSAGE_SENDER;
        s_incomingMessageRootCommitter = msg.sender;
        s_incomingMessageTimelock = 0;
    }

    /////////////////////
    // Admin Functions //
    /////////////////////

    /// @notice Pause outbound messages
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause outbound messages
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Sets the address of the EOA or contract allowed to commit new message root states
    /// @param messageRootCommitter Address of the EOA or contract allowed to commit new message root states
    function setIncomingMessageRootCommitter(address messageRootCommitter) external onlyOwner {
        s_incomingMessageRootCommitter = messageRootCommitter;
    }

    /// @notice Sets the waiting period for message root states
    /// @param messageTimelock The waiting period for message root states (in milliseconds)
    function setIncomingMessageTimelock(uint64 messageTimelock) external onlyOwner {
        s_incomingMessageTimelock = messageTimelock;
    }

    ///////////////////////////////////////////
    // Incoming Messages Committer Functions //
    ///////////////////////////////////////////

    /// @notice Commits a new message output root
    /// @param messageRoot The message root to commit
    function commitMessageRoot(bytes32 messageRoot) external {
        require(s_incomingMessageRootCommitter == msg.sender, "Caller not committer");
        if (s_incomingMessageRoots[messageRoot] == uint256(0)) {
            // solhint-disable-next-line not-rely-on-time
            s_incomingMessageRoots[messageRoot] = block.timestamp;
        }
    }

    ///////////////////////////////////////
    // Incoming Message Public Functions //
    ///////////////////////////////////////

    /// @notice Relays a message published on Fuel
    /// @param sender The address sending the message
    /// @param recipient The receiving address
    /// @param amount The value amount to send with message
    /// @param nonce The message nonce
    /// @param data The ABI of the call to make to the receiver
    /// @param merkleProof Merkle proof to prove this message is valid
    /// @dev Made payable to reduce gas costs
    function relayMessage(
        bytes32 sender,
        bytes32 recipient,
        bytes32 nonce,
        uint64 amount,
        bytes calldata data,
        OutputMessageProof calldata merkleProof
    ) external payable nonReentrant whenNotPaused {
        //calculate message ID and amount sent
        bytes32 messageId =
            CryptographyLib.hash(abi.encodePacked(sender, recipient, nonce, amount, data));
        uint256 messageValue = amount * (10**(ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS));

        //verify the merkle proof root
        uint256 messageRootTimestamp = s_incomingMessageRoots[merkleProof.root];
        require(messageRootTimestamp > 0, "Invalid root");
        // solhint-disable-next-line not-rely-on-time
        require(
            messageRootTimestamp <= block.timestamp - s_incomingMessageTimelock,
            "Root timelocked"
        );

        //verify merkle inclusion proof
        bool messageExists =
            BinaryMerkleTree.verify(
                merkleProof.root,
                abi.encodePacked(messageId),
                merkleProof.proof,
                merkleProof.key,
                merkleProof.numLeaves
            );
        require(messageExists, "Invalid proof");

        //verify message has not already been successfully relayed
        require(!s_incomingMessageSuccessful[messageId], "Message already relayed");

        //make sure we have enough gas to finish after function
        //TODO: revisit these values
        require(gasleft() >= 45000, "Insufficient gas for relay");

        //set message sender for receiving contract to reference
        s_incomingMessageSender = sender;

        //relay message
        (bool success, ) =
            ExcessivelySafeCall.excessivelySafeCall(
                address(uint160(uint256(recipient))),
                gasleft() - 40000,
                messageValue,
                0,
                data
            );

        //make sure relay succeeded
        require(success, "Message relay failed");

        //unset message sender reference
        s_incomingMessageSender = NULL_MESSAGE_SENDER;

        //keep track of successfully relayed messages
        s_incomingMessageSuccessful[messageId] = true;
    }

    ///////////////////////////////////////
    // Outgoing Message Public Functions //
    ///////////////////////////////////////

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The target message receiver
    /// @param data The message data to be sent to the receiver
    /// @param owner The owner predicate required to play message
    function sendMessage(
        bytes32 recipient,
        bytes32 owner,
        bytes memory data
    ) external payable whenNotPaused {
        _sendOutgoingMessage(recipient, owner, data);
    }

    /// @notice Send only ETH to the given recipient
    /// @param recipient The target message receiver
    function sendETH(bytes32 recipient) external payable whenNotPaused {
        _sendOutgoingMessage(recipient, recipient, new bytes(0));
    }

    //////////////////////////////
    // General Public Functions //
    //////////////////////////////

    /// @notice Used by message receiving contracts to get the address on Fuel that sent the message
    /// @return sender the address of the sender on Fuel
    function getMessageSender() external view returns (bytes32) {
        require(s_incomingMessageSender != NULL_MESSAGE_SENDER, "Current message sender not set");
        return s_incomingMessageSender;
    }

    /// @notice Gets the number of decimals used in the Fuel base asset
    /// @return decimals of the Fuel base asset
    function getFuelBaseAssetDecimals() public pure returns (uint8) {
        return uint8(FUEL_BASE_ASSET_DECIMALS);
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Performs all necessary logic to send a message to a target on Fuel
    /// @param recipient The receiving address
    /// @param owner The owner predicate required to play message
    /// @param data The message data to be sent to the receiver
    function _sendOutgoingMessage(
        bytes32 recipient,
        bytes32 owner,
        bytes memory data
    ) private {
        bytes32 sender = bytes32(uint256(uint160(msg.sender)));
        unchecked {
            //make sure data size is not too large
            require(data.length < MAX_MESSAGE_DATA_SIZE, "message-data-too-large");

            //make sure amount fits into the Fuel base asset decimal level
            uint256 precision = 10**(ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS);
            uint256 amount = msg.value / precision;
            if (msg.value > 0) {
                require(amount * precision == msg.value, "amount-precision-incompatability");
                require(amount <= ((2**64) - 1), "amount-precision-incompatability");
            }

            //emit message for Fuel clients to pickup (messageID calculated offchain)
            emit SentMessage(
                sender,
                recipient,
                owner,
                s_outgoingMessageNonce,
                uint64(amount),
                data
            );

            //incriment nonce for next message
            ++s_outgoingMessageNonce;
        }
    }

    /// @notice Default receive function
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {
        // handle incoming eth
    }
}
