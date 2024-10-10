// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "./FuelERC721Gateway.sol";
import "../FuelBridgeBase/FuelBridgeBaseV2.sol";

/// @custom:deprecation THIS CONTRACT IS DEPRECATED. CHECK FuelERC20GatewayV4
contract FuelERC721GatewayV2 is FuelERC721Gateway, FuelBridgeBaseV2 {
    function registerAsReceiver(address tokenAddress) external payable virtual override onlyFromPortal {
        bytes32 sender = messageSender();

        isBridge[sender][tokenAddress] = true;

        emit ReceiverRegistered(sender, tokenAddress);
    }

    /// @notice Deposits the given tokens to an account or contract on Fuel
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param tokenId tokenId to deposit
    /// @param messageData The data of the message to send for deposit
    function _deposit(
        address tokenAddress,
        bytes32 fuelContractId,
        uint256 tokenId,
        bytes memory messageData
    ) internal virtual override {
        // TODO: this check might be unnecessary. If the token is conformant to ERC721
        // it should not be possible to deposit the same token again
        require(_deposits[tokenAddress][tokenId] == 0, "tokenId is already owned by another fuel bridge");
        if (!isBridge[fuelContractId][tokenAddress]) revert FuelContractIsNotBridge();

        _deposits[tokenAddress][tokenId] = fuelContractId;

        //send message to gateway on Fuel to finalize the deposit
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);

        IERC721Upgradeable(tokenAddress).transferFrom(msg.sender, address(this), tokenId);
        //emit event for successful token deposit
        emit Deposit(bytes32(uint256(uint160(msg.sender))), tokenAddress, fuelContractId, tokenId);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
