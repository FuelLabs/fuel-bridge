// SPDX-License-Identifier: UNLICENSED
// solhint-disable not-rely-on-time
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {CryptographyLib} from "../lib/Cryptography.sol";

/// @notice Structure for commits
struct Commit {
    bytes32 blockHash;
    uint32 timestamp;
    address reserved1;
    uint16 reserved2;
}

/// @notice The Fuel v2 chain state
contract FuelChainState is Initializable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    ///////////////
    // Constants //
    ///////////////

    /// @dev The commit proccess parameters
    // NUM_COMMIT_SLOTS an arbitrary number of commits to store before starting to overwrite
    uint256 public constant NUM_COMMIT_SLOTS = 240;
    // Number of blocks per commit interval
    // BLOCKS_PER_COMMIT_INTERVAL = (num of blocks per minute * target interval in minutes)
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable BLOCKS_PER_COMMIT_INTERVAL;

    // Time after which a commit becomes finalized
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint256 public immutable TIME_TO_FINALIZE;

    /// Time before a slot can be overwritten
    /// @custom:oz-upgrades-unsafe-allow state-variable-immutable
    uint32 public immutable COMMIT_COOLDOWN;

    /// @dev The admin related contract roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant COMMITTER_ROLE = keccak256("COMMITTER_ROLE");

    ////////////
    // Events //
    ////////////

    /// @dev Emitted when a commit is first submitted
    event CommitSubmitted(uint256 indexed commitHeight, bytes32 blockHash);

    ////////////
    // Errors //
    ////////////

    error UnknownBlock();
    error CannotRecommit();

    /////////////
    // Storage //
    /////////////

    /// @dev The commits buffer
    Commit[NUM_COMMIT_SLOTS] private _commitSlots;

    /////////////////////////////
    // Constructor/Initializer //
    /////////////////////////////

    /// @notice Constructor disables initialization for the implementation contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(uint256 timeToFinalize, uint256 blocksPerCommitInterval) {
        TIME_TO_FINALIZE = timeToFinalize;
        COMMIT_COOLDOWN = uint32(timeToFinalize) * 8;
        BLOCKS_PER_COMMIT_INTERVAL = blocksPerCommitInterval;

        _disableInitializers();
    }

    /// @notice Contract initializer to setup starting values
    function initialize() public initializer {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        //grant initial roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
        _grantRole(COMMITTER_ROLE, msg.sender);
    }

    /////////////////////
    // Admin Functions //
    /////////////////////

    /// @notice Pause block commitments
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause block commitments
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Commits a block header.
    /// @param blockHash The hash of a block
    /// @param commitHeight The height of the commit
    function commit(bytes32 blockHash, uint256 commitHeight) external whenNotPaused onlyRole(COMMITTER_ROLE) {
        uint256 slot = commitHeight % NUM_COMMIT_SLOTS;
        Commit storage commitSlot = _commitSlots[slot];

        unchecked {
            if (commitSlot.timestamp + COMMIT_COOLDOWN > uint32(block.timestamp)) {
                revert CannotRecommit();
            }
        }

        commitSlot.blockHash = blockHash;
        commitSlot.timestamp = uint32(block.timestamp);

        emit CommitSubmitted(commitHeight, blockHash);
    }

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Checks if a given block is finalized
    /// @param blockHash The hash of the block to check
    /// @param blockHeight The height of the block to check
    /// @return true if the block is finalized
    function finalized(bytes32 blockHash, uint256 blockHeight) external view whenNotPaused returns (bool) {
        // TODO This division could be done offchain, or at least also could be assembly'ed to avoid non-zero division check
        uint256 commitHeight = blockHeight / BLOCKS_PER_COMMIT_INTERVAL;
        Commit storage commitSlot = _commitSlots[commitHeight % NUM_COMMIT_SLOTS];
        if (commitSlot.blockHash != blockHash) revert UnknownBlock();

        return block.timestamp >= uint256(commitSlot.timestamp) + TIME_TO_FINALIZE;
    }

    /// @notice Gets the block hash at the given commit height
    /// @param commitHeight The height of the commit
    /// @return hash of the block at the given commit height
    function blockHashAtCommit(uint256 commitHeight) external view returns (bytes32) {
        Commit storage commitSlot = _commitSlots[commitHeight % NUM_COMMIT_SLOTS];
        return commitSlot.blockHash;
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only owner)
    }
}
