// SPDX-License-Identifier: Apache 2.0
pragma solidity 0.8.9;

import {FuelMessagePortalV3} from "./v3/FuelMessagePortalV3.sol";

/// @notice to be used by external tools, like the block producer
/// @dev marked abstract to track all relevant current and future functions as development evolves
abstract contract IFuelMessagePortal is FuelMessagePortalV3 {
    event Transaction(uint64 max_gas, bytes canonically_serialized_tx);

    function sendTransaction(uint64 gas, bytes calldata serializedTx) external payable virtual;

    function getLastSeenBlock() external virtual returns (uint256);

    function getUsedGas() external virtual returns (uint64);
}
