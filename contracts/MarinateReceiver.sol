// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


interface IMarinate {
    function addReward(address token, uint256 amount) external;
}

interface IwsUMAMI is IERC20 {
  function wrap( uint _amount ) external returns ( uint );
  function unwrap( uint _amount ) external returns ( uint );
}

interface IStakingHelper {
    function stake( uint _amount, address _recipient ) external;
}

contract MarinateReceiver is AccessControl, ReentrancyGuard {
  address public immutable UMAMI;
  address public immutable sUMAMI;
  address public immutable wsUMAMI;
  address public stakingHelper;
  IMarinate public marinateContract;
  address[] public distributedTokens;
  mapping(address => bool) public isDistributedToken;
  bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

  constructor(address _marinate, address _UMAMI, address _sUMAMI, address _wsUMAMI) {
    UMAMI = _UMAMI;
    sUMAMI = _sUMAMI;
    wsUMAMI = _wsUMAMI;
    marinateContract = IMarinate(_marinate);
    _setupRole(ADMIN_ROLE, msg.sender);
  }

  event RewardAdded(address token, uint256 amount);

  function sendBalancesAsRewards() external onlyAdmin nonReentrant {
    for (uint256 i = 0; i < distributedTokens.length; i++) {
      address token = distributedTokens[i];
      uint256 tokenBalance = IERC20(token).balanceOf(address(this));
      if (tokenBalance == 0) { continue; }
      if (token == UMAMI) {
        require(stakingHelper != address(0), "Staking not enabled");
        _stake(tokenBalance);
        uint256 wrappedTokenBalance = _wrap(tokenBalance);
        _addRewards(wsUMAMI, wrappedTokenBalance);
      } else {
        _addRewards(token, tokenBalance);
      }
      emit RewardAdded(token, tokenBalance);
    }
  }

  function _stake(uint256 amount) internal onlyAdmin {
    IERC20( UMAMI ).approve( stakingHelper, amount );
    IStakingHelper( stakingHelper ).stake( amount, address(this) );
  }

  function _wrap(uint256 amount) internal onlyAdmin returns (uint256 wrappedAmount) {
    IERC20(sUMAMI).approve(wsUMAMI, amount);
    wrappedAmount = IwsUMAMI(wsUMAMI).wrap(amount);
  }

  function _addRewards(address token, uint256 amount) internal onlyAdmin {
    require(IERC20(token).approve(address(marinateContract), amount), "Approve failed");
    marinateContract.addReward(token, amount);
  }

  function addDistributedToken(address token) external onlyAdmin {
    isDistributedToken[token] = true;
    distributedTokens.push(token);
  }

  function removeDistributedToken(address token) external onlyAdmin {
    for (uint256 i = 0; i < distributedTokens.length; i++) {
      if (distributedTokens[i] == token) {
        distributedTokens[i] = distributedTokens[distributedTokens.length - 1];
        distributedTokens.pop();
        isDistributedToken[token] = false;
      }
    }
  }

  function setMarinateAddress(address st) external onlyAdmin {
    marinateContract = IMarinate(st);
  }

  function recoverEth() external onlyAdmin {
    (bool success, ) = msg.sender.call{value: address(this).balance}("");
    require(success, "Withdraw failed");
  }

  function setStaking( address _stakingHelper ) external onlyAdmin() {
      require( _stakingHelper != address(0) );
      stakingHelper = _stakingHelper;
    }

  modifier onlyAdmin() {
    require(hasRole(ADMIN_ROLE, msg.sender), "Caller is not an admin");
    _;
  }
}