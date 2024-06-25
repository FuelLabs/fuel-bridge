// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

import "../v3/FuelMessagePortalV3.sol";

/// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
contract FuelMessagePortalV4 is FuelMessagePortalV3 {
    event Transaction(uint256 indexed nonce, uint64 max_gas, bytes canonically_serialized_tx);

    error GasLimit();
    error MinGas();
    error InsufficientFee();
    error RecipientRejectedETH();

    bytes32 public constant FEE_COLLECTOR_ROLE = keccak256("FEE_COLLECTOR_ROLE");

    uint64 public immutable GAS_LIMIT;
    uint64 public immutable GAS_TARGET;
    uint64 public immutable MIN_GAS_PER_TX;
    uint256 public immutable MIN_GAS_PRICE;

    uint192 internal lastSeenBlock;
    uint64 internal usedGas;
    uint256 internal gasPrice;
    uint256 internal transactionNonce;

    constructor(
        uint256 depositLimitGlobal,
        uint64 gasLimit,
        uint64 minGasPerTx,
        uint256 minGasPrice
    ) FuelMessagePortalV3(depositLimitGlobal) {
        GAS_LIMIT = gasLimit;
        GAS_TARGET = gasLimit / 2;
        MIN_GAS_PER_TX = minGasPerTx;
        MIN_GAS_PRICE = minGasPrice;
    }

    function sendTransaction(uint64 gas, bytes calldata serializedTx) external payable virtual {
        if (gas < MIN_GAS_PER_TX) {
            revert MinGas();
        }

        uint64 _usedGas = usedGas;
        uint192 _lastSeenBlock = lastSeenBlock;
        uint256 _gasPrice = gasPrice;

        if (_lastSeenBlock < block.number) {
            uint256 distance;
            unchecked {
                distance = block.number - uint256(_lastSeenBlock);
            }

            if (distance == 1) {
                if (_usedGas > GAS_TARGET) {
                    // Max increment: x2
                    _gasPrice = (_gasPrice * PRECISION * _usedGas) / GAS_TARGET;
                } else {
                    // Max decrement: x0.5
                    _gasPrice = (_gasPrice * (PRECISION + (_usedGas * PRECISION) / GAS_TARGET)) / 2;
                }

                _gasPrice /= PRECISION;
            } else {
                _gasPrice /= distance;
            }

            _usedGas = gas;
        } else {
            _usedGas += gas;
        }

        if (_usedGas > GAS_LIMIT) {
            revert GasLimit();
        }

        if (_gasPrice < MIN_GAS_PRICE) {
            _gasPrice = MIN_GAS_PRICE;
        }

        lastSeenBlock = uint192(block.number);
        usedGas = _usedGas;
        gasPrice = _gasPrice;

        unchecked {
            emit Transaction(transactionNonce++, gas, serializedTx);
        }

        uint256 fee = _gasPrice * gas;

        if (msg.value != fee) {
            if (msg.value < fee) {
                revert InsufficientFee();
            }

            unchecked {
                (bool success, bytes memory result) = _msgSender().call{value: msg.value - fee}("");
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
                    revert RecipientRejectedETH();
                }
            }
        }
    }

    function getLastSeenBlock() public view virtual returns (uint256) {
        return uint256(lastSeenBlock);
    }

    function getUsedGas() external view returns (uint64) {
        return usedGas;
    }

    function getTransactionNonce() external view virtual returns (uint256) {
        return transactionNonce;
    }

    function getGasPrice() external view virtual returns (uint256) {
        return gasPrice;
    }

    function getCurrentUsedGas() external view virtual returns (uint64) {
        if (getLastSeenBlock() == block.number) return usedGas;

        return 0;
    }

    function collectFees() external onlyRole(FEE_COLLECTOR_ROLE) {
        (bool success, ) = _msgSender().call{value: address(this).balance}("");
        if (!success) revert RecipientRejectedETH();
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
