// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {verifyBinaryTree} from "@fuel-contracts/merkle-sol/contracts/tree/binary/BinaryMerkleTree.sol";
import {FuelSidechainConsensus} from "./FuelSidechainConsensus.sol";
import {SidechainBlockHeader, SidechainBlockHeaderLib} from "./types/SidechainBlockHeader.sol";
import {SidechainBlockHeaderLite, SidechainBlockHeaderLiteLib} from "./types/SidechainBlockHeaderLite.sol";
import {SafeCall} from "../vendor/SafeCall.sol";
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
contract FuelMessagePortal is
    IFuelMessagePortal,
    Initializable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SidechainBlockHeaderLib for SidechainBlockHeader;
    using SidechainBlockHeaderLiteLib for SidechainBlockHeaderLite;

    ///////////////
    // Constants //
    ///////////////

    /// @dev The admin related contract roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @dev The number of decimals that the base Fuel asset uses
    uint256 public constant FUEL_BASE_ASSET_DECIMALS = 9;
    uint256 public constant ETH_DECIMALS = 18;

    /// @dev The max message data size in bytes
    uint256 public constant MAX_MESSAGE_DATA_SIZE = 2 ** 16;

    /// @dev Non-zero null value to optimize gas costs
    bytes32 internal constant NULL_MESSAGE_SENDER = 0x000000000000000000000000000000000000000000000000000000000000dead;

    /////////////
    // Storage //
    /////////////

    /// @notice Current message sender for other contracts to reference
    bytes32 internal _incomingMessageSender;

    /// @notice The Fuel sidechain consensus contract
    FuelSidechainConsensus private _sidechainConsensus;

    /// @notice The waiting period for message root states (in milliseconds)
    uint64 private _incomingMessageTimelock;

    /// @notice Nonce for the next message to be sent
    uint64 private _outgoingMessageNonce;

    /// @notice Mapping of message hash to boolean success value
    mapping(bytes32 => bool) private _incomingMessageSuccessful;

    /////////////////////////////
    // Constructor/Initializer //
    /////////////////////////////

    /// @notice Constructor disables initialization for the implementation contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Contract initializer to setup starting values
    /// @param sidechainConsensus Consensus contract
    function initialize(FuelSidechainConsensus sidechainConsensus) public initializer {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        //grant initial roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        //consensus contract
        _sidechainConsensus = sidechainConsensus;

        //outgoing message data
        _outgoingMessageNonce = 0;

        //incoming message data
        _incomingMessageSender = NULL_MESSAGE_SENDER;
        _incomingMessageTimelock = 0;
    }

    /////////////////////
    // Admin Functions //
    /////////////////////

    /// @notice Pause outbound messages
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause outbound messages
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Sets the waiting period for message root states
    /// @param messageTimelock The waiting period for message root states (in milliseconds)
    function setIncomingMessageTimelock(uint64 messageTimelock) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _incomingMessageTimelock = messageTimelock;
    }

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Gets the number of decimals used in the Fuel base asset
    /// @return decimals of the Fuel base asset
    function fuelBaseAssetDecimals() public pure returns (uint8) {
        return uint8(FUEL_BASE_ASSET_DECIMALS);
    }

    /// @notice Gets the set sidechain consensus contract
    /// @return sidechain consensus contract
    function sidechainConsensusContract() public view returns (address) {
        return address(_sidechainConsensus);
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
    ) external payable whenNotPaused {
        //verify block header
        require(
            _sidechainConsensus.verifyBlock(blockHeader.computeConsensusHeaderHash(), poaSignature),
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
    ) external payable whenNotPaused {
        //verify root block header
        require(
            _sidechainConsensus.verifyBlock(rootBlockHeader.computeConsensusHeaderHash(), poaSignature),
            "Invalid root block"
        );

        //verify block in history
        require(
            verifyBinaryTree(
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

    /// @notice Gets the currently set timelock for all incoming messages (in milliseconds)
    /// @return incoming message timelock
    function incomingMessageTimelock() public view returns (uint64) {
        return _incomingMessageTimelock;
    }

    /// @notice Gets if the given message ID has been relayed successfully
    /// @param messageId Message ID
    /// @return true if message has been relayed successfully
    function incomingMessageSuccessful(bytes32 messageId) public view returns (bool) {
        return _incomingMessageSuccessful[messageId];
    }

    /// @notice Used by message receiving contracts to get the address on Fuel that sent the message
    /// @return sender the address of the sender on Fuel
    function messageSender() external view returns (bytes32) {
        require(_incomingMessageSender != NULL_MESSAGE_SENDER, "Current message sender not set");
        return _incomingMessageSender;
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
    function depositETH(bytes32 recipient) external payable whenNotPaused {
        _sendOutgoingMessage(recipient, new bytes(0));
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
            uint256 precision = 10 ** (ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS);
            uint256 amount = msg.value / precision;
            if (msg.value > 0) {
                require(amount * precision == msg.value, "amount-precision-incompatability");
                require(amount <= ((2 ** 64) - 1), "amount-precision-incompatability");
            }

            //emit message for Fuel clients to pickup (messageID calculated offchain)
            emit SentMessage(sender, recipient, _outgoingMessageNonce, uint64(amount), data);

            // increment nonce for next message
            ++_outgoingMessageNonce;
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
    ) private nonReentrant {
        //verify message validity
        bytes32 messageId = CryptographyLib.hash(
            abi.encodePacked(message.sender, message.recipient, message.nonce, message.amount, message.data)
        );
        require(!_incomingMessageSuccessful[messageId], "Already relayed");
        require(
            (blockHeader.timestamp - 4611686018427387914) <=
                // solhint-disable-next-line not-rely-on-time
                (block.timestamp - _incomingMessageTimelock),
            "Timelock not elapsed"
        );

        //verify message in block
        require(
            verifyBinaryTree(
                blockHeader.outputMessagesRoot,
                abi.encodePacked(messageId),
                messageInBlockProof.proof,
                messageInBlockProof.key,
                blockHeader.outputMessagesCount
            ),
            "Invalid message in block proof"
        );

        //set message sender for receiving contract to reference
        _incomingMessageSender = message.sender;

        //relay message
        //solhint-disable-next-line avoid-low-level-calls
        bool success = SafeCall.call(
            address(uint160(uint256(message.recipient))),
            message.amount * (10 ** (ETH_DECIMALS - FUEL_BASE_ASSET_DECIMALS)),
            message.data
        );

        //make sure relay succeeded
        require(success, "Message relay failed");

        //unset message sender reference
        _incomingMessageSender = NULL_MESSAGE_SENDER;

        //keep track of successfully relayed messages
        _incomingMessageSuccessful[messageId] = true;
    }

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only admin)
    }
}
