// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "hardhat/console.sol";

contract MockFuelMessagePortal {
    event SendMessageCalled(bytes32 indexed target, bytes data);

    bytes32 private _messageSender;

    function setMessageSender(bytes32 value) external {
        _messageSender = value;
    }

    function messageSender() external view returns (bytes32) {
        return _messageSender;
    }

    function sendMessage(bytes32 target, bytes calldata data) external {
        console.log("target");
        console.logBytes32(target);
        console.log("data");
        console.logBytes(data);

        emit SendMessageCalled(target, data);
    }
}
