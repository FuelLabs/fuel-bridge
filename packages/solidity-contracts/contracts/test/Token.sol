// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice This token is for testing purposes.
contract Token is ERC20, ERC20Permit {
    address public _owner;

    /// @notice Constructor.
    constructor() ERC20("Token", "TKN") ERC20Permit("ERC20") {
        _owner = msg.sender;
    }

    /// @notice This is a simple mint function.
    /// @param owner The owner of the token.
    /// @param amount The amount of the token to mint to the owner.
    /// @dev Allows anyone to mint the token.
    function mint(address owner, uint256 amount) external {
        _mint(owner, amount);
    }
}
