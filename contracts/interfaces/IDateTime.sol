// SPDX-License-Identifier: GPL-2.0 AND MIT

pragma solidity ^0.8.0;

interface IDateTime {
    function getDay(uint256 timestamp) external returns (uint8);
}
