// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {CryptographyLib} from "../lib/Cryptography.sol";

/// @notice The Fuel v2 chain state consensus
contract FuelChainConsensus is Initializable, PausableUpgradeable, AccessControlUpgradeable, UUPSUpgradeable {
    ///////////////
    // Constants //
    ///////////////

    /// @dev The admin related contract roles
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /////////////
    // Storage //
    /////////////

    /// @dev The Current PoA key
    address private _authorityKey;

    /////////////////////////////
    // Constructor/Initializer //
    /////////////////////////////

    /// @notice Constructor disables initialization for the implementation contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Contract initializer to setup starting values
    /// @param key Public key of the block producer authority
    function initialize(address key) public initializer {
        __Pausable_init();
        __AccessControl_init();
        __UUPSUpgradeable_init();

        //grant initial roles
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        // data
        _authorityKey = key;
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

    /// @notice Sets the PoA key
    /// @param key Address of the PoA authority
    function setAuthorityKey(address key) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _authorityKey = key;
    }

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Gets the currently set PoA key
    /// @return authority key
    function authorityKey() public view returns (address) {
        return _authorityKey;
    }

    /// @notice Verify a given block.
    /// @param blockHash The hash of a block
    /// @param signature The signature over the block hash
    function verifyBlock(bytes32 blockHash, bytes calldata signature) external view whenNotPaused returns (bool) {
        return CryptographyLib.addressFromSignature(signature, blockHash) == _authorityKey;
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
