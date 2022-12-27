// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {FuelMessagesEnabled} from "./FuelMessagesEnabled.sol";
import {IFuelMessagePortal} from "./IFuelMessagePortal.sol";

/// @title FuelMessagesEnabledUpgradeable
/// @notice Helper contract for contracts sending and receiving messages from Fuel
abstract contract FuelMessagesEnabledUpgradeable is Initializable, FuelMessagesEnabled {
    /////////////////
    // Initializer //
    /////////////////

    /// @dev Initializes the contract
    // solhint-disable-next-line func-name-mixedcase
    function __FuelMessagesEnabled_init(IFuelMessagePortal fuelMessagePortal) internal onlyInitializing {
        __FuelMessagesEnabled_init_unchained(fuelMessagePortal);
    }

    // solhint-disable-next-line func-name-mixedcase
    function __FuelMessagesEnabled_init_unchained(IFuelMessagePortal fuelMessagePortal) internal onlyInitializing {
        _fuelMessagePortal = fuelMessagePortal;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
