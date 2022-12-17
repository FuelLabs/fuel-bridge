// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {CryptographyLib} from "../lib/Cryptography.sol";

/// @notice The Fuel v2 Sidechain PoA system.
contract FuelSidechainConsensus is Initializable, OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    /////////////
    // Storage //
    /////////////

    /// @dev The Current PoA key
    address public s_authorityKey;

    /////////////////////////////
    // Constructor/Initializer //
    /////////////////////////////

    /// @notice Constructor disables initialization for the implementation contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Contract initializer to setup starting values
    /// @param authorityKey Public key of the block producer authority
    function initialize(address authorityKey) public initializer {
        __Pausable_init();
        __Ownable_init();
        __UUPSUpgradeable_init();

        // data
        s_authorityKey = authorityKey;
    }

    /////////////////////
    // Admin Functions //
    /////////////////////

    /// @notice Sets the PoA key
    /// @param authorityKey Address of the PoA authority
    function setAuthorityKey(address authorityKey) external onlyOwner {
        s_authorityKey = authorityKey;
    }

    /// @notice Pause block commitments
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause block commitments
    function unpause() external onlyOwner {
        _unpause();
    }

    //////////////////////
    // Public Functions //
    //////////////////////

    /// @notice Verify a given block.
    /// @param blockHash The hash of a block
    /// @param signature The signature over the block hash
    function verifyBlock(bytes32 blockHash, bytes calldata signature) external view whenNotPaused returns (bool) {
        return CryptographyLib.addressFromSignature(signature, blockHash) == s_authorityKey;
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Executes a message in the given header
    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        //should revert if msg.sender is not authorized to upgrade the contract (currently only owner)
    }
}
