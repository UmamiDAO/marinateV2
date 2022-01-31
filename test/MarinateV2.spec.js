const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const SCALE = ethers.utils.parseUnits("1", 40);

describe("MarinateV2", async function () {
  let owner, accounts;
  let DateTime;
  let MockedUMAMI;
  let MarinateV2, sUMAMI, wsUMAMI;
  let rewardToken;
  let coreContracts;
  const provider = await ethers.getDefaultProvider("http://localhost:8545");

  async function printTokenBalance(token, address) {
    let balance = await token.balanceOf(address);
    console.log(`token balance for ${address} is ${ethers.utils.formatEther(balance)}`);
  }

  async function fastForward(seconds) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  }

  before(async () => {
    // setup peripheral contracts
    [owner, ...accounts] = await ethers.getSigners();
    const _DateTime = await ethers.getContractFactory("MockDateTime");
    DateTime = await _DateTime.deploy();
    const _MockedUMAMI = await ethers.getContractFactory("MockERC20");
    MockedUMAMI = await _MockedUMAMI.deploy("UMAMI", "UMAMI");
    const _MockedNFT = await ethers.getContractFactory("MockERC721");
    MockedNFT = await _MockedNFT.deploy("UMAMI-NFT", "UMAMI-NFT");

    // reward token
    const _RewardToken = await ethers.getContractFactory("MockERC20");
    RewardToken = await _RewardToken.deploy("RWD", "RWD");
  });

  beforeEach(async () => {
    const _MarinateV2 = await ethers.getContractFactory("MarinateV2");
    MarinateV2 = await _MarinateV2.deploy(MockedUMAMI.address, DateTime.address, "Marinated UMAMI", "mUMAMI");

    await MarinateV2.addApprovedRewardToken(RewardToken.address);
    RewardToken.mint(owner.address, ethers.utils.parseEther("100000"))

    for (let i = 0; i < 5; i++) {
      await RewardToken.transfer(accounts[i].address, ethers.utils.parseEther("10000"));
    }
  });

  it("Stake - Early Withdraw", async function () {

  });

  it("Stake - Stake and Withdraw - No Rebase & Rewards", async function () {

  });

  it("Stake - Stake and Double Withdraw", async function () {

  });

  it("Stake - Stake and Stake again", async function () {
  });

  it("Rewards - 50/50 rewards - 1/3 multipliers", async function () {
    /*
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");
    let multiplier = ethers.utils.parseUnits("3", 40);

    let preBal0 = await rewardToken.balanceOf(accounts[0].address);
    let preBal1 = await rewardToken.balanceOf(accounts[1].address);

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.setMarinateLevel(1337, 600, multiplier);
    await marinate.connect(accounts[1]).stake(1337, amount);

    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 11);

    await marinate.connect(accounts[0]).withdraw(0);
    await marinate.connect(accounts[1]).withdraw(1337);
    let postBal0 = await rewardToken.balanceOf(accounts[0].address);
    let postBal1 = await rewardToken.balanceOf(accounts[1].address);
    expect(postBal0).to.be.closeTo(preBal0.add(ethers.utils.parseEther("25")), 1);
    expect(postBal1).to.be.closeTo(preBal1.add(ethers.utils.parseEther("75")), 1);
    */
  });
  /*

  it("Rewards - getAvailableTokenRewards", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");
    let multiplier = ethers.utils.parseUnits("3", 40);

    let preBal0 = await rewardToken.balanceOf(accounts[0].address);
    let preBal1 = await rewardToken.balanceOf(accounts[1].address);

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.setMarinateLevel(1337, 600, multiplier);
    await marinate.connect(accounts[1]).stake(1337, amount);

    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 11);

    let postBal0 = await marinate.connect(accounts[0]).withdraw(0);
    let postBal1 = await marinate.connect(accounts[1]).withdraw(0);
    expect(postBal0).to.be.closeTo(preBal0.add(ethers.utils.parseEther("25")), 1);
    expect(postBal1).to.be.closeTo(preBal1.add(ethers.utils.parseEther("75")), 1);
  });

  it("Rewards - 50/50 rewards - equal multipliers", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");
    let multiplier = ethers.utils.parseUnits("3", 40);

    let preBal0 = await rewardToken.balanceOf(accounts[0].address);
    let preBal1 = await rewardToken.balanceOf(accounts[1].address);

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(1, amount);
    await marinate.connect(accounts[1]).stake(1, amount);

    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);
    await fastForward(60 * 60 * 24 * 3);

    await marinate.connect(accounts[0]).withdraw(1);
    await marinate.connect(accounts[1]).withdraw(1);
    let postBal0 = await rewardToken.balanceOf(accounts[0].address);
    let postBal1 = await rewardToken.balanceOf(accounts[1].address);
    expect(postBal0).to.be.closeTo(preBal0.add(ethers.utils.parseEther("50")), 1);
    expect(postBal1).to.be.closeTo(preBal1.add(ethers.utils.parseEther("50")), 1);
  });

  it("Rewards - getAvailableTokenRewards 1", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);

    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);

    let avail1 = await marinate
      .connect(accounts[0])
      .getAvailableTokenRewards(accounts[0].address, rewardToken.address, 0);
    let avail2 = await marinate
      .connect(accounts[1])
      .getAvailableTokenRewards(accounts[1].address, rewardToken.address, 0);
    expect(avail1).to.be.closeTo(ethers.utils.parseEther("50"), 1);
    expect(avail2).to.be.closeTo(ethers.utils.parseEther("50"), 1);
  });

  it("Rewards - getAvailableTokenRewards 2", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);

    await rewardToken.approve(marinate.address, rewardAmount.mul(2));
    await marinate.addReward(rewardToken.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);

    let avail1 = await marinate
      .connect(accounts[0])
      .getAvailableTokenRewards(accounts[0].address, rewardToken.address, 0);
    let avail2 = await marinate
      .connect(accounts[1])
      .getAvailableTokenRewards(accounts[1].address, rewardToken.address, 0);
    expect(avail1).to.be.closeTo(ethers.utils.parseEther("100"), 1);
    expect(avail2).to.be.closeTo(ethers.utils.parseEther("100"), 1);
  });

  it("Rewards - getAvailableTokenRewards 3", async function () {
    let amount = ethers.utils.parseUnits("1", 9);
    let rewardAmount = ethers.utils.parseEther("100");

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);

    await rewardToken.approve(marinate.address, rewardAmount);
    await marinate.addReward(rewardToken.address, rewardAmount);

    await sUMAMI.connect(accounts[0]).approve(marinate.address, amount);
    await sUMAMI.connect(accounts[1]).approve(marinate.address, amount);
    await marinate.connect(accounts[0]).stake(0, amount);
    await marinate.connect(accounts[1]).stake(0, amount);

    await rewardToken.approve(marinate.address, rewardAmount.mul(2));
    await marinate.addReward(rewardToken.address, rewardAmount.mul(2));

    let avail1 = await marinate
      .connect(accounts[0])
      .getAvailableTokenRewards(accounts[0].address, rewardToken.address, 0);
    let avail2 = await marinate
      .connect(accounts[1])
      .getAvailableTokenRewards(accounts[1].address, rewardToken.address, 0);
    expect(avail1).to.be.closeTo(ethers.utils.parseEther("150"), 10);
    expect(avail2).to.be.closeTo(ethers.utils.parseEther("150"), 10);
  });

  it("Stake - Different Levels - Withdraw from shortest", async function () {
    let amount = ethers.utils.parseUnits("1", 8);

    await sUMAMI.approve(marinate.address, amount.mul(2));
    await marinate.stake(1, amount);
    await marinate.stake(0, amount);

    await fastForward(60 * 11);

    await marinate.withdraw(0);
    await expect(marinate.withdraw(1)).to.be.revertedWith("Too soon");
  });

  it("Stake - No hanging rewards (excessTokenRewards)", async function () {
    let amount = ethers.utils.parseUnits("1", 8);

    await sUMAMI.approve(marinate.address, amount.mul(2));

    await marinate.stake(0, amount);
    await fastForward(60 * 11);
    await marinate.withdraw(0);

    await rewardToken.approve(marinate.address, amount);
    await marinate.addReward(rewardToken.address, amount);
    let withdrawBal0 = await rewardToken.balanceOf(owner.address);

    await marinate.stake(0, amount);
    await fastForward(60 * 11);
    await marinate.withdraw(0);

    let withdrawBal1 = await rewardToken.balanceOf(owner.address);

    expect(await marinate.excessTokenRewards(rewardToken.address), "Not added to excessTokenRewards").to.be.equal(
      amount,
    );
  });

  it("Stake - Different Levels - Withdraw from both", async function () {
    let amount = ethers.utils.parseUnits("1", 8);

    let preBal = await sUMAMI.balanceOf(owner.address);

    await sUMAMI.approve(marinate.address, amount.mul(2));
    await marinate.stake(1, amount);
    await marinate.stake(0, amount);

    await fastForward(60 * 60 * 24 * 2);

    await marinate.withdraw(0);
    await marinate.withdraw(1);
    let postBal = await sUMAMI.balanceOf(owner.address);
    expect(postBal, "Couldn't withdraw all staked balance").to.be.closeTo(preBal, 2);
  });

  it("Add Reward Token", async function () {
    await marinate.addApprovedRewardToken(sUMAMI.address);

    expect(await marinate.isApprovedRewardToken(sUMAMI.address)).to.be.equal(true);
  });

  it("RemoveReward Token", async function () {
    await marinate.removeApprovedRewardToken(UMAMI.address);

    expect(await marinate.isApprovedRewardToken(UMAMI.address)).to.be.equal(false);
  });

  it("Add Reward Token - No duplicates", async function () {
    await expect(marinate.addApprovedRewardToken(UMAMI.address)).to.be.revertedWith("Reward token exists");
  });

  it("Receiver - UMAMI is wrapped", async function () {
    await marinateReceiver.addDistributedToken(UMAMI.address);
    await UMAMI.transfer(marinateReceiver.address, ethers.utils.parseUnits("100", 9));
    await marinate.addApprovedRewardToken(wsUMAMI.address);
    await marinateReceiver.sendBalancesAsRewards();
    expect(await marinate.excessTokenRewards(wsUMAMI.address), "Not added to excessTokenRewards").to.be.gt(0);
  });
  */
});
