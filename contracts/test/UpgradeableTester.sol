// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {FuelMessagesEnabledUpgradeable} from "../messaging/FuelMessagesEnabledUpgradeable.sol";
import {IFuelMessagePortal} from "../messaging/IFuelMessagePortal.sol";

/// @notice This contract allows for testing message receiving.
contract UpgradeableTester is FuelMessagesEnabledUpgradeable {
    /// @notice Test the init function for FuelMessagesEnabledUpgradeable
    function testFuelMessagesEnabledInit(IFuelMessagePortal fuelMessagePortal) external {
        __FuelMessagesEnabled_init(fuelMessagePortal);
    }

    /// @notice Test the init unchained function for FuelMessagesEnabledUpgradeable
    function testFuelMessagesEnabledInitUnchained(IFuelMessagePortal fuelMessagePortal) external {
        __FuelMessagesEnabled_init_unchained(fuelMessagePortal);
    }
}
