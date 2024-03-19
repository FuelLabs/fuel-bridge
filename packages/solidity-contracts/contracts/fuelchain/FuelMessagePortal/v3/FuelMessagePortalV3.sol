// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import "../v2/FuelMessagePortalV2.sol";

/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
contract FuelMessagePortalV3 is FuelMessagePortalV2 {
    using FuelBlockHeaderLib for FuelBlockHeader;
    using FuelBlockHeaderLiteLib for FuelBlockHeaderLite;

    error MessageBlacklisted();
    error WithdrawalsPaused();

    bool public withdrawalsPaused;
    mapping(bytes32 => bool) public messageIsBlacklisted;

    constructor(uint256 _depositLimitGlobal) FuelMessagePortalV2(_depositLimitGlobal) {}

    function pauseWithdrawals() external payable onlyRole(PAUSER_ROLE) {
        withdrawalsPaused = true;
    }

    function unpauseWithdrawals() external payable onlyRole(PAUSER_ROLE) {
        withdrawalsPaused = false;
    }

    function setMessageBlacklist(bytes32 messageId, bool value) external payable onlyRole(PAUSER_ROLE) {
        messageIsBlacklisted[messageId] = value;
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

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
