// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import "../v3/FuelMessagePortalV3.sol";

/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
contract FuelMessagePortalV4 is FuelMessagePortalV3 {
    event Transaction(uint256 indexed nonce, uint64 max_gas, bytes canonically_serialized_tx);

    error GasLimit();

    uint64 public immutable GAS_LIMIT;

    uint192 internal lastSeenBlock;
    uint64 internal usedGas;

    constructor(uint256 _depositLimitGlobal, uint64 _gasLimit) FuelMessagePortalV3(_depositLimitGlobal) {
        GAS_LIMIT = _gasLimit;
    }

    function sendTransaction(uint64 gas, bytes calldata /*serializedTx*/) external payable virtual {
        uint64 _usedGas = usedGas;

        if (lastSeenBlock == block.number) {
            _usedGas += gas;
        } else {
            _usedGas = gas;
        }

        if (_usedGas > GAS_LIMIT) {
            revert GasLimit();
        }

        lastSeenBlock = uint192(block.number);
        usedGas = _usedGas;
    }

    function getLastSeenBlock() public virtual returns (uint256) {
        return uint256(lastSeenBlock);
    }

    function getUsedGas() external virtual returns (uint64) {
        if (getLastSeenBlock() == block.number) return usedGas;

        return 0;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
