// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract NFT is ERC721 {
    constructor() ERC721("TestNFT", "TestNFT") {}

    function mint(address to, uint tokenID) external {
        _mint(to, tokenID);
    }
}
