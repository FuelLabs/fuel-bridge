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
    //TODO: update these values once block time and commit frequency are finalized
    uint256 public constant NUM_COMMIT_SLOTS = 240; //30 days worth of commits
    uint256 public constant BLOCKS_PER_COMMIT_INTERVAL = 10800;
    uint256 public constant TIME_TO_FINALIZE = 10800;

    /// @dev The admin related contract roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant COMMITTER_ROLE = keccak256("COMMITTER_ROLE");

    ////////////
    // Events //
    ////////////

    /// @dev Emitted when a commit is first submitted
    event CommitSubmitted(uint256 indexed commitHeight, bytes32 blockHash);

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
    constructor() {
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
        uint256 commitHeight = blockHeight / BLOCKS_PER_COMMIT_INTERVAL;
        Commit storage commitSlot = _commitSlots[commitHeight % NUM_COMMIT_SLOTS];
        require(commitSlot.blockHash == blockHash, "Unknown block");

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
