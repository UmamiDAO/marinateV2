// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./MarinateV2.sol";
import "./interfaces/IwsUMAMI.sol";

// interface IwsUMAMI is IERC20 {
//   function wMEMOToMEMO( uint _amount ) external view returns ( uint );
// }

interface ITreasury {
    function mintRewards( address _recipient, uint _amount ) external;
}

contract MarinateUnlocker is ReentrancyGuard {
  address constant UMAMI = 0x1622bF67e6e5747b81866fE0b85178a93C7F86e3;
  address constant sUMAMI = 0xe6d557d416ff5640235119369c7e26AA18a906D7;
  address constant wsUMAMI = 0x3CacDc222F8Cd8D249e9A45CA4AD2aa381DA2692;
  address constant treasury = 0xE8E6a534146EFdCAdB64C4ce78600E5C9e71fc97;
  address constant marinate = 0x190a6b6E8e4D9B8324E1F97127c588C5b082d94b;
  mapping(address => bool) public hasUnlocked;
  
  event Unlocked(address recipient, uint256 levelId, uint256 wrappedAmount, uint256 unwrappedAmount, uint256 totalRewards, uint256 total);

  constructor() {}

  function unlock() external nonReentrant {
    require(!hasUnlocked[msg.sender], "Already unlocked");
    hasUnlocked[msg.sender] = true;
    uint256 total = 0;

    for (uint32 i = 0; i < 4; i++) {
      (,,uint256 wrappedAmount,,) = Marinate(marinate).marinatorInfo(msg.sender, i);
      if (wrappedAmount == 0) {
        // Nothing staked in this level
        continue;
      }
      uint256 unwrappedAmount = IwsUMAMI(wsUMAMI).wUMAMITosUMAMI(wrappedAmount);

      uint256 owedPerUnitStake = Marinate(marinate).totalCumTokenRewardsPerStake(UMAMI) - Marinate(marinate).paidCumTokenRewardsPerStake(UMAMI, msg.sender, i);
      uint256 pendingRewards = (Marinate(marinate).multipliedBalance(msg.sender, i) * owedPerUnitStake) / 1e40;
      uint256 rewards = pendingRewards + Marinate(marinate).toBePaid(UMAMI, msg.sender, i);
      total += unwrappedAmount + rewards;
      emit Unlocked(msg.sender, i, wrappedAmount, unwrappedAmount, rewards, total);
    }
    ITreasury(treasury).mintRewards(msg.sender, total);
  }
}
