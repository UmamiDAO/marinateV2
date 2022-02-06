// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.0;

// contracts
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// interfaces
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IDateTime } from "./interfaces/IDateTime.sol";

contract MarinateV2 is AccessControl, IERC721Receiver, ReentrancyGuard, ERC20 {
    using SafeERC20 for IERC20;

    uint32 constant DAY_IN_SECONDS = 86400;
    address public immutable UMAMI;
    IDateTime public dateTime;
    uint256 public totalStaked = 0;
    uint256 public totalMultipliedStaked = 0;


    /// @notice
    /// @dev mapping (address => excessTokenRewards)
    mapping(address => uint256) public excessTokenRewards;

    /// @notice
    /// @dev mapping (address => totalCumTokenRewardsPerStake)
    mapping(address => uint256) public totalCumTokenRewardsPerStake;

    /// @notice
    /// @dev mapping (address => ( address => paidCumTokenRewardsPerStake))
    mapping(address => mapping(address => uint256)) public paidCumTokenRewardsPerStake;

    /// @notice
    /// @dev mapping (address => nft multipliers)
    mapping(address => uint256) public multipliers;

    /// @notice
    /// @dev mapping (address => ( address => multiplierStaked))
    mapping(address => mapping(address => bool)) public multiplierStaked;

    /// @notice
    /// @dev mapping (address => isApprovedRewardToken)
    mapping(address => bool) public isApprovedRewardToken;

    /// @notice
    /// @dev mapping (address => isApprovedMultiplierToken)
    mapping(address => bool) public isApprovedMultiplierToken;

    /// @notice
    /// @dev mapping (address => Marinator)
    mapping(address => Marinator) public marinatorInfo;

    /// @notice
    /// @dev mapping (address => ( address => toBePaid))
    mapping(address => mapping(address => uint256)) public toBePaid;

    /// @notice
    /// @dev array rewardsTokens
    address[] public rewardTokens;

    /// @notice
    /// @dev array multiplierTokens
    address[] public multiplierTokens;

    /// @notice wat is dis
    /// @dev
    uint256 public SCALE = 1e40;

    /// @notice is staking enabled
    /// @dev bool stakeEnabled
    bool public stakeEnabled;

    /// @notice are wiuthdrawals enabled
    /// @dev
    bool public withdrawEnabled;

    /// @notice allow early withdrawals from staking
    /// @dev
    bool public allowEarlyWithdrawals;

    /// @notice the admin role hash
    /// @dev
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /*==== STRUCTS ====*/

    struct Marinator {
        uint256 lastDepositTime;
        uint256 amount;
        uint256 multipliedAmount;
    }

    /*==== EVENTS ====*/

    event Stake(address addr, uint256 amount, uint256 multipliedAmount);
    event StakeMultiplier(address addr, address nft, uint256 tokenId);
    event Withdraw(address addr, uint256 amount);
    event WithdrawMultiplier(address addr, address nft, uint256 tokenId);
    event RewardCollection(address token, address addr, uint256 amount);
    event RewardAdded(address token, uint256 amount, uint256 rps);

    /*==== CONSTRUCTOR ====*/

    constructor(
        address _UMAMI,
        address _dateTime,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        UMAMI = _UMAMI;
        dateTime = IDateTime(_dateTime);
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        rewardTokens.push(_UMAMI);
        isApprovedRewardToken[_UMAMI] = true;
        stakeEnabled = true;
        withdrawEnabled = true;
        allowEarlyWithdrawals = false;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        return MarinateV2.onERC721Received.selector;
    }

    /**
     * @dev Hook that is called after any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * has been transferred to `to`.
     * - when `from` is zero, `amount` tokens have been minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens have been burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        if (from == address(0) || to == address(0)) {
            return;
        } else {
            uint256 fromBalance = balanceOf(from);
            uint256 toBalance = balanceOf(to);
            // update marinator info
            Marinator memory marinatorFrom = marinatorInfo[from];
            Marinator memory marinatorTo = marinatorInfo[to];

            // get new multiplied amounts
            uint256 multipliedFromAmount = _getMultipliedAmount(fromBalance, from);
            uint256 multipliedToAmount = _getMultipliedAmount(toBalance, to);

            // calculate total old multiplied amounts
            uint256 oldMultipliedAmount = marinatorFrom.multipliedAmount + marinatorTo.multipliedAmount;
            uint256 newMultipliedAmount = multipliedFromAmount + multipliedToAmount;

            // calculate new total multiplied staked
            totalMultipliedStaked -= oldMultipliedAmount;
            totalMultipliedStaked += newMultipliedAmount;

            // update marinator info
            marinatorInfo[from] = Marinator({
                lastDepositTime: marinatorFrom.lastDepositTime,
                amount: fromBalance,
                multipliedAmount: multipliedFromAmount
            });
            marinatorInfo[to] = Marinator({
                lastDepositTime: marinatorTo.lastDepositTime,
                amount: toBalance,
                multipliedAmount: multipliedToAmount
            });
        }
    }

    /**
     * @notice adds a reward token amount
     * @param token the token address of the reward
     * @param amount the amount of the token
     */
    function addReward(address token, uint256 amount) external nonReentrant {
        require(isApprovedRewardToken[token], "Token is not approved for rewards");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        if (totalStaked == 0) {
            // Rewards which nobody is eligible for
            excessTokenRewards[token] += amount;
            return;
        }
        uint256 rewardPerStake = (amount * SCALE) / totalMultipliedStaked;
        require(rewardPerStake > 0, "insufficient reward per stake");
        totalCumTokenRewardsPerStake[token] += rewardPerStake;
        emit RewardAdded(token, amount, rewardPerStake);
    }

    /**
     * @notice stake a multiplier nft
     * @param _NFT the address of the NFT contract
     * @param tokenId the tokenId of the nft to stake
     */
    function stakeMultiplier(address _NFT, uint256 tokenId) external {
        require(stakeEnabled, "Staking not enabled");
        require(dateTime.getDay(block.timestamp) == 1, "Not 1st of month");
        require(isApprovedMultiplierToken[_NFT], "Not approved NFT");
        require(!multiplierStaked[msg.sender][_NFT], "NFT already staked");

        // stake nft multiplier
        IERC721(_NFT).safeTransferFrom(msg.sender, address(this), tokenId);
        multiplierStaked[msg.sender][_NFT] = true;

        // Update existing marinated amount
        Marinator memory info = marinatorInfo[msg.sender];
        uint256 multipliedAmount = _getMultipliedAmount(info.amount, msg.sender);
        uint256 oldMultipliedAmount = info.multipliedAmount;

        // update marinator info
        marinatorInfo[msg.sender] = Marinator({
            lastDepositTime: info.lastDepositTime,
            amount: info.amount,
            multipliedAmount: multipliedAmount
        });

        // update totals
        totalMultipliedStaked -= oldMultipliedAmount;
        totalMultipliedStaked += multipliedAmount;

        // Store the sender's info
        emit StakeMultiplier(msg.sender, _NFT, tokenId);
    }

    /**
     * @notice withdraw a multiplier nft
     * @param _NFT the address of the NFT contract
     * @param tokenId the tokenId of the nft to stake
     */
    function withdrawMultiplier(address _NFT, uint256 tokenId) external {
        require(withdrawEnabled, "Withdraw not enabled");
        require(dateTime.getDay(block.timestamp) == 1, "Not 1st of month");
        require(isApprovedMultiplierToken[_NFT], "Not approved NFT");
        require(multiplierStaked[msg.sender][_NFT], "NFT not staked");

        // check nft not locked
        Marinator memory info = marinatorInfo[msg.sender];
        require(info.lastDepositTime + DAY_IN_SECONDS < block.timestamp, "NFT locked");

        // unstake nft
        IERC721(_NFT).safeTransferFrom(address(this), msg.sender, tokenId);
        multiplierStaked[msg.sender][_NFT] = false;

        // update totals
        uint256 oldMultipliedAmount = info.multipliedAmount;
        uint256 baseAmount = info.amount;
        uint256 multipliedAmount = _getMultipliedAmount(baseAmount, msg.sender);

        // Update existing marinated amount
        marinatorInfo[msg.sender] = Marinator({
            lastDepositTime: info.lastDepositTime,
            amount: baseAmount,
            multipliedAmount: multipliedAmount
        });

        // to handle the case of multiple staked nft's
        totalMultipliedStaked -= oldMultipliedAmount;
        totalMultipliedStaked += multipliedAmount;

        emit WithdrawMultiplier(msg.sender, _NFT, tokenId);
    }

    /**
     * @notice stake UMAMI
     * @param amount the amount of umami to stake
     */
    function stake(uint256 amount) external {
        require(stakeEnabled, "Staking not enabled");
        require(dateTime.getDay(block.timestamp) == 1, "Not 1st of month");
        require(amount > 0, "Invalid stake amount");

        // Wrap the sUMAMI into wsUMAMI
        IERC20(UMAMI).safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);

        uint256 multipliedAmount = _getMultipliedAmount(amount, msg.sender);

        // Store the sender's info
        Marinator memory info = marinatorInfo[msg.sender];
        marinatorInfo[msg.sender] = Marinator({
            lastDepositTime: block.timestamp,
            amount: info.amount + amount,
            multipliedAmount: info.multipliedAmount + multipliedAmount
        });

        if (info.amount == 0) {
            // New user - not eligible for any previous rewards on any token
            for (uint256 i = 0; i < rewardTokens.length; i++) {
                address token = rewardTokens[i];
                paidCumTokenRewardsPerStake[token][msg.sender] = totalCumTokenRewardsPerStake[token];
            }
        } else {
            _collectRewards();
        }

        totalStaked += amount;
        totalMultipliedStaked += multipliedAmount;
        emit Stake(msg.sender, amount, multipliedAmount);
    }

    /**
     * @notice withdraw staked UMAMI and burn sUMAMI
     */
    function withdraw() public nonReentrant {
        require(withdrawEnabled, "Withdraw not enabled");
        require(allowEarlyWithdrawals || dateTime.getDay(block.timestamp) == 1, "Too soon");

        _collectRewards();
        _payRewards();

        Marinator memory info = marinatorInfo[msg.sender];
        delete marinatorInfo[msg.sender];
        totalMultipliedStaked -= info.multipliedAmount;
        totalStaked -= info.amount;

        IERC20(UMAMI).safeTransfer(msg.sender, info.amount);
        _burn(msg.sender, info.amount);

        emit Withdraw(msg.sender, info.amount);
    }

    /**
     * @notice pay rewards to a marinator
     */
    function _payRewards() private {
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            uint256 amount = toBePaid[token][msg.sender];
            IERC20(token).safeTransfer(msg.sender, amount);
            delete toBePaid[token][msg.sender];
        }
    }

    /**
     * @notice collect rewards from a marinator
     */
    function _collectRewards() private {
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            _collectRewardsForToken(rewardTokens[i]);
        }
    }

    /**
     * @notice collect rewards for a token
     * @param token the token to collect rewards for
     */
    function _collectRewardsForToken(address token) private {
        Marinator memory info = marinatorInfo[msg.sender];
        require(info.multipliedAmount > 0, "No stake for rewards");
        uint256 owedPerUnitStake = totalCumTokenRewardsPerStake[token] - paidCumTokenRewardsPerStake[token][msg.sender];
        uint256 totalRewards = (info.multipliedAmount * owedPerUnitStake) / SCALE;
        paidCumTokenRewardsPerStake[token][msg.sender] = totalCumTokenRewardsPerStake[token];
        toBePaid[token][msg.sender] += totalRewards;
    }

    /**
     * @notice get the multiplied amount of total share
     * @param amount the unmultiplied amount
     * @return multipliedAmount the reward amount considering the multiplier nft's the user has staked
     */
    function _getMultipliedAmount(uint256 amount, address account) private returns (uint256 multipliedAmount) {
        uint256 multiplier = 1;
        for (uint256 i = 0; i < multiplierTokens.length; i++) {
            if (multiplierStaked[account][multiplierTokens[i]]) {
                multiplier += multipliers[multiplierTokens[i]];
            }
        }
        multipliedAmount = amount * multiplier * SCALE;
    }

    /**
     * @notice get the available token rewards
     * @param staker the marinator
     * @param token the token to check for
     * @return totalRewards - the available rewards for that token and marinator
     */
    function getAvailableTokenRewards(address staker, address token) external view returns (uint256 totalRewards) {
        Marinator memory info = marinatorInfo[staker];
        uint256 owedPerUnitStake = totalCumTokenRewardsPerStake[token] - paidCumTokenRewardsPerStake[token][staker];
        uint256 pendingRewards = (info.multipliedAmount * owedPerUnitStake) / SCALE;
        totalRewards = pendingRewards + toBePaid[token][staker];
    }

    /**
     * @notice withdraw excess rewards from the contract
     */
    function withdrawExcessRewards() external onlyAdmin {
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            uint256 amount = excessTokenRewards[rewardTokens[i]];
            if (amount == 0) {
                continue;
            }
            IERC20(rewardTokens[i]).safeTransfer(msg.sender, amount);
            excessTokenRewards[rewardTokens[i]] = 0;
        }
    }

    /**
     * @notice add an approved reward token to be paid
     * @param token the address of the token to be paid in
     */
    function addApprovedRewardToken(address token) external onlyAdmin {
        require(!isApprovedRewardToken[token], "Reward token exists");
        isApprovedRewardToken[token] = true;
        rewardTokens.push(token);
    }

    /**
     * @notice remove a reward token
     * @param token the address of the token to remove
     */
    function removeApprovedRewardToken(address token) external onlyAdmin {
        require(isApprovedRewardToken[token], "Reward token does not exist");
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            if (rewardTokens[i] == token) {
                rewardTokens[i] = rewardTokens[rewardTokens.length - 1];
                rewardTokens.pop();
                isApprovedRewardToken[token] = false;
            }
        }
    }

    /**
     * @notice add an nft multiplier token
     * @param token the address of the token to add
     * @param multiplier the multiplier amount for that nft collection
     */
    function addApprovedMultiplierToken(address token, uint256 multiplier) external onlyAdmin {
        require(!isApprovedMultiplierToken[token], "Reward token exists");
        isApprovedMultiplierToken[token] = true;
        multipliers[token] = multiplier;
        multiplierTokens.push(token);
    }

    /**
     * @notice remove a nft multiplier token
     * @param token the address of the token to remove
     */
    function removeApprovedMultiplierToken(address token) external onlyAdmin {
        require(isApprovedMultiplierToken[token], "Reward token does not exist");
        for (uint256 i = 0; i < multiplierTokens.length; i++) {
            if (multiplierTokens[i] == token) {
                multiplierTokens[i] = multiplierTokens[multiplierTokens.length - 1];
                multiplierTokens.pop();
                isApprovedMultiplierToken[token] = false;
            }
        }
    }

    /*==== MUTATORS ====*/

    /**
     * @notice set the scale
     * @param _scale scale
     */
    function setScale(uint256 _scale) external onlyAdmin {
        SCALE = _scale;
    }

    /**
     * @notice set staking enabled
     * @param enabled enabled
     */
    function setStakeEnabled(bool enabled) external onlyAdmin {
        stakeEnabled = enabled;
    }

    /**
     * @notice set withdrawal enabled
     * @param enabled enabled
     */
    function setWithdrawEnabled(bool enabled) external onlyAdmin {
        withdrawEnabled = enabled;
    }

    /**
     * @notice set allow early withdrawals
     * @param enabled enabled
     */
    function setAllowEarlyWithdrawals(bool enabled) external onlyAdmin {
        allowEarlyWithdrawals = enabled;
    }

    /*==== ADMIN ====*/

    /**
     * @notice migrate a token to a different address
     * @param token the token address
     * @param destination the token destination
     * @param amount the token amount
     */
    function migrateToken(
        address token,
        address destination,
        uint256 amount
    ) external onlyAdmin {
        uint256 total = 0;
        if (amount == 0) {
            total = IERC20(token).balanceOf(address(this));
        } else {
            total = amount;
        }
        IERC20(token).safeTransfer(destination, total);
    }

    /**
     * @notice recover eth
     */
    function recoverEth() external onlyAdmin {
        // For recovering eth mistakenly sent to the contract
        (bool success, ) = msg.sender.call{ value: address(this).balance }("");
        require(success, "Withdraw failed");
    }

    /*==== MODIFIERS ====*/

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "Caller is not an admin");
        _;
    }
}
