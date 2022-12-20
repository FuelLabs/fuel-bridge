// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/**
 * @title SafeCall
 * @notice Perform low level safe calls. See https://github.com/nomad-xyz/ExcessivelySafeCall
 */
library SafeCall {
    /**
     * @notice Perform a low level call without copying any returndata
     *
     * @param _target   Address to call
     * @param _value    Amount of value to pass to the call
     * @param _calldata Calldata to pass to the call
     */
    function call(address _target, uint256 _value, bytes memory _calldata) internal returns (bool) {
        bool _success;
        uint256 _gas = gasleft();
        assembly {
            _success := call(
                _gas,
                _target,
                _value,
                add(_calldata, 0x20), // inloc
                mload(_calldata), // inlen
                0, // outloc
                0 // outlen
            )
        }
        return _success;
    }
}
