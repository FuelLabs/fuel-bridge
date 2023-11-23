// SPDX-License-Identifier: Apache 2.0
pragma solidity ^0.8.0;

import "../v2/FuelERC20GatewayV2.sol";

contract FuelERC20GatewayV3 is FuelERC20GatewayV2 {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    error GlobalDepositLimit();
    error CannotDepositZero();
    error CannotWithdrawZero();
    error TokenIdNotAllowed();

    mapping(address => uint256) public depositLimitGlobal;
    mapping(address => uint256) public depositTotals;

    function setGlobalDepositLimit(address token, uint256 limit)
        external
        payable
        virtual
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        depositLimitGlobal[token] = limit;
    }

    /// @notice Deposits the given tokens to an account or contract on Fuel
    /// @param tokenAddress Address of the token being transferred to Fuel
    /// @param fuelContractId ID of the contract on Fuel that manages the deposited tokens
    /// @param amount Amount of tokens to deposit
    /// @param messageData The data of the message to send for deposit
    function _deposit(address tokenAddress, bytes32 fuelContractId, uint256 amount, bytes memory messageData)
        internal
        virtual
        override
    {
        ////////////
        // Checks //
        ////////////
        if (amount == 0) revert CannotDepositZero();

        uint256 updatedDepositTotals = depositTotals[tokenAddress] + amount;
        if (updatedDepositTotals > depositLimitGlobal[tokenAddress]) revert GlobalDepositLimit();

        if (!isBridge[fuelContractId][tokenAddress]) revert FuelContractIsNotBridge();

        /////////////
        // Effects //
        /////////////
        _deposits[tokenAddress][fuelContractId] += amount;
        depositTotals[tokenAddress] = updatedDepositTotals;

        /////////////
        // Actions //
        /////////////
        //send message to gateway on Fuel to finalize the deposit
        sendMessage(CommonPredicates.CONTRACT_MESSAGE_PREDICATE, messageData);

        //transfer tokens to this contract and update deposit balance
        IERC20Upgradeable(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);

        //emit event for successful token deposit
        emit Deposit(bytes32(uint256(uint160(msg.sender))), tokenAddress, fuelContractId, amount);
    }

    /// @notice Finalizes the withdrawal process from the Fuel side gateway contract
    /// @param to Account to send withdrawn tokens to
    /// @param tokenAddress Address of the token being withdrawn from Fuel
    /// @param amount Amount of tokens to withdraw
    /// @param tokenId Discriminator for ERC721 / ERC1155 tokens. For ERC20, it must be 0
    /// @dev Made payable to reduce gas costs
    function finalizeWithdrawal(address to, address tokenAddress, uint256 amount, uint256 tokenId)
        external
        payable
        override
        whenNotPaused
        onlyFromPortal
    {
        ////////////
        // Checks //
        ////////////
        if (amount == 0) revert CannotWithdrawZero();
        if (tokenId > 0) revert TokenIdNotAllowed();

        /////////////
        // Effects //
        /////////////
        bytes32 fuelContractId = messageSender();

        //reduce deposit balance and transfer tokens (math will underflow if amount is larger than allowed)
        _deposits[tokenAddress][fuelContractId] -= amount;
        depositTotals[tokenAddress] -= amount;

        /////////////
        // Actions //
        /////////////
        IERC20Upgradeable(tokenAddress).safeTransfer(to, amount);

        //emit event for successful token withdraw
        emit Withdrawal(bytes32(uint256(uint160(to))), tokenAddress, fuelContractId, amount);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
