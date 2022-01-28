// SPDX-License-Identifier: GPL-2.0 AND MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IwsUMAMI is IERC20 {
  function wrap( uint _amount ) external returns ( uint );
  function unwrap( uint _amount ) external returns ( uint );
}