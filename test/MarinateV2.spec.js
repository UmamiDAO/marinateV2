const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MarinateV2", async function () {
  let owner, accounts;
  let DateTime;
  let MockedUMAMI;
  let MarinateV2;
  let RewardToken, MockedNFT, MockedNFT2, MockedERC20, MockedERC202;
  let SCALE;

  async function printTokenBalance(token, address) {
    let balance = await token.balanceOf(address);
    console.log(`token balance for ${address} is ${ethers.utils.formatEther(balance)}`);
  }

  async function fastForward(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  async function setup() {
    const _MarinateV2 = await ethers.getContractFactory("MarinateV2");
    MarinateV2 = await _MarinateV2.deploy(MockedUMAMI.address, "Marinated UMAMI", "mUMAMI", "1000000000000000000000");
    await MarinateV2.addApprovedRewardToken(RewardToken.address);
    await MockedUMAMI.mint(owner.address, ethers.utils.parseEther("100000"));
    await MockedUMAMI.transfer(accounts[0].address, ethers.utils.parseEther("10000"));
    SCALE = await MarinateV2.SCALE();
  }

  before(async () => {
    // setup peripheral contracts
    [owner, ...accounts] = await ethers.getSigners();
    const _MockedUMAMI = await ethers.getContractFactory("MockERC20");
    MockedUMAMI = await _MockedUMAMI.deploy("UMAMI", "UMAMI");
    const _MockedNFT = await ethers.getContractFactory("MockERC721");
    MockedNFT = await _MockedNFT.deploy("UMAMI-NFT-2%", "UMAMI-NFT");
    MockedNFT2 = await _MockedNFT.deploy("UMAMI-NFT-10%", "UMAMI-NFT");

    // reward token
    const _RewardToken = await ethers.getContractFactory("MockERC20");
    RewardToken = await _RewardToken.deploy("RWD", "RWD");
  });

  describe("#stake", async function () {
    beforeEach(async () => {
      await setup();
    });

    it("sets the storage variables", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      const mUmamiBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(mUmamiBalance).to.equal(amount);
    });

    it("reverts for invalid amount", async function () {
      let amount = 0;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await expect(MarinateV2.connect(accounts[0]).stake(amount)).to.be.revertedWith("Invalid stake amount");
    });

    it("reverts when not enabled", async function () {
      let amount = 100;
      await MarinateV2.connect(owner).setStakeEnabled(false);
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await expect(MarinateV2.connect(accounts[0]).stake(amount)).to.be.revertedWith("Staking not enabled");
    });

    it("collects rewards for prior stakers when depositing", async function () {
      let amount = 100;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, "100");
      await MarinateV2.connect(accounts[0]).stake(amount);
      const toBePaidRewards = await MarinateV2.toBePaid(RewardToken.address, accounts[0].address);
      expect(toBePaidRewards).to.equal(100000);
    });
    it("Stake twice", async function () {
      const amount = ethers.utils.parseEther("100");
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount.mul(2));
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      const balance = await MarinateV2.balanceOf(accounts[0].address);
      expect(balance).to.be.equal(amount.mul(2));
    });
  });
  describe("#withdraw", async function () {
    beforeEach(async () => {
      await setup();
    });

    it("sets storage variables after withdrawing", async function () {
      let amount = 100000;
      await MarinateV2.connect(owner).setStakingWithdrawEnabled(true);
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      const balanceBeforeStake = await MockedUMAMI.balanceOf(accounts[0].address);
      await MarinateV2.connect(accounts[0]).stake(amount);
      const balanceAfterStake = await MockedUMAMI.balanceOf(accounts[0].address);
      expect(balanceAfterStake).to.be.equal(balanceBeforeStake.sub(amount));
      const mUmamiBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(mUmamiBalance).to.equal(amount);

      await MarinateV2.connect(accounts[0]).withdraw();
      const balanceAfterWithdraw = await MockedUMAMI.balanceOf(accounts[0].address);
      expect(balanceAfterWithdraw).to.equal(balanceBeforeStake);
    });
    it("Stake and Double Withdraw", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(owner).setStakingWithdrawEnabled(true);
      await MarinateV2.connect(accounts[0]).withdraw();
      await expect(MarinateV2.connect(accounts[0]).withdraw()).to.be.revertedWith("No staked balance");
    });

    it("collects and pays the rewards when a user has pending rewards", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(owner).setStakingWithdrawEnabled(true);
      await MarinateV2.connect(accounts[0]).withdraw();
      const usrRewardBalance = await RewardToken.balanceOf(accounts[0].address);
      const paidRewards = await MarinateV2.paidTokenRewardsPerStake(RewardToken.address, accounts[0].address);
      const totalRewards = await MarinateV2.totalTokenRewardsPerStake(RewardToken.address);
      expect(paidRewards).to.equal(totalRewards);
      expect(usrRewardBalance).to.equal(100000);
    });
    it("burns the users mUMAMI", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      await MarinateV2.connect(owner).setStakingWithdrawEnabled(true);
      await MarinateV2.connect(accounts[0]).withdraw();
      const mUMAMIBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(mUMAMIBalance).to.equal(0);
    });
    it("returns the users UMAMI tokens", async function () {
      let amount = 100000;
      await MockedUMAMI.mint(accounts[1].address, amount);
      await MockedUMAMI.connect(accounts[1]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[1]).stake(amount);
      const UMAMIBalancePrior = await MockedUMAMI.balanceOf(accounts[1].address);
      await MarinateV2.connect(owner).setStakingWithdrawEnabled(true);
      await MarinateV2.connect(accounts[1]).withdraw();
      const UMAMIBalance = await MockedUMAMI.balanceOf(accounts[1].address);
      expect(UMAMIBalance - UMAMIBalancePrior).to.equal(100000);
    });
    it("Stake and Withdraw - Locked funds", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await fastForward(60 * 60 * 24);
      await expect(MarinateV2.connect(accounts[0]).withdraw()).to.be.revertedWith("Withdraw not enabled");
    });
  });

  describe("#addReward", async function () {
    beforeEach(async () => {
      await setup();
      const _MockedERC20 = await ethers.getContractFactory("MockERC20");
      MockedERC20 = await _MockedERC20.deploy("MCK", "MCK");
    });
    it("can only add a reward of an approved token", async function () {
      await expect(MarinateV2.connect(owner).addReward(MockedERC20.address, 1)).to.be.revertedWith(
        "Token is not approved",
      );
    });

    it("updates the storage variables for the reward added", async function () {
      let one = ethers.utils.parseEther("1");
      let amount = 100000;
      await MarinateV2.addApprovedRewardToken(MockedERC20.address);
      await MockedERC20.mint(owner.address, one);
      await MockedERC20.connect(owner).approve(MarinateV2.address, one);
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await MarinateV2.connect(owner).addReward(MockedERC20.address, one);

      const totalRewardsPerStake = await MarinateV2.totalTokenRewardsPerStake(MockedERC20.address);
      expect(totalRewardsPerStake).to.equal(SCALE.mul(10000000000000));
    });

    it("updates the storage variables for the reward added with no stake", async function () {
      let one = ethers.utils.parseEther("1");
      await MarinateV2.addApprovedRewardToken(MockedERC20.address);
      await MockedERC20.mint(owner.address, one);
      await MockedERC20.connect(owner).approve(MarinateV2.address, one);

      await expect(MarinateV2.connect(owner).addReward(MockedERC20.address, one)).to.be.revertedWith(
        "Total staked is zero",
      );

      const totalRewardsPerStake = await MarinateV2.totalTokenRewardsPerStake(MockedERC20.address);
      expect(totalRewardsPerStake).to.equal(0);
    });
  });

  describe("#claimRewards", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("can claim rewards varying in size for varing users", async function () {
      let amount = 100000;
      let three = ethers.utils.parseEther("3");
      let two = ethers.utils.parseEther("2");
      let one = ethers.utils.parseEther("1");
      const initAccountBalance1 = await RewardToken.balanceOf(accounts[0].address);
      const initAccountBalance2 = await RewardToken.balanceOf(accounts[1].address);
      const initAccountBalance3 = await RewardToken.balanceOf(accounts[2].address);

      await MockedUMAMI.mint(accounts[1].address, amount);
      await MockedUMAMI.mint(accounts[2].address, amount);

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await RewardToken.mint(owner.address, three);
      await RewardToken.connect(owner).approve(MarinateV2.address, three);

      await MarinateV2.connect(owner).addReward(RewardToken.address, one);

      await MockedUMAMI.connect(accounts[1]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[1]).stake(amount);
      await MarinateV2.connect(owner).addReward(RewardToken.address, one);

      await MockedUMAMI.connect(accounts[2]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[2]).stake(amount);
      await MarinateV2.connect(owner).addReward(RewardToken.address, one);

      await MarinateV2.connect(accounts[0]).claimRewards();
      await MarinateV2.connect(accounts[1]).claimRewards();
      await MarinateV2.connect(accounts[2]).claimRewards();

      const finalAccountBalance1 = await RewardToken.balanceOf(accounts[0].address);
      const finalAccountBalance2 = await RewardToken.balanceOf(accounts[1].address);
      const finalAccountBalance3 = await RewardToken.balanceOf(accounts[2].address);
      const epoch1 = Math.round(ethers.utils.formatEther(one.add(one.div(2)).add(one.div(3))) * 1e6) / 1e6;
      const epoch2 = Math.round(ethers.utils.formatEther(one.div(2).add(one.div(3))) * 1e6) / 1e6;
      const epoch3 = Math.round(ethers.utils.formatEther(one.div(3)) * 1e6) / 1e6;

      expect(Math.round(ethers.utils.formatEther(finalAccountBalance1.sub(initAccountBalance1)) * 1e6) / 1e6).to.equal(
        epoch1,
      );
      expect(Math.round(ethers.utils.formatEther(finalAccountBalance2.sub(initAccountBalance2)) * 1e6) / 1e6).to.equal(
        epoch2,
      );
      expect(Math.round(ethers.utils.formatEther(finalAccountBalance3.sub(initAccountBalance3)) * 1e6) / 1e6).to.equal(
        epoch3,
      );
    });
  });

  describe("#managingRewardTokens", async function () {
    beforeEach(async () => {
      await setup();
      const _MockedERC20 = await ethers.getContractFactory("MockERC20");
      MockedERC20 = await _MockedERC20.deploy("MCK", "MCK");
    });
    it("Add Reward Token", async function () {
      await MarinateV2.addApprovedRewardToken(MockedERC20.address);
      await expect(MarinateV2.addApprovedRewardToken(MockedERC20.address)).to.be.revertedWith("Reward token exists");
    });

    it("RemoveReward Token", async function () {
      await MarinateV2.addApprovedRewardToken(MockedERC20.address);
      await MarinateV2.removeApprovedRewardToken(MockedERC20.address);
      await expect(MarinateV2.removeApprovedRewardToken(MockedERC20.address)).to.be.revertedWith("");
    });

    it("Add Reward Token - No duplicates", async function () {
      await expect(MarinateV2.addApprovedRewardToken(MockedUMAMI.address)).to.be.revertedWith("Reward token exists");
    });
  });

  describe("#getAvailableTokenRewards", async function () {
    beforeEach(async () => {
      await setup();
      const _MockedERC20 = await ethers.getContractFactory("MockERC20");
      MockedERC20 = await _MockedERC20.deploy("MCK", "MCK");
      MockedERC202 = await _MockedERC20.deploy("MCK2", "MCK2");
    });
    it("retrives accurate token reward 0 rewards", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.addApprovedRewardToken(MockedERC20.address);

      const totalRewards = await MarinateV2.getAvailableTokenRewards(accounts[0].address, MockedERC20.address);
      expect(totalRewards).to.equal(0);
    });

    it("retrives accurate token reward - 1 reward", async function () {
      let one = ethers.utils.parseEther("1");
      let two = ethers.utils.parseEther("2");
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).transfer(accounts[1].address, partial);
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, partial);
      await MarinateV2.connect(accounts[0]).stake(partial);
      await MockedUMAMI.connect(accounts[1]).approve(MarinateV2.address, partial);
      await MarinateV2.connect(accounts[1]).stake(partial);

      await MarinateV2.addApprovedRewardToken(MockedERC20.address);

      await MockedERC20.mint(owner.address, two);
      await MockedERC20.connect(owner).approve(MarinateV2.address, two);
      await MarinateV2.connect(owner).addReward(MockedERC20.address, two);

      const accountReward = await MarinateV2.getAvailableTokenRewards(accounts[0].address, MockedERC20.address);
      const accountReward1 = await MarinateV2.getAvailableTokenRewards(accounts[1].address, MockedERC20.address);

      expect(accountReward).to.equal(one);
      expect(accountReward1).to.equal(one);
    });

    it("retrives accurate token reward - 2 rewards", async function () {
      let one = ethers.utils.parseEther("1");
      let two = ethers.utils.parseEther("2");
      let half = ethers.utils.parseEther("0.5");
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).transfer(accounts[1].address, partial);
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, partial);
      await MarinateV2.connect(accounts[0]).stake(partial);
      await MockedUMAMI.connect(accounts[1]).approve(MarinateV2.address, partial);
      await MarinateV2.connect(accounts[1]).stake(partial);

      await MarinateV2.addApprovedRewardToken(MockedERC20.address);
      await MarinateV2.addApprovedRewardToken(MockedERC202.address);

      await MockedERC20.mint(owner.address, two);
      await MockedERC20.connect(owner).approve(MarinateV2.address, two);
      await MarinateV2.connect(owner).addReward(MockedERC20.address, two);

      await MockedERC202.mint(owner.address, one);
      await MockedERC202.connect(owner).approve(MarinateV2.address, one);
      await MarinateV2.connect(owner).addReward(MockedERC202.address, one);

      const accountReward = await MarinateV2.getAvailableTokenRewards(accounts[0].address, MockedERC20.address);
      const accountReward1 = await MarinateV2.getAvailableTokenRewards(accounts[1].address, MockedERC20.address);
      const Reward = await MarinateV2.getAvailableTokenRewards(accounts[0].address, MockedERC202.address);
      const Reward1 = await MarinateV2.getAvailableTokenRewards(accounts[1].address, MockedERC202.address);

      expect(accountReward).to.equal(one);
      expect(accountReward1).to.equal(one);
      expect(Reward).to.equal(half);
      expect(Reward1).to.equal(half);
    });
  });

  describe("#removeApprovedRewardToken", async function () {
    beforeEach(async () => {
      await setup();
      const _MockedERC20 = await ethers.getContractFactory("MockERC20");
      MockedERC20 = await _MockedERC20.deploy("MCK", "MCK");
    });

    it("reverts if already added", async function () {
      await expect(MarinateV2.connect(owner).removeApprovedRewardToken(MockedERC20.address)).to.revertedWith(
        "Reward token does not exist",
      );
    });
  });

  describe("#setDepositLimit", async function () {
    beforeEach(async () => {
      await setup();
    });
  });
});
