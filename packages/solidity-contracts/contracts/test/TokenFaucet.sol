// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice This token is used for testing purposes.
contract TokenFaucet is ERC20 {
    address public _owner;
    uint16 public constant MAX_MINTS = 100;

    // Mapping to track whether an address has minted before
    mapping(address => uint16) public addressMints;

    /// @notice Constructor.
    constructor() ERC20("TokenFaucet", "TKN") {
        _owner = msg.sender;
    }

    /// @notice This is a simple mint function.
    /// @dev Allows anyone to mint the token only if the address hasn't minted before.
    // the params are not used but they are here to keep compatibility with
    // the Token contract
    function mint(address onwer, uint256 amount) external {
        require(addressMints[msg.sender] <= MAX_MINTS, "Max mints per address limit reached");
        // Mint tokens to the caller
        //        1 TKN == 1_000_000_000_000_000_000
        _mint(msg.sender, 10_000_000_000_000_000_000);
        // Mark the address as having minted
        addressMints[msg.sender] = addressMints[msg.sender] + 1;
    }
}
