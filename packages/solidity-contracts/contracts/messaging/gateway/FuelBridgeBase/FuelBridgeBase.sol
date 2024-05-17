// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

abstract contract FuelBridgeBase {
    /// @notice Finalizes the withdrawal process from the Fuel side gateway contract
    /// @param to Account to send withdrawn tokens to
    /// @param tokenAddress Address of the token being withdrawn from Fuel
    /// @param amount Amount of tokens to withdraw
    /// @param tokenId Discriminator for ERC721 / ERC1155 tokens. For ERC20, it must be 0
    /// @dev Made payable to reduce gas costs
    function finalizeWithdrawal(
        address to,
        address tokenAddress,
        uint256 amount,
        uint256 tokenId
    ) external payable virtual;
}
