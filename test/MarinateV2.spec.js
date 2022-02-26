const { expect } = require("chai");
const { ethers } = require("hardhat");
const SCALE = ethers.utils.parseUnits("1", 40);

describe("MarinateV2", async function () {
  let owner, accounts;
  let DateTime;
  let MockedUMAMI;
  let MarinateV2;
  let RewardToken, MockedNFT, MockedNFT2, MockedERC20, MockedERC202;

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
    MarinateV2 = await _MarinateV2.deploy(MockedUMAMI.address, "Marinated UMAMI", "mUMAMI");
    await MarinateV2.addApprovedRewardToken(RewardToken.address);
    await MarinateV2.addApprovedMultiplierToken(MockedNFT.address, 200);
    await MockedUMAMI.mint(owner.address, ethers.utils.parseEther("100000"));
    await MockedUMAMI.transfer(accounts[0].address, ethers.utils.parseEther("10000"));
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
      const info = await MarinateV2.marinatorInfo(accounts[0].address);
      const mUmamiBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(mUmamiBalance).to.equal(amount);
      expect(info.amount).to.equal(amount);
      expect(Math.round(info.multipliedAmount / Math.pow(10, 40))).to.equal(amount);
    });

    it("sets the multiplied amount with nft staked", async function () {
      await MockedNFT.mint(accounts[0].address, 0);
      let amount = 100000;
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, 0);
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, 0);
      await MarinateV2.connect(accounts[0]).stake(amount);
      const info = await MarinateV2.marinatorInfo(accounts[0].address);
      const mUmamiBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(mUmamiBalance).to.equal(amount);
      expect(info.amount).to.equal(amount);
      expect(Math.round(info.multipliedAmount / Math.pow(10, 40))).to.equal(amount * 1.02);
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
      const info = await MarinateV2.marinatorInfo(accounts[0].address);
      expect(info.amount).to.be.equal(amount.mul(2));
      expect(info.multipliedAmount.div(SCALE)).to.be.equal(amount.mul(2));
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
      await MarinateV2.connect(accounts[0]).stake(amount);

      await MarinateV2.connect(accounts[0]).withdraw();
      const info = await MarinateV2.marinatorInfo(accounts[0].address);
      const mUmamiBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(mUmamiBalance).to.equal(0);
      expect(info.amount).to.equal(0);
      expect(info.multipliedAmount).to.equal(0);
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

  describe("#withdrawMultiplier", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("can only withdraw approved multipliers", async function () {
      let amount = 100000;
      await MarinateV2.connect(owner).setMultiplierWithdrawEnabled(true);
      await expect(MarinateV2.connect(accounts[0]).withdrawMultiplier(MockedNFT2.address, 4)).to.be.revertedWith(
        "Unapproved NFT",
      );
    });

    it("reverts if withdrawal not enabled", async function () {
      await MarinateV2.connect(owner).setMultiplierStakeEnabled(false);
      await expect(MarinateV2.connect(accounts[0]).withdrawMultiplier(MockedNFT2.address, 4)).to.be.revertedWith(
        "Withdraw not enabled",
      );
    });

    it("can only withdraw if a multiplier has been staked", async function () {
      let amount = 100000;
      await MarinateV2.connect(owner).setMultiplierWithdrawEnabled(true);
      await expect(MarinateV2.connect(accounts[3]).withdrawMultiplier(MockedNFT.address, 4)).to.be.revertedWith(
        "NFT not staked",
      );
    });

    it("sets storage after multiplier is withdrawn", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      const initTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const initMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      await MockedNFT.mint(accounts[0].address, 5);
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, "5");
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, "5");

      await MarinateV2.connect(owner).setMultiplierWithdrawEnabled(true);
      await MarinateV2.connect(accounts[0]).withdrawMultiplier(MockedNFT.address, "5");

      const postTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const postMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      expect(postTotalMultiplied).to.equal(initTotalMultiplied);
      expect(initMarinatorInfo.multipliedAmount).to.equal(postMarinatorInfo.multipliedAmount);
    });
    it("sets storage after multiplier is withdrawn - different multipliers", async function () {
      let amount = 100000;
      await MarinateV2.connect(owner).setMultiplierWithdrawEnabled(true);
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(owner).addApprovedMultiplierToken(MockedNFT2.address, 500); // 5%

      const initTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const initMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      await MockedNFT.mint(accounts[0].address, 10);
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, "10");
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, "10");

      await MockedNFT2.mint(accounts[0].address, 7);
      await MockedNFT2.connect(accounts[0]).approve(MarinateV2.address, "7");
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT2.address, "7");

      await MarinateV2.connect(accounts[0]).withdrawMultiplier(MockedNFT.address, "10");
      await MarinateV2.connect(accounts[0]).withdrawMultiplier(MockedNFT2.address, "7");

      const postTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const postMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      expect(postTotalMultiplied).to.equal(initTotalMultiplied);
      expect(initMarinatorInfo.multipliedAmount).to.equal(postMarinatorInfo.multipliedAmount);
    });
  });

  describe("#stakeMultiplier", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("can only stake approved multipliers", async function () {
      let amount = 100000;
      await MockedNFT2.mint(accounts[0].address, 4);
      await MockedNFT2.connect(accounts[0]).approve(MarinateV2.address, "4");
      await expect(MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT2.address, "4")).to.be.revertedWith(
        "Unapproved NFT",
      );
    });

    it("sets storage after multiplier is staked", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      const initTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const initMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      await MockedNFT.mint(accounts[0].address, 6);
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, "6");
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, "6");

      const stakedTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const stakedMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      expect(Math.round(stakedTotalMultiplied / Math.pow(10, 40))).to.equal(
        Math.round(initTotalMultiplied / Math.pow(10, 40)) * 1.02,
      );
      expect(Math.round(stakedMarinatorInfo.multipliedAmount / Math.pow(10, 40))).to.equal(
        Math.round(initMarinatorInfo.multipliedAmount / Math.pow(10, 40)) * 1.02,
      );
    });
    it("sets storage after multiplier is staked - different multipliers", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(owner).addApprovedMultiplierToken(MockedNFT2.address, 500); // 5%

      const initTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const initMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      await MockedNFT.mint(accounts[0].address, 8);
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, "8");
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, "8");

      await MockedNFT2.mint(accounts[0].address, 9);
      await MockedNFT2.connect(accounts[0]).approve(MarinateV2.address, "9");
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT2.address, "9");

      const stakedTotalMultiplied = await MarinateV2.totalMultipliedStaked();
      const stakedMarinatorInfo = await MarinateV2.marinatorInfo(accounts[0].address);

      expect(Math.round(stakedTotalMultiplied / Math.pow(10, 40))).to.equal(
        Math.round(initTotalMultiplied / Math.pow(10, 40)) * 1.07,
      ); // 5% + 2%
      expect(Math.round(stakedMarinatorInfo.multipliedAmount / Math.pow(10, 40))).to.equal(
        Math.round(initMarinatorInfo.multipliedAmount / Math.pow(10, 40)) * 1.07,
      );
    });

    it("reverts if multiplierStakingEnabled disabled", async function () {
      let amount = 100000;
      await MarinateV2.connect(owner).setMultiplierStakeEnabled(false);
      await MockedNFT2.mint(accounts[0].address, 22);
      await MockedNFT2.connect(accounts[0]).approve(MarinateV2.address, "22");
      await expect(MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT2.address, "22")).to.be.revertedWith(
        "NFT staking not enabled",
      );
    });
    it("reverts if nft already staked", async function () {
      let amount = 100000;
      await MockedNFT.mint(accounts[0].address, 44);
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, "44");
      await MockedNFT.mint(accounts[0].address, 444);
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, "444");
      MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, "444");
      await expect(MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, "44")).to.be.revertedWith(
        "NFT already staked",
      );
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
      expect(totalRewardsPerStake).to.equal(10000000000000);
    });

    it("updates the storage variables for the reward added with no stake", async function () {
      let one = ethers.utils.parseEther("1");
      await MarinateV2.addApprovedRewardToken(MockedERC20.address);
      await MockedERC20.mint(owner.address, one);
      await MockedERC20.connect(owner).approve(MarinateV2.address, one);

      await expect(MarinateV2.connect(owner).addReward(MockedERC20.address, one)).to.be.revertedWith(
        "Total multiplied staked zero",
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
      const rewardAdded = await MarinateV2.isApprovedRewardToken(MockedERC20.address);
      expect(rewardAdded).to.be.equal(true);
    });

    it("RemoveReward Token", async function () {
      await MarinateV2.addApprovedRewardToken(MockedERC20.address);
      await MarinateV2.removeApprovedRewardToken(MockedERC20.address);
      const rewardTokenExists = await MarinateV2.isApprovedRewardToken(MockedERC20.address);
      expect(rewardTokenExists).to.be.equal(false);
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

  describe("#removeApprovedMultiplierToken", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("removes an approved multiplier token", async function () {
      await MarinateV2.connect(owner).addApprovedMultiplierToken(MockedNFT2.address, 500);

      const before = await MarinateV2.isApprovedMultiplierNFT(MockedNFT.address);
      const before1 = await MarinateV2.isApprovedMultiplierNFT(MockedNFT2.address);

      expect(before).to.equal(true);
      expect(before1).to.equal(true);

      await MarinateV2.connect(owner).removeApprovedMultiplierToken(MockedNFT2.address);

      const result = await MarinateV2.isApprovedMultiplierNFT(MockedNFT.address);
      const result1 = await MarinateV2.isApprovedMultiplierNFT(MockedNFT2.address);

      expect(result).to.equal(true);
      expect(result1).to.equal(false);
    });

    it("reverts if not a multiplier nft", async function () {
      await expect(MarinateV2.connect(owner).removeApprovedMultiplierToken(MockedNFT2.address)).to.be.revertedWith(
        "Approved NFT does not exist",
      );
    });
  });

  describe("#setScale", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets scale", async function () {
      await MarinateV2.connect(owner).setScale(500000000);
      const scale = await MarinateV2.SCALE();
      expect(scale).to.equal(500000000);
    });

    it("reverts if not admin", async function () {
      await expect(MarinateV2.connect(accounts[1]).setScale(500000000)).to.revertedWith("Caller is not an admin");
    });
  });

  describe("#setMultiplierStakeEnabled", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets scale", async function () {
      await MarinateV2.connect(owner).setMultiplierStakeEnabled(false);
      const scale = await MarinateV2.multiplierStakingEnabled();
      expect(scale).to.equal(false);
    });

    it("reverts if not admin", async function () {
      await expect(MarinateV2.connect(accounts[1]).setMultiplierStakeEnabled(false)).to.revertedWith(
        "Caller is not an admin",
      );
    });
  });

  describe("#addApprovedMultiplierToken", async function () {
    beforeEach(async () => {
      await setup();
    });

    it("reverts if already added", async function () {
      await expect(MarinateV2.connect(owner).addApprovedMultiplierToken(MockedNFT.address, 500)).to.revertedWith(
        "Approved NFT exists",
      );
    });
  });

  describe("#removeApprovedRewardToken", async function () {
    beforeEach(async () => {
      await setup();
    });

    it("reverts if already added", async function () {
      await expect(MarinateV2.connect(owner).removeApprovedRewardToken(MockedERC20.address)).to.revertedWith(
        "Reward token does not exist",
      );
    });
  });

  describe("#migrateToken", async function () {
    beforeEach(async () => {
      await setup();
    });

    it("transfers tokens from address", async function () {
      let amount = 100000;
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await RewardToken.mint(owner.address, amount);
      await RewardToken.connect(owner).approve(MarinateV2.address, amount);
      await MarinateV2.connect(owner).addReward(RewardToken.address, amount);
      await MarinateV2.connect(owner).migrateToken(RewardToken.address, accounts[4].address, partial);

      const balanceC = await RewardToken.balanceOf(MarinateV2.address);
      const balanceA = await RewardToken.balanceOf(accounts[4].address);
      expect(balanceC).to.equal(partial);
      expect(balanceA).to.equal(partial);
    });
    it("transfers tokens from address", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await RewardToken.mint(owner.address, amount);
      await RewardToken.connect(owner).approve(MarinateV2.address, amount);
      await MarinateV2.connect(owner).addReward(RewardToken.address, amount);
      await MarinateV2.connect(owner).migrateToken(RewardToken.address, accounts[5].address, 0);

      const balanceC = await RewardToken.balanceOf(MarinateV2.address);
      const balanceA = await RewardToken.balanceOf(accounts[5].address);
      expect(balanceC).to.equal(0);
      expect(balanceA).to.equal(amount);
    });
  });

  describe("#recoverEth", async function () {
    beforeEach(async () => {
      await setup();
    });

    it("can retrive eth", async function () {
      await MarinateV2.connect(owner).recoverEth();
    });
  });
});
