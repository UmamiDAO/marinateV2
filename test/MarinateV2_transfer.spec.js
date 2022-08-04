const { expect } = require("chai");
const { ethers } = require("hardhat");
const SCALE = ethers.utils.parseUnits("1", 40);

describe("MarinateV2 - transfer", async function () {
  let owner, accounts;
  let MockedUMAMI;
  let MarinateV2;
  let WhitelistedDepositContract, BlockedDepositContract, BlockedDepositContract2;
  let RewardToken, MockedERC20;

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

    const _MarinateV2 = await ethers.getContractFactory("MarinateV2");
    const _DepositContract = await ethers.getContractFactory("MockDepositContract");
    MarinateV2 = await _MarinateV2.deploy(MockedUMAMI.address, "Marinated UMAMI", "mUMAMI", "1000000000000000000000");
    WhitelistedDepositContract = await _DepositContract.deploy(MarinateV2.address);
    BlockedDepositContract = await _DepositContract.deploy(MarinateV2.address);
    BlockedDepositContract2 = await _DepositContract.deploy(MarinateV2.address);
    await MarinateV2.addApprovedRewardToken(RewardToken.address);
    await MarinateV2.addToContractWhitelist(WhitelistedDepositContract.address);
    await MockedUMAMI.mint(owner.address, ethers.utils.parseEther("100000"));
    await MockedUMAMI.transfer(accounts[0].address, ethers.utils.parseEther("10000"));
  }

  before(async () => {
    // setup peripheral contracts
    [owner, ...accounts] = await ethers.getSigners();
    const _MockedUMAMI = await ethers.getContractFactory("MockERC20");
    MockedUMAMI = await _MockedUMAMI.deploy("UMAMI", "UMAMI");
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
      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
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

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount - partial);
      expect(mUmamiBalance1).to.equal(partial);
    });
    it("partial transfer with recipient small balance", async function () {
      let partial = 50000;
      let small = 25000;
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

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial);

      expect(mUmamiBalance0).to.equal(small);
      expect(mUmamiBalance1).to.equal(partial + small);
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

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
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

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial + amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
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

      expect(await MarinateV2.totalSupply()).to.equal(amount);
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

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount - partial);
      expect(mUmamiBalance1).to.equal(partial);
    });
    it("partial transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;
      let small = 25000;

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

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial);

      expect(mUmamiBalance0).to.equal(small);
      expect(mUmamiBalance1).to.equal(partial + small);
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

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
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

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial + amount);

      expect(mUmamiBalance0).to.equal(0);
      expect(mUmamiBalance1).to.equal(amount);
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
      expect(BlockedDepositContract.connect(accounts[0]).deposit(amount)).to.be.revertedWith("Not whitelisted");
      const blockedContractBalance = await MarinateV2.balanceOf(BlockedDepositContract.address);
      expect(blockedContractBalance).to.equal(0);
    });
    it("partial transfer with recipient 0 balance", async function () {
      let amount = 100000;
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial)).to.be.revertedWith("Not whitelisted");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.connect(accounts[0]).claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount);
      expect(mUmamiBalance1).to.equal(0);
    });
    it("partial transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;
      let small = 25000;

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial)).to.be.revertedWith("Not whitelisted");

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, small)).to.be.revertedWith("Not whitelisted");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount);
      expect(mUmamiBalance1).to.equal(0);
    });
    it("full transfer with recipient 0 balance", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, amount)).to.be.revertedWith("Not whitelisted");

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

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount);
      expect(mUmamiBalance1).to.equal(0);
    });
    it("full transfer with recipient small balance", async function () {
      let amount = 100000;
      let partial = 50000;

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial)).to.be.revertedWith("Not whitelisted");

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, partial)).to.be.revertedWith("Not whitelisted");
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

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount);
      expect(mUmamiBalance1).to.equal(0);
    });
  });

  describe("#not whitelisted to wallet", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets variables", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).approve(BlockedDepositContract.address, amount);
      expect(BlockedDepositContract.connect(accounts[0]).deposit(amount)).to.be.revertedWith("Not whitelisted");

      const totalSupply = await MarinateV2.totalSupply();
      expect(totalSupply).to.equal(amount);
      const contractBalance = await MarinateV2.balanceOf(BlockedDepositContract.address);
      expect(contractBalance).to.equal(0);

      expect(BlockedDepositContract.connect(accounts[0]).withdraw(amount)).to.be.revertedWith("Not whitelisted");
    });
    it("partial transfer with recipient 0 balance", async function () {
      let amount = 100000;
      let partial = 50000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, amount)).to.be.revertedWith("Not whitelisted");
      expect(BlockedDepositContract.connect(accounts[0]).withdraw(partial)).to.be.revertedWith("Not whitelisted");

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.connect(accounts[0]).claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount);
      expect(mUmamiBalance1).to.equal(0);
    });
    it("full transfer with recipient 0 balance", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, amount)).to.be.revertedWith("Not whitelisted");

      await MarinateV2.connect(accounts[0]).claimRewards();

      expect(BlockedDepositContract.connect(accounts[0]).withdraw(amount)).to.be.revertedWith("Not whitelisted");

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await BlockedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(BlockedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(BlockedDepositContract.address);

      expect(rewardBalance0).to.equal(2 * amount);
      expect(rewardBalance1).to.equal(0);

      expect(mUmamiBalance0).to.equal(amount);
      expect(mUmamiBalance1).to.equal(0);
    });
  });
  describe("#whitelisted to wallet", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets variables", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).approve(WhitelistedDepositContract.address, amount);
      await WhitelistedDepositContract.connect(accounts[0]).deposit(amount);
      const afterDepositBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(afterDepositBalance).to.equal(0);

      const totalSupply = await MarinateV2.totalSupply();
      expect(totalSupply).to.equal(amount);
      await WhitelistedDepositContract.connect(accounts[0]).withdraw(amount);
      const afterWithdrawBalance = await MarinateV2.balanceOf(accounts[0].address);
      expect(afterWithdrawBalance).to.equal(amount);
    });
    it("partial transfer with recipient 0 balance", async function () {
      let amount = 100000;
      let partial = 50000;
      let small = 25000;

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      await MarinateV2.connect(accounts[0]).transfer(WhitelistedDepositContract.address, partial);

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await WhitelistedDepositContract.connect(accounts[0]).withdraw(small);

      await MarinateV2.connect(accounts[0]).claimRewards();
      await WhitelistedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(WhitelistedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(WhitelistedDepositContract.address);

      expect(rewardBalance0).to.equal(partial);
      expect(rewardBalance1).to.equal(partial);

      expect(mUmamiBalance0).to.equal(partial + small);
      expect(mUmamiBalance1).to.equal(small);
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

      await WhitelistedDepositContract.connect(accounts[0]).withdraw(partial);

      await RewardToken.mint(owner.address, "100000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      await MarinateV2.connect(accounts[0]).claimRewards();
      await WhitelistedDepositContract.claimMarinateRewards();

      const rewardBalance0 = await RewardToken.balanceOf(accounts[0].address);
      const rewardBalance1 = await RewardToken.balanceOf(WhitelistedDepositContract.address);
      const mUmamiBalance0 = await MarinateV2.balanceOf(accounts[0].address);
      const mUmamiBalance1 = await MarinateV2.balanceOf(WhitelistedDepositContract.address);

      expect(rewardBalance0).to.equal(partial + amount);
      expect(rewardBalance1).to.equal(partial);

      expect(mUmamiBalance0).to.equal(amount);
      expect(mUmamiBalance1).to.equal(0);
    });
  });

  describe("#not whitelisted to not whitelisted", async function () {
    beforeEach(async () => {
      await setup();
    });
    it("sets variables", async function () {
      let amount = 100000;
      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);
      await MarinateV2.connect(accounts[0]).approve(BlockedDepositContract.address, amount);
      expect(BlockedDepositContract.connect(accounts[0]).deposit(amount)).to.be.revertedWith("Not whitelisted");

      const totalSupply = await MarinateV2.totalSupply();
      expect(totalSupply).to.equal(amount);

      expect(BlockedDepositContract.connect(accounts[0]).transfer(BlockedDepositContract2.address, amount)).to.be.revertedWith("Not whitelisted");

      const bal = await MarinateV2.balanceOf(BlockedDepositContract2.address);
      expect(bal, "mUMAMI not transferred").to.be.equal(0);
    });
    it("transfers", async function () {
      let amount = 100000;
      let partial = 50000;
      let small = 25000;

      await MockedUMAMI.connect(accounts[0]).approve(MarinateV2.address, amount);
      await MarinateV2.connect(accounts[0]).stake(amount);

      expect(MarinateV2.connect(accounts[0]).transfer(BlockedDepositContract.address, amount)).to.be.revertedWith("Not whitelisted");

      await RewardToken.connect(owner).mint(owner.address, "1000000");
      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      expect(BlockedDepositContract.connect(accounts[0]).transfer(BlockedDepositContract2.address, partial)).to.be.revertedWith("Not whitelisted");

      await RewardToken.connect(owner).approve(MarinateV2.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");

      expect(BlockedDepositContract2.connect(accounts[0]).transfer(accounts[0].address, partial)).to.be.revertedWith("Not whitelisted");

      await RewardToken.connect(owner).approve(MarinateV2.address, "200000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      await MarinateV2.connect(owner).addReward(RewardToken.address, "100000");
      await MarinateV2.connect(accounts[0]).claimRewards();
      let rewardBal = await RewardToken.balanceOf(accounts[0].address);
      // All rewards
      expect(rewardBal).to.be.equal("400000");
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
