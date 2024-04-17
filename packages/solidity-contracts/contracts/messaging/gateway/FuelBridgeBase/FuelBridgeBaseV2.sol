// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

/// @custom:deprecation THIS CONTRACT IS DEPRECATED
abstract contract FuelBridgeBaseV2 {
    error FuelContractIsNotBridge();

    event ReceiverRegistered(bytes32 indexed fuelContractId, address indexed tokenAddress);

    mapping(bytes32 => mapping(address => bool)) public isBridge;

    /// @notice Accepts a message from a fuel entity to acknowledge it can receive tokens
    /// @param tokenAddress The token address that the fuel entity can receive
    /// @dev Made payable to reduce gas costs
    /// @dev funcSig: aec97dc6  =>  registerAsReceiver(address)
    function registerAsReceiver(address tokenAddress) external payable virtual;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
