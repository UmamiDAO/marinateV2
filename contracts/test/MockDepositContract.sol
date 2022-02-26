// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// contracts
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MarinateV2 } from "../MarinateV2.sol";

// interfaces
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockDepositContract {
    using SafeERC20 for IERC20;

    address public mUMAMI;

    constructor(address _mUMAMI) {
        mUMAMI = _mUMAMI;
    }

    function deposit(uint256 amount) external {
        IERC20(mUMAMI).safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdraw(uint256 amount) external {
        IERC20(mUMAMI).safeTransfer(msg.sender, amount);
    }

    function claimMarinateRewards() external {
        MarinateV2(mUMAMI).claimRewards();
    }
}
