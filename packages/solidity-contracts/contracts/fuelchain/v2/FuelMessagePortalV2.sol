// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import '../FuelMessagePortal.sol';

contract FuelMessagePortalV2 is FuelMessagePortal {

    error AccountDepositLimit();
    error GlobalDepositLimit();

    uint256 public depositLimitGlobal;
    uint256 public depositLimitPerAccount;

    uint public totalDeposited;
    mapping(address => uint) public depositedAmounts;


    function initializeV2(
        uint _depositLimitGlobal, 
        uint _depositLimitPerAccount
    ) public reinitializer(2) {
        depositLimitGlobal = _depositLimitGlobal;
        depositLimitPerAccount = _depositLimitPerAccount;
    }

    function setGlobalDepositLimit(uint limit) external virtual payable onlyRole(DEFAULT_ADMIN_ROLE) {
        depositLimitGlobal = limit;
    }

    function setPerAccountDepositLimit(uint limit) external virtual payable onlyRole(DEFAULT_ADMIN_ROLE) {
        depositLimitPerAccount = limit;
    }

    function rescueETH(uint amount) external virtual payable onlyRole(DEFAULT_ADMIN_ROLE) {
        payable(msg.sender).transfer(amount);
    }

    ////////////////////////
    // Internal Functions //
    ////////////////////////

    /// @notice Performs all necessary logic to send a message to a target on Fuel
    /// @param recipient The message receiver address or predicate root
    /// @param data The message data to be sent to the receiver
    function _sendOutgoingMessage(bytes32 recipient, bytes memory data) internal virtual override {
        bytes32 sender = bytes32(uint256(uint160(msg.sender)));
        unchecked {
            //make sure data size is not too large
            if (data.length >= MAX_MESSAGE_DATA_SIZE) revert MessageDataTooLarge();

            // v2: increase deposited amount for sender
            // Do not think this needs an overflow check, you cannot get that much ether
            uint256 userDepositedAmount = depositedAmounts[msg.sender] + msg.value;
            if(userDepositedAmount > depositLimitPerAccount) {
                revert AccountDepositLimit();
            }

            // v2: increase global deposited ether
            uint256 globalDepositedAmount = totalDeposited += msg.value;
            if(globalDepositedAmount > depositLimitGlobal) {
                revert GlobalDepositLimit();
            }
            
            //make sure amount fits into the Fuel base asset decimal level
            uint256 amount = msg.value / PRECISION;
            if (msg.value > 0) {
                if (amount * PRECISION != msg.value) revert AmountPrecisionIncompatibility();
                if (amount > type(uint64).max) revert AmountTooBig();
            }

            depositedAmounts[msg.sender] = userDepositedAmount;

            //emit message for Fuel clients to pickup (messageID calculated offchain)
            uint nonce = _outgoingMessageNonce;
            emit MessageSent(sender, recipient, nonce, uint64(amount), data);

            // increment nonce for next message
            _outgoingMessageNonce = nonce + 1;
        }
    }

    /// @notice Executes a message in the given header
    /// @param messageId The id of message to execute
    /// @param message The message to execute
    function _executeMessage(bytes32 messageId, Message calldata message) internal virtual override nonReentrant {
        if (_incomingMessageSuccessful[messageId]) revert AlreadyRelayed();

        //set message sender for receiving contract to reference
        _incomingMessageSender = message.sender;

        // v2: update accounting if the message carries an amount 
        bool success;
        bytes memory result;
        if(message.amount > 0) {
            uint256 withdrawnAmount = message.amount * PRECISION;
            address recipient = address(uint160(uint256(message.recipient)));
            uint256 depositedAmount = depositedAmounts[recipient];

            if(depositedAmount < withdrawnAmount) {
                depositedAmounts[recipient] = 0;
            } else {
                // Underflow check already done
                unchecked {depositedAmounts[recipient] = depositedAmount - withdrawnAmount;}
            }

            // Underflow check enabled since the amount is coded in `message`
            totalDeposited -= withdrawnAmount;

            (success, result) = recipient.call{value: withdrawnAmount}(message.data);
        } else {
            (success, result) = address(uint160(uint256(message.recipient))).call(message.data);
        }


        if (!success) {
            // Look for revert reason and bubble it up if present
            if (result.length > 0) {
                // The easiest way to bubble the revert reason is using memory via assembly
                /// @solidity memory-safe-assembly
                assembly {
                    let returndata_size := mload(result)
                    revert(add(32, result), returndata_size)
                }
            }
            revert("Message relay failed");
        }

        //unset message sender reference
        _incomingMessageSender = NULL_MESSAGE_SENDER;

        //keep track of successfully relayed messages
        _incomingMessageSuccessful[messageId] = true;

        //emit event for successful message relay
        emit MessageRelayed(messageId, message.sender, message.recipient, message.amount);
    }
    
    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}