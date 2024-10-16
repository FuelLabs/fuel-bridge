// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {FuelMessagesEnabledUpgradeable} from "../messaging/FuelMessagesEnabledUpgradeable.sol";
import {FuelMessagePortal} from "../fuelchain/FuelMessagePortal.sol";

/// @notice This contract allows for testing message receiving.
contract UpgradeableTester is FuelMessagesEnabledUpgradeable {
    /// @notice Test the init function for FuelMessagesEnabledUpgradeable
    function testFuelMessagesEnabledInit(FuelMessagePortal fuelMessagePortal) external {
        __FuelMessagesEnabled_init(fuelMessagePortal);
    }

    /// @notice Test the init unchained function for FuelMessagesEnabledUpgradeable
    function testFuelMessagesEnabledInitUnchained(FuelMessagePortal fuelMessagePortal) external {
        __FuelMessagesEnabled_init_unchained(fuelMessagePortal);
    }
}
