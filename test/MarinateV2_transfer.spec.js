const { expect } = require("chai");
const { ethers } = require("hardhat");
const SCALE = ethers.utils.parseUnits("1", 40);

describe("MarinateV2 - transfer", async function () {
  let owner, accounts;
  let DateTime;
  let MockedUMAMI;
  let MarinateV2;
  let WhitelistedDepositContract, BlockedDepositContract;
  let RewardToken, MockedNFT, MockedNFT2, MockedERC20;

  async function printTokenBalance(token, address) {
    let balance = await token.balanceOf(address);
    console.log(`token balance for ${address} is ${ethers.utils.formatEther(balance)}`);
  }

  async function fastForward(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  async function setTime(timestamp) {
    await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
    await network.provider.send("evm_mine");
  }

  async function setup() {
    // reward token
    const _RewardToken = await ethers.getContractFactory("MockERC20");
    RewardToken = await _RewardToken.deploy("RWD", "RWD");

    const _MarinateV2 = await ethers.getContractFactory("MarinateV2V2");
    const _DepositContract = await ethers.getContractFactory("MockDepositContract");
    MarinateV2 = await _MarinateV2.deploy(MockedUMAMI.address, DateTime.address, "Marinated UMAMI", "mUMAMI");
    WhitelistedDepositContract = await _DepositContract.deploy(MarinateV2.address);
    BlockedDepositContract = await _DepositContract.deploy(MarinateV2.address);
    await MarinateV2.addApprovedRewardToken(RewardToken.address);
    await MarinateV2.addApprovedMultiplierToken(MockedNFT.address, 200);
    await MarinateV2.addToContractWhitelist(WhitelistedDepositContract.address);
    await MockedUMAMI.mint(owner.address, ethers.utils.parseEther("100000"));
    await MockedUMAMI.transfer(accounts[0].address, ethers.utils.parseEther("10000"));
  }

  before(async () => {
    // setup peripheral contracts
    [owner, ...accounts] = await ethers.getSigners();
    const _DateTime = await ethers.getContractFactory("MockDateTime");
    DateTime = await _DateTime.deploy();
    const _MockedUMAMI = await ethers.getContractFactory("MockERC20");
    MockedUMAMI = await _MockedUMAMI.deploy("UMAMI", "UMAMI");
    const _MockedNFT = await ethers.getContractFactory("MockERC721");
    MockedNFT = await _MockedNFT.deploy("UMAMI-NFT-2%", "UMAMI-NFT");
    MockedNFT2 = await _MockedNFT.deploy("UMAMI-NFT-10%", "UMAMI-NFT");

    
  });

  describe("#wallet to wallet", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("can set storage when transfering without multipliers", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).transfer(accounts[1].address, amount);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(accounts[1].address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(accounts[1].address);
      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(amount);
    });

    it("can set storage when transfering with multipliers", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await MockedNFT.mint(accounts[0].address, 1);
      await MockedNFT.connect(accounts[0]).approve(MarinateV2.address, "1");
      await MarinateV2.connect(accounts[0]).stakeMultiplier(MockedNFT.address, "1");

      await MockedNFT.mint(accounts[1].address, 2);
      await MockedNFT.connect(accounts[1]).approve(MarinateV2.address, "2");
      await MarinateV2.connect(accounts[1]).stakeMultiplier(MockedNFT.address, "2");

      await MarinateV2.connect(accounts[0]).transfer(accounts[1].address, amount);

      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(accounts[1].address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(accounts[1].address);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(amount * 1.02);
    });
    it("collects outstanding rewards for the user before transfering", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      await MarinateV2.connect(accounts[0]).transfer(accounts[1].address, amount);

      const rewardBalance = await MarinateV2.toBePaid(RewardToken.address, accounts[0].address);
      expect(rewardBalance).to.equal(100000);
    });
    it("partial transfer with recipient 0 balance", async function () {
      let amount = 100000;
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(accounts[1].address, partial);

      await MarinateV2.connect(accounts[0]).claimRewards();
      await MarinateV2.connect(accounts[1]).claimRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(accounts[1].address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(accounts[1].address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(accounts[1].address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount - partial);
      expect(mUmamiBalance1).to.equal(partial);
      expect(info0.amount).to.equal(50000);
      expect(info1.amount).to.equal(50000);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(50000);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(50000);
    });
    it("partial transfer with recipient small balance", async function () {
      let partial = 50000;
      let small = 25000
      await MockedUMAMI.connect(accounts[0]).transfer(accounts[1].address, partial);

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, partial);
      await MockedUMAMI.connect(accounts[1]).approve(MarinateV2.address, partial);
      await MarinateV2.connect(accounts[0]).stake(partial);
      await MarinateV2.connect(accounts[1]).stake(partial);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(accounts[1].address, small);
      await MarinateV2.connect(accounts[0]).claimRewards();
      await MarinateV2.connect(accounts[1]).claimRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(accounts[1].address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(accounts[1].address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(accounts[1].address);

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial);

      expect(mUmamiBalance0).to.equal(small);
      expect(mUmamiBalance1).to.equal(partial + small);
      expect(info0.amount).to.equal(small);
      expect(info1.amount).to.equal(partial + small);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(small);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(partial + small);
    });
    it("full transfer with recipient 0 balance", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(accounts[1].address, amount);

      await MarinateV2.connect(accounts[0]).claimRewards();

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[1]).claimRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(accounts[1].address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(accounts[1].address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(accounts[1].address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(amount);
    });
    it("full transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).transfer(accounts[1].address, partial);

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, partial);
      await MockedUMAMI.connect(accounts[1]).approve(MarinateV2.address, partial);
      await MarinateV2.connect(accounts[0]).stake(partial);
      await MarinateV2.connect(accounts[1]).stake(partial);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(accounts[1].address, partial);
      await MarinateV2.connect(accounts[0]).claimRewards();
      await MarinateV2.connect(accounts[1]).claimRewards();

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await MarinateV2.connect(accounts[1]).claimRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(accounts[1].address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(accounts[1].address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(accounts[1].address);

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial + amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(amount);
    });
  });
  describe("#wallet to whitelisted", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets variables", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).approve(WhitelistedDepositContract.address, amount);
      await WhitelistedDepositContract.connect(accounts[0]).deposit(amount);

      const multipliedBalance = await MarinateV2.totalMultipliedStaked();
      const stakedBalance = await MarinateV2.totalStaked();
      expect(Math.round(multipliedBalance / Math.pow(10, 40))).to.equal(amount);
      expect(stakedBalance).to.equal(amount);
    });
    it("partial transfer with recipient 0 balance", async function () {
      let amount = 100000;
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      
      await MarinateV2.connect(accounts[0]).transfer(WhitelistedDepositContract.address, partial);

      await MarinateV2.connect(accounts[0]).claimRewards();
      await WhitelistedDepositContract.connect(accounts[0]).claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(WhitelistedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(WhitelistedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(WhitelistedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount - partial);
      expect(mUmamiBalance1).to.equal(partial);
      expect(info0.amount).to.equal(50000);
      expect(info1.amount).to.equal(50000);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(50000);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(50000);
    });
    it("partial transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;
      let small = 25000

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await MarinateV2.connect(accounts[0]).transfer(WhitelistedDepositContract.address, partial);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(WhitelistedDepositContract.address, small);
      
      await MarinateV2.connect(accounts[0]).claimRewards();
      await WhitelistedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(WhitelistedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(WhitelistedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(WhitelistedDepositContract.address);

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial);

      expect(mUmamiBalance0).to.equal(small);
      expect(mUmamiBalance1).to.equal(partial + small);
      expect(info0.amount).to.equal(small);
      expect(info1.amount).to.equal(partial + small);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(small);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(partial + small);
    });
    it("full transfer with recipient 0 balance", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(WhitelistedDepositContract.address, amount);

      await MarinateV2.connect(accounts[0]).claimRewards();

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await WhitelistedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(WhitelistedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(WhitelistedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(WhitelistedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(amount);
    });
    it("full transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).transfer(WhitelistedDepositContract.address, partial);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(WhitelistedDepositContract.address, partial);
      await MarinateV2.connect(accounts[0]).claimRewards();
      await WhitelistedDepositContract.claimMarinateRewards();

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await WhitelistedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(WhitelistedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(WhitelistedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(WhitelistedDepositContract.address);

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial + amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(amount);
    });
  });
  describe("#wallet to not whitelisted", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets variables", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).approve(BlockedDepositContract.address, amount);
      await BlockedDepositContract.connect(accounts[0]).deposit(amount);

      const multipliedBalance = await MarinateV2.totalMultipliedStaked();
      const stakedBalance = await MarinateV2.totalStaked();
      expect(multipliedBalance).to.equal(0);
      expect(stakedBalance).to.equal(amount);
    });
    it("partial transfer with recipient 0 balance", async function () {
      let amount = 100000;
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      
      await MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial);

      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.connect(accounts[0]).claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount - partial);
      expect(mUmamiBalance1).to.equal(partial);
      expect(info0.amount).to.equal(50000);
      expect(info1.amount).to.equal(50000);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(50000);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(0);
    });
    it("partial transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;
      let small = 25000

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, small);
      
      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(small);
      expect(mUmamiBalance1).to.equal(partial + small);
      expect(info0.amount).to.equal(small);
      expect(info1.amount).to.equal(partial + small);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(small);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(0);
    });
    it("full transfer with recipient 0 balance", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, amount);

      await MarinateV2.connect(accounts[0]).claimRewards();

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      //await expect(MarinateV2.connect(owner).addReward(RewardToken.address, "100000")).to.be.revertedWith("Total multiplied staked equal to zero");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(0);
    });
    it("full transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial);
      
      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial);
      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.claimMarinateRewards();

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      //await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);
      const info0 = await MarinateV2.marinatorInfo(accounts[0].address);
      const info1 = await MarinateV2.marinatorInfo(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
      expect(info0.amount).to.equal(0);
      expect(info1.amount).to.equal(amount);
      expect(Math.round(info0.multipliedAmount / Math.pow(10, 40))).to.equal(0);
      expect(Math.round(info1.multipliedAmount / Math.pow(10, 40))).to.equal(0);
    });
  });

  describe("#not whitelisted to wallet", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets variables", async function () {
    });
    it("partial transfer with recipient 0 balance", async function () {
    });
    it("partial transfer with recipient small balance", async function () {
    });
    it("full transfer with recipient 0 balance", async function () {
    });
    it("full transfer with recipient small balance", async function () {
    });
  });
  describe("#whitelisted to wallet", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets variables", async function () {
    });
    it("partial transfer with recipient 0 balance", async function () {
    });
    it("partial transfer with recipient small balance", async function () {
    });
    it("full transfer with recipient 0 balance", async function () {
    });
    it("full transfer with recipient small balance", async function () {
    });

  });

});

/*
Tests:
Man: multiplier and none
Transfer -
W2W - partial transfer W2 no balance - man
W2W - full transfer W2 no balance - man
W2W - partial transfer W2 small balance - man
W2W - full transfer W2 small balance - man
W2WC - partial transfer WC no balance
W2WC - partial transfer WC small balance
W2WC - full transfer WC no balance
W2WC - full transfer WC small balance
WC2W - partial transfer W no balance - man
WC2W - partial transfer W small balance - man
W2BC - partial transfer BC no balance
W2BC - partial transfer BC small balance
BC2W - partial transfer W no balance
BC2W - partial transfer W small balance
*/
