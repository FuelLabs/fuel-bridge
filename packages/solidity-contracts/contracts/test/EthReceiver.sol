// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.9;

contract EthReceiver {
    bool reject = false;
    string reason;

    receive() external payable {
        if (reject) {
            if (bytes(reason).length > 0) require(false, reason);
            revert();
        }
    }

    function setupRevert(bool value, string calldata _reason) external {
        reject = value;
        reason = _reason;
    }
}
