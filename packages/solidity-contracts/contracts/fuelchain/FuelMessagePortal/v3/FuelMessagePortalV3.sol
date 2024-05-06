// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import "../v2/FuelMessagePortalV2.sol";

/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
contract FuelMessagePortalV3 is FuelMessagePortalV2 {
    using FuelBlockHeaderLib for FuelBlockHeader;
    using FuelBlockHeaderLiteLib for FuelBlockHeaderLite;

    error MessageBlacklisted();
    error WithdrawalsPaused();
    error MessageRelayFailed();

    bool public withdrawalsPaused;
    mapping(bytes32 => bool) public messageIsBlacklisted;

    constructor(uint256 _depositLimitGlobal) FuelMessagePortalV2(_depositLimitGlobal) {}

    function pauseWithdrawals() external payable onlyRole(PAUSER_ROLE) {
        withdrawalsPaused = true;
    }

    function unpauseWithdrawals() external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        withdrawalsPaused = false;
    }

    function addMessageToBlacklist(bytes32 messageId) external payable onlyRole(PAUSER_ROLE) {
        messageIsBlacklisted[messageId] = true;
    }

    function removeMessageFromBlacklist(bytes32 messageId) external payable onlyRole(DEFAULT_ADMIN_ROLE) {
        messageIsBlacklisted[messageId] = false;
    }

    ///////////////////////////////////////
    // Incoming Message Public Functions //
    ///////////////////////////////////////

    /// @notice Relays a message published on Fuel from a given block
    /// @param message The message to relay
    /// @param rootBlockHeader The root block for proving chain history
    /// @param blockHeader The block containing the message
    /// @param blockInHistoryProof Proof that the message block exists in the history of the root block
    /// @param messageInBlockProof Proof that message exists in block
    /// @dev Made payable to reduce gas costs
    function relayMessage(
        Message calldata message,
        FuelBlockHeaderLite calldata rootBlockHeader,
        FuelBlockHeader calldata blockHeader,
        MerkleProof calldata blockInHistoryProof,
        MerkleProof calldata messageInBlockProof
    ) external payable virtual override whenNotPaused {
        if (withdrawalsPaused) {
            revert WithdrawalsPaused();
        }

        //verify root block header
        if (!_fuelChainState.finalized(rootBlockHeader.computeConsensusHeaderHash(), rootBlockHeader.height)) {
            revert UnfinalizedBlock();
        }

        //verify block in history
        if (
            !verifyBinaryTree(
                rootBlockHeader.prevRoot,
                abi.encodePacked(blockHeader.computeConsensusHeaderHash()),
                blockInHistoryProof.proof,
                blockInHistoryProof.key,
                rootBlockHeader.height
            )
        ) revert InvalidBlockInHistoryProof();

        //verify message in block
        bytes32 messageId = CryptographyLib.hash(
            abi.encodePacked(message.sender, message.recipient, message.nonce, message.amount, message.data)
        );

        if (messageIsBlacklisted[messageId]) {
            revert MessageBlacklisted();
        }

        if (
            !verifyBinaryTree(
                blockHeader.outputMessagesRoot,
                abi.encodePacked(messageId),
                messageInBlockProof.proof,
                messageInBlockProof.key,
                blockHeader.outputMessagesCount
            )
        ) revert InvalidMessageInBlockProof();

        //execute message
        _executeMessage(messageId, message);
    }

    /// @notice Executes a message in the given header
    /// @param messageId The id of message to execute
    /// @param message The message to execute
    function _executeMessage(bytes32 messageId, Message calldata message) internal virtual override nonReentrant {
        if (_incomingMessageSuccessful[messageId]) revert AlreadyRelayed();

        //set message sender for receiving contract to reference
        _incomingMessageSender = message.sender;

        // v2: update accounting if the message carries an amount
        bool success;
        bytes memory result;
        if (message.amount > 0) {
            uint256 withdrawnAmount = message.amount * PRECISION;

            // Underflow check enabled since the amount is coded in `message`
            totalDeposited -= withdrawnAmount;

            (success, result) = address(uint160(uint256(message.recipient))).call{value: withdrawnAmount}(message.data);
        } else {
            (success, result) = address(uint160(uint256(message.recipient))).call(message.data);
        }

        if (!success) {
            // Look for revert reason and bubble it up if present
            if (result.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly
                /// @solidity memory-safe-assembly
                assembly {
                    let returndata_size := mload(result)
                    revert(add(32, result), returndata_size)
                }
            }
            revert MessageRelayFailed();
        }

        //unset message sender reference
        _incomingMessageSender = NULL_MESSAGE_SENDER;

        //keep track of successfully relayed messages
        _incomingMessageSuccessful[messageId] = true;

        //emit event for successful message relay
        emit MessageRelayed(messageId, message.sender, message.recipient, message.amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
