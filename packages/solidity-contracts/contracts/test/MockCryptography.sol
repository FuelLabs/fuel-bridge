// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import {CryptographyLib} from "../lib/Cryptography.sol";

contract MockCryptography {
    function hash(bytes memory data) public pure returns (bytes32) {
        return CryptographyLib.hash(data);
    }
}
