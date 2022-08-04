// SPDX-License-Identifier: GNU GPLv3
pragma solidity 0.8.4;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IMarinate {
    function addReward(address token, uint256 amount) external;
}

contract MarinateReceiver is AccessControl, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    EnumerableSet.AddressSet private distributedTokens;
    address public immutable UMAMI;
    IMarinate public marinateContract;
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant AUTOMATION_ROLE = keccak256("AUTOMATION_ROLE");
    event RewardAdded(address token, uint256 amount);

    constructor(address _marinate, address _UMAMI) {
        UMAMI = _UMAMI;
        marinateContract = IMarinate(_marinate);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(ADMIN_ROLE, msg.sender);
    }

    function sendBalancesAsRewards() external onlyAdminOrAutomation nonReentrant {
        uint256 numberOfDistributedTokens = distributedTokens.length();
        for (uint256 i = 0; i < numberOfDistributedTokens; i++) {
            address token = distributedTokens.at(i);
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            if (tokenBalance == 0) {
                continue;
            }
            _addRewards(token, tokenBalance);
            emit RewardAdded(token, tokenBalance);
        }
    }

    function _addRewards(address token, uint256 amount) private {
        IERC20(token).safeApprove(address(marinateContract), amount);
        marinateContract.addReward(token, amount);
    }

    function addDistributedToken(address token) external onlyAdmin {
        distributedTokens.add(token);
    }

    function removeDistributedToken(address token) external onlyAdmin {
        distributedTokens.remove(token);
    }

    function setMarinateAddress(address marinate) external onlyAdmin {
        marinateContract = IMarinate(marinate);
    }

    function recoverEth() external onlyAdmin {
        (bool success, ) = msg.sender.call{value: address(this).balance}("");
        require(success, "Withdraw failed");
    }

    function recoverToken(address token) external onlyAdmin {
        uint256 total = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, total);
    }

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "Not admin");
        _;
    }

    modifier onlyAdminOrAutomation() {
        require(hasRole(ADMIN_ROLE, msg.sender) || hasRole(AUTOMATION_ROLE, msg.sender), "Not admin or automation");
        _;
    }
}
