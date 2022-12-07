// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {CryptographyLib} from "../lib/Cryptography.sol";

/// @notice The Fuel v2 Sidechain PoA system.
contract FuelSidechainConsensus is Ownable, Pausable {
    /////////////
    // Storage //
    /////////////

    /// @dev The Current PoA key
    address public s_authorityKey;

    /////////////////
    // Constructor //
    /////////////////

    /// @notice Contract constructor to setup immutable values and starting values.
    /// @param authorityKey Public key of the block producer authority
    constructor(address authorityKey) Ownable() {
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
    function verifyBlock(bytes32 blockHash, bytes calldata signature)
        external
        view
        whenNotPaused
        returns (bool)
    {
        return CryptographyLib.addressFromSignature(signature, blockHash) == s_authorityKey;
    }
}
