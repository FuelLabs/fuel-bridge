// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

contract MockFuelMessagePortal {

    bytes32 private _messageSender;

    function setMessageSender(bytes32 value) external {
        _messageSender = value;
    }

    function messageSender() external view returns (bytes32) {
        return _messageSender;
    }

    function sendMessage(bytes32, bytes calldata) external pure {}
}