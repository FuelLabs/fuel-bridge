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

    /// @notice sends a transaction to the L2. The sender pays the execution cost with a fee that
    /// @notice depends on congestion of previous calls to this function.
    /// @notice DA costs are paid by the ethereum transaction itself
    /// @dev Excess fee will be returned to the sender. Checks-effects-interactions pattern followed
    /// @param gas amount of gas forwarded for the transaction in L2
    /// @param serializedTx Complete fuel transaction
    function sendTransaction(uint64 gas, bytes calldata serializedTx) external payable virtual {
        if (gas < MIN_GAS_PER_TX) {
            revert MinGas();
        }

        uint64 _usedGas = usedGas;
        uint192 _lastSeenBlock = lastSeenBlock;
        uint256 _gasPrice = gasPrice;

        if (_lastSeenBlock < block.number) {
            // Update gas price
            uint256 distance;
            unchecked {
                distance = block.number - uint256(_lastSeenBlock);
            }

            // If we had transactions in the previous block, check previous block congestion
            if (distance == 1) {
                if (_usedGas > GAS_TARGET) {
                    /**
                     * Max increment: x2 (Gas limit = gas target x2, see constructor)
                     *                              usedGas
                     * new gasPrice = gasPrice x --------------
                     *                             gasTarget
                     */
                    _gasPrice = _divByNonZero((_gasPrice * PRECISION * _usedGas), GAS_TARGET);
                } else {
                    /**
                     * Max decrement: x0.5. Min decrement: x1
                     *                                   usedGas
                     * new gasPrice = gasPrice x (1 + ---------------- ) x 0.5
                     *                                  gasTarget
                     */
                    _gasPrice = _divByNonZero(
                        _gasPrice * (PRECISION + _divByNonZero((_usedGas * PRECISION), GAS_TARGET)),
                        2
                    );
                }

                _gasPrice /= PRECISION;
            } else {
                // If there were no transactions in the previous block, use distance to last congested block
                _gasPrice = _divByNonZero(_gasPrice, distance);
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

        // Check fee and return to sender if needed
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

    /// @dev gas efficient division. Must be used with care, `_div` must be non zero
    function _divByNonZero(uint256 _num, uint256 _div) internal pure returns (uint256 result) {
        assembly {
            result := div(_num, _div)
        }
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
