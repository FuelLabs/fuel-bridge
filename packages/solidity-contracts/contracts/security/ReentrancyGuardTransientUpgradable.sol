// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @dev Variant of {ReentrancyGuard} that uses transient storage.
 * For detailed context on reentrancy guard check https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable/blob/master/contracts/utils/ReentrancyGuardUpgradeable.sol
 * For detailed context on EIP1153(Transient Storage) check https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1153.md
 *
 */
abstract contract ReentrancyGuardTransientUpgradable is Initializable {
    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    uint256 private constant _NOT_ENTERED = 0;
    uint256 private constant _ENTERED = 1;

    // @notice acts as the storage slot in transient storage
    // avoiding the use of a namespace storage slot, to avoid storage collisions with upgrades
    uint256 __transientSlotPlaceholder;

    function __ReentrancyGuardTransient_init() internal onlyInitializing {
        __ReentrancyGuardTransient_init_unchained();
    }

    function __ReentrancyGuardTransient_init_unchained() internal onlyInitializing {}

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_get() != _NOT_ENTERED) revert ReentrancyGuardReentrantCall();

        // Any calls to nonReentrant after this point will fail
        _set(_ENTERED);
    }

    function _nonReentrantAfter() private {
        _set(_NOT_ENTERED);
    }

    /**
     * @dev Store `value` at location `slot` in transient storage.
     */
    function _set(uint256 value) internal {
        assembly ("memory-safe") {
            let slot := __transientSlotPlaceholder.slot
            tstore(slot, value)
        }
    }

    /**
     * @dev Load the value held at location `slot` in transient storage.
     */
    function _get() internal view returns (uint256 value) {
        assembly ("memory-safe") {
            let slot := __transientSlotPlaceholder.slot
            value := tload(slot)
        }
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
