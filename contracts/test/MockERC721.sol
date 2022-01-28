// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    // solhint-disable-next-line no-empty-blocks
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}

    function mint(address account, uint256 tokenId) external {
        _mint(account, tokenId);
    }
}
