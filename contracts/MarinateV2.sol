// SPDX-License-Identifier: GNU GPLv3
pragma solidity 0.8.4;

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//                                                                            //
//                              #@@@@@@@@@@@@&,                               //
//                      .@@@@@   .@@@@@@@@@@@@@@@@@@@*                        //
//                  %@@@,    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@                    //
//               @@@@     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                 //
//             @@@@     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@               //
//           *@@@#    .@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@             //
//          *@@@%    &@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@            //
//          @@@@     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           //
//          @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           //
//                                                                            //
//          (@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@,           //
//          (@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@,           //
//                                                                            //
//          @@@@@   @@@@@@@@@   @@@@@@@@@   @@@@@@@@@   @@@@@@@@@             //
//            &@@@@@@@    #@@@@@@@.   ,@@@@@@@,   .@@@@@@@/    @@@@           //
//                                                                            //
//          @@@@@      @@@%    *@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           //
//          @@@@@      @@@@    %@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@           //
//          .@@@@      @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@            //
//            @@@@@  &@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@             //
//                (&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&&(                 //
//                                                                            //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

// Libraries
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { ContractWhitelist } from "./ContractWhitelist.sol";

// Interfaces
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

/// @title Umami MarinateV2 Staking
/// @author 0xtoki luffyowls
contract MarinateV2 is AccessControl, IERC721Receiver, ReentrancyGuard, ERC20, ContractWhitelist {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    /************************************************
     *  STORAGE
     ***********************************************/

    /// @notice total token rewards
    mapping(address => uint256) public totalTokenRewardsPerStake;

    /// @notice number of reward epochs paid to marinator
    mapping(address => mapping(address => uint256)) public paidTokenRewardsPerStake;

    /// @notice rewards due to be paid to marinator
    mapping(address => mapping(address => uint256)) public toBePaid;

    /// @notice an array of reward tokens to issue rewards in
    EnumerableSet.AddressSet private rewardTokens;

    /// @notice is staking enabled
    bool public stakeEnabled;

    /// @notice are withdrawals enabled
    bool public withdrawEnabled;

    /// @notice if transfering mUMAMI is enabled
    bool public transferEnabled;

    /// @notice allow payment of rewards
    bool public payRewardsEnabled;

    /// @notice scale used for calcs
    uint256 public immutable SCALE;

    /// @notice deposit upper limit
    uint256 public depositLimit;

    /************************************************
     *  IMMUTABLES & CONSTANTS
     ***********************************************/

    /// @notice the admin role hash
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice for base calculations
    uint256 public constant BASE = 10000;

    /// @notice address of the UMAMI token
    address public immutable UMAMI;

    uint8 immutable _decimals;

    /************************************************
     *  EVENTS
     ***********************************************/

    event Stake(address addr, uint256 amount);
    event Withdraw(address addr, uint256 amount);
    event RewardCollection(address token, address addr, uint256 amount);
    event RewardAdded(address token, uint256 amount, uint256 rps);
    event RewardClaimed(address token, address staker, uint256 amount);

    /************************************************
     *  CONSTRUCTOR
     ***********************************************/

    constructor(
        address _UMAMI,
        string memory name,
        string memory symbol,
        uint256 _depositLimit
    ) ERC20(name, symbol) {
        UMAMI = _UMAMI;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        rewardTokens.add(_UMAMI);
        stakeEnabled = true;
        withdrawEnabled = false;
        transferEnabled = true;
        payRewardsEnabled = true;
        depositLimit = _depositLimit;
        SCALE = 1e40;
        _decimals = IERC20Metadata(_UMAMI).decimals();
    }

    /************************************************
     *  DEPOSIT & WITHDRAW
     ***********************************************/

    /**
     * @notice stake UMAMI
     * @param amount the amount of umami to stake
     */
    function stake(uint256 amount) external isEligibleSender {
        require(stakeEnabled, "Staking not enabled");
        require(amount > 0, "Invalid stake amount");
        require(totalSupply() + amount <= depositLimit, "Deposit capacity reached");

        uint256 balance = balanceOf(msg.sender);
        if (balance == 0) {
            // new user - not eligible for any previous rewards on any token
            _resetPaidRewards(msg.sender);
        } else {
            _collectRewards(msg.sender);
        }

        IERC20(UMAMI).safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);

        emit Stake(msg.sender, amount);
    }

    /**
     * @notice withdraw staked UMAMI and burn mUMAMI
     */
    function withdraw() public nonReentrant {
        require(withdrawEnabled, "Withdraw not enabled");
        uint256 balance = balanceOf(msg.sender);
        require(balance > 0, "No staked balance");

        _collectRewards(msg.sender);
        _payRewards(msg.sender);

        IERC20(UMAMI).safeTransfer(msg.sender, balance);
        _burn(msg.sender, balance);

        emit Withdraw(msg.sender, balance);
    }

    /************************************************
     *  REWARDS
     ***********************************************/

    /**
     * @notice claim rewards
     */
    function claimRewards() public nonReentrant {
        _collectRewards(msg.sender);
        _payRewards(msg.sender);
    }

    /**
     * @notice adds a reward token amount
     * @param token the token address of the reward
     * @param amount the amount of the token
     */
    function addReward(address token, uint256 amount) external nonReentrant {
        require(rewardTokens.contains(token), "Token is not approved");
        require(totalSupply() > 0, "Total staked is zero");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        uint256 rewardPerStake = (amount * SCALE) / totalSupply();
        require(rewardPerStake > 0, "Insufficient reward per stake");
        totalTokenRewardsPerStake[token] += rewardPerStake;
        emit RewardAdded(token, amount, rewardPerStake);
    }

    /**
     * @notice pay rewards to a marinator
     */
    function _payRewards(address user) private {
        require(payRewardsEnabled, "Pay rewards disabled");
        uint256 numberOfRewardTokens = rewardTokens.length();
        for (uint256 i = 0; i < numberOfRewardTokens; i++) {
            address token = rewardTokens.at(i);
            uint256 amount = toBePaid[token][user];
            IERC20(token).safeTransfer(user, amount);
            emit RewardClaimed(token, user, amount);
            delete toBePaid[token][user];
        }
    }

    /**
     * @notice reset rewards for user
     * @param user the user to reset rewards paid for
     */
    function _resetPaidRewards(address user) private {
        uint256 numberOfRewardTokens = rewardTokens.length();
        for (uint256 i = 0; i < numberOfRewardTokens; i++) {
            address token = rewardTokens.at(i);
            paidTokenRewardsPerStake[token][user] = totalTokenRewardsPerStake[token];
        }
    }

    /**
     * @notice collect rewards from a marinator
     * @param user the amount of umami to stake
     */
    function _collectRewards(address user) private {
        uint256 numberOfRewardTokens = rewardTokens.length();
        for (uint256 i = 0; i < numberOfRewardTokens; i++) {
            _collectRewardsForToken(rewardTokens.at(i), user);
        }
    }

    /**
     * @notice collect rewards for a token
     * @param token the token to collect rewards for
     * @param user the amount of umami to stake
     */
    function _collectRewardsForToken(address token, address user) private {
        uint256 balance = balanceOf(user);
        uint256 owedPerUnitStake = totalTokenRewardsPerStake[token] - paidTokenRewardsPerStake[token][user];
        uint256 totalRewards = (balance * owedPerUnitStake) / SCALE;
        paidTokenRewardsPerStake[token][user] = totalTokenRewardsPerStake[token];
        toBePaid[token][user] += totalRewards;
    }

    /************************************************
     *  MUTATORS
     ***********************************************/

    /**
     * @notice add an approved reward token to be paid
     * @param token the address of the token to be paid in
     */
    function addApprovedRewardToken(address token) external onlyAdmin {
        require(!rewardTokens.contains(token), "Reward token exists");
        rewardTokens.add(token);
    }

    /**
     * @notice remove a reward token
     * @param token the address of the token to remove
     */
    function removeApprovedRewardToken(address token) external onlyAdmin {
        require(rewardTokens.contains(token), "Reward token does not exist");
        require(IERC20(token).balanceOf(address(this)) == 0, "Reward token not completely claimed by everyone yet");
        rewardTokens.remove(token);
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
    function setStakingWithdrawEnabled(bool enabled) external onlyAdmin {
        withdrawEnabled = enabled;
    }

    /**
     * @notice set transfer enabled
     * @param enabled enabled
     */
    function setTransferEnabled(bool enabled) external onlyAdmin {
        transferEnabled = enabled;
    }

    /**
     * @notice set pay rewards enabled
     * @param enabled enabled
     */
    function setPayRewardsEnabled(bool enabled) external onlyAdmin {
        payRewardsEnabled = enabled;
    }

    /**
     * @notice set deposit limit
     * @param limit upper limit for deposits
     */
    function setDepositLimit(uint256 limit) external onlyAdmin {
        depositLimit = limit;
    }

    /************************************************
     *  VIEWS
     ***********************************************/

    /**
     * @notice get the available token rewards
     * @param staker the marinator
     * @param token the token to check for
     * @return totalRewards - the available rewards for that token and marinator
     */
    function getAvailableTokenRewards(address staker, address token) external view returns (uint256 totalRewards) {
        uint256 balance = balanceOf(staker);
        uint256 owedPerUnitStake = totalTokenRewardsPerStake[token] - paidTokenRewardsPerStake[token][staker];
        uint256 pendingRewards = (balance * owedPerUnitStake) / SCALE;
        totalRewards = pendingRewards + toBePaid[token][staker];
    }

    /************************************************
     *  ERC20 OVERRIDES
     ***********************************************/

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * will be transferred to `to`.
     * - when `from` is zero, `amount` tokens will be minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256
    ) internal virtual override {
        require(transferEnabled, "Transfer disabled");
        require(isWhitelisted(from) && isWhitelisted(to), "Not whitelisted");

        if (from == address(0) || to == address(0)) {
            return;
        } else {
            uint256 balance = balanceOf(to);
            if (balance == 0) {
                _resetPaidRewards(to);
            }
            _collectRewards(from);
            _collectRewards(to);
        }
    }

    function _beforeRemoveFromContractWhitelist(address _contract) internal override {
        _collectRewards(_contract);
        _payRewards(_contract);
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden;
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /************************************************
     *  ERC721 HANDLERS
     ***********************************************/

    /**
     * @notice ERC721 transfer
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return MarinateV2.onERC721Received.selector;
    }

    /************************************************
     *  MODIFIERS
     ***********************************************/

    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "Caller is not an admin");
        _;
    }
}
