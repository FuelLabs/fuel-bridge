// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice This token is for testing purposes.
contract NoDecimalsToken is ERC20 {
    address public _owner;
    uint8 customDecimals;

    /// @notice Constructor.
    constructor(uint8 _decimals) ERC20("Token", "TKN") {
        _owner = msg.sender;
        customDecimals = _decimals;
    }

    /// @notice This is a simple mint function.
    /// @param owner The owner of the token.
    /// @param amount The amount of the token to mint to the owner.
    /// @dev Allows anyone to mint the token.
    function mint(address owner, uint256 amount) external {
        _mint(owner, amount);
    }

    function decimals() public view virtual override returns (uint8) {
        revert("");
    }
}
