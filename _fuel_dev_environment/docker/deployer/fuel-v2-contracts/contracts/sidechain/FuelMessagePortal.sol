// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {
    BinaryMerkleTree
} from "@fuel-contracts/merkle-sol/contracts/tree/binary/BinaryMerkleTree.sol";
import {FuelSidechainConsensus} from "./FuelSidechainConsensus.sol";
import {SidechainBlockHeader, SidechainBlockHeaderLib} from "./types/SidechainBlockHeader.sol";
import {
    SidechainBlockHeaderLite,
    SidechainBlockHeaderLiteLib
} from "./types/SidechainBlockHeaderLite.sol";
import {ExcessivelySafeCall} from "../vendor/ExcessivelySafeCall.sol";
import {CryptographyLib} from "../lib/Cryptography.sol";
import {IFuelMessagePortal} from "../messaging/IFuelMessagePortal.sol";

/// @notice Structure for proving an element in a merkle tree
struct MerkleProof {
    uint256 key;
    bytes32[] proof;
}

/// @notice Structure containing all message details
struct Message {
    bytes32 sender;
    bytes32 recipient;
    bytes32 nonce;
    uint64 amount;
    bytes data;
}

/// @title FuelMessagePortal
/// @notice The Fuel Message Portal contract sends messages to and from Fuel
contract FuelMessagePortal is IFuelMessagePortal, Ownable, Pausable, ReentrancyGuard {
    using SidechainBlockHeaderLib for SidechainBlockHeader;
    using SidechainBlockHeaderLiteLib for SidechainBlockHeaderLite;

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

    /// @dev The Fuel sidechain consensus contract
    FuelSidechainConsensus public immutable SIDECHAIN_CONSENSUS;

    /////////////
    // Storage //
    /////////////

    /// @notice Current message sender for other contracts to reference
    bytes32 internal s_incomingMessageSender;

    /// @notice The waiting period for message root states (in milliseconds)
    uint64 public s_incomingMessageTimelock;

    /// @notice Nonce for the next message to be sent
    uint64 public s_outgoingMessageNonce;

    /// @notice Mapping of message hash to boolean success value
    mapping(bytes32 => bool) public s_incomingMessageSuccessful;

    /////////////////
    // Constructor //
    /////////////////

    /// @notice Contract constructor to setup immutable values and default values
    constructor(FuelSidechainConsensus sidechainConsensus) Ownable() {
        SIDECHAIN_CONSENSUS = sidechainConsensus;

        //outgoing message data
        s_outgoingMessageNonce = 0;

        //incoming message data
        s_incomingMessageSender = NULL_MESSAGE_SENDER;
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

    /// @notice Sets the waiting period for message root states
    /// @param messageTimelock The waiting period for message root states (in milliseconds)
    function setIncomingMessageTimelock(uint64 messageTimelock) external onlyOwner {
        s_incomingMessageTimelock = messageTimelock;
    }

    ///////////////////////////////////////
    // Incoming Message Public Functions //
    ///////////////////////////////////////

    /// @notice Relays a message published on Fuel from a given block
    /// @param message The message to relay
    /// @param blockHeader The block containing the message
    /// @param messageInBlockProof Proof that message exists in block
    /// @param poaSignature Authority signature proving block validity
    /// @dev Made payable to reduce gas costs
    function relayMessageFromFuelBlock(
        Message calldata message,
        SidechainBlockHeader calldata blockHeader,
        MerkleProof calldata messageInBlockProof,
        bytes calldata poaSignature
    ) external payable nonReentrant whenNotPaused {
        //verify block header
        require(
            SIDECHAIN_CONSENSUS.verifyBlock(blockHeader.computeConsensusHeaderHash(), poaSignature),
            "Invalid block"
        );

        //execute message
        _executeMessageInHeader(message, blockHeader, messageInBlockProof);
    }

    /// @notice Relays a message published on Fuel from a given block
    /// @param message The message to relay
    /// @param rootBlockHeader The root block for proving chain history
    /// @param blockHeader The block containing the message
    /// @param blockInHistoryProof Proof that the message block exists in the history of the root block
    /// @param messageInBlockProof Proof that message exists in block
    /// @param poaSignature Authority signature proving block validity
    /// @dev Made payable to reduce gas costs
    function relayMessageFromPrevFuelBlock(
        Message calldata message,
        SidechainBlockHeaderLite calldata rootBlockHeader,
        SidechainBlockHeader calldata blockHeader,
        MerkleProof calldata blockInHistoryProof,
        MerkleProof calldata messageInBlockProof,
        bytes calldata poaSignature
    ) external payable nonReentrant whenNotPaused {
        //verify root block header
        require(
            SIDECHAIN_CONSENSUS.verifyBlock(
                rootBlockHeader.computeConsensusHeaderHash(),
                poaSignature
            ),
            "Invalid root block"
        );

        //verify block in history
        require(
            BinaryMerkleTree.verify(
                rootBlockHeader.prevRoot,
                abi.encodePacked(blockHeader.computeConsensusHeaderHash()),
                blockInHistoryProof.proof,
                blockInHistoryProof.key,
                rootBlockHeader.height - 1
            ),
            "Invalid block in history proof"
        );

        //execute message
        _executeMessageInHeader(message, blockHeader, messageInBlockProof);
    }

    ///////////////////////////////////////
    // Outgoing Message Public Functions //
    ///////////////////////////////////////

    /// @notice Send a message to a recipient on Fuel
    /// @param recipient The target message receiver address or predicate root
    /// @param data The message data to be sent to the receiver
    function sendMessage(bytes32 recipient, bytes memory data) external payable whenNotPaused {
        _sendOutgoingMessage(recipient, data);
    }

    /// @notice Send only ETH to the given recipient
    /// @param recipient The target message receiver
    function sendETH(bytes32 recipient) external payable whenNotPaused {
        _sendOutgoingMessage(recipient, new bytes(0));
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
    /// @param recipient The message receiver address or predicate root
    /// @param data The message data to be sent to the receiver
    function _sendOutgoingMessage(bytes32 recipient, bytes memory data) private {
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
            emit SentMessage(sender, recipient, s_outgoingMessageNonce, uint64(amount), data);

            // increment nonce for next message
            ++s_outgoingMessageNonce;
        }
    }

    /// @notice Executes a message in the given header
    /// @param message The message to execute
    /// @param blockHeader The block containing the message
    /// @param messageInBlockProof Proof that message exists in block
    function _executeMessageInHeader(
        Message calldata message,
        SidechainBlockHeader calldata blockHeader,
        MerkleProof calldata messageInBlockProof
    ) private {
        //verify message validity
        bytes32 messageId =
            CryptographyLib.hash(
                abi.encodePacked(
                    message.sender,
                    message.recipient,
                    message.nonce,
                    message.amount,
                    message.data
                )
            );
        require(!s_incomingMessageSuccessful[messageId], "Already relayed");
        require(
            // solhint-disable-next-line not-rely-on-time
            (blockHeader.timestamp - 4611686018427387914) <=
                (block.timestamp - s_incomingMessageTimelock),
            "Timelock not elapsed"
        );

        //verify message in block
        require(
            BinaryMerkleTree.verify(
                blockHeader.outputMessagesRoot,
                abi.encodePacked(messageId),
                messageInBlockProof.proof,
                messageInBlockProof.key,
                blockHeader.outputMessagesCount
            ),
            "Invalid message in block proof"
        );

        //make sure we have enough gas to finish after function
        //TODO: revisit these values
        require(gasleft() >= 45000, "Insufficient gas for relay");

        //set message sender for receiving contract to reference
        s_incomingMessageSender = message.sender;

        //relay message
        (bool success, ) =
            ExcessivelySafeCall.excessivelySafeCall(
                address(uint160(uint256(message.recipient))),
                gasleft() - 40000,
                message.amount * (10**(ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS)),
                0,
                message.data
            );

        //make sure relay succeeded
        require(success, "Message relay failed");

        //unset message sender reference
        s_incomingMessageSender = NULL_MESSAGE_SENDER;

        //keep track of successfully relayed messages
        s_incomingMessageSuccessful[messageId] = true;
    }

    /// @notice Default receive function
    // solhint-disable-next-line no-empty-blocks
    receive() external payable {
        // handle incoming eth
    }
}
