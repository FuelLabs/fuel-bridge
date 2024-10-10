// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.24;

import "./FuelERC20Gateway.sol";
import "../FuelBridgeBase/FuelBridgeBaseV2.sol";

/// @custom:deprecation THIS CONTRACT IS DEPRECATED. CHECK FuelERC20GatewayV4
contract FuelERC20GatewayV2 is FuelERC20Gateway, FuelBridgeBaseV2 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    function registerAsReceiver(address tokenAddress) external payable virtual override onlyFromPortal {
        bytes32 sender = messageSender();

        isBridge[sender][tokenAddress] = true;

        emit ReceiverRegistered(sender, tokenAddress);
    }

    /// @notice Deposits the given tokens to an account or contract on Fuel
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @param messageData The data of the message to send for deposit
    function _deposit(
        address tokenAddress,
        bytes32 fuelContractId,
        uint256 amount,
        bytes memory messageData
    ) internal virtual override {
        require(amount > 0, "Cannot deposit zero");
        if (!isBridge[fuelContractId][tokenAddress]) revert FuelContractIsNotBridge();

        //transfer tokens to this contract and update deposit balance
        IERC20Upgradeable(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        _deposits[tokenAddress][fuelContractId] = _deposits[tokenAddress][fuelContractId] + amount;

        //send message to gateway on Fuel to finalize the deposit
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);

        //emit event for successful token deposit
        emit Deposit(bytes32(uint256(uint160(msg.sender))), tokenAddress, fuelContractId, amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
